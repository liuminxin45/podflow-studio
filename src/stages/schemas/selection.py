"""
Selection Stage Schema

选题阶段的输入输出定义
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field

from src.stages.schemas.common import (
    BaseStageInput,
    BaseStageOutput,
    ClusterSchema,
    ItemSchema,
)


class ScoringWeights(BaseModel):
    """评分权重"""
    freshness: float = 0.4
    impact: float = 0.3
    source_trust: float = 0.2
    quality: float = 0.1


class SelectionConfig(BaseModel):
    """选题配置"""
    max_clusters: int = 5
    weights: ScoringWeights = Field(default_factory=ScoringWeights)
    
    # Auto topic 配置
    auto_topic_enabled: bool = False
    strategy: str = "balanced"


class TopicCandidate(BaseModel):
    """选题候选"""
    topic_id: str
    title: str
    score: float
    decision: str  # pass / discard
    items: List[str] = Field(default_factory=list)
    reasoning: Optional[str] = None


class SelectionInput(BaseStageInput):
    """Selection Stage 输入
    
    接收 Cluster 输出的聚类和 items
    """
    clusters: List[ClusterSchema]
    items: Dict[str, ItemSchema]
    selection_config: SelectionConfig = Field(default_factory=SelectionConfig)


class SelectionStats(BaseModel):
    """选题统计"""
    total_clusters: int = 0
    passed_topics: int = 0
    discarded_topics: int = 0
    total_items_selected: int = 0


class SelectionOutput(BaseStageOutput):
    """Selection Stage 输出
    
    返回选中的 items
    """
    items_selected: List[ItemSchema] = Field(default_factory=list)
    topic_candidates: List[TopicCandidate] = Field(default_factory=list)
    stats: SelectionStats = Field(default_factory=SelectionStats)
    
    # 透传数据（供后续 Stage 使用）
    all_items: Dict[str, ItemSchema] = Field(default_factory=dict)
