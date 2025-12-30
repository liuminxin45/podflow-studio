"""
Normalization helpers that convert raw feed/extractor output into NewsItem dicts.
"""

from __future__ import annotations

import datetime as dt
from dataclasses import asdict
from typing import Any, Callable, Mapping, Sequence
from urllib.parse import urlparse

from src.fetch.operations.extractor import ExtractResult, extract_from_url
from src.fetch.operations.source_guard import SourceGuard
from src.store.operations.fingerprints import ensure_item_fingerprints
from src.utils.hash_utils import stable_hash
from src.utils.models import NewsEntities, NewsItem, NewsItemQuality, NewsSource
from src.utils.time_parser import parse_date


def _domain_from_url(url: str | None) -> str:
    if not url:
        return ""
    try:
        parsed = urlparse(url)
        host = (parsed.netloc or "").lower()
        if host.startswith("www."):
            host = host[4:]
        return host
    except Exception:
        return ""


def _pick(value1: str | None, value2: str | None) -> str | None:
    return value1 if value1 and value1.strip() else (value2 if value2 and value2.strip() else None)


def _current_time_iso() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat()


def normalize_item(
    raw: Mapping[str, Any],
    *,
    extractor_result: ExtractResult | None = None,
    source_profile: Mapping[str, Any] | None = None,
) -> dict:
    """
    Convert a raw feed item + optional extraction result into a NewsItem dict.
    """

    url = str(raw.get("url") or raw.get("link") or "").strip()
    # 保留原始published_at格式（ISO8601），不进行时区转换
    published_at_raw = raw.get("published_at")
    published_raw = published_at_raw  # 初始化避免unbound错误
    
    if published_at_raw and isinstance(published_at_raw, str):
        # 如果已经是ISO8601格式，直接使用
        published_at_iso = published_at_raw
        parsed_date = parse_date(published_at_raw)
    else:
        # 否则尝试从其他字段解析
        published_raw = (
            raw.get("published")
            or raw.get("updated")
            or raw.get("pubDate")
            or raw.get("date")
        )
        parsed_date = parse_date(published_raw) if isinstance(published_raw, str) else parse_date(str(published_raw or ""))
        published_at_iso = parsed_date.datetime.isoformat() if parsed_date.datetime else None

    extracted_title = extractor_result.title if extractor_result else None
    extracted_summary = extractor_result.summary if extractor_result else None
    extracted_text = extractor_result.text if extractor_result else ""
    extracted_language = (extractor_result.metadata or {}).get("language") if extractor_result else None

    raw_title = str(raw.get("title") or "").strip()
    raw_summary = str(raw.get("summary") or raw.get("description") or "").strip()
    raw_content = str(raw.get("content") or raw.get("body") or "").strip()

    title = _pick(extracted_title, raw_title) or "Untitled"
    summary = _pick(extracted_summary, raw_summary)

    content_candidates = [extracted_text.strip(), raw_content]
    content = next((c for c in content_candidates if c and len(c) > 0), summary or raw_title)

    lang = (raw.get("lang") or raw.get("language") or extracted_language or "zh").strip()

    domain_from_profile = (source_profile or {}).get("domain") if source_profile else None
    source_domain = domain_from_profile or _domain_from_url(url)
    source_name = (
        (source_profile or {}).get("name")
        or raw.get("source_name")
        or raw.get("source")
        or source_domain
        or "unknown"
    )

    news_id = str(
        raw.get("id")
        or raw.get("guid")
        or stable_hash([url, title, str(published_raw or ""), source_domain])
    )

    source = NewsSource(
        name=str(source_name),
        domain=source_domain or "",
        url=url,
        canonical_url=(raw.get("canonical_url") or raw.get("link") or url) or None,
        fetch_time=_current_time_iso(),
    )

    quality = NewsItemQuality(
        extractor=("trafilatura" if extractor_result else None),
        extract_confidence=1.0 if extractor_result and extractor_result.text else None,
        length=len(content or ""),
    )

    news_item = NewsItem(
        id=news_id,
        source=source,
        title=title,
        summary=summary,
        content=content or "",
        lang=lang or "zh",
        published_at=published_at_iso,
        published_at_raw=str(published_raw) if published_raw else None,
        tags=list(raw.get("tags") or []),
        entities=NewsEntities(),
        quality=quality,
        meta={
            "raw_source": {
                "name": raw.get("source"),
                "category": raw.get("category"),
                "author": raw.get("author"),
            },
            "source_profile": dict(source_profile) if source_profile else None,
        },
    )

    data = asdict(news_item)
    source_dict = data.get("source") or {}
    data["source_info"] = source_dict
    data["source_name"] = source_dict.get("name")
    data["source_domain"] = source_dict.get("domain")
    data["source_url"] = source_dict.get("url")
    data["source"] = source_dict.get("name") or source_dict.get("url") or ""
    
    # 保持published_at为ISO8601字符串格式
    if data.get("published_at") and not isinstance(data["published_at"], str):
        data["published_at"] = data["published_at"].isoformat()
    
    ensure_item_fingerprints(data)
    return data


def prepare_items(
    raw_items: Sequence[Mapping[str, Any]],
    *,
    source_guard: SourceGuard,
    min_content_length: int = 0,
    extractor_fetch: Callable[[str], ExtractResult] | None = None,
) -> tuple[list[dict], list[dict]]:
    """
    Apply source guard + normalization pipeline.

    Returns (normalized_items, guard_blocked_items).
    """

    extractor_fetch = extractor_fetch or extract_from_url
    normalized: list[dict] = []
    blocked: list[dict] = []

    for raw in raw_items:
        url = str(raw.get("url") or raw.get("link") or "").strip()
        guard_result = source_guard.check(url=url)
        if not guard_result.get("allowed", True):
            entry = dict(raw)
            entry["_source_guard"] = guard_result
            blocked.append(entry)
            continue

        content = str(raw.get("content") or raw.get("body") or "")
        extractor_result: ExtractResult | None = None
        if min_content_length and len(content) < min_content_length and url:
            extractor_result = extractor_fetch(url)

        item = normalize_item(
            raw,
            extractor_result=extractor_result,
            source_profile=guard_result.get("policy") or {},
        )
        item.setdefault("meta", {})
        item["meta"]["source_guard"] = guard_result
        normalized.append(item)

    return normalized, blocked
