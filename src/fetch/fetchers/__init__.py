"""
Fetcher implementations
"""

# Import fetchers to trigger registration
from . import standard_rss  # noqa: F401
from . import sixtys_digest  # noqa: F401
from . import aibot_daily_fetcher  # noqa: F401

__all__ = []
