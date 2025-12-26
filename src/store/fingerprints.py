"""
Utilities for generating and managing fingerprints used by the store layer.

These helpers centralise URL normalisation, canonical content hashing and
SimHash generation so that fetch/dedup/cluster stages can stay consistent.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Iterable, Sequence

from src.utils import models
from src.utils.hash_utils import (
    build_content_fingerprint,
    normalize_url as normalize_url_basic,
    sha256_text,
    simhash,
)

__all__ = [
    "FingerprintBundle",
    "make_fingerprints",
    "ensure_item_fingerprints",
    "tokenize_for_simhash",
    "normalize_url",
]


@dataclass(slots=True, frozen=True)
class FingerprintBundle:
    normalized_url: str
    content_sha256: str
    title_sha256: str
    simhash: str


_PUNCT_RE = re.compile(r"[，。、“”‘’！：；？,.!?()\[\]{}<>\"']")


def normalize_url(url: str | None) -> str:
    """Wrapper that tolerates ``None``."""

    if not url:
        return ""
    return normalize_url_basic(url)


def tokenize_for_simhash(*segments: str) -> list[str]:
    """
    Crude tokeniser primarily for SimHash.

    It removes punctuation and splits on whitespace to avoid bringing in
    heavyweight NLP dependencies before they are truly needed.
    """

    tokens: list[str] = []
    for segment in segments:
        if not segment:
            continue
        stripped = _PUNCT_RE.sub(" ", segment.lower())
        tokens.extend(tok for tok in stripped.split() if tok)
    return tokens


def make_fingerprints(
    *,
    url: str | None,
    title: str | None,
    content: str | None,
    extra_tokens: Iterable[str] | None = None,
) -> FingerprintBundle:
    normalized_url = normalize_url(url)
    title_sha = sha256_text((title or "").strip())
    content_sha = build_content_fingerprint(title, content)

    tokens: list[str] = tokenize_for_simhash(title or "", content or "")
    if extra_tokens:
        tokens.extend(extra_tokens)
    simhash_hex = simhash(tokens)
    return FingerprintBundle(
        normalized_url=normalized_url,
        content_sha256=content_sha,
        title_sha256=title_sha,
        simhash=simhash_hex,
    )


def ensure_item_fingerprints(item: dict | models.NewsItem) -> dict:
    """
    Attach the canonical fingerprint bundle to a mutable dict item.

    Returns the dictionary representation (''vars'' for dataclasses).
    """

    if isinstance(item, models.NewsItem):
        data = vars(item).copy()
    else:
        data = item

    payload = data.get("fingerprints") or {}
    if payload.get("content_sha256") and payload.get("simhash"):
        return data

    bundle = make_fingerprints(
        url=(data.get("source") or {}).get("url") if isinstance(data.get("source"), dict) else data.get("url"),
        title=data.get("title"),
        content=data.get("content"),
    )
    payload.update(
        {
            "normalized_url": bundle.normalized_url,
            "content_sha256": bundle.content_sha256,
            "title_sha256": bundle.title_sha256,
            "simhash": bundle.simhash,
        }
    )
    data["fingerprints"] = payload
    return data
