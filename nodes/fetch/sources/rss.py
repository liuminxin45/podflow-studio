"""Key-free RSS source.

This adapter reads a list of RSS/Atom feed URLs (no API key required) and is
the reliability baseline for the automated GitHub Actions path. Unlike the
NewsNow and AI-news aggregators, RSS feeds are plain HTTP served by public
news sites, so they are reachable from CI runners without third-party
aggregator uptime.

URLs come from ``FetchConfig.rss_urls`` (wired from ``PODFLOW_RSS_URLS``).
When none are configured it falls back to ``DEFAULT_RSS_URLS``.
"""

from typing import Any
from urllib.parse import urlparse

import requests

from nodes.fetch.sources.base import FetchSourceBase

# Public, key-free Chinese tech/news feeds. Used only when no explicit URLs are
# provided. Each feed is fetched independently; failures are skipped.
DEFAULT_RSS_URLS = [
    "https://www.ithome.com/rss/",
    "https://www.solidot.org/index.rss",
]

REQUEST_TIMEOUT = 25
MAX_ITEMS_PER_FEED = 15


class RSSSource(FetchSourceBase):
    """RSS/Atom feed adapter (key-free, CI-reliable baseline)."""

    @property
    def name(self) -> str:
        return "RSS"

    @property
    def description(self) -> str:
        return "Key-free RSS/Atom feeds; the reliability baseline for automated runs."

    def fetch(
        self,
        fetch_logs: list[str] | None = None,
        config: Any | None = None,
    ) -> list[dict[str, Any]]:
        urls = _resolve_urls(config)
        if not urls:
            if fetch_logs is not None:
                fetch_logs.append("[RSS] No feed URLs configured; skipping")
            return []

        items: list[dict[str, Any]] = []
        for url in urls:
            try:
                feed_items = _fetch_feed(url, fetch_logs)
            except Exception as exc:
                if fetch_logs is not None:
                    fetch_logs.append(f"[RSS] Failed to fetch {url}: {type(exc).__name__}: {exc}")
                continue
            items.extend(feed_items)
            if fetch_logs is not None:
                fetch_logs.append(f"[RSS] Fetched {len(feed_items)} items from {url}")
        return items


def _resolve_urls(config: Any | None) -> list[str]:
    raw: list[str] = []
    if config is not None:
        raw = list(getattr(config, "rss_urls", []) or [])
    cleaned = [u.strip() for u in raw if isinstance(u, str) and u.strip()]
    if cleaned:
        return cleaned
    return [u for u in DEFAULT_RSS_URLS if u]


def _fetch_feed(url: str, fetch_logs: list[str] | None) -> list[dict[str, Any]]:
    import feedparser

    response = requests.get(
        url,
        headers={
            "Accept": "application/rss+xml, application/atom+xml, application/xml, text/xml",
            "User-Agent": (
                "Mozilla/5.0 (compatible; PodFlowStudio/0.2; +https://github.com/"
                "liuminxin45/podflow-studio)"
            ),
        },
        timeout=REQUEST_TIMEOUT,
    )
    response.raise_for_status()

    parsed = feedparser.parse(response.content or response.text)
    feed_title = (parsed.feed or {}).get("title") or _host_label(url)
    entries = list(parsed.entries or [])[:MAX_ITEMS_PER_FEED]

    items: list[dict[str, Any]] = []
    for entry in entries:
        title = (entry.get("title") or "").strip()
        content = _entry_content(entry)
        link = (entry.get("link") or "").strip()
        published = entry.get("published") or entry.get("updated") or entry.get("pubDate") or ""
        if not title and not content:
            continue
        if not content:
            content = title
        if not title:
            title = content[:60]
        items.append(
            {
                "title": title,
                "content": content,
                "url": link,
                "published": published,
                "source": f"rss:{_host_label(url)}",
                "type": "rss",
                "source_kind": "feed",
                "source_name": feed_title,
            }
        )
    return items


def _entry_content(entry: Any) -> str:
    content = entry.get("summary") or entry.get("description") or ""
    # Prefer the longer structured content if present.
    structured = entry.get("content")
    if isinstance(structured, list) and structured:
        candidate = structured[0].get("value", "") or ""
        if len(candidate) > len(content):
            content = candidate
    return content.strip()


def _host_label(url: str) -> str:
    try:
        host = urlparse(url).netloc or url
        return host.lower().replace("www.", "")
    except Exception:
        return url


source = RSSSource()
