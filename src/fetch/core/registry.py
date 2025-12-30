"""
RSS Fetcher Registry
"""

import logging
from typing import Optional, Type

from .base import BaseFetcher


class FetcherRegistry:
    """Fetcher注册表"""
    
    _fetchers: dict[str, Type[BaseFetcher]] = {}
    _logger = logging.getLogger("fetch.registry")
    
    @classmethod
    def register(cls, fetcher_type: str, fetcher_class: Type[BaseFetcher]):
        """注册fetcher"""
        if fetcher_type in cls._fetchers:
            cls._logger.warning(f"Fetcher '{fetcher_type}' already registered, overwriting")
        
        cls._fetchers[fetcher_type] = fetcher_class
        cls._logger.info(f"Registered fetcher: {fetcher_type} -> {fetcher_class.__name__}")
    
    @classmethod
    def get(cls, fetcher_type: str) -> Optional[Type[BaseFetcher]]:
        """获取fetcher类"""
        return cls._fetchers.get(fetcher_type)
    
    @classmethod
    def list_all(cls) -> list[str]:
        """列出所有已注册的fetcher类型"""
        return list(cls._fetchers.keys())
    
    @classmethod
    def create_instance(cls, fetcher_type: str) -> Optional[BaseFetcher]:
        """创建fetcher实例"""
        fetcher_class = cls.get(fetcher_type)
        if not fetcher_class:
            cls._logger.error(f"Fetcher type '{fetcher_type}' not found")
            return None
        
        try:
            return fetcher_class()
        except Exception as e:
            cls._logger.error(f"Failed to create fetcher instance: {e}")
            return None


def register_fetcher(fetcher_type: str):
    """装饰器：自动注册fetcher"""
    def decorator(fetcher_class: Type[BaseFetcher]):
        FetcherRegistry.register(fetcher_type, fetcher_class)
        return fetcher_class
    return decorator
