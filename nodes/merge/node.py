from typing import Dict, Any, List
from nodes.merge.config import MergeConfig


def run(state: Dict[str, Any], config: MergeConfig = None) -> Dict[str, Any]:
    """Merge node - 创作素材池：整合 Fetch 与 Manual 两侧的内容"""
    config = config or MergeConfig()
    logs = state.get("logs", [])
    errors = state.get("errors", [])

    logs.append("[MergeNode] Starting content merge")

    fetch_contents = state.get("fetch_contents", [])
    manual_contents = state.get("manual_contents", [])

    logs.append(f"[MergeNode] Fetch provided {len(fetch_contents)} items")
    logs.append(f"[MergeNode] Manual provided {len(manual_contents)} items")

    # Tag sources for traceability
    for item in fetch_contents:
        item["_source_channel"] = "auto"
    for item in manual_contents:
        item["_source_channel"] = "manual"

    # Combine both channels
    merged = list(fetch_contents) + list(manual_contents)

    # Deduplicate by title similarity
    if config.deduplicate and len(merged) > 1:
        before = len(merged)
        merged = _deduplicate(merged, config.similarity_threshold)
        removed = before - len(merged)
        if removed > 0:
            logs.append(f"[MergeNode] Removed {removed} duplicate(s)")

    if len(merged) == 0:
        logs.append("[MergeNode] Warning: No content from either source. Pipeline may produce empty results.")
    else:
        logs.append(f"[MergeNode] Final merged pool: {len(merged)} items")

    state["raw_contents"] = merged
    state["logs"] = logs
    state["errors"] = errors
    return state


def _deduplicate(items: List[Dict[str, Any]], threshold: float = 0.8) -> List[Dict[str, Any]]:
    """Title-based deduplication. Uses exact match when threshold >= 1.0,
    otherwise falls back to SequenceMatcher ratio."""
    from difflib import SequenceMatcher

    unique: List[Dict[str, Any]] = []
    seen_titles: List[str] = []
    for item in items:
        title = item.get("title", "").strip().lower()
        if not title:
            unique.append(item)
            continue
        if threshold >= 1.0:
            if title not in seen_titles:
                seen_titles.append(title)
                unique.append(item)
        else:
            is_dup = any(
                SequenceMatcher(None, title, s).ratio() >= threshold
                for s in seen_titles
            )
            if not is_dup:
                seen_titles.append(title)
                unique.append(item)
    return unique
