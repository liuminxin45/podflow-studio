from pydantic import Field
from protocol.config_base import NodeConfigBase


class ManualConfig(NodeConfigBase):
    """Manual input node configuration."""

    news_items: list[dict[str, str]] = Field(
        default_factory=list,
        description="手动输入的新闻列表。每条新闻包含title（标题）和content（内容）字段。",
    )
