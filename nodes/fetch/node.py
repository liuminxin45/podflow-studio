from typing import Any

from collections.abc import Iterable
from pathlib import Path
from datetime import datetime, UTC
from email.utils import parsedate_to_datetime
from difflib import SequenceMatcher
import importlib.util
import re
import sys
from nodes.fetch.config import FetchConfig


def run(state: dict[str, Any], config: FetchConfig = None) -> dict[str, Any]:
    """Run fetch node with dynamic source loading and discover filters."""
    config = config or FetchConfig()
    logs = state.get("logs", [])
    errors = state.get("errors", [])

    logs.append("[FetchNode] Starting fetch")

    sources_dir = Path(__file__).parent / "sources"
    if not sources_dir.exists():
        errors.append(
            {
                "node": "fetch",
                "message": "Sources directory not found",
                "detail": f"Directory {sources_dir} does not exist",
            }
        )
        state["fetch_contents"] = []
        state["logs"] = logs
        state["errors"] = errors
        return state

    available_sources = _list_sources(sources_dir)
    enabled_sources = _resolve_enabled_sources(config, available_sources)
    logs.append(f"[FetchNode] Enabled sources: {enabled_sources}")

    if not enabled_sources:
        logs.append("[FetchNode] No sources selected; skipping fetch")
        state["fetch_contents"] = []
        state["logs"] = logs
        state["errors"] = errors
        return state

    all_contents: list[dict[str, Any]] = []

    per_source_cap = _resolve_per_source_cap(config)

    for source_name in enabled_sources:
        source_file = sources_dir / f"{source_name}.py"
        if not source_file.exists():
            logs.append(f"[FetchNode] Warning: Source file '{source_name}.py' not found, skipping")
            continue

        try:
            logs.append(f"[FetchNode] Loading source: {source_name}")
            source_module = _load_source_module(source_name, source_file)

            if not hasattr(source_module, "source"):
                logs.append(
                    f"[FetchNode] Warning: Source '{source_name}' has no 'source' instance, skipping"
                )
                continue

            source_instance = source_module.source
            logs.append(f"[FetchNode] Fetching from: {source_instance.name}")
            items = _fetch_source_items(source_instance, config, logs)
            normalized = _normalize_items(items, source_name, logs)

            if per_source_cap > 0:
                capped = _cap_items_per_content_source(normalized, per_source_cap)
                if len(capped) < len(normalized):
                    logs.append(
                        f"[FetchNode] Capping {source_name} from {len(normalized)} to {len(capped)} ({per_source_cap} per content source)"
                    )
                    normalized = capped
            logs.append(f"[FetchNode] Fetched {len(normalized)} valid items from {source_name}")
            all_contents.extend(normalized)

        except Exception as e:
            error_msg = f"Failed to fetch from {source_name}: {str(e)}"
            logs.append(f"[FetchNode] Error: {error_msg}")
            errors.append(
                {"node": "fetch", "source": source_name, "message": error_msg, "detail": str(e)}
            )

    logs.append(f"[FetchNode] Total items fetched: {len(all_contents)}")

    filtered_contents = _apply_discover_filters(all_contents, config, logs)
    logs.append(f"[FetchNode] Final items after discover filtering: {len(filtered_contents)}")

    state["fetch_contents"] = filtered_contents
    state["logs"] = logs
    state["errors"] = errors
    return state


def _load_source_module(source_name: str, source_file: Path):
    """Dynamically load a source module."""
    spec = importlib.util.spec_from_file_location(f"nodes.fetch.sources.{source_name}", source_file)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def _fetch_source_items(source_instance: Any, config: FetchConfig, logs: list[str]):
    """Call a source through the current fetch-source contract."""
    return source_instance.fetch(fetch_logs=logs, config=config)


def _resolve_per_source_cap(config: FetchConfig) -> int:
    """Resolve the item cap applied to each top-level source."""
    result_limit = max(1, int(getattr(config, "result_limit", 10) or 10))
    breadth_cap = {1: 20, 2: 50, 3: 100, 4: 200, 5: 0}.get(config.breadth, 100)
    if breadth_cap <= 0:
        return result_limit
    return min(result_limit, breadth_cap)


