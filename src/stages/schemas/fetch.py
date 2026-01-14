"""
Fetch Stage Schema

数据获取阶段的输入输出定义
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field

from src.stages.schemas.common import BaseStageInput, BaseStageOutput, ItemSchema


class SourceConfig(BaseModel):
    """数据源配置"""
    name: str
    fetcher: str = "standard_rss"
    url: Optional[str] = None
    enabled: bool = True
    extra: Dict[str, Any] = Field(default_factory=dict)


class FetchInput(BaseStageInput):
    """Fetch Stage 输入
    
    描述要从哪些源获取数据
    """
    sources: List[SourceConfig] = Field(default_factory=list)
    timeout_seconds: int = 30
    
    # 可选：直接提供 items（跳过拉取）
    items_override: Optional[List[ItemSchema]] = None


class FetchStats(BaseModel):
    """Fetch 统计信息"""
    total_fetched: int = 0
    total_after_normalize: int = 0
    total_after_dedup: int = 0
    total_after_compliance: int = 0
    total_after_date_filter: int = 0
    sources_succeeded: int = 0
    sources_failed: int = 0


class FetchOutput(BaseStageOutput):
    """Fetch Stage 输出
    
    返回去重后的 items
    """
    items_raw: List[ItemSchema] = Field(default_factory=list)
    items_dedup: Dict[str, ItemSchema] = Field(default_factory=dict)
    stats: FetchStats = Field(default_factory=FetchStats)
