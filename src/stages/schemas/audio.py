"""
Audio Stage Schema

音频生成阶段的输入输出定义
"""

from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, Field

from src.stages.schemas.common import AudioPathsSchema, BaseStageInput, BaseStageOutput
from src.stages.schemas.script import ScriptSegment


class TTSConfig(BaseModel):
    """TTS 配置"""
    provider: str = "doubao"
    mode: str = "podcast"  # podcast / tts / voiceclone_http
    timeout_seconds: int = 120


class RenderConfig(BaseModel):
    """音频渲染配置"""
    add_bgm: bool = True
    add_intro: bool = True
    add_outro: bool = True
    normalize_loudness: bool = True


class AudioConfig(BaseModel):
    """音频配置"""
    tts: TTSConfig = Field(default_factory=TTSConfig)
    render: RenderConfig = Field(default_factory=RenderConfig)


class AudioInput(BaseStageInput):
    """Audio Stage 输入
    
    接收 Script 输出的脚本内容
    """
    ssml: str
    segments: List[ScriptSegment] = Field(default_factory=list)
    audio_config: AudioConfig = Field(default_factory=AudioConfig)


class AudioSegmentOutput(BaseModel):
    """音频段落输出"""
    segment_id: str
    tts_path: str
    duration_seconds: float


class AudioStats(BaseModel):
    """音频统计"""
    total_segments: int = 0
    total_duration_seconds: float = 0.0
    tts_chars_processed: int = 0


class AudioOutput(BaseStageOutput):
    """Audio Stage 输出
    
    返回生成的音频路径
    """
    audio_paths: AudioPathsSchema = Field(default_factory=AudioPathsSchema)
    segments: List[AudioSegmentOutput] = Field(default_factory=list)
    stats: AudioStats = Field(default_factory=AudioStats)