def _cap_items_per_content_source(items: list[dict[str, Any]], limit: int) -> list[dict[str, Any]]:
    counts: dict[str, int] = {}
    capped: list[dict[str, Any]] = []
    for item in items:
        source_key = str(item.get("source") or item.get("source_id") or "unknown")
        count = counts.get(source_key, 0)
        if count >= limit:
            continue
        counts[source_key] = count + 1
        capped.append(item)
    return capped


def get_available_sources() -> list[dict[str, Any]]:
    """Get list of available data sources."""
    sources_dir = Path(__file__).parent / "sources"

    if not sources_dir.exists():
        return []

    available = []

    for source_file in sources_dir.glob("*.py"):
        # 跳过特殊文件
        if source_file.name.startswith("_") or source_file.name == "base.py":
            continue

        source_name = source_file.stem

        try:
            # 尝试加载模块获取元数据
            module = _load_source_module(source_name, source_file)

            if hasattr(module, "source"):
                source_instance = module.source
                available.append(
                    {
                        "id": source_name,
                        "name": source_instance.name,
                        "description": source_instance.description,
                    }
                )
            else:
                # 如果没有source实例，只返回基本信息
                available.append(
                    {
                        "id": source_name,
                        "name": source_name,
                        "description": "No description available",
                    }
                )
        except Exception as e:
            # 加载失败，返回基本信息
            available.append(
                {
                    "id": source_name,
                    "name": source_name,
                    "description": f"Error loading: {str(e)}",
                }
            )

    return available


def _list_sources(sources_dir: Path) -> list[str]:
    if not sources_dir.exists():
        return []
    sources: list[str] = []
    for source_file in sources_dir.glob("*.py"):
        if source_file.name.startswith("_") or source_file.name == "base.py":
            continue
        sources.append(source_file.stem)
    return sources


def _resolve_enabled_sources(config: FetchConfig, available: list[str]) -> list[str]:
    available_set = set(available)
    selected = [s for s in config.enabled_sources if s in available_set]

    if not available:
        return selected

    # User has explicitly selected sources → respect their selection.
    if config.enabled_sources:
        return selected

    # No explicit selection → enable all real sources
    priority = ["ai_news_daily", "newsnow"]
    ordered = [s for s in priority if s in available_set] + [
        s for s in available if s not in priority
    ]
    return ordered


def _breadth_to_source_count(breadth: int, available_count: int) -> int:
    mapping = {1: 1, 2: 2, 3: 3, 4: min(4, available_count), 5: available_count}
    return mapping.get(breadth, min(3, available_count))


def _normalize_items(
    items: Iterable[Any], source_name: str, logs: list[str]
) -> list[dict[str, Any]]:
    normalized: list[dict[str, Any]] = []
    for idx, item in enumerate(items or []):
        if not isinstance(item, dict):
            logs.append(f"[FetchNode] Skipping invalid item at {source_name}[{idx}] (not dict)")
            continue
        title = str(item.get("title") or "").strip()
        content = str(item.get("content") or "").strip()
        url = str(item.get("url") or "").strip()
        published = item.get("published") or ""
        source = str(item.get("source") or source_name).strip()
        item_type = str(item.get("type") or "rss").strip()

        if not title and not content:
            logs.append(f"[FetchNode] Skipping empty item at {source_name}[{idx}]")
            continue
        if not content:
            content = title
        if not title:
            title = content[:60] + ("..." if len(content) > 60 else "")

        normalized.append(
            {
                "title": title,
                "content": content,
                "url": url,
                "published": published,
                "source": source,
                "type": item_type,
            }
        )
        for key in (
            "summary",
            "source_kind",
            "source_id",
            "source_name",
            "rank",
            "score",
            "first_seen",
            "last_seen",
            "mobile_url",
        ):
            if key in item:
                normalized[-1][key] = item[key]
    return normalized


