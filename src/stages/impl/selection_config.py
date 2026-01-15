"""
Selection Stage Configuration

独立的选题阶段配置，不依赖 .env 文件
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Optional
import yaml

from src.stages.schemas.selection import SelectionConfig


def load_selection_stage_config(config_path: Optional[str] = None) -> dict:
    """
    加载 Selection Stage 配置
    
    优先级：
    1. 环境变量
    2. 指定的配置文件
    3. 默认配置文件 (config/optimized_settings.yaml)
    4. 默认值
    
    Args:
        config_path: 配置文件路径，如果为 None 则使用默认路径
        
    Returns:
        dict: 选题配置字典
    """
    # 默认配置
    config_data = {
        "max_clusters": 5,
        "weights": {
            "freshness": 0.4,
            "impact": 0.3,
            "source_trust": 0.2,
            "quality": 0.1,
        },
        "auto_topic_enabled": False,
        "strategy": "balanced",
    }
    
    # 从配置文件加载
    if config_path is None:
        config_path = "config/optimized_settings.yaml"
    
    config_file = Path(config_path)
    if config_file.exists():
        try:
            with open(config_file, 'r', encoding='utf-8') as f:
                yaml_config = yaml.safe_load(f)
                
                # 加载 selection 配置
                if "selection" in yaml_config:
                    selection_cfg = yaml_config["selection"]
                    
                    if "constraints" in selection_cfg and "max_clusters" in selection_cfg["constraints"]:
                        config_data["max_clusters"] = selection_cfg["constraints"]["max_clusters"]
                
                # 加载 auto_topic 配置
                if "auto_topic" in yaml_config:
                    auto_topic_cfg = yaml_config["auto_topic"]
                    
                    if "enabled" in auto_topic_cfg:
                        config_data["auto_topic_enabled"] = auto_topic_cfg["enabled"]
                
                # 加载 channel 配置
                if "channel" in yaml_config:
                    channel_cfg = yaml_config["channel"]
                    
                    if "auto_topic_strategy" in channel_cfg:
                        config_data["strategy"] = channel_cfg["auto_topic_strategy"]
                        
        except Exception as e:
            import logging
            logging.getLogger("selection.config").warning(f"Failed to load config from {config_path}: {e}")
    
    # 环境变量覆盖（最高优先级）
    if "SELECTION_MAX_CLUSTERS" in os.environ:
        config_data["max_clusters"] = int(os.environ["SELECTION_MAX_CLUSTERS"])
    if "SELECTION_AUTO_TOPIC_ENABLED" in os.environ:
        config_data["auto_topic_enabled"] = os.environ["SELECTION_AUTO_TOPIC_ENABLED"].lower() in ("true", "1", "yes")
    if "SELECTION_STRATEGY" in os.environ:
        config_data["strategy"] = os.environ["SELECTION_STRATEGY"]
    
    return config_data


def save_selection_stage_config(config: dict, config_path: Optional[str] = None) -> None:
    """
    保存 Selection Stage 配置到文件
    
    Args:
        config: 选题配置字典
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
    
    # 更新 selection 部分
    if "selection" not in yaml_config:
        yaml_config["selection"] = {}
    if "constraints" not in yaml_config["selection"]:
        yaml_config["selection"]["constraints"] = {}
    
    yaml_config["selection"]["constraints"]["max_clusters"] = config.get("max_clusters", 5)
    
    # 更新 auto_topic 部分
    if "auto_topic" not in yaml_config:
        yaml_config["auto_topic"] = {}
    
    yaml_config["auto_topic"]["enabled"] = config.get("auto_topic_enabled", False)
    
    # 更新 channel 部分
    if "channel" not in yaml_config:
        yaml_config["channel"] = {}
    
    yaml_config["channel"]["auto_topic_strategy"] = config.get("strategy", "balanced")
    
    # 保存回文件
    config_file.parent.mkdir(parents=True, exist_ok=True)
    with open(config_file, 'w', encoding='utf-8') as f:
        yaml.dump(yaml_config, f, allow_unicode=True, default_flow_style=False)
