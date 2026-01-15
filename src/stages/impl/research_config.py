"""
Research Stage Configuration

独立的研究阶段配置，不依赖 .env 文件
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Optional
import yaml

from src.stages.schemas.research import ResearchConfig


def load_research_stage_config(config_path: Optional[str] = None) -> ResearchConfig:
    """
    加载 Research Stage 配置
    
    优先级：
    1. 环境变量
    2. 指定的配置文件
    3. 默认配置文件 (config/optimized_settings.yaml)
    4. 默认值
    
    Args:
        config_path: 配置文件路径，如果为 None 则使用默认路径
        
    Returns:
        ResearchConfig: 研究配置对象
    """
    # 默认配置
    config_data = {
        "enabled": True,
        "provider": "anspire",
        "max_total_claims": 20,
        "max_claims_per_item": 5,
        "min_claim_confidence": 0.6,
        "include_opinions": False,
        "include_contrast_queries": True,
    }
    
    # 从配置文件加载
    if config_path is None:
        config_path = "config/optimized_settings.yaml"
    
    config_file = Path(config_path)
    if config_file.exists():
        try:
            with open(config_file, 'r', encoding='utf-8') as f:
                yaml_config = yaml.safe_load(f)
                research_cfg = yaml_config.get("research", {})
                
                # 映射配置字段
                if "enabled" in research_cfg:
                    config_data["enabled"] = research_cfg["enabled"]
                if "provider" in research_cfg:
                    config_data["provider"] = research_cfg["provider"]
                if "max_items" in research_cfg:
                    config_data["max_total_claims"] = research_cfg["max_items"]
                if "max_sources" in research_cfg:
                    config_data["max_claims_per_item"] = research_cfg["max_sources"]
                if "timeout_seconds" in research_cfg:
                    # 可以添加到 ResearchConfig 如果需要
                    pass
        except Exception as e:
            import logging
            logging.getLogger("research.config").warning(f"Failed to load config from {config_path}: {e}")
    
    # 环境变量覆盖（最高优先级）
    if "RESEARCH_ENABLED" in os.environ:
        config_data["enabled"] = os.environ["RESEARCH_ENABLED"].lower() in ("true", "1", "yes")
    if "RESEARCH_PROVIDER" in os.environ:
        config_data["provider"] = os.environ["RESEARCH_PROVIDER"]
    if "RESEARCH_MAX_TOTAL_CLAIMS" in os.environ:
        config_data["max_total_claims"] = int(os.environ["RESEARCH_MAX_TOTAL_CLAIMS"])
    if "RESEARCH_MAX_CLAIMS_PER_ITEM" in os.environ:
        config_data["max_claims_per_item"] = int(os.environ["RESEARCH_MAX_CLAIMS_PER_ITEM"])
    if "RESEARCH_MIN_CLAIM_CONFIDENCE" in os.environ:
        config_data["min_claim_confidence"] = float(os.environ["RESEARCH_MIN_CLAIM_CONFIDENCE"])
    if "RESEARCH_INCLUDE_OPINIONS" in os.environ:
        config_data["include_opinions"] = os.environ["RESEARCH_INCLUDE_OPINIONS"].lower() in ("true", "1", "yes")
    if "RESEARCH_INCLUDE_CONTRAST_QUERIES" in os.environ:
        config_data["include_contrast_queries"] = os.environ["RESEARCH_INCLUDE_CONTRAST_QUERIES"].lower() in ("true", "1", "yes")
    
    return ResearchConfig(**config_data)


def save_research_stage_config(config: ResearchConfig, config_path: Optional[str] = None) -> None:
    """
    保存 Research Stage 配置到文件
    
    Args:
        config: 研究配置对象
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
    
    # 更新 research 部分
    if "research" not in yaml_config:
        yaml_config["research"] = {}
    
    yaml_config["research"]["enabled"] = config.enabled
    yaml_config["research"]["provider"] = config.provider
    yaml_config["research"]["max_items"] = config.max_total_claims
    yaml_config["research"]["max_sources"] = config.max_claims_per_item
    
    # 保存回文件
    config_file.parent.mkdir(parents=True, exist_ok=True)
    with open(config_file, 'w', encoding='utf-8') as f:
        yaml.dump(yaml_config, f, allow_unicode=True, default_flow_style=False)