def _apply_discover_filters(
    items: list[dict[str, Any]], config: FetchConfig, logs: list[str]
) -> list[dict[str, Any]]:
    filtered = list(items)

    filtered = _filter_with_log(filtered, logs, "language", lambda i: _match_language(i, config))
    filtered = _filter_with_log(
        filtered, logs, "exclude_keywords", lambda i: not _match_exclude(i, config)
    )

    min_len = _quality_min_length(config.quality)
    filtered = _filter_with_log(
        filtered,
        logs,
        "quality",
        lambda i: i.get("type") == "hotlist" or len(i.get("content", "")) >= min_len,
    )

    filtered = _filter_with_log(filtered, logs, "freshness", lambda i: _match_freshness(i, config))
    filtered = _filter_with_log(
        filtered,
        logs,
        "relevance",
        lambda i: i.get("type") == "hotlist" or _relevance_score(i, config) >= config.min_relevance,
    )

    if config.prefer_original:
        filtered = _filter_with_log(filtered, logs, "prefer_original", lambda i: not _is_repost(i))

    if not config.allow_duplicates and len(filtered) > 1:
        threshold = 0.9 if config.quality >= 4 else 0.85
        if config.event_detection or config.group_by_topic:
            threshold = min(threshold, 0.82)
        before = len(filtered)
        filtered = _deduplicate(filtered, threshold)
        removed = before - len(filtered)
        if removed > 0:
            logs.append(f"[FetchNode] Removed {removed} duplicate items")

    if config.event_detection and len(filtered) > 1:
        filtered = _detect_events(filtered, 0.75, logs)

    if config.group_by_topic and len(filtered) > 1:
        filtered = _group_by_topic(filtered, 0.78)

    filtered = _sort_items(filtered, config)

    if config.max_articles and len(filtered) > config.max_articles:
        filtered = filtered[: config.max_articles]

    if config.include_summary:
        for item in filtered:
            if "summary" not in item:
                content = item.get("content", "")
                # Extract a meaningful first sentence or paragraph as summary
                summary = _extract_summary(content, 200)
                item["summary"] = summary

    return filtered


def _filter_with_log(
    items: list[dict[str, Any]], logs: list[str], label: str, predicate
) -> list[dict[str, Any]]:
    before = len(items)
    filtered = [item for item in items if predicate(item)]
    removed = before - len(filtered)
    if removed > 0:
        logs.append(f"[FetchNode] Filtered {removed} items by {label}")
    return filtered


def _quality_min_length(quality: int) -> int:
    mapping = {1: 0, 2: 40, 3: 100, 4: 160, 5: 220}
    return mapping.get(quality, 100)


def _match_language(item: dict[str, Any], config: FetchConfig) -> bool:
    if config.language_mix == "mixed":
        return True
    text = _normalize_text(item)
    if not text:
        return True
    cjk_count = len(re.findall(r"[\u4e00-\u9fff]", text))
    alpha_count = len(re.findall(r"[a-zA-Z]", text))
    total = max(len(text), 1)
    cjk_ratio = cjk_count / total
    alpha_ratio = alpha_count / total
    if config.language_mix == "chinese":
        return cjk_ratio >= 0.2 or cjk_count >= 5
    if config.language_mix == "english":
        return alpha_ratio >= 0.4 or alpha_count >= 20
    return True


def _match_exclude(item: dict[str, Any], config: FetchConfig) -> bool:
    if not config.exclude_keywords:
        return False
    text = _normalize_text(item)
    return any(kw.strip().lower() in text for kw in config.exclude_keywords if kw.strip())


