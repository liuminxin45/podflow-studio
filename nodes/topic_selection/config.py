from pydantic import Field
from protocol.config_base import NodeConfigBase, LLMConfigMixin


class TopicSelectionConfig(NodeConfigBase, LLMConfigMixin):
    """Topic selection node configuration."""

    temperature: float = Field(default=0.3, ge=0.0, le=2.0, description="LLM temperature")
    min_cluster_size: int = Field(default=3, ge=1, le=20, description="最小聚类大小")
    max_topics: int = Field(default=1, ge=1, le=10, description="最大主题数")
    use_llm_scoring: bool = Field(default=True, description="是否使用LLM评分")

    # Auto Selection Mode (for Discover layer)
    mode: str = Field(default="cluster", description="选题模式: cluster / analyze_relevance")
    target_topic: str = Field(default="", description="目标主题（analyze_relevance模式）")
    time_range_hours: int = Field(default=24, ge=1, le=720, description="时间范围（小时）")
    focus_instruction: str = Field(default="", description="额外指令")
    min_match_score: int = Field(default=70, ge=0, le=100, description="最低匹配分数")
    max_items: int = Field(default=10, ge=1, le=100, description="最大选取条目数")
