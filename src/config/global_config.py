"""
Global Configuration Module

全局配置模块，提供 LLM 等共享配置，不依赖 .env 文件
各 stage 可以自由读取全局参数配置

优先级：
1. 环境变量
2. 配置文件 (config/optimized_settings.yaml)
3. 默认值
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any, Dict, Optional
import yaml
from pydantic import BaseModel, Field


class LLMConfig(BaseModel):
    """LLM 配置"""
    provider: str = "deepseek"
    model: str = "deepseek-chat"
    temperature: float = 0.7
    max_tokens: int = 4000
    timeout_seconds: int = 120
    
    # Provider-specific settings
    base_url: Optional[str] = None
    api_key: Optional[str] = None


class ChannelConfig(BaseModel):
    """频道配置"""
    id: str = "life-consumer"
    name: str = "生活与消费资讯"
    language: str = "zh-CN"
    style: Dict[str, Any] = Field(default_factory=lambda: {
        "audience": "普通消费者",
        "length_minutes": 6,
        "tone": "口语化、生动、像朋友聊天"
    })


class OutputConfig(BaseModel):
    """输出路径配置"""
    runs_dir: str = "./out/runs"
    fetch_archives_dir: str = "./out/fetch"
    script_dir: str = "./out/script"
    tts_dir: str = "./out/tts"
    render_dir: str = "./out/render"
    publish_dir: str = "./out/publish"


class GlobalConfig(BaseModel):
    """全局配置"""
    llm: LLMConfig = Field(default_factory=LLMConfig)
    channel: ChannelConfig = Field(default_factory=ChannelConfig)
    output: OutputConfig = Field(default_factory=OutputConfig)


def load_global_config(config_path: Optional[str] = None) -> GlobalConfig:
    """
    加载全局配置
    
    优先级：
    1. 环境变量
    2. 指定的配置文件
    3. 默认配置文件 (config/optimized_settings.yaml)
    4. 默认值
    
    Args:
        config_path: 配置文件路径，如果为 None 则使用默认路径
        
    Returns:
        GlobalConfig: 全局配置对象
    """
    # 默认配置
    config_data = {
        "llm": {
            "provider": "deepseek",
            "model": "deepseek-chat",
            "temperature": 0.7,
            "max_tokens": 4000,
            "timeout_seconds": 120,
        },
        "channel": {
            "id": "life-consumer",
            "name": "生活与消费资讯",
            "language": "zh-CN",
            "style": {
                "audience": "普通消费者",
                "length_minutes": 6,
                "tone": "口语化、生动、像朋友聊天"
            }
        },
        "output": {
            "runs_dir": "./out/runs",
            "fetch_archives_dir": "./out/fetch",
            "script_dir": "./out/script",
            "tts_dir": "./out/tts",
            "render_dir": "./out/render",
            "publish_dir": "./out/publish",
        }
    }
    
    # 从配置文件加载
    if config_path is None:
        config_path = "config/optimized_settings.yaml"
    
    config_file = Path(config_path)
    if config_file.exists():
        try:
            with open(config_file, 'r', encoding='utf-8') as f:
                yaml_config = yaml.safe_load(f)
                
                # 加载 LLM 配置
                if "llm" in yaml_config:
                    llm_cfg = yaml_config["llm"]
                    if "provider" in llm_cfg:
                        config_data["llm"]["provider"] = llm_cfg["provider"]
                    if "model" in llm_cfg:
                        config_data["llm"]["model"] = llm_cfg["model"]
                    if "temperature" in llm_cfg:
                        config_data["llm"]["temperature"] = llm_cfg["temperature"]
                    if "max_tokens" in llm_cfg:
                        config_data["llm"]["max_tokens"] = llm_cfg["max_tokens"]
                    if "timeout_seconds" in llm_cfg:
                        config_data["llm"]["timeout_seconds"] = llm_cfg["timeout_seconds"]
                    if "base_url" in llm_cfg:
                        config_data["llm"]["base_url"] = llm_cfg["base_url"]
                    if "api_key" in llm_cfg:
                        config_data["llm"]["api_key"] = llm_cfg["api_key"]
                
                # 加载频道配置
                if "channel" in yaml_config:
                    channel_cfg = yaml_config["channel"]
                    if "id" in channel_cfg:
                        config_data["channel"]["id"] = channel_cfg["id"]
                    if "name" in channel_cfg:
                        config_data["channel"]["name"] = channel_cfg["name"]
                    if "language" in channel_cfg:
                        config_data["channel"]["language"] = channel_cfg["language"]
                    if "style" in channel_cfg:
                        config_data["channel"]["style"] = channel_cfg["style"]
                
                # 加载输出配置
                if "output" in yaml_config:
                    output_cfg = yaml_config["output"]
                    for key in ["runs_dir", "fetch_archives_dir", "script_dir", "tts_dir", "render_dir", "publish_dir"]:
                        if key in output_cfg:
                            config_data["output"][key] = output_cfg[key]
                            
        except Exception as e:
            import logging
            logging.getLogger("config.global").warning(f"Failed to load config from {config_path}: {e}")
    
    # 环境变量覆盖（最高优先级）
    # LLM 配置
    if "LLM_PROVIDER" in os.environ:
        config_data["llm"]["provider"] = os.environ["LLM_PROVIDER"]
    if "LLM_MODEL" in os.environ:
        config_data["llm"]["model"] = os.environ["LLM_MODEL"]
    if "LLM_TEMPERATURE" in os.environ:
        config_data["llm"]["temperature"] = float(os.environ["LLM_TEMPERATURE"])
    if "LLM_MAX_TOKENS" in os.environ:
        config_data["llm"]["max_tokens"] = int(os.environ["LLM_MAX_TOKENS"])
    if "LLM_TIMEOUT_SECONDS" in os.environ:
        config_data["llm"]["timeout_seconds"] = int(os.environ["LLM_TIMEOUT_SECONDS"])
    if "LLM_BASE_URL" in os.environ:
        config_data["llm"]["base_url"] = os.environ["LLM_BASE_URL"]
    if "LLM_API_KEY" in os.environ:
        config_data["llm"]["api_key"] = os.environ["LLM_API_KEY"]
    
    # Provider-specific env vars (for backward compatibility)
    provider = config_data["llm"]["provider"].lower()
    if provider == "deepseek":
        if "DEEPSEEK_BASE_URL" in os.environ:
            config_data["llm"]["base_url"] = os.environ["DEEPSEEK_BASE_URL"]
        if "DEEPSEEK_API_KEY" in os.environ:
            config_data["llm"]["api_key"] = os.environ["DEEPSEEK_API_KEY"]
        if "DEEPSEEK_MODEL" in os.environ:
            config_data["llm"]["model"] = os.environ["DEEPSEEK_MODEL"]
    elif provider == "moonshot":
        if "MOONSHOT_BASE_URL" in os.environ:
            config_data["llm"]["base_url"] = os.environ["MOONSHOT_BASE_URL"]
        if "MOONSHOT_API_KEY" in os.environ:
            config_data["llm"]["api_key"] = os.environ["MOONSHOT_API_KEY"]
        if "MOONSHOT_MODEL" in os.environ:
            config_data["llm"]["model"] = os.environ["MOONSHOT_MODEL"]
    elif provider == "openai":
        if "OPENAI_BASE_URL" in os.environ:
            config_data["llm"]["base_url"] = os.environ["OPENAI_BASE_URL"]
        if "OPENAI_API_KEY" in os.environ:
            config_data["llm"]["api_key"] = os.environ["OPENAI_API_KEY"]
        if "OPENAI_MODEL" in os.environ:
            config_data["llm"]["model"] = os.environ["OPENAI_MODEL"]
    
    # 频道配置
    if "CHANNEL_ID" in os.environ:
        config_data["channel"]["id"] = os.environ["CHANNEL_ID"]
    if "CHANNEL_NAME" in os.environ:
        config_data["channel"]["name"] = os.environ["CHANNEL_NAME"]
    if "CHANNEL_LANGUAGE" in os.environ:
        config_data["channel"]["language"] = os.environ["CHANNEL_LANGUAGE"]
    
    return GlobalConfig(**config_data)


def get_llm_config(config_path: Optional[str] = None) -> LLMConfig:
    """
    获取 LLM 配置（便捷方法）
    
    Args:
        config_path: 配置文件路径
        
    Returns:
        LLMConfig: LLM 配置对象
    """
    global_config = load_global_config(config_path)
    return global_config.llm


def get_channel_config(config_path: Optional[str] = None) -> ChannelConfig:
    """
    获取频道配置（便捷方法）
    
    Args:
        config_path: 配置文件路径
        
    Returns:
        ChannelConfig: 频道配置对象
    """
    global_config = load_global_config(config_path)
    return global_config.channel


# 全局单例（可选使用）
_global_config_instance: Optional[GlobalConfig] = None


def get_global_config(reload: bool = False, config_path: Optional[str] = None) -> GlobalConfig:
    """
    获取全局配置单例
    
    Args:
        reload: 是否重新加载配置
        config_path: 配置文件路径
        
    Returns:
        GlobalConfig: 全局配置对象
    """
    global _global_config_instance
    
    if _global_config_instance is None or reload:
        _global_config_instance = load_global_config(config_path)
    
    return _global_config_instance
