"""
Fetch Stage Configuration

独立的数据获取阶段配置，不依赖 .env 文件
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import List, Optional
import yaml

from src.stages.schemas.fetch import SourceConfig


def load_fetch_stage_config(config_path: Optional[str] = None) -> dict:
    """
    加载 Fetch Stage 配置
    
    优先级：
    1. 环境变量
    2. 指定的配置文件
    3. 默认配置文件 (config/optimized_settings.yaml)
    4. 默认值
    
    Args:
        config_path: 配置文件路径，如果为 None 则使用默认路径
        
    Returns:
        dict: 包含 sources 和 timeout_seconds 的配置字典
    """
    # 默认配置
    config_data = {
        "sources": [],
        "timeout_seconds": 30,
    }
    
    # 从配置文件加载
    if config_path is None:
        config_path = "config/optimized_settings.yaml"
    
    config_file = Path(config_path)
    if config_file.exists():
        try:
            with open(config_file, 'r', encoding='utf-8') as f:
                yaml_config = yaml.safe_load(f)
                
                # 加载 sources 配置
                if "sources" in yaml_config and "rss" in yaml_config["sources"]:
                    sources_config = yaml_config["sources"]["rss"]
                    sources = []
                    
                    for src in sources_config:
                        if src.get("enabled", False):
                            # 转换为 SourceConfig 格式
                            for url in src.get("urls", []):
                                sources.append({
                                    "name": src["name"],
                                    "fetcher": src["fetcher"],
                                    "url": url,
                                    "enabled": True,
                                    "extra": {"category": src.get("category", "general")}
                                })
                    
                    config_data["sources"] = sources
                    
        except Exception as e:
            import logging
            logging.getLogger("fetch.config").warning(f"Failed to load config from {config_path}: {e}")
    
    # 环境变量覆盖（最高优先级）
    if "FETCH_TIMEOUT_SECONDS" in os.environ:
        config_data["timeout_seconds"] = int(os.environ["FETCH_TIMEOUT_SECONDS"])
    
    return config_data


def save_fetch_stage_config(sources: List[dict], config_path: Optional[str] = None) -> None:
    """
    保存 Fetch Stage 配置到文件
    
    Args:
        sources: 数据源列表
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
    
    # 更新 sources 部分
    if "sources" not in yaml_config:
        yaml_config["sources"] = {}
    
    # 将 sources 转换回原始格式（按 name 分组）
    sources_by_name = {}
    for src in sources:
        name = src["name"]
        if name not in sources_by_name:
            sources_by_name[name] = {
                "name": name,
                "fetcher": src["fetcher"],
                "enabled": src.get("enabled", True),
                "category": src.get("extra", {}).get("category", "general"),
                "urls": []
            }
        sources_by_name[name]["urls"].append(src["url"])
    
    yaml_config["sources"]["rss"] = list(sources_by_name.values())
    
    # 保存回文件
    config_file.parent.mkdir(parents=True, exist_ok=True)
    with open(config_file, 'w', encoding='utf-8') as f:
        yaml.dump(yaml_config, f, allow_unicode=True, default_flow_style=False)
