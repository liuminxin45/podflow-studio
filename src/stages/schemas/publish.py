"""
Publish Stage Schema

发布阶段的输入输出定义
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field

from src.stages.schemas.common import AudioPathsSchema, BaseStageInput, BaseStageOutput


class PublishConfig(BaseModel):
    """发布配置"""
    local_enabled: bool = True
    remote_enabled: bool = False
    platforms: List[str] = Field(default_factory=list)


class PublishInput(BaseStageInput):
    """Publish Stage 输入
    
    接收 Audio 输出的音频路径和脚本元数据
    """
    audio_paths: AudioPathsSchema
    title: str
    shownotes: str = ""
    tags: List[str] = Field(default_factory=list)
    publish_config: PublishConfig = Field(default_factory=PublishConfig)


class PublishResult(BaseModel):
    """发布结果"""
    platform: str
    success: bool
    url: Optional[str] = None
    error: Optional[str] = None


class PublishStats(BaseModel):
    """发布统计"""
    platforms_attempted: int = 0
    platforms_succeeded: int = 0
    platforms_failed: int = 0


class PublishOutput(BaseStageOutput):
    """Publish Stage 输出
    
    返回发布结果
    """
    published_path: Optional[str] = None
    results: List[PublishResult] = Field(default_factory=list)
    stats: PublishStats = Field(default_factory=PublishStats)
