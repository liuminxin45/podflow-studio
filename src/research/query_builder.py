"""
Query Builder Module

为断言构建调查查询（主查询 + 对照查询）。

查询策略：
- 主查询：直接验证断言的真实性
- 对照查询：寻找反驳或补充信息
- 时间约束：根据断言类型和场景调整时间范围
- 查询优化：关键词提取、查询扩展

作者：Auto-Podcast Team
版本：1.0.0
更新：2025-12-26
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

from src.research.claims import Claim
from src.research.claim_normalize import extract_key_terms


@dataclass
class ResearchQuery:
    """调查查询"""
    query_text: str
    query_type: str  # main / contrast / background
    claim_id: str  # 关联的断言ID（source_item_id + 索引）
    time_constraint: Optional[str] = None  # realtime / recent / any
    max_age_days: Optional[int] = None
    keywords: Optional[List[str]] = None
    metadata: Optional[Dict[str, Any]] = None
    
    def __post_init__(self):
        if self.keywords is None:
            self.keywords = []
        if self.metadata is None:
            self.metadata = {}
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "query_text": self.query_text,
            "query_type": self.query_type,
            "claim_id": self.claim_id,
            "time_constraint": self.time_constraint,
            "max_age_days": self.max_age_days,
            "keywords": self.keywords,
            "metadata": self.metadata,
        }


def _extract_entities(text: str) -> List[str]:
    """提取文本中的实体（简化版）"""
    entities = []
    
    # 提取引号内容
    quoted = re.findall(r'["""](.*?)["""]', text)
    entities.extend(quoted)
    
    # 提取数字+单位
    numbers = re.findall(r'\d+(?:\.\d+)?\s*(?:%|万|亿|千|百|元|美元|欧元|人|次|个)', text)
    entities.extend(numbers)
    
    # 提取时间表达
    dates = re.findall(r'\d{4}年\d{1,2}月\d{1,2}日|\d{4}年\d{1,2}月|\d{4}年', text)
    entities.extend(dates)
    
    return entities


def build_main_query(claim: Claim) -> str:
    """
    构建主查询（验证断言）
    
    Args:
        claim: 断言对象
        
    Returns:
        查询文本
    """
    text = claim.text
    
    # 提取关键实体
    entities = _extract_entities(text)
    keywords = extract_key_terms(text, top_n=3)
    
    # 根据断言类型构建查询
    if claim.claim_type == "factual":
        # 事实性断言：直接验证
        if entities:
            # 包含具体实体，直接使用
            query = text
        else:
            # 添加验证性关键词
            query = f"{text} 真实性 验证"
    
    elif claim.claim_type == "causal":
        # 因果关系：寻找证据链
        query = f"{text} 原因 影响 分析"
    
    elif claim.claim_type == "predictive":
        # 预测性断言：寻找依据和专家观点
        query = f"{text} 预测 依据 专家观点"
    
    elif claim.claim_type == "comparative":
        # 比较性断言：寻找对比数据
        query = f"{text} 对比 数据"
    
    else:
        # 默认
        query = text
    
    return query.strip()


def build_contrast_query(claim: Claim) -> Optional[str]:
    """
    构建对照查询（寻找反驳或不同观点）
    
    Args:
        claim: 断言对象
        
    Returns:
        查询文本，如果不需要对照查询则返回None
    """
    # 观点性断言不需要对照查询
    if claim.claim_type == "opinion":
        return None
    
    text = claim.text
    
    # 提取核心主题
    keywords = extract_key_terms(text, top_n=2)
    if not keywords:
        return None
    
    # 构建反向查询
    if claim.claim_type == "factual":
        query = f"{' '.join(keywords)} 质疑 反驳 不实"
    elif claim.claim_type == "causal":
        query = f"{' '.join(keywords)} 其他原因 替代解释"
    elif claim.claim_type == "predictive":
        query = f"{' '.join(keywords)} 不同预测 反对观点"
    else:
        query = f"{' '.join(keywords)} 不同观点 争议"
    
    return query.strip()


def determine_time_constraint(
    claim: Claim,
    *,
    scenario: str = "realtime",
    default_max_age_days: int = 30,
) -> tuple[str, Optional[int]]:
    """
    确定时间约束
    
    Args:
        claim: 断言对象
        scenario: 场景类型 (realtime / research)
        default_max_age_days: 默认最大天数
        
    Returns:
        (time_constraint, max_age_days)
    """
    if scenario == "realtime":
        # 实时场景：强时间约束
        if claim.claim_type == "predictive":
            # 预测性断言：需要最新信息
            return "realtime", 7
        elif claim.claim_type == "factual":
            # 事实性断言：中等时间约束
            return "recent", default_max_age_days
        else:
            return "recent", default_max_age_days * 2
    
    elif scenario == "research":
        # 研究场景：弱时间约束或无约束
        if claim.claim_type == "predictive":
            # 预测性断言仍需较新信息
            return "recent", default_max_age_days * 2
        else:
            # 其他类型：无时间约束
            return "any", None
    
    else:
        return "recent", default_max_age_days


def build_queries_for_claim(
    claim: Claim,
    *,
    scenario: str = "realtime",
    include_contrast: bool = True,
    max_age_days: int = 30,
) -> List[ResearchQuery]:
    """
    为单个断言构建查询集
    
    Args:
        claim: 断言对象
        scenario: 场景类型 (realtime / research)
        include_contrast: 是否包含对照查询
        max_age_days: 默认最大天数
        
    Returns:
        查询列表
    """
    queries: List[ResearchQuery] = []
    claim_id = f"{claim.source_item_id}:{claim.text[:50]}"
    
    # 确定时间约束
    time_constraint, age_days = determine_time_constraint(
        claim,
        scenario=scenario,
        default_max_age_days=max_age_days,
    )
    
    # 主查询
    main_query_text = build_main_query(claim)
    keywords = extract_key_terms(claim.text, top_n=5)
    
    main_query = ResearchQuery(
        query_text=main_query_text,
        query_type="main",
        claim_id=claim_id,
        time_constraint=time_constraint,
        max_age_days=age_days,
        keywords=keywords,
        metadata={
            "claim_type": claim.claim_type,
            "claim_confidence": claim.confidence,
            "source_location": claim.location,
        },
    )
    queries.append(main_query)
    
    # 对照查询
    if include_contrast:
        contrast_query_text = build_contrast_query(claim)
        if contrast_query_text:
            contrast_query = ResearchQuery(
                query_text=contrast_query_text,
                query_type="contrast",
                claim_id=claim_id,
                time_constraint=time_constraint,
                max_age_days=age_days,
                keywords=keywords,
                metadata={
                    "claim_type": claim.claim_type,
                    "parent_query": main_query_text,
                },
            )
            queries.append(contrast_query)
    
    return queries


def build_queries_batch(
    claims: List[Claim],
    *,
    scenario: str = "realtime",
    include_contrast: bool = True,
    max_age_days: int = 30,
) -> List[ResearchQuery]:
    """
    批量构建查询
    
    Args:
        claims: 断言列表
        scenario: 场景类型 (realtime / research)
        include_contrast: 是否包含对照查询
        max_age_days: 默认最大天数
        
    Returns:
        所有查询的列表
    """
    all_queries: List[ResearchQuery] = []
    
    for claim in claims:
        queries = build_queries_for_claim(
            claim,
            scenario=scenario,
            include_contrast=include_contrast,
            max_age_days=max_age_days,
        )
        all_queries.extend(queries)
    
    return all_queries


def optimize_query(query_text: str, max_length: int = 200) -> str:
    """
    优化查询文本（长度控制、关键词提取）
    
    Args:
        query_text: 原始查询文本
        max_length: 最大长度
        
    Returns:
        优化后的查询文本
    """
    if len(query_text) <= max_length:
        return query_text
    
    # 提取关键词
    keywords = extract_key_terms(query_text, top_n=5)
    
    # 如果关键词足够，使用关键词
    keywords_text = " ".join(keywords)
    if len(keywords_text) <= max_length:
        return keywords_text
    
    # 否则截断
    return query_text[:max_length].rsplit(" ", 1)[0] + "..."


__all__ = [
    "ResearchQuery",
    "build_queries_for_claim",
    "build_queries_batch",
    "optimize_query",
]
