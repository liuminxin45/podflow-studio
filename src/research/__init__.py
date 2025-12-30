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

from .sources.anspire import anspire_research_items
from .core.config import ResearchSettings, load_research_config, get_provider_config
from .sources.research_client import (
    ResearchConfig,
    ResearchOutput,
    UnifiedResearchClient,
    MetaSoClient,
    create_client,
    create_client_from_env,
    research_items_with_client,
)
from .sources.metaso import metaso_research_items
from .processing.news_splitter import NewsTopic, NewsSplitter, split_news_for_research
from .utils.batch_researcher import (
    TopicResearchResult,
    BatchResearchResult,
    BatchResearcher,
    research_topics_batch,
)
from .llm_integration.podcast_enhancer import (
    EnhancedContent,
    PodcastEnhancer,
    enhance_topic_for_podcast,
)
from .core.models import (
    RetrievalQuery,
    RetrievalPlan,
    RetrievalBundle,
    LLM1Output,
    LLM2Output,
    PipelineResult,
)
from .utils.cache_manager import CacheManager
from .retrieval.history_search import HistoryPodcastSearcher
from .retrieval.retrieval_v2 import RetrievalV2Executor
from .llm_integration.llm_stages import LLMStage1, LLMStage2

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
    # 播客内容增强
    "EnhancedContent",
    "PodcastEnhancer",
    "enhance_topic_for_podcast",
    # Pipeline V2
    "RetrievalQuery",
    "RetrievalPlan",
    "RetrievalBundle",
    "LLM1Output",
    "LLM2Output",
    "PipelineResult",
    "CacheManager",
    "HistoryPodcastSearcher",
    "RetrievalV2Executor",
    "LLMStage1",
    "LLMStage2",
]