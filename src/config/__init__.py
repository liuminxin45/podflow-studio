"""
Configuration Module

全局配置模块，提供统一的配置加载接口
"""

from .global_config import (
    GlobalConfig,
    LLMConfig,
    ChannelConfig,
    OutputConfig,
    load_global_config,
    get_llm_config,
    get_channel_config,
    get_global_config,
)

__all__ = [
    "GlobalConfig",
    "LLMConfig",
    "ChannelConfig",
    "OutputConfig",
    "load_global_config",
    "get_llm_config",
    "get_channel_config",
    "get_global_config",
]
