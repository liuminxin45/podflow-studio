"""
Deduplication helpers for news items.

Implements multi-layer dedup:
1. URL canonicalisation dedup
2. Content hash dedup
3. SimHash near-duplicate filtering
"""

from __future__ import annotations

import itertools
from dataclasses import dataclass, field
from typing import Sequence

from src.store.operations.fingerprints import ensure_item_fingerprints

__all__ = [
    "DuplicateRecord",
    "DedupResult",
    "deduplicate_items",
    "dedup_items",
]


@dataclass(slots=True)
class DuplicateRecord:
    item_id: str | None
    reason: str
    reference_id: str | None = None


@dataclass(slots=True)
class DedupResult:
    unique_items: list[dict] = field(default_factory=list)
    duplicates: list[DuplicateRecord] = field(default_factory=list)

    def as_tuple(self) -> tuple[list[dict], list[DuplicateRecord]]:
        return self.unique_items, self.duplicates


def _hamming_distance(hex_a: str, hex_b: str) -> int:
    try:
        return bin(int(hex_a, 16) ^ int(hex_b, 16)).count("1")
    except ValueError:
        return 64


def _normalize_item(item: dict) -> dict:
    return ensure_item_fingerprints(item)


def _safe_id(value: str | None) -> str:
    return value or ""


def deduplicate_items(
    items: Sequence[dict],
    *,
    max_items: int | None = None,
    simhash_max_distance: int = 3,
) -> DedupResult:
    result = DedupResult()
    seen_urls: dict[str, str] = {}
    seen_content: dict[str, str] = {}
    seen_simhash: dict[str, str] = {}

    for item in items:
        payload = _normalize_item(item)
        fp = payload.get("fingerprints") or {}
        normalized_url = fp.get("normalized_url") or ""
        content_sha = fp.get("content_sha256") or ""
        simhash_hex = fp.get("simhash") or ""
        source_info = payload.get("source") or {}
        item_id = payload.get("id") or source_info.get("url")
        safe_item_id = _safe_id(item_id)

        if normalized_url and normalized_url in seen_urls:
            result.duplicates.append(
                DuplicateRecord(item_id=item_id, reason="normalized_url", reference_id=seen_urls[normalized_url])
            )
            continue
        if content_sha and content_sha in seen_content:
            result.duplicates.append(
                DuplicateRecord(item_id=item_id, reason="content_sha256", reference_id=seen_content[content_sha])
            )
            continue

        duplicate_simhash = None
        if simhash_hex:
            for other_hash, ref_id in seen_simhash.items():
                if _hamming_distance(simhash_hex, other_hash) <= simhash_max_distance:
                    duplicate_simhash = ref_id
                    break
        if duplicate_simhash:
            result.duplicates.append(
                DuplicateRecord(item_id=item_id, reason="simhash", reference_id=duplicate_simhash)
            )
            continue

        result.unique_items.append(payload)
        if normalized_url:
            seen_urls[normalized_url] = safe_item_id
        if content_sha:
            seen_content[content_sha] = safe_item_id
        if simhash_hex:
            seen_simhash[simhash_hex] = safe_item_id

        if max_items is not None and len(result.unique_items) >= max_items:
            break

    return result


def dedup_items(items: Sequence[dict], max_items: int) -> list[dict]:
    """
    Backwards-compatible wrapper used by ``run.py``.

    Returns only the list of unique items, capped by ``max_items``.
    """

    result = deduplicate_items(items, max_items=max_items)
    return result.unique_items
