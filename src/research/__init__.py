"""
Research Module

这个模块提供了统一的研究服务接口，支持多种研究服务提供商。

主要组件：
- research_client: 统一研究客户端
- metaso: MetaSo研究服务实现

使用示例：
    from src.research import create_client_from_env
    
    client = create_client_from_env("metaso")
    result = client.research_items(items)
"""

from .research_client import (
    ResearchConfig,
    ResearchOutput,
    UnifiedResearchClient,
    MetaSoClient,
    create_client,
    create_client_from_env,
    research_items_with_client,
)

from .metaso import metaso_research_items

__all__ = [
    # 统一客户端
    "ResearchConfig",
    "ResearchOutput", 
    "UnifiedResearchClient",
    "MetaSoClient",
    "create_client",
    "create_client_from_env",
    "research_items_with_client",
    # 原始实现
    "metaso_research_items",
]