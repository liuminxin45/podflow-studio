"""
Cluster Stage Schema

聚类阶段的输入输出定义
"""

from __future__ import annotations

from typing import Dict, List, Optional

from pydantic import BaseModel, Field

from src.stages.schemas.common import (
    BaseStageInput,
    BaseStageOutput,
    ClusterSchema,
    ItemSchema,
)


class ClusterConfig(BaseModel):
    """聚类配置"""
    simhash_max_distance: int = 4
    title_min_jaccard: float = 0.4
    time_window_days: int = 3
    cooldown_days: int = 2


class ClusterInput(BaseStageInput):
    """Cluster Stage 输入
    
    接收 Fetch 输出的 items
    """
    items: Dict[str, ItemSchema]
    cluster_config: ClusterConfig = Field(default_factory=ClusterConfig)


class ClusterStats(BaseModel):
    """聚类统计"""
    total_items: int = 0
    total_clusters: int = 0
    avg_cluster_size: float = 0.0
    max_cluster_size: int = 0


class ClusterOutput(BaseStageOutput):
    """Cluster Stage 输出
    
    返回聚类结果
    """
    clusters: List[ClusterSchema] = Field(default_factory=list)
    items: Dict[str, ItemSchema] = Field(default_factory=dict)  # 透传
    stats: ClusterStats = Field(default_factory=ClusterStats)
