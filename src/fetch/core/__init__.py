"""
Core fetch module components
"""

from .base import BaseFetcher, FetchResult, FetchStatus
from .registry import FetcherRegistry, register_fetcher

__all__ = [
    "BaseFetcher",
    "FetchResult",
    "FetchStatus",
    "FetcherRegistry",
    "register_fetcher",
]
