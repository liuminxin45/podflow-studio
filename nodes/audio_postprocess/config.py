from pydantic import Field
from protocol.config_base import NodeConfigBase


class AudioPostprocessConfig(NodeConfigBase):
    """Audio post-processing node configuration."""

    output_dir: str = Field(default="out/episodes", description="输出目录")
    output_format: str = Field(default="mp3", description="输出格式")
    final_basename: str = Field(default="final", description="最终音频文件名（不含扩展名）")
    segment_pause_ms: int = Field(default=600, ge=0, le=5000, description="段间停顿毫秒数")
    normalize_loudness: bool = Field(default=True, description="是否进行基础响度标准化")
    trim_silence: bool = Field(default=False, description="是否裁剪静音（依赖可用时启用）")
    add_bgm: bool = Field(default=False, description="是否添加背景音乐")
    bgm_path: str = Field(default="", description="背景音乐路径")
    bgm_volume: float = Field(default=0.15, ge=0.0, le=1.0, description="背景音乐音量(0-1)")
    allow_missing_segments: bool = Field(
        default=False,
        description="是否允许忽略缺失的源片段并继续生成不完整成品",
    )
