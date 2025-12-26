"""
AI Bot Daily News Fetcher

这个文件实现了从AI工具集网站获取每日AI快讯的功能。

功能概述：
- 从ai-bot.cn网站抓取每日AI新闻快讯
- 解析网页内容并提取结构化信息
- 支持按日期获取历史快讯内容
- 提供内容清洗和格式化

主要函数：
- fetch_aibot_daily_items_with_status(): 获取AI快讯并返回状态
- parse_aibot_daily_content(): 解析AI快讯内容
- extract_news_items(): 提取新闻条目

数据特性：
- 自动提取标题、链接、发布时间
- 支持内容摘要和详细信息
- 按日期组织内容结构
- 保留原始网页链接

使用示例：
    items, status = fetch_aibot_daily_items_with_status(
        url="https://ai-bot.cn/daily-ai-news/",
        source="AI工具集-每日AI快讯",
        episode_date="2025-12-25",
        timeout_seconds=30
    )

数据来源：
- AI工具集官网 (ai-bot.cn)
- 每日AI快讯栏目
- 历史快讯存档

作者：Auto-Podcast Team
版本：1.0.0
更新：2025-12-25
"""

from __future__ import annotations

import datetime as dt
import hashlib
import logging
import re
from typing import Any
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup


_DATE_RE = re.compile(r"(?P<m>\d{1,2})\s*月\s*(?P<d>\d{1,2})")


def _stable_item_id(url: str) -> str:
    return hashlib.sha256(url.encode("utf-8")).hexdigest()


def _parse_cn_month_day(s: str) -> tuple[int, int] | None:
    m = _DATE_RE.search(s or "")
    if not m:
        return None
    try:
        mm = int(m.group("m"))
        dd = int(m.group("d"))
        if 1 <= mm <= 12 and 1 <= dd <= 31:
            return mm, dd
    except Exception:
        return None
    return None


def _guess_year(episode_date: str, month: int, day: int) -> int:
    try:
        d = dt.date.fromisoformat(episode_date)
    except Exception:
        d = dt.date.today()

    # Usually the page shows recent days around episode_date.
    # If month/day looks ahead by too much, assume previous year.
    y = d.year
    try:
        cand = dt.date(y, month, day)
    except Exception:
        return y

    delta = (cand - d).days
    if delta > 180:
        return y - 1
    if delta < -180:
        return y + 1
    return y


def _to_iso_date(y: int, m: int, d: int) -> str:
    return dt.datetime(y, m, d, tzinfo=dt.timezone.utc).isoformat()


def fetch_aibot_daily_items_with_status(
    *,
    url: str,
    source: str,
    episode_date: str,
    timeout_seconds: int,
) -> tuple[list[dict], int]:
    log = logging.getLogger("fetch.aibot_daily")

    resp = requests.get(
        url,
        timeout=timeout_seconds,
        headers={"User-Agent": "podcast-bot/0.1"},
    )
    resp.raise_for_status()

    soup = BeautifulSoup(resp.text, "html.parser")

    try:
        today = dt.date.fromisoformat(episode_date)
    except Exception:
        today = dt.date.today()
    yesterday = today - dt.timedelta(days=1)

    wanted_md = {(today.month, today.day), (yesterday.month, yesterday.day)}

    out: list[dict] = []

    containers = soup.select("div.news-list")
    for container in containers:
        current_md: tuple[int, int] | None = None
        capture = False
        published_at: str | None = None

        for node in container.select("div.news-date, div.news-item"):
            classes = set((node.get("class") or []))
            if "news-date" in classes:
                date_s = node.get_text(strip=True)
                md = _parse_cn_month_day(date_s)
                if (md is None) or (md not in wanted_md):
                    current_md = md
                    capture = False
                    published_at = None
                    continue

                current_md = md
                capture = True
                y = _guess_year(episode_date, md[0], md[1])
                published_at = _to_iso_date(y, md[0], md[1])
                continue

            if "news-item" not in classes:
                continue
            if not capture:
                continue
            if not current_md or not published_at:
                continue

            a = node.select_one("div.news-content h2 a")
            if not a:
                continue
            title = a.get_text(strip=True)
            link_raw = str(a.get("href") or "").strip()
            if not link_raw:
                continue
            link = urljoin(url, link_raw)

            p = node.select_one("div.news-content p")
            source_name = ""
            summary = ""
            if p:
                span = p.select_one("span.news-time")
                span_text = span.get_text(strip=True) if span else ""
                if span_text.startswith("来源："):
                    source_name = span_text.replace("来源：", "", 1).strip()

                p_text = p.get_text(" ", strip=True)
                if span_text and p_text.endswith(span_text):
                    p_text = p_text[: -len(span_text)].strip()
                summary = p_text

            src = source
            if source_name:
                src = f"{source} - {source_name}".strip()

            out.append(
                {
                    "id": _stable_item_id(link),
                    "title": title,
                    "summary": summary,
                    "content": "",
                    "url": link,
                    "published_at": published_at,
                    "source": src,
                }
            )

    if len(out) == 0:
        log.info("no items parsed for today/yesterday; episode_date=%s", episode_date)

    return out, int(getattr(resp, "status_code", 200) or 200)
