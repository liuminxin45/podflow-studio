"""
Research Configuration Loader

加载和管理研究相关的配置设置，支持从 settings.yaml 文件读取配置。

功能概述：
- 从 settings.yaml 加载研究配置
- 支持环境变量覆盖
- 提供默认配置值
- 配置验证和错误处理

主要类：
- ResearchSettings: 研究配置模型
- load_research_config(): 加载配置的工厂函数

使用示例：
    config = load_research_config()
    client = create_client_from_env(config.provider)

作者：Auto-Podcast Team
版本：1.0.0
更新：2025-12-29
"""

from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Any, Dict, Optional

import yaml
from pydantic import BaseModel, Field


class ResearchSettings(BaseModel):
    """研究配置模型"""
    provider: str = Field(default="metaso", description="研究服务提供商 (metaso, anspire)")
    enabled: bool = Field(default=True, description="是否启用研究功能")
    timeout_seconds: int = Field(default=60, description="请求超时时间（秒）")
    max_items: Optional[int] = Field(default=None, description="最大研究条目数")
    max_retries: int = Field(default=3, description="最大重试次数")
    retry_delay: float = Field(default=1.0, description="重试延迟时间（秒）")
    
    # Provider-specific settings
    metaso: Dict[str, Any] = Field(default_factory=dict, description="MetaSo特定配置")
    anspire: Dict[str, Any] = Field(default_factory=dict, description="Anspire特定配置")


def load_research_config(
    settings_path: Optional[str | Path] = None,
    env_prefix: str = "RESEARCH_"
) -> ResearchSettings:
    """
    从 settings.yaml 文件和环境变量加载研究配置
    
    Args:
        settings_path: settings.yaml 文件路径，默认为 ./config/settings.yaml
        env_prefix: 环境变量前缀，默认为 RESEARCH_
        
    Returns:
        ResearchSettings: 加载的配置对象
    """
    logger = logging.getLogger("research.config")
    
    # 默认配置路径
    if settings_path is None:
        settings_path = Path("./config/settings.yaml")
    else:
        settings_path = Path(settings_path)
    
    # 加载 YAML 配置
    config_data: Dict[str, Any] = {}
    
    if settings_path.exists():
        try:
            with open(settings_path, encoding="utf-8") as f:
                yaml_data = yaml.safe_load(f) or {}
            
            # 提取 research 配置段
            if "research" in yaml_data:
                config_data = yaml_data["research"]
                logger.info(f"已从 {settings_path} 加载研究配置")
            else:
                logger.warning(f"{settings_path} 中未找到 research 配置段，使用默认配置")
                
        except Exception as e:
            logger.error(f"加载 {settings_path} 失败: {e}，使用默认配置")
    else:
        logger.warning(f"{settings_path} 不存在，使用默认配置")
    
    # 环境变量覆盖
    env_overrides = {}
    
    # 基础配置的环境变量
    if f"{env_prefix}PROVIDER" in os.environ:
        env_overrides["provider"] = os.environ[f"{env_prefix}PROVIDER"]
    
    if f"{env_prefix}ENABLED" in os.environ:
        env_overrides["enabled"] = os.environ[f"{env_prefix}ENABLED"].lower() in ("true", "1", "yes")
    
    if f"{env_prefix}TIMEOUT_SECONDS" in os.environ:
        try:
            env_overrides["timeout_seconds"] = int(os.environ[f"{env_prefix}TIMEOUT_SECONDS"])
        except ValueError:
            logger.warning(f"无效的 {env_prefix}TIMEOUT_SECONDS 值")
    
    if f"{env_prefix}MAX_ITEMS" in os.environ:
        try:
            val = int(os.environ[f"{env_prefix}MAX_ITEMS"])
            env_overrides["max_items"] = val if val > 0 else None
        except ValueError:
            logger.warning(f"无效的 {env_prefix}MAX_ITEMS 值")
    
    if f"{env_prefix}MAX_RETRIES" in os.environ:
        try:
            env_overrides["max_retries"] = int(os.environ[f"{env_prefix}MAX_RETRIES"])
        except ValueError:
            logger.warning(f"无效的 {env_prefix}MAX_RETRIES 值")
    
    if f"{env_prefix}RETRY_DELAY" in os.environ:
        try:
            env_overrides["retry_delay"] = float(os.environ[f"{env_prefix}RETRY_DELAY"])
        except ValueError:
            logger.warning(f"无效的 {env_prefix}RETRY_DELAY 值")
    
    # 合并配置
    merged_config = {**config_data, **env_overrides}
    
    # 确保嵌套配置存在
    if "metaso" not in merged_config:
        merged_config["metaso"] = {}
    if "anspire" not in merged_config:
        merged_config["anspire"] = {}
    
    # 创建配置对象
    try:
        config = ResearchSettings(**merged_config)
        logger.info(f"研究配置加载完成: provider={config.provider}, enabled={config.enabled}")
        return config
    except Exception as e:
        logger.error(f"创建研究配置失败: {e}，使用默认配置")
        return ResearchSettings()


def get_provider_config(config: ResearchSettings, provider: str) -> Dict[str, Any]:
    """
    获取特定提供商的配置
    
    Args:
        config: 研究配置对象
        provider: 提供商名称 (metaso, anspire)
        
    Returns:
        Dict[str, Any]: 提供商特定配置
    """
    if provider == "metaso":
        return config.metaso or {}
    elif provider == "anspire":
        return config.anspire or {}
    else:
        return {}


__all__ = [
    "ResearchSettings",
    "load_research_config",
    "get_provider_config",
]
