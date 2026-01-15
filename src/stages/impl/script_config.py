"""
Script Stage Configuration

独立的脚本生成阶段配置，不依赖 .env 文件
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Optional
import yaml

from src.stages.schemas.script import ScriptConfig, ChannelConfig


def load_script_stage_config(config_path: Optional[str] = None) -> dict:
    """
    加载 Script Stage 配置
    
    优先级：
    1. 环境变量
    2. 指定的配置文件
    3. 默认配置文件 (config/optimized_settings.yaml)
    4. 默认值
    
    Args:
        config_path: 配置文件路径，如果为 None 则使用默认路径
        
    Returns:
        dict: 包含 script_config 和 channel 的配置字典
    """
    # 默认配置
    config_data = {
        "script_config": {
            "provider": "deepseek",
            "temperature": 0.7,
            "max_tokens": 4000,
        },
        "channel": {
            "id": "life-consumer",
            "name": "生活与消费资讯",
            "style": {
                "audience": "普通消费者",
                "length_minutes": 6,
                "tone": "口语化、生动、像朋友聊天"
            },
            "target_duration_minutes": 5,
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
                        config_data["script_config"]["provider"] = llm_cfg["provider"]
                    if "temperature" in llm_cfg:
                        config_data["script_config"]["temperature"] = llm_cfg["temperature"]
                    if "max_tokens" in llm_cfg:
                        config_data["script_config"]["max_tokens"] = llm_cfg["max_tokens"]
                
                # 加载 channel 配置
                if "channel" in yaml_config:
                    channel_cfg = yaml_config["channel"]
                    
                    if "id" in channel_cfg:
                        config_data["channel"]["id"] = channel_cfg["id"]
                    if "name" in channel_cfg:
                        config_data["channel"]["name"] = channel_cfg["name"]
                    if "style" in channel_cfg:
                        config_data["channel"]["style"] = channel_cfg["style"]
                    
                    # 从 style 中提取 target_duration_minutes
                    if "style" in channel_cfg and "length_minutes" in channel_cfg["style"]:
                        config_data["channel"]["target_duration_minutes"] = channel_cfg["style"]["length_minutes"]
                        
        except Exception as e:
            import logging
            logging.getLogger("script.config").warning(f"Failed to load config from {config_path}: {e}")
    
    # 环境变量覆盖（最高优先级）
    if "SCRIPT_PROVIDER" in os.environ:
        config_data["script_config"]["provider"] = os.environ["SCRIPT_PROVIDER"]
    if "SCRIPT_TEMPERATURE" in os.environ:
        config_data["script_config"]["temperature"] = float(os.environ["SCRIPT_TEMPERATURE"])
    if "SCRIPT_MAX_TOKENS" in os.environ:
        config_data["script_config"]["max_tokens"] = int(os.environ["SCRIPT_MAX_TOKENS"])
    
    if "CHANNEL_ID" in os.environ:
        config_data["channel"]["id"] = os.environ["CHANNEL_ID"]
    if "CHANNEL_NAME" in os.environ:
        config_data["channel"]["name"] = os.environ["CHANNEL_NAME"]
    if "CHANNEL_TARGET_DURATION_MINUTES" in os.environ:
        config_data["channel"]["target_duration_minutes"] = int(os.environ["CHANNEL_TARGET_DURATION_MINUTES"])
    
    return config_data


def save_script_stage_config(config: dict, config_path: Optional[str] = None) -> None:
    """
    保存 Script Stage 配置到文件
    
    Args:
        config: 脚本配置字典
        config_path: 配置文件路径，如果为 None 则使用默认路径
    """
    if config_path is None:
        config_path = "config/optimized_settings.yaml"
    
    config_file = Path(config_path)
    
    # 读取现有配置
    yaml_config = {}
    if config_file.exists():
        try:
            with open(config_file, 'r', encoding='utf-8') as f:
                yaml_config = yaml.safe_load(f) or {}
        except Exception:
            pass
    
    # 更新 llm 部分
    if "llm" not in yaml_config:
        yaml_config["llm"] = {}
    
    script_cfg = config.get("script_config", {})
    if "provider" in script_cfg:
        yaml_config["llm"]["provider"] = script_cfg["provider"]
    if "temperature" in script_cfg:
        yaml_config["llm"]["temperature"] = script_cfg["temperature"]
    if "max_tokens" in script_cfg:
        yaml_config["llm"]["max_tokens"] = script_cfg["max_tokens"]
    
    # 更新 channel 部分
    if "channel" not in yaml_config:
        yaml_config["channel"] = {}
    
    channel_cfg = config.get("channel", {})
    if "id" in channel_cfg:
        yaml_config["channel"]["id"] = channel_cfg["id"]
    if "name" in channel_cfg:
        yaml_config["channel"]["name"] = channel_cfg["name"]
    if "style" in channel_cfg:
        yaml_config["channel"]["style"] = channel_cfg["style"]
    
    # 保存回文件
    config_file.parent.mkdir(parents=True, exist_ok=True)
    with open(config_file, 'w', encoding='utf-8') as f:
        yaml.dump(yaml_config, f, allow_unicode=True, default_flow_style=False)
