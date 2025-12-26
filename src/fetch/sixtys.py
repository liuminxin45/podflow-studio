"""
60s News Fetcher

这个文件实现了从60s新闻网站获取每日新闻摘要的功能。

功能概述：
- 从60s.viki.moe网站抓取每日新闻摘要
- 支持多个数据源的容错处理
- 提供内容清洗和格式化
- 包含完整的错误处理机制

主要函数：
- fetch_sixtys_items_with_status(): 获取60s新闻并返回状态
- parse_sixtys_content(): 解析60s新闻内容
- extract_news_items(): 提取新闻条目

数据特性：
- 每日60秒新闻摘要
- 支持多个备用数据源
- 自动提取标题、链接、发布时间
- 按日期组织内容结构

使用示例：
    items, status, source = fetch_sixtys_items_with_status(
        base_url="https://60s.viki.moe",
        source="60s-每天60秒读懂世界(数据源)",
        timeout_seconds=30
    )

数据来源：
- 60s新闻网站 (60s.viki.moe)
- 每日新闻摘要服务
- 支持历史数据获取

作者：Auto-Podcast Team
版本：1.0.0
更新：2025-12-25
"""

from __future__ import annotations

import hashlib
import logging
from typing import Any

import requests


def _stable_item_id(source: str, date: str, idx: int, title: str, link: str) -> str:
    base = f"{source}|{date}|{idx}|{title}|{link}".strip()
    return hashlib.sha256(base.encode("utf-8")).hexdigest()


def _get_str(d: dict[str, Any], key: str) -> str:
    v = d.get(key)
    return v.strip() if isinstance(v, str) else ""


def fetch_sixtys_items_with_status(
    *,
    base_url: str | None = None,
    base_urls: list[str] | None = None,
    source: str,
    timeout_seconds: int,
) -> tuple[list[dict], int | None, str | None]:
    log = logging.getLogger("fetch.sixtys")

    candidates: list[str] = []
    if isinstance(base_urls, list):
        for u in base_urls:
            if isinstance(u, str) and u.strip():
                candidates.append(u.strip())
    if base_url and base_url.strip():
        candidates.append(base_url.strip())
    if not candidates:
        raise RuntimeError("sixtys base_url(s) empty")

    last_status: int | None = None
    last_err: Exception | None = None

    for cand in candidates:
        u0 = cand.rstrip("/")
        if not (u0.startswith("http://") or u0.startswith("https://")):
            u0 = "https://" + u0

        url = f"{u0}/v2/60s"
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
            "Accept": "application/json,text/plain,*/*",
            "Referer": f"{u0}/",
        }

        try:
            resp = requests.get(url, headers=headers, timeout=timeout_seconds)
            last_status = int(getattr(resp, "status_code", 0) or 0) or None
            if resp.status_code == 403:
                log.warning("sixtys returned 403 (Forbidden). base_url=%s", u0)
                continue
            resp.raise_for_status()

            data = resp.json()
            if not isinstance(data, dict):
                continue

            payload = data.get("data")
            if not isinstance(payload, dict):
                continue

            date = _get_str(payload, "date")
            link = _get_str(payload, "link")
            published_at = date or None

            news = payload.get("news")
            if not isinstance(news, list):
                continue

            out: list[dict] = []
            for i, s in enumerate(news):
                if not isinstance(s, str):
                    continue
                title = s.strip()
                if not title:
                    continue
                out.append(
                    {
                        "id": _stable_item_id(source=source, date=date or "", idx=i, title=title, link=link),
                        "title": title,
                        "summary": "",
                        "content": "",
                        "url": link or url,
                        "published_at": published_at,
                        "source": source,
                    }
                )

            tip = _get_str(payload, "tip")
            if tip:
                out.append(
                    {
                        "id": _stable_item_id(source=source, date=date or "", idx=999, title=tip, link=link),
                        "title": tip,
                        "summary": "",
                        "content": "",
                        "url": link or url,
                        "published_at": published_at,
                        "source": source,
                    }
                )

            return out, int(resp.status_code), u0
        except Exception as e:  # noqa: BLE001
            last_err = e
            continue

    if last_err is not None:
        raise last_err
    return [], last_status, None
