"""
Script Stage Schema

脚本生成阶段的输入输出定义
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field

from src.stages.schemas.common import BaseStageInput, BaseStageOutput, ItemSchema


class ChannelConfig(BaseModel):
    """频道配置"""
    id: str = "life-consumer"
    name: str = "消费生活"
    host_name: str = "主播"
    style: str = "casual"
    target_duration_minutes: int = 5


class ScriptConfig(BaseModel):
    """脚本生成配置"""
    provider: str = "deepseek"
    temperature: float = 0.7
    timeout_seconds: int = 120
    segmented: bool = True  # 是否分段生成


class ScriptInput(BaseStageInput):
    """Script Stage 输入
    
    接收 Research 输出的增强 items
    """
    items: List[ItemSchema]
    channel: ChannelConfig = Field(default_factory=ChannelConfig)
    script_config: ScriptConfig = Field(default_factory=ScriptConfig)


class ScriptSegment(BaseModel):
    """脚本段落"""
    segment_id: str
    item_id: Optional[str] = None
    title: str
    ssml: str
    duration_estimate_seconds: Optional[float] = None


class ScriptStats(BaseModel):
    """脚本统计"""
    total_segments: int = 0
    total_chars: int = 0
    estimated_duration_seconds: float = 0.0


class ScriptOutput(BaseStageOutput):
    """Script Stage 输出
    
    返回生成的脚本
    """
    title: str = ""
    ssml: str = ""
    shownotes: str = ""
    tags: List[str] = Field(default_factory=list)
    segments: List[ScriptSegment] = Field(default_factory=list)
    stats: ScriptStats = Field(default_factory=ScriptStats)
