"""
Content Filter and Processor

这个文件实现了内容过滤和处理功能，用于新闻内容的清洗和标准化。

功能概述：
- 新闻内容过滤和清洗
- 文本格式化和标准化
- 支持多种过滤规则
- 提供内容质量评估

主要函数：
- filter_content(): 内容过滤主函数
- clean_text(): 文本清洗
- normalize_content(): 内容标准化
- assess_quality(): 内容质量评估

过滤特性：
- 去除HTML标签和特殊字符
- 标准化文本格式
- 过滤低质量内容
- 支持自定义过滤规则

使用示例：
    filtered_content = filter_content(
        original_text,
        rules=["html_tags", "special_chars", "normalize"]
    )

应用场景：
- 新闻内容预处理
- 文本数据清洗
- 内容质量提升
- 数据标准化处理

作者：Auto-Podcast Team
版本：1.0.0
更新：2025-12-25
"""

from __future__ import annotations

import re


_CALENDAR_TITLE_RE = re.compile(r"^[📅🗓]\s*\d{4}-\d{2}-\d{2}\s+星期[一二三四五六日天]$")
_CALENDAR_DATE_RE = re.compile(r"\d{4}-\d{2}-\d{2}")
_NEWS_ITEM_1_RE = re.compile(r"(?:^|\n)\s*1[\.、]\s*([^\n]+)")
_HTML_TAG_RE = re.compile(r"<[^>]+>")


def _is_noise_item(item: dict) -> bool:
    title = (item.get("title") or "").strip()
    if not title:
        return False
    if _CALENDAR_TITLE_RE.match(title):
        summary = (item.get("summary") or "").strip()
        content = (item.get("content") or "").strip()
        return (not summary) and (not content)
    return False


def _rewrite_calendar_title(item: dict) -> str | None:
    title = (item.get("title") or "").strip()
    if not _CALENDAR_TITLE_RE.match(title):
        return None

    summary = (item.get("summary") or "").strip()
    content = (item.get("content") or "").strip()
    body = summary or content
    if not body:
        return None

    date = None
    m = _CALENDAR_DATE_RE.search(title)
    if m:
        date = m.group(0)

    text = _HTML_TAG_RE.sub("\n", body)
    text = text.replace("&nbsp;", " ").replace("&quot;", "\"").replace("&amp;", "&")
    text = re.sub(r"\n{2,}", "\n", text).strip()

    m2 = _NEWS_ITEM_1_RE.search("\n" + text)
    if m2:
        head = m2.group(1).strip()
        if date:
            return f"60s {date}: {head}"
        return f"60s: {head}"

    if date:
        return f"60s {date}"
    return "60s"


def filter_items(items: list[dict], fields: list[str] | None) -> list[dict]:
    if fields is None:
        fields = ["title"]

    fields2 = [str(f).strip() for f in fields if str(f).strip()]
    if "url" not in fields2:
        fields2.append("url")
    if "source" not in fields2:
        fields2.append("source")
    if not fields2:
        return list(items)

    out: list[dict] = []
    for it in items:
        if not isinstance(it, dict):
            continue
        it2 = it
        new_title = _rewrite_calendar_title(it)
        if new_title:
            it2 = dict(it)
            it2["title"] = new_title
        if _is_noise_item(it):
            continue
        o: dict = {}
        for f in fields2:
            o[f] = it2.get(f)
        out.append(o)
    return out


def filter_fetch_archive_payload(payload: dict, fields: list[str] | None, keep_raw: bool = False) -> dict:
    if not isinstance(payload, dict):
        return payload

    out = dict(payload)

    items_raw = payload.get("items_raw")
    items_raw2 = [x for x in items_raw if isinstance(x, dict)] if isinstance(items_raw, list) else None

    if isinstance(items_raw2, list):
        out["raw_items_count"] = len(items_raw2)

    if keep_raw:
        if isinstance(items_raw2, list):
            out["items_raw"] = filter_items(items_raw2, fields)
    else:
        out.pop("items_raw", None)

    items = payload.get("items")
    if not keep_raw and isinstance(items_raw2, list):
        filtered_items = filter_items(items_raw2, fields)
        out["items"] = filtered_items
        out["filtered_items_count"] = len(filtered_items)
    elif isinstance(items, list):
        filtered_items = filter_items([x for x in items if isinstance(x, dict)], fields)
        out["items"] = filtered_items
        out["filtered_items_count"] = len(filtered_items)

    return out
