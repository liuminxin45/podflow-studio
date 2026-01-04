"""
Claim Extraction Module

从新闻内容中提取可验证的断言（claims），用于后续的事实核查和证据收集。

设计原则：
- 规则优先：使用启发式规则快速提取常见断言模式
- 结构化输出：每个断言包含文本、类型、置信度、来源位置
- 可扩展：支持自定义规则和LLM增强（可选）

断言类型：
- factual: 事实性陈述（数据、事件、引用）
- causal: 因果关系
- predictive: 预测性陈述
- opinion: 观点性陈述（低优先级）
- comparative: 比较性陈述

作者：Auto-Podcast Team
版本：1.0.0
更新：2025-12-26
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple


@dataclass
class Claim:
    """单个断言"""
    text: str
    claim_type: str  # factual / causal / predictive / opinion / comparative
    confidence: float  # 0.0-1.0
    source_item_id: str
    location: str  # title / summary / content
    span: Optional[Tuple[int, int]] = None
    context: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "text": self.text,
            "claim_type": self.claim_type,
            "confidence": self.confidence,
            "source_item_id": self.source_item_id,
            "location": self.location,
            "span": self.span,
            "context": self.context,
            "metadata": self.metadata,
        }


# 断言提取规则模式
FACTUAL_PATTERNS = [
    # 数据/统计
    re.compile(r"(?:增长|下降|上升|减少|达到|超过|突破|约|大约)\s*\d+(?:\.\d+)?(?:%|万|亿|千|百|个|次|人|元|美元|欧元)?", re.IGNORECASE),
    # 时间事件
    re.compile(r"(?:在|于|将于|已于)\s*\d{4}年\d{1,2}月\d{1,2}日", re.IGNORECASE),
    # 引用/发布
    re.compile(r"(?:发布|公布|宣布|表示|称|指出|透露|报道)(?:称|说|道)?", re.IGNORECASE),
    # 数据来源
    re.compile(r"(?:根据|据|来自|显示|数据|报告|研究|调查).*(?:显示|表明|指出)", re.IGNORECASE),
]

CAUSAL_PATTERNS = [
    re.compile(r"(?:由于|因为|因|导致|造成|引发|带来|促使|推动)", re.IGNORECASE),
    re.compile(r"(?:使得|让|令|导致).*(?:增加|减少|提高|降低|改善|恶化)", re.IGNORECASE),
]

PREDICTIVE_PATTERNS = [
    re.compile(r"(?:预计|预测|预期|预估|预判|预见|将|将会|可能|或将)", re.IGNORECASE),
    re.compile(r"(?:未来|今后|接下来|下一步|明年|后续)", re.IGNORECASE),
]

COMPARATIVE_PATTERNS = [
    re.compile(r"(?:相比|对比|比|超过|高于|低于|优于|劣于|强于|弱于)", re.IGNORECASE),
    re.compile(r"(?:同比|环比|较.*增长|较.*下降)", re.IGNORECASE),
]

OPINION_PATTERNS = [
    re.compile(r"(?:认为|觉得|感觉|似乎|看来|应该|必须|需要)", re.IGNORECASE),
    re.compile(r"(?:我们|我|笔者|本文|业内|专家|分析师).*(?:认为|预计|判断)", re.IGNORECASE),
]


def _split_sentences(text: str) -> List[str]:
    """将文本分割为句子"""
    if not text:
        return []
    
    # 简单句子分割（中英文）
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    # 分割中文标点和英文标点
    sentences = re.split(r'[。！？；]|[.!?;]\s+|\n', text)
    return [s.strip() for s in sentences if s.strip() and len(s.strip()) > 5]


def _match_patterns(sentence: str, patterns: List[re.Pattern]) -> bool:
    """检查句子是否匹配任一模式"""
    return any(pat.search(sentence) for pat in patterns)


def _extract_context(text: str, span: Tuple[int, int], window: int = 50) -> str:
    """提取断言的上下文"""
    start, end = span
    left = max(0, start - window)
    right = min(len(text), end + window)
    return text[left:right]


def extract_claims_from_item(
    item: Dict[str, Any],
    *,
    max_claims_per_item: int = 10,
    min_confidence: float = 0.5,
    include_opinions: bool = False,
) -> List[Claim]:
    """
    从单个新闻条目中提取断言
    
    Args:
        item: 新闻条目字典
        max_claims_per_item: 每个条目最多提取的断言数
        min_confidence: 最低置信度阈值
        include_opinions: 是否包含观点性断言
        
    Returns:
        断言列表
    """
    claims: List[Claim] = []
    item_id = str(item.get("id", "unknown"))
    
    # 提取各部分文本
    title = str(item.get("title", "")).strip()
    summary = str(item.get("summary", "")).strip()
    content = str(item.get("content", "")).strip()
    
    # 处理标题
    if title:
        title_claims = _extract_claims_from_text(
            title,
            item_id=item_id,
            location="title",
            include_opinions=include_opinions,
        )
        claims.extend(title_claims)
    
    # 处理摘要
    if summary and len(claims) < max_claims_per_item:
        summary_claims = _extract_claims_from_text(
            summary,
            item_id=item_id,
            location="summary",
            include_opinions=include_opinions,
        )
        claims.extend(summary_claims)
    
    # 处理正文
    if content and len(claims) < max_claims_per_item:
        content_claims = _extract_claims_from_text(
            content,
            item_id=item_id,
            location="content",
            include_opinions=include_opinions,
        )
        claims.extend(content_claims)
    
    # 过滤和排序
    claims = [c for c in claims if c.confidence >= min_confidence]
    claims.sort(key=lambda x: x.confidence, reverse=True)
    
    return claims[:max_claims_per_item]


def _extract_claims_from_text(
    text: str,
    *,
    item_id: str,
    location: str,
    include_opinions: bool = False,
) -> List[Claim]:
    """从文本中提取断言"""
    claims: List[Claim] = []
    sentences = _split_sentences(text)
    
    for sentence in sentences:
        if len(sentence) < 6 or len(sentence) > 500:
            continue
        
        claim_type: Optional[str] = None
        confidence = 0.6
        
        # 特殊处理：标题直接作为断言（新闻标题通常包含核心事实）
        if location == "title" and len(sentence) >= 10:
            claim_type = "factual"
            confidence = 0.75  # 标题的基础置信度
        # 按优先级匹配模式
        elif _match_patterns(sentence, FACTUAL_PATTERNS):
            claim_type = "factual"
            confidence = 0.8
        elif _match_patterns(sentence, CAUSAL_PATTERNS):
            claim_type = "causal"
            confidence = 0.75
        elif _match_patterns(sentence, PREDICTIVE_PATTERNS):
            claim_type = "predictive"
            confidence = 0.7
        elif _match_patterns(sentence, COMPARATIVE_PATTERNS):
            claim_type = "comparative"
            confidence = 0.7
        elif include_opinions and _match_patterns(sentence, OPINION_PATTERNS):
            claim_type = "opinion"
            confidence = 0.5
        
        if claim_type:
            # 提升包含数字的断言置信度
            if re.search(r'\d+(?:\.\d+)?', sentence):
                confidence = min(1.0, confidence + 0.1)
            
            # 提升包含引用的断言置信度
            if re.search(r'(?:称|表示|指出|透露|报道)', sentence):
                confidence = min(1.0, confidence + 0.05)
            
            claim = Claim(
                text=sentence,
                claim_type=claim_type,
                confidence=confidence,
                source_item_id=item_id,
                location=location,
                metadata={
                    "length": len(sentence),
                    "has_numbers": bool(re.search(r'\d+', sentence)),
                },
            )
            claims.append(claim)
    
    return claims


def extract_claims_batch(
    items: List[Dict[str, Any]],
    *,
    max_claims_per_item: int = 10,
    min_confidence: float = 0.5,
    include_opinions: bool = False,
) -> List[Claim]:
    """
    批量提取断言
    
    Args:
        items: 新闻条目列表
        max_claims_per_item: 每个条目最多提取的断言数
        min_confidence: 最低置信度阈值
        include_opinions: 是否包含观点性断言
        
    Returns:
        所有断言的列表
    """
    all_claims: List[Claim] = []
    
    for item in items:
        claims = extract_claims_from_item(
            item,
            max_claims_per_item=max_claims_per_item,
            min_confidence=min_confidence,
            include_opinions=include_opinions,
        )
        all_claims.extend(claims)
    
    return all_claims


__all__ = [
    "Claim",
    "extract_claims_from_item",
    "extract_claims_batch",
]
