"""
TechCrunch RSS Feed Source
从TechCrunch抓取科技新闻
"""

from typing import Any
from nodes.fetch.sources.base import FetchSourceBase


class TechCrunchSource(FetchSourceBase):
    """TechCrunch data source."""

    @property
    def name(self) -> str:
        return "TechCrunch"

    @property
    def description(self) -> str:
        return "TechCrunch科技新闻（RSS）"

    def fetch(self, fetch_logs: list[str] | None = None) -> list[dict[str, Any]]:
        """Fetch from TechCrunch RSS feed."""
        import feedparser

        url = "https://techcrunch.com/feed/"
        feed = feedparser.parse(url)

        items = []
        for entry in feed.entries[:15]:  # 最多15条
            items.append(
                {
                    "title": entry.get("title", ""),
                    "content": entry.get("summary", ""),
                    "url": entry.get("link", ""),
                    "published": entry.get("published", ""),
                    "source": "techcrunch",
                    "type": "rss",
                }
            )

        return items


# 导出实例供fetch节点使用
source = TechCrunchSource()
