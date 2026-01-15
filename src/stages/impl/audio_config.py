"""
Audio Stage Configuration

独立的音频生成阶段配置，不依赖 .env 文件
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Optional
import yaml

from src.stages.schemas.audio import AudioConfig, TTSConfig, RenderConfig


def load_audio_stage_config(config_path: Optional[str] = None) -> AudioConfig:
    """
    加载 Audio Stage 配置
    
    优先级：
    1. 环境变量
    2. 指定的配置文件
    3. 默认配置文件 (config/optimized_settings.yaml)
    4. 默认值
    
    Args:
        config_path: 配置文件路径，如果为 None 则使用默认路径
        
    Returns:
        AudioConfig: 音频配置对象
    """
    # 默认配置
    config_data = {
        "tts": {
            "provider": "doubao",
            "mode": "podcast",
            "timeout_seconds": 120,
        },
        "render": {
            "add_bgm": True,
            "add_intro": True,
            "add_outro": True,
            "normalize_loudness": True,
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
                
                # 加载 TTS 配置
                if "tts" in yaml_config:
                    tts_cfg = yaml_config["tts"]
                    
                    if "provider" in tts_cfg:
                        config_data["tts"]["provider"] = tts_cfg["provider"]
                    if "mode" in tts_cfg:
                        config_data["tts"]["mode"] = tts_cfg["mode"]
                    if "timeout_seconds" in tts_cfg:
                        config_data["tts"]["timeout_seconds"] = tts_cfg["timeout_seconds"]
                        
        except Exception as e:
            import logging
            logging.getLogger("audio.config").warning(f"Failed to load config from {config_path}: {e}")
    
    # 环境变量覆盖（最高优先级）
    if "TTS_PROVIDER" in os.environ:
        config_data["tts"]["provider"] = os.environ["TTS_PROVIDER"]
    if "TTS_MODE" in os.environ:
        config_data["tts"]["mode"] = os.environ["TTS_MODE"]
    if "TTS_TIMEOUT_SECONDS" in os.environ:
        config_data["tts"]["timeout_seconds"] = int(os.environ["TTS_TIMEOUT_SECONDS"])
    
    # Doubao-specific env var
    if "DOUBAO_MODE" in os.environ:
        config_data["tts"]["mode"] = os.environ["DOUBAO_MODE"]
    
    if "RENDER_ADD_BGM" in os.environ:
        config_data["render"]["add_bgm"] = os.environ["RENDER_ADD_BGM"].lower() in ("true", "1", "yes")
    if "RENDER_ADD_INTRO" in os.environ:
        config_data["render"]["add_intro"] = os.environ["RENDER_ADD_INTRO"].lower() in ("true", "1", "yes")
    if "RENDER_ADD_OUTRO" in os.environ:
        config_data["render"]["add_outro"] = os.environ["RENDER_ADD_OUTRO"].lower() in ("true", "1", "yes")
    if "RENDER_NORMALIZE_LOUDNESS" in os.environ:
        config_data["render"]["normalize_loudness"] = os.environ["RENDER_NORMALIZE_LOUDNESS"].lower() in ("true", "1", "yes")
    
    return AudioConfig(**config_data)


def save_audio_stage_config(config: AudioConfig, config_path: Optional[str] = None) -> None:
    """
    保存 Audio Stage 配置到文件
    
    Args:
        config: 音频配置对象
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
    
    # 更新 tts 部分
    if "tts" not in yaml_config:
        yaml_config["tts"] = {}
    
    yaml_config["tts"]["provider"] = config.tts.provider
    yaml_config["tts"]["mode"] = config.tts.mode
    yaml_config["tts"]["timeout_seconds"] = config.tts.timeout_seconds
    
    # 保存回文件
    config_file.parent.mkdir(parents=True, exist_ok=True)
    with open(config_file, 'w', encoding='utf-8') as f:
        yaml.dump(yaml_config, f, allow_unicode=True, default_flow_style=False)
