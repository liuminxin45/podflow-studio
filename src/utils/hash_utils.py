"""
Hash and fingerprint helpers shared across the Auto-Podcast pipeline.

The helpers here are pure and dependency-light so they can be safely
used inside fetch/dedup/research stages without creating import cycles.
"""

from __future__ import annotations

import hashlib
import json
import re
from typing import Iterable, Sequence
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

__all__ = [
    "sha256_text",
    "stable_hash",
    "normalize_url",
    "build_content_fingerprint",
    "simhash",
]

# UTM & tracking parameters that should be removed in canonical URLs.
DEFAULT_TRACKING_PARAMS = {
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_term",
    "utm_content",
    "spm",
    "fbclid",
    "gclid",
    "msclkid",
    "igshid",
}

_WHITESPACE_RE = re.compile(r"\s+")


def sha256_text(text: str | bytes) -> str:
    """
    Return the hex-encoded SHA256 of the provided text or bytes.
    """

    if isinstance(text, str):
        data = text.encode("utf-8")
    else:
        data = text
    return hashlib.sha256(data).hexdigest()


def stable_hash(parts: Sequence[str | bytes | None]) -> str:
    """
    Join multiple parts and compute a sha256 hash.
    None values are treated as empty strings.
    """

    normalized = []
    for part in parts:
        if part is None:
            normalized.append("")
        elif isinstance(part, bytes):
            normalized.append(part.decode("utf-8", errors="ignore"))
        else:
            normalized.append(part)
    payload = "\u241f".join(normalized)
    return sha256_text(payload)


def normalize_url(url: str, *, strip_params: Iterable[str] | None = None) -> str:
    """
    Produce a canonical form of the URL for deduplication purposes.
    """

    if not url:
        return ""
    parsed = urlparse(url.strip())
    netloc = parsed.netloc.lower()
    scheme = (parsed.scheme or "http").lower()
    path = parsed.path or "/"

    # Remove duplicate slashes and trailing slash (except root).
    path = re.sub(r"/{2,}", "/", path)
    if path.endswith("/") and path != "/":
        path = path[:-1]

    # Remove tracking query parameters.
    params_to_strip = set(DEFAULT_TRACKING_PARAMS)
    if strip_params:
        params_to_strip.update(strip_params)
    query_items = []
    for key, value in parse_qsl(parsed.query, keep_blank_values=True):
        if key.lower() in params_to_strip:
            continue
        query_items.append((key, value))
    query = urlencode(query_items, doseq=True)

    normalized = urlunparse((scheme, netloc, path, "", query, ""))
    return normalized


def build_content_fingerprint(title: str | None, content: str | None) -> str:
    """
    Combine title + content to produce a stable fingerprint string.
    """

    blocks = [
        _WHITESPACE_RE.sub(" ", (title or "").strip()),
        _WHITESPACE_RE.sub(" ", (content or "").strip()),
    ]
    return stable_hash(blocks)


def simhash(tokens: Sequence[str] | str, bits: int = 64) -> str:
    """
    Lightweight SimHash implementation for near-duplicate detection.
    """

    if isinstance(tokens, str):
        tokens = tokens.split()

    if bits <= 0:
        raise ValueError("bits must be positive")

    vector = [0] * bits
    for token in tokens:
        if not token:
            continue
        token_hash = int(sha256_text(token), 16)
        for i in range(bits):
            bitmask = 1 << i
            if token_hash & bitmask:
                vector[i] += 1
            else:
                vector[i] -= 1

    fingerprint = 0
    for i, weight in enumerate(vector):
        if weight >= 0:
            fingerprint |= 1 << i
    return f"{fingerprint:0{bits // 4}x}"


def serialize_for_hash(payload: object) -> str:
    """
    Convert arbitrary JSON-serializable payload into a canonical string.
    """

    return json.dumps(payload, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
