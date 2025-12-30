"""
Fetch module - RSS fetchers with registry pattern
"""

# Import fetchers to trigger registration
from .fetchers import standard_rss  # noqa: F401
from .fetchers import sixtys_digest  # noqa: F401
from .fetchers import aibot_daily_fetcher  # noqa: F401

from .core.registry import FetcherRegistry

__all__ = ["FetcherRegistry"]
