"""
Hacker News RSS Feed Source
从Hacker News首页抓取最新的技术新闻
"""

from typing import Any
from nodes.fetch.sources.base import FetchSourceBase


class HackerNewsSource(FetchSourceBase):
    """Hacker News data source."""

    @property
    def name(self) -> str:
        return "Hacker News"

    @property
    def description(self) -> str:
        return "Hacker News首页热门技术新闻（RSS）"

    def fetch(self, fetch_logs: list[str] | None = None) -> list[dict[str, Any]]:
        """Fetch from Hacker News RSS feed."""
        import feedparser

        url = "https://hnrss.org/frontpage"
        feed = feedparser.parse(url)

        items = []
        for entry in feed.entries[:20]:  # 最多20条
            items.append(
                {
                    "title": entry.get("title", ""),
                    "content": entry.get("summary", ""),
                    "url": entry.get("link", ""),
                    "published": entry.get("published", ""),
                    "source": "hackernews",
                    "type": "rss",
                }
            )

        return items


# 导出实例供fetch节点使用
source = HackerNewsSource()
