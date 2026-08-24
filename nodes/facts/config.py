from pydantic import Field

from protocol.config_base import LLMConfigMixin, NodeConfigBase
from protocol.presets import get_default_preset


class FactsConfig(NodeConfigBase, LLMConfigMixin):
    """Fact card generation configuration."""

    max_facts: int = Field(default=20, ge=1, le=50, description="最多生成事实卡片数量")
    selected_topic_count: int = Field(
        default_factory=lambda: int(get_default_preset()["recommended_news_item_count"]),
        ge=1,
        le=50,
        description="默认早报推荐条目数量",
    )
    require_semantic_verification: bool = Field(
        default=False,
        description="正式候选必须由配置模型逐主张核验；关闭时只能生成 demo-only 诊断数据",
    )
