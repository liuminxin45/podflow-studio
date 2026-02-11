from pydantic import Field
from protocol.config_base import NodeConfigBase


class ReviewConfig(NodeConfigBase):
    """Review node configuration - 发布前审阅检查"""
    
    require_approval: bool = Field(
        default=False,
        description="是否需要人工确认后才能发布"
    )
