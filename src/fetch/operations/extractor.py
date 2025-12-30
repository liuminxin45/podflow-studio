"""
HTML extraction utilities for converting webpages into clean text blocks.

Usage:
    from src.fetch.extractor import extract_from_html, extract_from_url
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any

import requests
import trafilatura


@dataclass(slots=True)
class ExtractResult:
    text: str
    title: str | None = None
    summary: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)

    def is_empty(self) -> bool:
        return not (self.text or "").strip()


def extract_from_html(html: str, *, url: str | None = None) -> ExtractResult:
    """
    Extracts readable text from HTML using trafilatura (with graceful fallback).
    """

    if not html:
        return ExtractResult(text="")

    downloaded = trafilatura.extract(html, include_comments=False, url=url, include_tables=False)
    if downloaded:
        metadata_obj = trafilatura.metadata.extract_metadata(html)
        title = None
        description = None
        lang = None
        if metadata_obj:
            title = getattr(metadata_obj, "title", None)
            description = getattr(metadata_obj, "description", None)
            lang = getattr(metadata_obj, "language", None)
        return ExtractResult(
            text=downloaded.strip(),
            title=title,
            summary=description,
            metadata={"language": lang} if lang else {},
        )

    # Fallback to naive stripping
    try:
        from bs4 import BeautifulSoup  # type: ignore

        soup = BeautifulSoup(html, "html.parser")
        title = soup.title.string.strip() if soup.title and soup.title.string else None
        text = soup.get_text(" ", strip=True)
        return ExtractResult(text=text, title=title, metadata={})
    except Exception:
        pass

    return ExtractResult(text=html)


def extract_from_url(url: str, *, timeout_seconds: int = 10) -> ExtractResult:
    """
    Downloads url and extracts readable text.
    """

    log = logging.getLogger("fetch.extractor")
    try:
        resp = requests.get(url, timeout=timeout_seconds, headers={"User-Agent": "podcast-extractor/0.1"})
        resp.raise_for_status()
    except Exception as exc:  # noqa: BLE001
        log.warning("extract_from_url failed: %s", exc)
        return ExtractResult(text="", metadata={"error": str(exc)})

    return extract_from_html(resp.text, url=url)
