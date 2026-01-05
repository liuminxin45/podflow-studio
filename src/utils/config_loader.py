"""
Unified Configuration Loader

统一配置加载器，从 settings.yaml 读取所有配置
"""

from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, Optional
import yaml


class ConfigLoader:
    """统一配置加载器"""
    
    def __init__(self, settings_path: str | Path = "config/base/settings.yaml"):
        """
        初始化配置加载器
        
        Args:
            settings_path: settings.yaml 文件路径
        """
        self.settings_path = Path(settings_path)
        self._config: Dict[str, Any] = {}
        self._load_config()
    
    def _load_config(self):
        """加载配置文件"""
        if self.settings_path.exists():
            with open(self.settings_path, "r", encoding="utf-8") as f:
                self._config = yaml.safe_load(f) or {}
        else:
            raise FileNotFoundError(f"配置文件不存在: {self.settings_path}")
    
    def get(self, key: str, default: Any = None) -> Any:
        """
        获取配置值
        
        Args:
            key: 配置键，支持点号分隔的嵌套键，如 "llm.deepseek.api_key"
            default: 默认值
            
        Returns:
            配置值
        """
        keys = key.split(".")
        value = self._config
        
        for k in keys:
            if isinstance(value, dict) and k in value:
                value = value[k]
            else:
                return default
        
        return value
    
    def get_all(self) -> Dict[str, Any]:
        """
        获取完整配置字典
        
        Returns:
            完整配置字典
        """
        return self._config.copy()
    
    def get_llm_config(self, provider: Optional[str] = None) -> Dict[str, Any]:
        """
        获取 LLM 配置
        
        Args:
            provider: LLM 提供商，如果为 None 则使用配置中的默认值
            
        Returns:
            LLM 配置字典
        """
        if provider is None:
            provider = self.get("llm.provider", "deepseek")
        
        base_config = {
            "provider": provider,
            "timeout_seconds": self.get("llm.timeout_seconds", 120),
            "max_tokens": self.get("llm.max_tokens", 4000),
            "temperature": self.get("llm.temperature", 0.7),
        }
        
        # 获取提供商特定配置
        provider_config = self.get(f"llm.{provider}", {})
        base_config.update(provider_config)
        
        return base_config
    
    def get_tts_config(self) -> Dict[str, Any]:
        """
        获取 TTS 配置
        
        Returns:
            TTS 配置字典
        """
        provider = self.get("tts.provider", "doubao")
        
        base_config = {
            "provider": provider,
            "timeout_seconds": self.get("tts.timeout_seconds", 60),
        }
        
        if provider == "doubao":
            doubao_config = self.get("tts.doubao", {})
            base_config["doubao"] = doubao_config
        
        return base_config
    
    def get_research_config(self, provider: Optional[str] = None) -> Dict[str, Any]:
        """
        获取 Research 配置
        
        Args:
            provider: Research 提供商，如果为 None 则使用配置中的默认值
            
        Returns:
            Research 配置字典
        """
        if provider is None:
            provider = self.get("research.provider", "anspire")
        
        base_config = {
            "provider": provider,
            "enabled": self.get("research.enabled", True),
            "timeout_seconds": self.get("research.timeout_seconds", 60),
            "max_items": self.get("research.max_items", 10),
            "max_retries": self.get("research.max_retries", 3),
            "retry_delay": self.get("research.retry_delay", 1.0),
        }
        
        # 获取提供商特定配置
        provider_config = self.get(f"research.{provider}", {})
        base_config.update(provider_config)
        
        return base_config


# 全局配置加载器实例
_config_loader: Optional[ConfigLoader] = None


def get_config_loader(settings_path: str | Path = "config/base/settings.yaml") -> ConfigLoader:
    """
    获取全局配置加载器实例
    
    Args:
        settings_path: settings.yaml 文件路径
        
    Returns:
        ConfigLoader 实例
    """
    global _config_loader
    if _config_loader is None:
        _config_loader = ConfigLoader(settings_path)
    return _config_loader
