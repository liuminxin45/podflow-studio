"""
Publish Stage Configuration

独立的发布阶段配置，不依赖 .env 文件
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Optional
import yaml

from src.stages.schemas.publish import PublishConfig


def load_publish_stage_config(config_path: Optional[str] = None) -> PublishConfig:
    """
    加载 Publish Stage 配置
    
    优先级：
    1. 环境变量
    2. 指定的配置文件
    3. 默认配置文件 (config/optimized_settings.yaml)
    4. 默认值
    
    Args:
        config_path: 配置文件路径，如果为 None 则使用默认路径
        
    Returns:
        PublishConfig: 发布配置对象
    """
    # 默认配置
    config_data = {
        "local_enabled": True,
        "remote_enabled": False,
        "platforms": [],
    }
    
    # 从配置文件加载
    if config_path is None:
        config_path = "config/optimized_settings.yaml"
    
    config_file = Path(config_path)
    if config_file.exists():
        try:
            with open(config_file, 'r', encoding='utf-8') as f:
                yaml_config = yaml.safe_load(f)
                
                # 加载 publish 配置
                if "publish" in yaml_config:
                    publish_cfg = yaml_config["publish"]
                    
                    if "local_enabled" in publish_cfg:
                        config_data["local_enabled"] = publish_cfg["local_enabled"]
                    if "remote_enabled" in publish_cfg:
                        config_data["remote_enabled"] = publish_cfg["remote_enabled"]
                    if "platforms" in publish_cfg:
                        config_data["platforms"] = publish_cfg["platforms"]
                        
        except Exception as e:
            import logging
            logging.getLogger("publish.config").warning(f"Failed to load config from {config_path}: {e}")
    
    # 环境变量覆盖（最高优先级）
    if "PUBLISH_LOCAL_ENABLED" in os.environ:
        config_data["local_enabled"] = os.environ["PUBLISH_LOCAL_ENABLED"].lower() in ("true", "1", "yes")
    if "PUBLISH_REMOTE_ENABLED" in os.environ:
        config_data["remote_enabled"] = os.environ["PUBLISH_REMOTE_ENABLED"].lower() in ("true", "1", "yes")
    if "PUBLISH_PLATFORMS" in os.environ:
        config_data["platforms"] = [p.strip() for p in os.environ["PUBLISH_PLATFORMS"].split(",")]
    
    return PublishConfig(**config_data)


def save_publish_stage_config(config: PublishConfig, config_path: Optional[str] = None) -> None:
    """
    保存 Publish Stage 配置到文件
    
    Args:
        config: 发布配置对象
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
    
    # 更新 publish 部分
    if "publish" not in yaml_config:
        yaml_config["publish"] = {}
    
    yaml_config["publish"]["local_enabled"] = config.local_enabled
    yaml_config["publish"]["remote_enabled"] = config.remote_enabled
    yaml_config["publish"]["platforms"] = config.platforms
    
    # 保存回文件
    config_file.parent.mkdir(parents=True, exist_ok=True)
    with open(config_file, 'w', encoding='utf-8') as f:
        yaml.dump(yaml_config, f, allow_unicode=True, default_flow_style=False)
