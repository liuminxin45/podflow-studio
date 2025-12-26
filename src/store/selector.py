"""
Cluster selector combining scoring and constraints, producing explanations.
"""

from __future__ import annotations

import dataclasses
import datetime as dt
from dataclasses import dataclass, field
from typing import Dict, Sequence
from urllib.parse import urlparse

from src.store.constraints import (
    ClusterMetadata,
    ConstraintConfig,
    ConstraintState,
    apply_constraints,
)
from src.store.scoring import ScoringConfig, ScoreDetail, score_cluster
from src.utils.models import StoryCluster

__all__ = [
    "SelectionConfig",
    "select_clusters",
]


def _majority(values: Sequence[str | None]) -> str | None:
    counts: dict[str, int] = {}
    for v in values:
        if not v:
            continue
        key = v.strip()
        if not key:
            continue
        counts[key] = counts.get(key, 0) + 1
    if not counts:
        return None
    return max(counts.items(), key=lambda item: (item[1], item[0]))[0]


def _extract_domain(url: str | None) -> str:
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


def _quality_hint(items: Sequence[dict]) -> float:
    values: list[float] = []
    for it in items:
        quality = it.get("quality") or {}
        conf = quality.get("extract_confidence")
        if isinstance(conf, (int, float)):
            values.append(float(conf))
            continue
        text_len = len((it.get("content") or "") + (it.get("summary") or ""))
        if text_len > 0:
            values.append(min(1.0, text_len / 4000))
    if not values:
        return 0.5
    return min(1.0, sum(values) / len(values))


def _cluster_to_dict(cluster: StoryCluster) -> dict:
    data = dataclasses.asdict(cluster)
    for key in ("first_seen_at", "last_seen_at", "cooldown_until"):
        value = data.get(key)
        if isinstance(value, dt.datetime):
            data[key] = value.isoformat()
    return data


def _item_snapshot(item: dict) -> dict:
    return {
        "id": item.get("id"),
        "title": item.get("title"),
        "summary": item.get("summary"),
        "content": item.get("content"),
        "url": item.get("url"),
        "category": item.get("category"),
        "published_at": item.get("published_at"),
        "source": item.get("source"),
    }


@dataclass(slots=True)
class SelectionConfig:
    max_clusters: int = 5
    scoring: ScoringConfig = field(default_factory=ScoringConfig)
    constraints: ConstraintConfig = field(default_factory=ConstraintConfig)


def select_clusters(
    clusters: Sequence[StoryCluster],
    *,
    item_lookup: Dict[str, dict],
    config: SelectionConfig | None = None,
    now: dt.datetime | None = None,
) -> dict:
    cfg = config or SelectionConfig()
    now = now or dt.datetime.now(dt.timezone.utc)
    entries: list[dict] = []

    def _cluster_items(clu: StoryCluster) -> list[dict]:
        out = []
        for item_id in clu.items:
            if not item_id:
                continue
            item = item_lookup.get(item_id)
            if item:
                out.append(item)
        return out

    contexts: list[dict] = []
    for cluster in clusters:
        items = _cluster_items(cluster)
        if not items:
            contexts.append(
                {
                    "cluster": cluster,
                    "metadata": ClusterMetadata(headline=cluster.headline),
                    "items": items,
                    "score": None,
                    "reasons": ["missing_items"],
                }
            )
            continue

        domains = [_extract_domain(it.get("url")) for it in items if it.get("url")]
        topic = _majority([it.get("category") or it.get("topic") for it in items])
        metadata = ClusterMetadata(topic=topic, domains=domains, headline=cluster.headline)
        detail = score_cluster(
            cluster=cluster,
            item_count=len(items),
            domains=domains,
            last_seen_at=cluster.last_seen_at,
            quality_hint=_quality_hint(items),
            config=cfg.scoring,
            now=now,
        )
        contexts.append(
            {
                "cluster": cluster,
                "metadata": metadata,
                "items": items,
                "score": detail,
                "reasons": [],
            }
        )

    contexts.sort(key=lambda ctx: (ctx["score"].total if ctx["score"] else 0.0), reverse=True)

    state = ConstraintState()
    selected_count = 0
    for ctx in contexts:
        cluster = ctx["cluster"]
        score_detail: ScoreDetail | None = ctx["score"]
        metadata: ClusterMetadata = ctx["metadata"]
        reasons: list[str] = ctx["reasons"]

        payload = {
            "cluster": _cluster_to_dict(cluster),
            "metadata": dataclasses.asdict(metadata),
            "score": dataclasses.asdict(score_detail) if score_detail else None,
            "items": [_item_snapshot(it) for it in ctx["items"]],
            "reasons": [],
            "selected": False,
        }

        if not ctx["items"]:
            payload["reasons"] = list(reasons)
            entries.append(payload)
            continue

        if selected_count >= max(0, cfg.max_clusters):
            payload["reasons"] = ["limit"] + reasons
            entries.append(payload)
            continue

        ok, constraint_reasons = apply_constraints(
            cluster=cluster,
            metadata=metadata,
            state=state,
            config=cfg.constraints,
            now=now,
        )
        if ok:
            state.register(metadata)
            payload["selected"] = True
            entries.append(payload)
            selected_count += 1
        else:
            payload["reasons"] = list(reasons) + constraint_reasons
            entries.append(payload)

    return {
        "entries": entries,
        "selected": [entry for entry in entries if entry["selected"]],
        "rejected": [entry for entry in entries if not entry["selected"]],
    }
