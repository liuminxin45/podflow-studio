"""
Stage Registry

Stage 注册表，用于发现和管理所有可用的 Stage
"""

from __future__ import annotations

from typing import Dict, Optional, Type, TYPE_CHECKING

if TYPE_CHECKING:
    from src.stages.base import BaseStage


class StageRegistry:
    """Stage 注册表"""
    
    _stages: Dict[str, Type["BaseStage"]] = {}
    
    @classmethod
    def register(cls, stage_class: Type["BaseStage"]) -> Type["BaseStage"]:
        """注册 Stage（可作为装饰器使用）
        
        Example:
            @StageRegistry.register
            class FetchStage(BaseStage):
                ...
        """
        # 延迟实例化以获取 name
        instance = stage_class.__new__(stage_class)
        instance.__init__({})
        stage_name = instance.name
        
        cls._stages[stage_name] = stage_class
        return stage_class
    
    @classmethod
    def get(cls, name: str, config: Optional[dict] = None) -> "BaseStage":
        """获取 Stage 实例
        
        Args:
            name: Stage 名称
            config: 配置字典
            
        Returns:
            Stage 实例
            
        Raises:
            ValueError: Stage 不存在
        """
        if name not in cls._stages:
            available = ", ".join(cls._stages.keys())
            raise ValueError(f"Stage '{name}' 不存在。可用的 Stage: {available}")
        
        return cls._stages[name](config or {})
    
    @classmethod
    def list_all(cls) -> list[str]:
        """列出所有已注册的 Stage 名称"""
        return list(cls._stages.keys())
    
    @classmethod
    def get_class(cls, name: str) -> Type["BaseStage"]:
        """获取 Stage 类（不实例化）"""
        if name not in cls._stages:
            raise ValueError(f"Stage '{name}' 不存在")
        return cls._stages[name]
    
    @classmethod
    def clear(cls):
        """清空注册表（测试用）"""
        cls._stages.clear()
