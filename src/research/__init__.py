"""
Research Module

这个模块提供了统一的研究服务接口，支持多种研究服务提供商。

主要组件：
- research_client: 统一研究客户端
- metaso: MetaSo研究服务实现
- anspire: Anspire Search Agent API实现
- config: 配置加载和管理

使用示例：
    from src.research import create_client_from_env
    
    # 自动从环境变量RESEARCH_PROVIDER选择提供商
    client = create_client_from_env()
    result = client.research_items(items)
    
    # 或指定提供商
    client = create_client_from_env("anspire")
    result = client.research_items(items)
"""

from .anspire import anspire_research_items
from .config import ResearchSettings, load_research_config, get_provider_config
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
from .news_splitter import NewsTopic, NewsSplitter, split_news_for_research
from .batch_researcher import (
    TopicResearchResult,
    BatchResearchResult,
    BatchResearcher,
    research_topics_batch,
)

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
    "anspire_research_items",
    # 配置管理
    "ResearchSettings",
    "load_research_config",
    "get_provider_config",
    # 新闻拆分
    "NewsTopic",
    "NewsSplitter",
    "split_news_for_research",
    # 批量研究
    "TopicResearchResult",
    "BatchResearchResult",
    "BatchResearcher",
    "research_topics_batch",
]