def _relevance_score(item: dict[str, Any], config: FetchConfig) -> int:
    text = _normalize_text(item)
    topic_words = _tokenize(config.topic)
    keywords = [kw.strip().lower() for kw in config.keywords if kw.strip()]

    if topic_words:
        hits = sum(1 for w in topic_words if w in text)
        ratio = hits / max(len(topic_words), 1)
        if ratio >= 0.4:
            score = 5
        elif ratio >= 0.25:
            score = 4
        elif ratio >= 0.15:
            score = 3
        elif ratio >= 0.05:
            score = 2
        else:
            score = 1
    else:
        score = 2 if keywords else 3

    if keywords:
        key_hits = sum(1 for k in keywords if k in text)
        if key_hits > 0:
            score = min(5, score + 1 + min(2, key_hits // 2))
    return score


def _match_freshness(item: dict[str, Any], config: FetchConfig) -> bool:
    recency_hours = getattr(config, "recency_hours", None)
    if recency_hours is not None:
        try:
            hours_limit = int(recency_hours)
        except (TypeError, ValueError):
            hours_limit = 0
        if hours_limit <= 0:
            return True
        published = _parse_datetime(item.get("published"))
        if not published:
            return True
        now = datetime.now(UTC)
        if published.tzinfo is None:
            published = published.replace(tzinfo=UTC)
        delta_hours = (now - published).total_seconds() / 3600
        return delta_hours <= hours_limit

    if config.freshness <= 1:
        return True
    published = _parse_datetime(item.get("published"))
    if not published:
        return True
    now = datetime.now(UTC)
    if published.tzinfo is None:
        published = published.replace(tzinfo=UTC)
    delta_hours = (now - published).total_seconds() / 3600
    if config.freshness >= 5:
        return delta_hours <= 6
    if config.freshness == 4:
        return delta_hours <= 24
    if config.freshness == 3:
        return delta_hours <= 72
    if config.freshness == 2:
        return delta_hours <= 24 * 7
    return True


def _parse_datetime(value: Any) -> datetime | None:
    if not value:
        return None
    if isinstance(value, datetime):
        return value
    if isinstance(value, (int, float)):
        try:
            return datetime.fromtimestamp(value, tz=UTC)
        except Exception:
            return None
    if isinstance(value, str):
        raw = value.strip()
        if not raw:
            return None
        try:
            return datetime.fromisoformat(raw.replace("Z", "+00:00"))
        except Exception:
            pass
        try:
            return parsedate_to_datetime(raw)
        except Exception:
            return None
    return None


def _is_repost(item: dict[str, Any]) -> bool:
    text = _normalize_text(item)
    if "转载" in text or "repost" in text:
        return True
    return False


def _deduplicate(items: list[dict[str, Any]], threshold: float) -> list[dict[str, Any]]:
    unique: list[dict[str, Any]] = []
    titles: list[str] = []
    for item in items:
        title = _normalize_title(item.get("title", ""))
        if not title:
            unique.append(item)
            continue
        is_dup = any(SequenceMatcher(None, title, seen).ratio() >= threshold for seen in titles)
        if not is_dup:
            titles.append(title)
            unique.append(item)
    return unique


def _detect_events(
    items: list[dict[str, Any]], threshold: float, logs: list[str]
) -> list[dict[str, Any]]:
    """Cluster items about the same event across sources, tag them with _event_id and _event_size."""
    events: list[tuple[str, list[int]]] = []  # (representative_title, [indices])
    for idx, item in enumerate(items):
        key = _normalize_title(item.get("title", ""))
        if not key:
            continue
        placed = False
        for eidx, (ekey, indices) in enumerate(events):
            if SequenceMatcher(None, key, ekey).ratio() >= threshold:
                indices.append(idx)
                placed = True
                break
        if not placed:
            events.append((key, [idx]))

    # Tag items that belong to multi-source events
    event_count = 0
    for ekey, indices in events:
        if len(indices) < 2:
            continue
        event_count += 1
        sources_in_event = set()
        for i in indices:
            items[i]["_event_id"] = event_count
            items[i]["_event_size"] = len(indices)
            sources_in_event.add(items[i].get("source", ""))
        items[indices[0]]["_event_sources"] = list(sources_in_event)

    if event_count > 0:
        logs.append(f"[FetchNode] Detected {event_count} multi-source events")
    return items


def _group_by_topic(items: list[dict[str, Any]], threshold: float) -> list[dict[str, Any]]:
    groups: list[tuple[str, list[dict[str, Any]]]] = []
    for item in items:
        key = _normalize_title(item.get("title", ""))
        placed = False
        for idx, (gkey, group_items) in enumerate(groups):
            if SequenceMatcher(None, key, gkey).ratio() >= threshold:
                group_items.append(item)
                groups[idx] = (gkey, group_items)
                placed = True
                break
        if not placed:
            groups.append((key, [item]))

    grouped: list[dict[str, Any]] = []
    for key, group_items in groups:
        representative = dict(group_items[0])
        if len(group_items) > 1:
            representative["_group_size"] = len(group_items)
        grouped.append(representative)
    return grouped


def _sort_items(items: list[dict[str, Any]], config: FetchConfig) -> list[dict[str, Any]]:
    if not items:
        return items

    trend_counts: dict[str, int] = {}
    for item in items:
        key = _normalize_title(item.get("title", ""))
        trend_counts[key] = trend_counts.get(key, 0) + 1

    def score(item: dict[str, Any]) -> tuple[float, float]:
        rel = _relevance_score(item, config)
        published = _parse_datetime(item.get("published"))
        recency = 0.0
        if published:
            now = datetime.now(UTC)
            if published.tzinfo is None:
                published = published.replace(tzinfo=UTC)
            hours = (now - published).total_seconds() / 3600
            if hours < 6:
                recency = 30
            elif hours < 24:
                recency = 18
            elif hours < 72:
                recency = 8
        trend = 0.0
        if config.trending_boost:
            trend = (trend_counts.get(_normalize_title(item.get("title", "")), 1) - 1) * 8
        keyword_hit = 6 if _match_keywords(item, config) else 0
        group_boost = (item.get("_group_size", 1) - 1) * 4
        return (rel * 12 + recency + trend + keyword_hit + group_boost, recency)

    return sorted(items, key=score, reverse=True)


def _match_keywords(item: dict[str, Any], config: FetchConfig) -> bool:
    if not config.keywords:
        return False
    text = _normalize_text(item)
    return any(kw.strip().lower() in text for kw in config.keywords if kw.strip())


def _normalize_text(item: dict[str, Any]) -> str:
    return f"{item.get('title', '')} {item.get('content', '')}".lower()


def _normalize_title(title: str) -> str:
    cleaned = re.sub(r"\s+", " ", str(title).strip().lower())
    cleaned = re.sub(r"[^a-z0-9\u4e00-\u9fff ]", "", cleaned)
    tokens = cleaned.split()
    return " ".join(tokens[:10])


def _extract_summary(content: str, max_len: int = 200) -> str:
    """Extract a meaningful summary: first complete sentence or paragraph."""
    if not content:
        return ""
    text = content.strip()
    # Try to find first sentence break (Chinese or English)
    for sep in ["。", "！", "？", ". ", "! ", "? ", "\n\n", "\n"]:
        pos = text.find(sep)
        if 0 < pos <= max_len:
            return text[: pos + len(sep)].strip()
    # Fall back to word boundary near max_len
    if len(text) <= max_len:
        return text
    cut = text[:max_len]
    # Try to break at last space or punctuation
    for ch in [" ", "，", ",", "；", "、"]:
        last = cut.rfind(ch)
        if last > max_len // 2:
            return cut[:last].strip() + "…"
    return cut.strip() + "…"


def _tokenize(text: str) -> list[str]:
    if not text:
        return []
    tokens = re.split(r"[,，、\s]+", text.lower())

    short_allow = {"ai", "ml", "llm", "ar", "vr", "5g"}
    stopwords = {
        "the",
        "and",
        "for",
        "with",
        "from",
        "that",
        "this",
        "into",
        "about",
        "关注",
        "方向",
        "相关",
        "新闻",
        "资讯",
        "话题",
        "今天",
        "最新",
    }

    cleaned: list[str] = []
    for token in tokens:
        t = token.strip("._-:;!?()[]{}\"'`“”‘’")
        if not t or t in stopwords:
            continue
        if re.fullmatch(r"[a-z0-9]+", t):
            if len(t) < 3 and t not in short_allow:
                continue
        elif re.fullmatch(r"[\u4e00-\u9fff]+", t):
            if len(t) < 2:
                continue
        cleaned.append(t)
    return cleaned
