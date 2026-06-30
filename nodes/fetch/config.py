from pydantic import Field
from protocol.config_base import NodeConfigBase


class FetchConfig(NodeConfigBase):
    """Fetch node configuration (Discover stage)."""

    topic: str = Field(default="", description="关注主题，用于相关度计算")
    breadth: int = Field(default=3, ge=1, le=5, description="信息广度 1-5")
    quality: int = Field(default=3, ge=1, le=5, description="内容质量 1-5")
    freshness: int = Field(default=4, ge=1, le=5, description="时效要求 1-5")

    enabled_sources: list[str] = Field(
        default_factory=list, description="启用的数据源列表（文件名，不含.py扩展名）。"
    )

    min_relevance: int = Field(default=3, ge=1, le=5, description="最低相关度要求 1-5")
    allow_duplicates: bool = Field(default=False, description="是否允许重复内容")
    prefer_original: bool = Field(default=True, description="优先原始报道")
    language_mix: str = Field(default="mixed", description="语言偏好：chinese/english/mixed")

    keywords: list[str] = Field(default_factory=list, description="重点关注词")
    exclude_keywords: list[str] = Field(default_factory=list, description="排除关键词")
    event_detection: bool = Field(default=True, description="事件聚合")
    trending_boost: bool = Field(default=False, description="热度加权")

    max_articles: int = Field(default=50, ge=1, le=500, description="输出数量上限")
    group_by_topic: bool = Field(default=True, description="按主题分组")
    include_summary: bool = Field(default=True, description="生成摘要")

    activePreset: str | None = Field(default=None, description="当前使用的预设（前端使用）")

    monitor_enabled: bool = Field(default=False, description="是否启用雷达持续监控")
    monitor_interval_min: int = Field(default=30, ge=5, le=1440, description="雷达监控间隔（分钟）")
    monitor_keep_last: int = Field(default=100, ge=10, le=1000, description="雷达结果保留条数上限")
