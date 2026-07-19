from pydantic import Field
from protocol.config_base import NodeConfigBase, LLMConfigMixin


class ResearchConfig(NodeConfigBase, LLMConfigMixin):
    """Research node configuration."""

    enable_web_search: bool = Field(default=False, description="是否启用网络搜索")
    max_search_results: int = Field(default=5, ge=1, le=20, description="最大搜索结果数")
