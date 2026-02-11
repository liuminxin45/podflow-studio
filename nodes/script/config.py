from typing import Dict, Any
from pydantic import Field
from protocol.config_base import NodeConfigBase, LLMConfigMixin


class ScriptConfig(NodeConfigBase, LLMConfigMixin):
    """Script generation node configuration."""
    
    target_duration_minutes: int = Field(
        default=15, 
        ge=1, 
        le=120,
        description="目标播客时长（分钟）"
    )
    dialogue_style: str = Field(
        default="conversational",
        description="对话风格（conversational/formal/casual）"
    )
    num_hosts: int = Field(
        default=2, 
        ge=1, 
        le=5,
        description="主持人数量"
    )
    require_approval: bool = Field(
        default=False,
        description="是否需要人工审批。开启后，脚本生成完成会暂停等待人工审批；关闭则由AI自动处理"
    )
    words_per_minute: int = Field(
        default=150,
        ge=50,
        le=400,
        description="语速（字/分钟），用于估算段落时长"
    )
