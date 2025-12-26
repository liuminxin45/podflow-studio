"""
TTS Segmenter Module

将脚本文本分段为适合TTS的小片段，优化听感和自然度。

分段策略：
- 25-35字为一段（中文）
- 在自然停顿处分段（标点符号）
- 数字和日期规范化读法
- 避免在关键词中间断开

作者：Auto-Podcast Team
版本：1.0.0
更新：2025-12-26
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple


@dataclass
class TextSegment:
    """文本片段"""
    text: str
    segment_index: int
    normalized_text: str = ""  # 规范化后的文本（用于TTS）
    duration_estimate: float = 0.0  # 预估时长（秒）
    metadata: Dict[str, Any] = field(default_factory=dict)
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "text": self.text,
            "segment_index": self.segment_index,
            "normalized_text": self.normalized_text,
            "duration_estimate": self.duration_estimate,
            "metadata": self.metadata,
        }


def normalize_numbers(text: str) -> str:
    """
    规范化数字读法
    
    Args:
        text: 原始文本
        
    Returns:
        规范化后的文本
    """
    result = text
    
    # 百分比
    result = re.sub(r'(\d+(?:\.\d+)?)\s*%', r'\1百分之', result)
    result = re.sub(r'(\d+(?:\.\d+)?)百分之', r'百分之\1', result)
    
    # 大数字（万、亿）
    # 保持原样，TTS引擎通常能正确处理
    
    # 小数
    result = re.sub(r'(\d+)\.(\d+)', r'\1点\2', result)
    
    # 序数词
    result = re.sub(r'第(\d+)', r'第\1', result)
    
    return result


def normalize_dates(text: str) -> str:
    """
    规范化日期读法
    
    Args:
        text: 原始文本
        
    Returns:
        规范化后的文本
    """
    result = text
    
    # YYYY年MM月DD日
    result = re.sub(
        r'(\d{4})年(\d{1,2})月(\d{1,2})日',
        lambda m: f"{m.group(1)}年{int(m.group(2))}月{int(m.group(3))}日",
        result
    )
    
    # YYYY-MM-DD
    result = re.sub(
        r'(\d{4})-(\d{1,2})-(\d{1,2})',
        lambda m: f"{m.group(1)}年{int(m.group(2))}月{int(m.group(3))}日",
        result
    )
    
    # MM/DD
    result = re.sub(
        r'(\d{1,2})/(\d{1,2})',
        lambda m: f"{int(m.group(1))}月{int(m.group(2))}日",
        result
    )
    
    return result


def normalize_special_terms(text: str) -> str:
    """
    规范化特殊术语读法
    
    Args:
        text: 原始文本
        
    Returns:
        规范化后的文本
    """
    result = text
    
    # 常见缩写
    replacements = {
        'AI': '人工智能',
        'CEO': '首席执行官',
        'CTO': '首席技术官',
        'CFO': '首席财务官',
        'GDP': '国内生产总值',
        'IPO': '首次公开募股',
        'APP': '应用程序',
        'VR': '虚拟现实',
        'AR': '增强现实',
    }
    
    for abbr, full in replacements.items():
        # 只替换独立的缩写词
        result = re.sub(rf'\b{abbr}\b', full, result)
    
    return result


def normalize_text_for_tts(text: str) -> str:
    """
    综合规范化文本用于TTS
    
    Args:
        text: 原始文本
        
    Returns:
        规范化后的文本
    """
    result = text
    
    # 应用各种规范化
    result = normalize_numbers(result)
    result = normalize_dates(result)
    result = normalize_special_terms(result)
    
    # 清理多余空白
    result = re.sub(r'\s+', ' ', result)
    result = result.strip()
    
    return result


def split_by_punctuation(text: str) -> List[str]:
    """
    按标点符号分割文本
    
    Args:
        text: 文本
        
    Returns:
        分割后的片段列表
    """
    # 在主要标点处分割
    # 保留标点符号
    pattern = r'([。！？；，、])'
    parts = re.split(pattern, text)
    
    # 重新组合（将标点附加到前一个片段）
    segments = []
    current = ""
    
    for i, part in enumerate(parts):
        if not part:
            continue
        
        if re.match(r'[。！？；，、]', part):
            current += part
            if part in '。！？；':  # 句子结束
                segments.append(current.strip())
                current = ""
        else:
            if current:
                segments.append(current.strip())
            current = part
    
    if current:
        segments.append(current.strip())
    
    return [s for s in segments if s]


def split_long_segment(text: str, max_length: int = 35) -> List[str]:
    """
    分割过长的片段
    
    Args:
        text: 文本
        max_length: 最大长度
        
    Returns:
        分割后的片段列表
    """
    if len(text) <= max_length:
        return [text]
    
    segments = []
    current = ""
    
    # 按逗号分割
    parts = text.split('，')
    
    for part in parts:
        if not part:
            continue
        
        # 如果当前片段加上新部分不超过最大长度
        test_segment = current + ('，' if current else '') + part
        
        if len(test_segment) <= max_length:
            current = test_segment
        else:
            # 保存当前片段
            if current:
                segments.append(current + '，')
                current = part
            else:
                # 单个部分就超长，强制分割
                if len(part) > max_length:
                    # 在空格或其他位置分割
                    words = part.split()
                    temp = ""
                    for word in words:
                        if len(temp + word) <= max_length:
                            temp += word + " "
                        else:
                            if temp:
                                segments.append(temp.strip())
                            temp = word + " "
                    if temp:
                        current = temp.strip()
                else:
                    current = part
    
    if current:
        segments.append(current)
    
    return segments


def segment_text(
    text: str,
    *,
    min_length: int = 25,
    max_length: int = 35,
    normalize: bool = True,
) -> List[TextSegment]:
    """
    将文本分段为适合TTS的片段
    
    Args:
        text: 原始文本
        min_length: 最小片段长度
        max_length: 最大片段长度
        normalize: 是否规范化文本
        
    Returns:
        文本片段列表
    """
    # 清理文本
    text = text.replace('\r\n', '\n').replace('\r', '\n')
    text = re.sub(r'\n+', '\n', text)
    text = text.strip()
    
    if not text:
        return []
    
    # 按段落分割
    paragraphs = [p.strip() for p in text.split('\n') if p.strip()]
    
    all_segments: List[TextSegment] = []
    segment_index = 0
    
    for paragraph in paragraphs:
        # 按标点分割
        punct_segments = split_by_punctuation(paragraph)
        
        for seg_text in punct_segments:
            # 检查长度
            if len(seg_text) > max_length:
                # 进一步分割
                sub_segments = split_long_segment(seg_text, max_length)
                for sub_text in sub_segments:
                    normalized = normalize_text_for_tts(sub_text) if normalize else sub_text
                    
                    segment = TextSegment(
                        text=sub_text,
                        segment_index=segment_index,
                        normalized_text=normalized,
                        duration_estimate=estimate_duration(normalized),
                        metadata={"paragraph_break": False},
                    )
                    all_segments.append(segment)
                    segment_index += 1
            else:
                normalized = normalize_text_for_tts(seg_text) if normalize else seg_text
                
                segment = TextSegment(
                    text=seg_text,
                    segment_index=segment_index,
                    normalized_text=normalized,
                    duration_estimate=estimate_duration(normalized),
                    metadata={"paragraph_break": False},
                )
                all_segments.append(segment)
                segment_index += 1
        
        # 标记段落结束
        if all_segments:
            all_segments[-1].metadata["paragraph_break"] = True
    
    return all_segments


def estimate_duration(text: str, chars_per_second: float = 3.5) -> float:
    """
    估算朗读时长
    
    Args:
        text: 文本
        chars_per_second: 每秒字数（中文）
        
    Returns:
        预估时长（秒）
    """
    # 计算中文字符数
    chinese_chars = sum(1 for c in text if '\u4e00' <= c <= '\u9fff')
    
    # 计算英文单词数
    english_words = len([w for w in text.split() if any(c.isalpha() for c in w)])
    
    # 中文：3.5字/秒，英文：2.5词/秒
    chinese_time = chinese_chars / chars_per_second
    english_time = english_words / 2.5
    
    # 标点停顿时间
    punctuation_count = sum(1 for c in text if c in '。！？；')
    pause_time = punctuation_count * 0.3
    
    total_time = chinese_time + english_time + pause_time
    
    return total_time


def merge_short_segments(
    segments: List[TextSegment],
    min_length: int = 25,
) -> List[TextSegment]:
    """
    合并过短的片段
    
    Args:
        segments: 片段列表
        min_length: 最小长度
        
    Returns:
        合并后的片段列表
    """
    if not segments:
        return []
    
    merged: List[TextSegment] = []
    current: Optional[TextSegment] = None
    
    for segment in segments:
        if current is None:
            current = segment
        elif len(current.text) < min_length and not current.metadata.get("paragraph_break"):
            # 合并
            current.text += segment.text
            current.normalized_text += segment.normalized_text
            current.duration_estimate += segment.duration_estimate
            current.metadata["paragraph_break"] = segment.metadata.get("paragraph_break", False)
        else:
            # 保存当前，开始新的
            merged.append(current)
            current = segment
    
    if current:
        merged.append(current)
    
    # 重新编号
    for i, seg in enumerate(merged):
        seg.segment_index = i
    
    return merged


def segment_script_for_tts(
    script: str,
    *,
    min_length: int = 25,
    max_length: int = 35,
    normalize: bool = True,
    merge_short: bool = True,
) -> List[TextSegment]:
    """
    将脚本分段用于TTS（完整流程）
    
    Args:
        script: 脚本文本
        min_length: 最小片段长度
        max_length: 最大片段长度
        normalize: 是否规范化
        merge_short: 是否合并过短片段
        
    Returns:
        文本片段列表
    """
    segments = segment_text(
        script,
        min_length=min_length,
        max_length=max_length,
        normalize=normalize,
    )
    
    if merge_short:
        segments = merge_short_segments(segments, min_length)
    
    return segments


__all__ = [
    "TextSegment",
    "segment_script_for_tts",
    "normalize_text_for_tts",
    "estimate_duration",
]
