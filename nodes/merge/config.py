from pydantic import Field
from protocol.config_base import NodeConfigBase


class MergeConfig(NodeConfigBase):
    """Merge node configuration - 创作素材池整合配置"""

    deduplicate: bool = Field(default=True, description="是否对合并后的内容进行去重")

    similarity_threshold: float = Field(
        default=0.8, description="去重时的相似度阈值（0-1），越高越严格"
    )
