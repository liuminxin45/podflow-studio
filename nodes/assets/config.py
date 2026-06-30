from pydantic import Field
from protocol.config_base import NodeConfigBase


class AssetsConfig(NodeConfigBase):
    """Assets node configuration."""

    output_dir: str = Field(default="out/assets", description="输出目录")
    generate_cover: bool = Field(default=True, description="是否生成封面")
    cover_size: list[int] = Field(
        default_factory=lambda: [1400, 1400], description="封面尺寸 [宽, 高]"
    )
