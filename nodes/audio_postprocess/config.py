from pydantic import Field
from protocol.config_base import NodeConfigBase


class AudioPostprocessConfig(NodeConfigBase):
    """Audio post-processing node configuration."""

    output_dir: str = Field(default="out/episodes", description="输出目录")
    output_format: str = Field(default="mp3", description="输出格式")
    add_bgm: bool = Field(default=False, description="是否添加背景音乐")
    bgm_path: str = Field(default="", description="背景音乐路径")
    bgm_volume: float = Field(default=0.15, ge=0.0, le=1.0, description="背景音乐音量(0-1)")
