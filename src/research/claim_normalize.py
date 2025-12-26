"""
Claim Normalization Module

标准化断言文本，便于后续去重和匹配。

规范化操作：
- 文本清理：去除多余空白、标点规范化
- 数字规范化：统一数字格式（保留原始值）
- 实体替换：将专有名词替换为占位符（可选）
- 语义规范化：同义词替换、时态统一（可选）

作者：Auto-Podcast Team
版本：1.0.0
更新：2025-12-26
"""

from __future__ import annotations

import re
from typing import Any, Dict, List, Optional, Tuple

from src.research.claims import Claim
from src.utils.hash_utils import stable_hash


def normalize_whitespace(text: str) -> str:
    """规范化空白字符"""
    text = text.replace("\r\n", " ").replace("\r", " ").replace("\n", " ")
    text = re.sub(r'\s+', ' ', text)
    return text.strip()


def normalize_punctuation(text: str) -> str:
    """规范化标点符号"""
    # 中文标点转英文
    replacements = {
        '，': ',',
        '。': '.',
        '！': '!',
        '？': '?',
        '；': ';',
        '：': ':',
        '"': '"',
        '"': '"',
        ''': "'",
        ''': "'",
        '（': '(',
        '）': ')',
        '【': '[',
        '】': ']',
    }
    
    for cn, en in replacements.items():
        text = text.replace(cn, en)
    
    # 移除多余标点
    text = re.sub(r'[,;:]+', ',', text)
    text = re.sub(r'\.{2,}', '.', text)
    
    return text.strip()


def normalize_numbers(text: str) -> Tuple[str, Dict[str, str]]:
    """
    规范化数字表达
    
    Returns:
        (normalized_text, number_map): 规范化后的文本和数字映射
    """
    number_map: Dict[str, str] = {}
    
    # 匹配数字模式
    patterns = [
        (r'(\d+(?:\.\d+)?)\s*(?:万|萬)', lambda m: str(float(m.group(1)) * 10000)),
        (r'(\d+(?:\.\d+)?)\s*(?:亿|億)', lambda m: str(float(m.group(1)) * 100000000)),
        (r'(\d+(?:\.\d+)?)\s*(?:千|仟)', lambda m: str(float(m.group(1)) * 1000)),
        (r'(\d+(?:\.\d+)?)\s*(?:百|佰)', lambda m: str(float(m.group(1)) * 100)),
    ]
    
    normalized = text
    for pattern, converter in patterns:
        matches = list(re.finditer(pattern, normalized))
        for match in reversed(matches):
            original = match.group(0)
            try:
                converted = converter(match)
                number_map[original] = converted
                normalized = normalized[:match.start()] + converted + normalized[match.end():]
            except (ValueError, AttributeError):
                continue
    
    return normalized, number_map


def normalize_claim_text(claim_text: str) -> str:
    """
    规范化断言文本
    
    Args:
        claim_text: 原始断言文本
        
    Returns:
        规范化后的文本
    """
    text = claim_text
    
    # 1. 空白规范化
    text = normalize_whitespace(text)
    
    # 2. 标点规范化
    text = normalize_punctuation(text)
    
    # 3. 数字规范化
    text, _ = normalize_numbers(text)
    
    # 4. 大小写规范化（保留专有名词）
    # 简单处理：仅规范化纯英文句子
    if re.match(r'^[a-zA-Z0-9\s.,!?;:()]+$', text):
        text = text.lower()
    
    # 5. 移除引号（避免影响匹配）
    text = text.replace('"', '').replace("'", '')
    
    return text.strip()


def create_claim_fingerprint(claim: Claim) -> str:
    """
    为断言创建指纹用于去重
    
    Args:
        claim: 断言对象
        
    Returns:
        指纹字符串
    """
    normalized_text = normalize_claim_text(claim.text)
    
    # 组合关键特征
    features = [
        normalized_text,
        claim.claim_type,
    ]
    
    return stable_hash(features)


def normalize_claim(claim: Claim) -> Dict[str, Any]:
    """
    规范化单个断言，返回包含原始和规范化信息的字典
    
    Args:
        claim: 原始断言
        
    Returns:
        包含规范化信息的字典
    """
    normalized_text = normalize_claim_text(claim.text)
    fingerprint = create_claim_fingerprint(claim)
    
    return {
        "original": claim.to_dict(),
        "normalized_text": normalized_text,
        "fingerprint": fingerprint,
        "text_length": len(normalized_text),
        "word_count": len(normalized_text.split()),
    }


def normalize_claims_batch(claims: List[Claim]) -> List[Dict[str, Any]]:
    """
    批量规范化断言
    
    Args:
        claims: 断言列表
        
    Returns:
        规范化后的断言字典列表
    """
    return [normalize_claim(claim) for claim in claims]


def extract_key_terms(text: str, top_n: int = 5) -> List[str]:
    """
    提取文本中的关键词（简单实现）
    
    Args:
        text: 文本
        top_n: 返回前N个关键词
        
    Returns:
        关键词列表
    """
    # 移除标点和数字
    cleaned = re.sub(r'[^\w\s]', ' ', text)
    cleaned = re.sub(r'\d+', '', cleaned)
    
    # 分词（简单空格分割）
    words = cleaned.split()
    
    # 过滤停用词（简化版）
    stopwords = {
        '的', '了', '在', '是', '我', '有', '和', '就', '不', '人', '都', '一', '一个',
        '上', '也', '很', '到', '说', '要', '去', '你', '会', '着', '没有', '看', '好',
        'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of',
        'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'be', 'been',
    }
    
    words = [w for w in words if len(w) > 1 and w.lower() not in stopwords]
    
    # 统计词频
    word_freq: Dict[str, int] = {}
    for word in words:
        word_freq[word] = word_freq.get(word, 0) + 1
    
    # 排序并返回top N
    sorted_words = sorted(word_freq.items(), key=lambda x: x[1], reverse=True)
    return [word for word, _ in sorted_words[:top_n]]


__all__ = [
    "normalize_claim_text",
    "create_claim_fingerprint",
    "normalize_claim",
    "normalize_claims_batch",
    "extract_key_terms",
]
