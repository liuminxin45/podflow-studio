"""
Topic Selection Strategies

策略模式：支持多套选题策略切换
"""

from __future__ import annotations

from typing import Dict, Type

from .base import BaseTopicStrategy
from .consumer_life import ConsumerLifeStrategy
from .consumer_life_v3 import ConsumerLifeStrategyV3
from .tech_innovation import TechInnovationStrategy
from .balanced import BalancedStrategy


# 策略注册表
_STRATEGY_REGISTRY: Dict[str, Type[BaseTopicStrategy]] = {
    "consumer_life": ConsumerLifeStrategy,
    "consumer_life_v3": ConsumerLifeStrategyV3,
    "tech_innovation": TechInnovationStrategy,
    "balanced": BalancedStrategy,
}


def get_strategy(name: str) -> BaseTopicStrategy:
    """获取策略实例
    
    Args:
        name: 策略名称 (consumer_life | tech_innovation | balanced)
    
    Returns:
        策略实例
    
    Raises:
        ValueError: 未知策略名称
    """
    if name not in _STRATEGY_REGISTRY:
        available = ", ".join(_STRATEGY_REGISTRY.keys())
        raise ValueError(f"未知策略: {name}. 可用策略: {available}")
    
    strategy_class = _STRATEGY_REGISTRY[name]
    return strategy_class()


def list_strategies() -> list[str]:
    """列出所有可用策略"""
    return list(_STRATEGY_REGISTRY.keys())


__all__ = [
    "BaseTopicStrategy",
    "ConsumerLifeStrategy",
    "TechInnovationStrategy",
    "BalancedStrategy",
    "get_strategy",
    "list_strategies",
]
