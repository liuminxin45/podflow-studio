"""
Story clustering utilities based on SimHash + title similarity.

This is an initial, lightweight clustering approach (no embeddings) that
groups near-duplicate stories and tracks cooldown windows to combat "霸榜".
"""

from __future__ import annotations

import datetime as dt
import itertools
import math
from dataclasses import dataclass, field
from typing import Iterable, List

from src.store.fingerprints import ensure_item_fingerprints
from src.utils.models import StoryCluster, StoryClusterSignals

__all__ = [
    "ClusterConfig",
    "cluster_items",
]


@dataclass(slots=True)
class ClusterConfig:
    simhash_max_distance: int = 4
    title_min_jaccard: float = 0.4
    time_window_days: int = 3
    cooldown_days: int = 2


def _split_title(title: str | None) -> set[str]:
    if not title:
        return set()
    tokens = [tok for tok in title.lower().replace("，", " ").replace("。", " ").split() if tok]
    return set(tokens)


def _jaccard(a: set[str], b: set[str]) -> float:
    if not a or not b:
        return 0.0
    inter = len(a & b)
    union = len(a | b)
    if union == 0:
        return 0.0
    return inter / union


def _hamming_distance(hex_a: str, hex_b: str) -> int:
    return bin(int(hex_a, 16) ^ int(hex_b, 16)).count("1")


def _recent_cutoff(now: dt.datetime, window_days: int) -> dt.datetime:
    return now - dt.timedelta(days=window_days)


def cluster_items(items: list[dict], *, config: ClusterConfig | None = None) -> list[StoryCluster]:
    cfg = config or ClusterConfig()
    now = dt.datetime.now(dt.timezone.utc)
    cutoff = _recent_cutoff(now, cfg.time_window_days)

    clusters: list[StoryCluster] = []

    for item in items:
        normalized = ensure_item_fingerprints(item)
        fp = normalized.get("fingerprints") or {}
        simhash_hex = fp.get("simhash")
        published_at = normalized.get("published_at")
        if isinstance(published_at, str):
            try:
                published_at_dt = dt.datetime.fromisoformat(published_at)
            except ValueError:
                published_at_dt = now
        elif isinstance(published_at, dt.datetime):
            published_at_dt = published_at
        else:
            published_at_dt = now

        if published_at_dt < cutoff:
            continue

        title_tokens = _split_title(normalized.get("title"))
        found_cluster: StoryCluster | None = None
        for cluster in clusters:
            last_seen_str = cluster.last_seen_at
            last_seen = (
                dt.datetime.fromisoformat(last_seen_str)
                if isinstance(last_seen_str, str)
                else last_seen_str
                if isinstance(last_seen_str, dt.datetime)
                else None
            )
            if last_seen and last_seen < cutoff:
                continue

            ref_item_id = cluster.items[-1]
            ref_item = next((it for it in items if it.get("id") == ref_item_id), None)
            if not ref_item:
                continue
            ref_fp = (ref_item.get("fingerprints") or {})
            ref_simhash = ref_fp.get("simhash")
            if simhash_hex and ref_simhash:
                if _hamming_distance(simhash_hex, ref_simhash) <= cfg.simhash_max_distance:
                    found_cluster = cluster
                    break

            ref_tokens = _split_title(ref_item.get("title"))
            if _jaccard(title_tokens, ref_tokens) >= cfg.title_min_jaccard:
                found_cluster = cluster
                break

        if found_cluster is None:
            cluster = StoryCluster(
                cluster_id=f"clu:{len(clusters)+1:04d}",
                headline=normalized.get("title") or "",
                topic=None,
                items=[normalized.get("id") or normalized.get("source", {}).get("url") or f"item:{len(clusters)}"],
                first_seen_at=published_at_dt.isoformat(),
                last_seen_at=published_at_dt.isoformat(),
                cooldown_until=(published_at_dt + dt.timedelta(days=cfg.cooldown_days)).isoformat(),
                signals=StoryClusterSignals(
                    freshness=1.0,
                    impact=None,
                    source_diversity=None,
                ),
            )
            clusters.append(cluster)
        else:
            found_cluster.items.append(normalized.get("id") or normalized.get("source", {}).get("url") or "")
            found_cluster.last_seen_at = published_at_dt.isoformat()
            found_cluster.cooldown_until = (published_at_dt + dt.timedelta(days=cfg.cooldown_days)).isoformat()

    return clusters
