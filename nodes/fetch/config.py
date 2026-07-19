from pydantic import Field
from protocol.config_base import NodeConfigBase


class FetchConfig(NodeConfigBase):
    """Fetch node configuration (Discover stage)."""

    topic: str = Field(default="", description="关注主题，用于相关度计算")
    breadth: int = Field(default=3, ge=1, le=5, description="信息广度 1-5")
    quality: int = Field(default=3, ge=1, le=5, description="内容质量 1-5")
    freshness: int = Field(default=4, ge=1, le=5, description="时效要求 1-5")
    recency_hours: int | None = Field(
        default=None,
        ge=0,
        le=24 * 365,
        description="前端发现页的时效窗口；None 时回退到 freshness。",
    )

    enabled_sources: list[str] = Field(
        default_factory=list, description="启用的数据源列表（文件名，不含.py扩展名）。"
    )
    newsnow_source_ids: list[str] = Field(
        default_factory=lambda: [
            "weibo",
            "zhihu",
            "baidu",
            "ithome",
            "36kr-quick",
            "github-trending-today",
            "hackernews",
            "wallstreetcn-quick",
            "cls-telegraph",
            "zaobao",
        ],
        description="NewsNow 子源 ID 列表，例如 weibo、zhihu、ithome。",
    )
    newsnow_base_url: str = Field(
        default="", description="NewsNow 服务地址，留空时使用 NEWSNOW_BASE_URL 或默认公开服务。"
    )

    min_relevance: int = Field(default=3, ge=1, le=5, description="最低相关度要求 1-5")
    allow_duplicates: bool = Field(default=False, description="是否允许重复内容")
    prefer_original: bool = Field(default=True, description="优先原始报道")
    language_mix: str = Field(default="mixed", description="语言偏好：chinese/english/mixed")
    result_limit: int = Field(
        default=10,
        ge=1,
        le=500,
        description="每个数据源采集条数；NewsNow 按每个子源分别限制。",
    )

    keywords: list[str] = Field(default_factory=list, description="重点关注词")
    exclude_keywords: list[str] = Field(default_factory=list, description="排除关键词")
    event_detection: bool = Field(default=True, description="事件聚合")
    trending_boost: bool = Field(default=False, description="热度加权")

    max_articles: int = Field(default=50, ge=1, le=500, description="输出数量上限")
    group_by_topic: bool = Field(default=True, description="按主题分组")
    include_summary: bool = Field(default=True, description="生成摘要")

    activePreset: str | None = Field(default=None, description="当前使用的预设（前端使用）")
