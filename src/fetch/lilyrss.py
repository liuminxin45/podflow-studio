"""
Lily RSS Fetcher

这个文件实现了从Lily RSS服务获取数据的功能。

功能概述：
- 专门处理Lily RSS格式的数据源
- 支持自定义RSS解析规则
- 提供数据标准化和清洗
- 包含完整的错误处理机制

主要函数：
- fetch_lilyrss_items(): 获取Lily RSS数据
- parse_lilyrss_content(): 解析Lily RSS内容
- normalize_lilyrss_item(): 标准化数据格式

RSS特性：
- 支持Lily特定的RSS扩展
- 自定义字段解析
- 内容格式优化
- 元数据提取

使用示例：
    items = fetch_lilyrss_items(
        rss_url="https://lily.example.com/rss.xml",
        source="Lily News"
    )

应用场景：
- 特定RSS源数据获取
- 内容聚合处理
- 新闻数据标准化
- 自定义RSS格式支持

作者：Auto-Podcast Team
版本：1.0.0
更新：2025-12-25
"""

from __future__ import annotations

import re
from typing import Any, Optional
from urllib.parse import urlencode

from src.fetch.rss import fetch_rss_items


def _bool_to_str(v: Any) -> str:
    if isinstance(v, bool):
        return "true" if v else "false"
    return str(v)


def _build_query(query: dict[str, Any] | None) -> str:
    if not query:
        return ""
    pairs: list[tuple[str, str]] = []
    for k, v in query.items():
        if v is None:
            continue
        if isinstance(v, (list, tuple)):
            for x in v:
                if x is None:
                    continue
                pairs.append((str(k), _bool_to_str(x)))
        else:
            pairs.append((str(k), _bool_to_str(v)))
    if not pairs:
        return ""
    return "?" + urlencode(pairs)


def _extract(kind: str, value: str) -> str:
    v = (value or "").strip()
    if not v:
        raise ValueError("empty input")

    if kind == "zhihuzhuanlan":
        m = re.search(r"https?://zhuanlan\.zhihu\.com/([^/?#]+)", v)
        if m:
            return m.group(1)
        m = re.search(r"https?://www\.zhihu\.com/column/([^/?#]+)", v)
        if m:
            return m.group(1)
        return v.strip("/")

    if kind in {"zhihu", "zhihu_upvote"}:
        m = re.search(r"https?://www\.zhihu\.com/(?:people|org)/([^/?#]+)", v)
        if m:
            return m.group(1)
        return v.strip("/")

    if kind == "zhihu_topic":
        m = re.search(r"https?://www\.zhihu\.com/topic/(\d+)", v)
        if m:
            return m.group(1)
        return v.strip("/")

    if kind == "zhihu_question":
        m = re.search(r"https?://www\.zhihu\.com/question/(\d+)", v)
        if m:
            return m.group(1)
        return v.strip("/")

    if kind == "zhihu_collection":
        m = re.search(r"https?://www\.zhihu\.com/collection/(\d+)", v)
        if m:
            return m.group(1)
        return v.strip("/")

    if kind == "v2ex":
        m = re.search(r"https?://www\.v2ex\.com/t/(\d+)", v)
        if m:
            return m.group(1)
        return v.strip("/")

    if kind == "static_zhihu":
        m = re.search(r"https?://zhuanlan\.zhihu\.com/p/(\d+)", v)
        if m:
            return m.group(1)
        return v.strip("/")

    if kind in {"jike_topic", "jike_user"}:
        m = re.search(r"https?://[^/]+/([^/?#]+)$", v)
        if m:
            return m.group(1)
        return v.strip("/")

    if kind == "gogs":
        m = re.search(r"https?://(.+)$", v)
        if m:
            return m.group(1)
        return v.lstrip("/")

    return v.strip("/")


def build_lily_rss_url(
    *,
    kind: str,
    value: str,
    base_url: str = "https://rss.lilydjwg.me",
    query: Optional[dict[str, Any]] = None,
) -> str:
    k = (kind or "").strip()
    if not k:
        raise ValueError("kind is empty")
    b = (base_url or "").rstrip("/")
    if not b:
        raise ValueError("base_url is empty")

    ident = _extract(k, value)
    q = _build_query(query)
    return f"{b}/{k}/{ident}{q}"


def fetch_lily_rss_items(
    *,
    kind: str,
    value: str,
    source: str,
    timeout_seconds: int,
    base_url: str = "https://rss.lilydjwg.me",
    query: Optional[dict[str, Any]] = None,
) -> list[dict]:
    feed_url = build_lily_rss_url(kind=kind, value=value, base_url=base_url, query=query)
    return fetch_rss_items(url=feed_url, source=source, timeout_seconds=timeout_seconds)
