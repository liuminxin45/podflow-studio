"""
Constraint helpers for cluster selection: cooldown, diversity, quotas.
"""

from __future__ import annotations

import datetime as dt
from dataclasses import dataclass, field
from typing import Iterable, Sequence

from src.utils.models import StoryCluster

__all__ = [
    "ClusterMetadata",
    "ConstraintConfig",
    "ConstraintState",
    "apply_constraints",
    "headline_tokens",
]


def headline_tokens(text: str | None) -> set[str]:
    if not text:
        return set()
    clean = text.replace("，", " ").replace("。", " ").replace("！", " ").replace("：", " ")
    return {tok.lower() for tok in clean.split() if tok.strip()}


@dataclass(slots=True)
class ClusterMetadata:
    topic: str | None = None
    domains: list[str] = field(default_factory=list)
    headline: str | None = None


@dataclass(slots=True)
class ConstraintConfig:
    cooldown_days: int = 2
    exception_keywords: Sequence[str] = (
        "最新",
        "宣布",
        "确认",
        "发布",
        "裁决",
        "修正",
        "更新",
    )
    max_per_topic: int = 2
    max_per_domain: int = 1
    max_title_similarity: float = 0.7  # jaccard similarity threshold


@dataclass(slots=True)
class ConstraintState:
    topic_counts: dict[str, int] = field(default_factory=dict)
    domain_counts: dict[str, int] = field(default_factory=dict)
    headline_token_sets: list[set[str]] = field(default_factory=list)

    def register(self, metadata: ClusterMetadata) -> None:
        if metadata.topic:
            self.topic_counts[metadata.topic] = self.topic_counts.get(metadata.topic, 0) + 1
        for domain in metadata.domains:
            dom = domain.lower()
            if not dom:
                continue
            self.domain_counts[dom] = self.domain_counts.get(dom, 0) + 1
        self.headline_token_sets.append(headline_tokens(metadata.headline))


def _jaccard(a: set[str], b: set[str]) -> float:
    if not a or not b:
        return 0.0
    inter = len(a & b)
    union = len(a | b)
    if union == 0:
        return 0.0
    return inter / union


def _parse_dt(value: dt.datetime | str | None) -> dt.datetime | None:
    if isinstance(value, dt.datetime):
        return value
    if isinstance(value, str):
        try:
            return dt.datetime.fromisoformat(value)
        except ValueError:
            return None
    return None


def _headline_has_exception(headline: str | None, keywords: Sequence[str]) -> bool:
    if not headline:
        return False
    low = headline.lower()
    for kw in keywords:
        if kw and kw.lower() in low:
            return True
    return False


def apply_constraints(
    *,
    cluster: StoryCluster,
    metadata: ClusterMetadata,
    state: ConstraintState,
    config: ConstraintConfig,
    now: dt.datetime | None = None,
) -> tuple[bool, list[str]]:
    now = now or dt.datetime.now(dt.timezone.utc)
    reasons: list[str] = []

    cooldown_until = _parse_dt(cluster.cooldown_until)
    if cooldown_until:
        delta = (cooldown_until - now).total_seconds()
        if delta > 0 and not _headline_has_exception(metadata.headline, config.exception_keywords):
            reasons.append("cooldown")

    if metadata.topic:
        current = state.topic_counts.get(metadata.topic, 0)
        if config.max_per_topic > 0 and current >= config.max_per_topic:
            reasons.append(f"topic_quota:{metadata.topic}")

    normalized_domains = [d.lower() for d in metadata.domains if d]
    for domain in normalized_domains:
        current = state.domain_counts.get(domain, 0)
        if config.max_per_domain > 0 and current >= config.max_per_domain:
            reasons.append(f"domain_quota:{domain}")
            break

    if config.max_title_similarity < 1.0:
        tokens = headline_tokens(metadata.headline)
        for existing in state.headline_token_sets:
            similarity = _jaccard(tokens, existing)
            if similarity >= config.max_title_similarity:
                reasons.append("too_similar")
                break

    return (len(reasons) == 0, reasons)
