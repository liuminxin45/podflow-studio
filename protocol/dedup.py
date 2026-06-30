"""
Shared deduplication utilities.

Used by merge and preprocess nodes to avoid duplicating logic.
"""

from typing import Any
from difflib import SequenceMatcher


def deduplicate_by_title(
    items: list[dict[str, Any]],
    threshold: float = 0.8,
) -> list[dict[str, Any]]:
    """
    Title-based deduplication.

    Uses exact match when threshold >= 1.0,
    otherwise falls back to SequenceMatcher ratio.

    Args:
        items: List of content dicts with 'title' field.
        threshold: Similarity threshold (0-1). Higher = stricter.

    Returns:
        Deduplicated list preserving original order.
    """
    unique: list[dict[str, Any]] = []
    seen_titles: list[str] = []

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
            is_dup = any(SequenceMatcher(None, title, s).ratio() >= threshold for s in seen_titles)
            if not is_dup:
                seen_titles.append(title)
                unique.append(item)

    return unique
