"""
Cluster scoring utilities: freshness / impact / source trust / quality.
"""

from __future__ import annotations

import dataclasses
import datetime as dt
import math
from dataclasses import dataclass, field
from typing import Iterable, Mapping

from src.utils.models import StoryCluster

__all__ = [
    "ScoreWeights",
    "ScoringConfig",
    "ScoreDetail",
    "score_cluster",
]


@dataclass(slots=True)
class ScoreWeights:
    freshness: float = 0.4
    impact: float = 0.3
    source_trust: float = 0.2
    quality: float = 0.1


@dataclass(slots=True)
class ScoringConfig:
    freshness_half_life_days: float = 3.0
    source_trust_overrides: Mapping[str, float] | None = None
    weights: ScoreWeights = field(default_factory=ScoreWeights)


@dataclass(slots=True)
class ScoreDetail:
    cluster_id: str
    total: float
    components: dict[str, float]
    info: dict[str, float]


def _to_datetime(value: dt.datetime | str | None, default: dt.datetime) -> dt.datetime:
    if isinstance(value, dt.datetime):
        return value
    if isinstance(value, str) and value:
        try:
            return dt.datetime.fromisoformat(value)
        except ValueError:
            pass
    return default


def _compute_freshness(last_seen: dt.datetime, now: dt.datetime, half_life_days: float) -> float:
    delta_days = max(0.0, (now - last_seen).total_seconds() / 86400.0)
    half_life = max(0.1, half_life_days)
    return math.exp(-delta_days / half_life)


def _compute_impact(item_count: int, domain_count: int) -> float:
    if item_count <= 0:
        return 0.0
    diversity = min(1.0, domain_count / 4.0)
    magnitude = min(1.0, math.log(item_count + 1, 5))
    return min(1.0, (diversity * 0.4) + (magnitude * 0.6))


def _compute_source_trust(domains: Iterable[str], overrides: Mapping[str, float] | None) -> float:
    overrides = overrides or {}
    values: list[float] = []
    for domain in domains:
        if not domain:
            continue
        score = overrides.get(domain, 0.5)
        values.append(float(max(0.0, min(1.0, score))))
    if not values:
        return 0.5
    return sum(values) / len(values)


def score_cluster(
    *,
    cluster: StoryCluster,
    item_count: int,
    domains: Iterable[str],
    last_seen_at: dt.datetime | str | None,
    quality_hint: float | None,
    config: ScoringConfig | None = None,
    now: dt.datetime | None = None,
) -> ScoreDetail:
    cfg = config or ScoringConfig()
    weights = cfg.weights
    now = now or dt.datetime.now(dt.timezone.utc)
    last_seen = _to_datetime(last_seen_at, default=now)
    domains_list = list(domains)

    freshness = _compute_freshness(last_seen, now, cfg.freshness_half_life_days)
    impact = _compute_impact(item_count=item_count, domain_count=len(set(domains_list)))
    trust = _compute_source_trust(domains_list, cfg.source_trust_overrides)
    quality = max(0.0, min(1.0, quality_hint if quality_hint is not None else 0.5))

    total = (
        freshness * weights.freshness
        + impact * weights.impact
        + trust * weights.source_trust
        + quality * weights.quality
    )

    components = {
        "freshness": round(freshness, 4),
        "impact": round(impact, 4),
        "source_trust": round(trust, 4),
        "quality": round(quality, 4),
    }

    return ScoreDetail(
        cluster_id=cluster.cluster_id,
        total=round(total, 4),
        components=components,
        info={
            "item_count": float(item_count),
            "domain_count": float(len(set(domains_list))),
        },
    )
