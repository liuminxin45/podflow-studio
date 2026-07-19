from pydantic import Field

from protocol.config_base import NodeConfigBase
from protocol.presets import get_default_preset


class FactsConfig(NodeConfigBase):
    """Fact card generation configuration."""

    max_facts: int = Field(default=20, ge=1, le=50, description="最多生成事实卡片数量")
    selected_topic_count: int = Field(
        default_factory=lambda: int(get_default_preset()["recommended_news_item_count"]),
        ge=1,
        le=50,
        description="默认早报推荐条目数量",
    )
