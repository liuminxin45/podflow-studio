"""
Cluster Stage Configuration

独立的聚类阶段配置，不依赖 .env 文件
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Optional
import yaml

from src.stages.schemas.cluster import ClusterConfig


def load_cluster_stage_config(config_path: Optional[str] = None) -> ClusterConfig:
    """
    加载 Cluster Stage 配置
    
    优先级：
    1. 环境变量
    2. 指定的配置文件
    3. 默认配置文件 (config/optimized_settings.yaml)
    4. 默认值
    
    Args:
        config_path: 配置文件路径，如果为 None 则使用默认路径
        
    Returns:
        ClusterConfig: 聚类配置对象
    """
    # 默认配置
    config_data = {
        "simhash_max_distance": 4,
        "title_min_jaccard": 0.4,
        "time_window_days": 1,
    }
    
    # 从配置文件加载
    if config_path is None:
        config_path = "config/optimized_settings.yaml"
    
    config_file = Path(config_path)
    if config_file.exists():
        try:
            with open(config_file, 'r', encoding='utf-8') as f:
                yaml_config = yaml.safe_load(f)
                
                # 加载 clustering 配置
                if "selection" in yaml_config and "clustering" in yaml_config["selection"]:
                    cluster_cfg = yaml_config["selection"]["clustering"]
                    
                    if "simhash_max_distance" in cluster_cfg:
                        config_data["simhash_max_distance"] = cluster_cfg["simhash_max_distance"]
                    if "title_min_jaccard" in cluster_cfg:
                        config_data["title_min_jaccard"] = cluster_cfg["title_min_jaccard"]
                    if "time_window_days" in cluster_cfg:
                        config_data["time_window_days"] = cluster_cfg["time_window_days"]
                        
        except Exception as e:
            import logging
            logging.getLogger("cluster.config").warning(f"Failed to load config from {config_path}: {e}")
    
    # 环境变量覆盖（最高优先级）
    if "CLUSTER_SIMHASH_MAX_DISTANCE" in os.environ:
        config_data["simhash_max_distance"] = int(os.environ["CLUSTER_SIMHASH_MAX_DISTANCE"])
    if "CLUSTER_TITLE_MIN_JACCARD" in os.environ:
        config_data["title_min_jaccard"] = float(os.environ["CLUSTER_TITLE_MIN_JACCARD"])
    if "CLUSTER_TIME_WINDOW_DAYS" in os.environ:
        config_data["time_window_days"] = int(os.environ["CLUSTER_TIME_WINDOW_DAYS"])
    
    return ClusterConfig(**config_data)


def save_cluster_stage_config(config: ClusterConfig, config_path: Optional[str] = None) -> None:
    """
    保存 Cluster Stage 配置到文件
    
    Args:
        config: 聚类配置对象
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
    
    # 更新 clustering 部分
    if "selection" not in yaml_config:
        yaml_config["selection"] = {}
    if "clustering" not in yaml_config["selection"]:
        yaml_config["selection"]["clustering"] = {}
    
    yaml_config["selection"]["clustering"]["simhash_max_distance"] = config.simhash_max_distance
    yaml_config["selection"]["clustering"]["title_min_jaccard"] = config.title_min_jaccard
    yaml_config["selection"]["clustering"]["time_window_days"] = config.time_window_days
    
    # 保存回文件
    config_file.parent.mkdir(parents=True, exist_ok=True)
    with open(config_file, 'w', encoding='utf-8') as f:
        yaml.dump(yaml_config, f, allow_unicode=True, default_flow_style=False)
