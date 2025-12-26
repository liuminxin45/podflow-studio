"""
Core data models shared by the Auto-Podcast pipeline stages.

The goal is to have a single source of truth for the schema outlined in
the vNext design doc so that fetch/store/research/LLM stages can type
against the same structures.
"""

from __future__ import annotations

import datetime as dt
from dataclasses import dataclass, field
from typing import Any, Literal, Sequence

__all__ = [
    "NewsSource",
    "NewsEntities",
    "NewsItemQuality",
    "NewsItem",
    "StoryClusterSignals",
    "StoryCluster",
    "Claim",
    "EvidenceSource",
    "EvidencePack",
    "MetasoWebPage",
    "MetasoSearchResult",
]


@dataclass(slots=True)
class NewsSource:
    name: str
    domain: str
    url: str
    canonical_url: str | None = None
    fetch_time: dt.datetime | str | None = None


@dataclass(slots=True)
class NewsEntities:
    people: list[str] = field(default_factory=list)
    orgs: list[str] = field(default_factory=list)
    places: list[str] = field(default_factory=list)


@dataclass(slots=True)
class NewsItemQuality:
    extractor: str | None = None
    extract_confidence: float | None = None
    length: int | None = None


@dataclass(slots=True)
class NewsItem:
    id: str
    source: NewsSource
    title: str
    summary: str | None
    content: str
    lang: str = "zh"
    published_at: dt.datetime | str | None = None
    published_at_raw: str | None = None
    tags: list[str] = field(default_factory=list)
    entities: NewsEntities = field(default_factory=NewsEntities)
    fingerprints: dict[str, str] = field(default_factory=dict)
    quality: NewsItemQuality = field(default_factory=NewsItemQuality)
    meta: dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class StoryClusterSignals:
    freshness: float | None = None
    impact: float | None = None
    source_diversity: float | None = None


@dataclass(slots=True)
class StoryCluster:
    cluster_id: str
    headline: str
    topic: str | None
    items: list[str] = field(default_factory=list)
    first_seen_at: dt.datetime | str | None = None
    last_seen_at: dt.datetime | str | None = None
    cooldown_until: dt.datetime | str | None = None
    signals: StoryClusterSignals = field(default_factory=StoryClusterSignals)
    meta: dict[str, Any] = field(default_factory=dict)


ClaimType = Literal["numeric", "event", "attribution", "policy", "other"]
ClaimVerdict = Literal["supported", "contradicted", "mixed", "unverified"]


@dataclass(slots=True)
class Claim:
    claim_id: str
    text: str
    claim_type: ClaimType = "other"
    priority: float = 0.0
    entities: list[str] = field(default_factory=list)
    needs_research: bool = True
    source_item_id: str | None = None
    meta: dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class EvidenceSource:
    title: str
    url: str
    stance: Literal["support", "refute", "neutral"] = "support"
    reliability: float | None = None
    snippet: str | None = None
    published_at: dt.datetime | str | None = None
    meta: dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class EvidencePack:
    claim_id: str
    verdict: ClaimVerdict
    confidence: float
    sources: list[EvidenceSource] = field(default_factory=list)
    notes: str | None = None
    meta: dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class MetasoWebPage:
    title: str
    link: str
    snippet: str | None
    score: str | None = None
    position: int | None = None
    date_raw: str | None = None
    date_iso: str | None = None
    published_at: dt.datetime | str | None = None
    reliability: float | None = None
    meta: dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class MetasoSearchResult:
    query: str
    credits: int
    webpages: list[MetasoWebPage] = field(default_factory=list)
    raw: dict[str, Any] | None = None
    fetched_at: dt.datetime | str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "query": self.query,
            "credits": self.credits,
            "webpages": [vars(wp) for wp in self.webpages],
            "raw": self.raw,
            "fetched_at": self.fetched_at.isoformat() if isinstance(self.fetched_at, dt.datetime) else self.fetched_at,
        }
