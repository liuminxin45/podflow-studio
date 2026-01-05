"""
Configuration Helper

提供便捷的配置访问函数，用于替代 os.environ
"""

from __future__ import annotations

from typing import Any
from src.utils.config_loader import get_config_loader


def get_config(key: str, default: Any = None) -> Any:
    """
    获取配置值的便捷函数
    
    Args:
        key: 配置键，支持点号分隔，如 "llm.deepseek.api_key"
        default: 默认值
        
    Returns:
        配置值
    """
    loader = get_config_loader()
    return loader.get(key, default)


def get_llm_config(provider: str | None = None) -> dict:
    """
    获取 LLM 配置
    
    Args:
        provider: LLM 提供商
        
    Returns:
        LLM 配置字典
    """
    loader = get_config_loader()
    return loader.get_llm_config(provider)


def get_tts_config() -> dict:
    """
    获取 TTS 配置
    
    Returns:
        TTS 配置字典
    """
    loader = get_config_loader()
    return loader.get_tts_config()


def get_research_config(provider: str | None = None) -> dict:
    """
    获取 Research 配置
    
    Args:
        provider: Research 提供商
        
    Returns:
        Research 配置字典
    """
    loader = get_config_loader()
    return loader.get_research_config(provider)
