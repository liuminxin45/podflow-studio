"""Bocha web-search adapter for headless PodFlow production."""

from __future__ import annotations

import os
import random
import time
from typing import Any, Callable

import requests


DEFAULT_BASE_URL = "https://api.bochaai.com"


class BochaSearchError(RuntimeError):
    """A search failure that must remain visible to formal automation."""


def _endpoint(base_url: str) -> str:
    base = (base_url or DEFAULT_BASE_URL).rstrip("/")
    if base.endswith("/v1/web-search"):
        return base
    if base.endswith("/v1"):
        return f"{base}/web-search"
    return f"{base}/v1/web-search"


def search_bocha(
    query: str,
    *,
    api_key: str = "",
    api_base: str = "",
    freshness: str = "oneWeek",
    max_results: int = 5,
    timeout: float = 45,
    attempts: int = 3,
    request: Callable[..., Any] = requests.post,
    wait: Callable[[float], None] = time.sleep,
) -> list[dict[str, str]]:
    key = (api_key or os.environ.get("PODFLOW_BOCHA_API_KEY", "")).strip()
    if not key:
        raise BochaSearchError("PODFLOW_BOCHA_API_KEY is required for formal research")
    normalized_query = " ".join(str(query or "").split())
    if not normalized_query:
        raise BochaSearchError("Bocha search query is empty")

    last_error = ""
    for attempt in range(max(1, attempts)):
        try:
            response = request(
                _endpoint(api_base),
                headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
                json={
                    "query": normalized_query,
                    "freshness": freshness,
                    "summary": True,
                    "count": min(10, max(1, int(max_results))),
                },
                timeout=timeout,
            )
        except requests.RequestException as error:
            last_error = f"Bocha request failed: {error}"
            if attempt + 1 >= attempts:
                raise BochaSearchError(last_error) from error
            wait(0.75 * (2**attempt) + random.random() * 0.25)
            continue

        if response.status_code == 429:
            last_error = "Bocha rate limit exceeded (HTTP 429)"
            if attempt + 1 >= attempts:
                raise BochaSearchError(last_error)
            wait(0.75 * (2**attempt) + random.random() * 0.25)
            continue
        if response.status_code in {401, 403}:
            raise BochaSearchError(f"Bocha authentication failed (HTTP {response.status_code})")
        if not response.ok:
            raise BochaSearchError(f"Bocha search failed (HTTP {response.status_code}): {response.text[:200]}")

        try:
            body = response.json()
        except ValueError as error:
            raise BochaSearchError("Bocha returned invalid JSON") from error
        if body.get("code") not in {None, 0, 200}:
            raise BochaSearchError(f"Bocha search failed: {body.get('msg') or body.get('message') or body.get('code')}")
        payload = body.get("data") if isinstance(body.get("data"), dict) else body
        values = ((payload.get("webPages") or {}).get("value") or []) if isinstance(payload, dict) else []
        results: list[dict[str, str]] = []
        seen: set[str] = set()
        for item in values:
            if not isinstance(item, dict):
                continue
            url = str(item.get("url") or "").strip()
            summary = " ".join(str(item.get("summary") or item.get("snippet") or "").split())
            if not url.startswith(("https://", "http://")) or not summary or url in seen:
                continue
            seen.add(url)
            results.append(
                {
                    "title": str(item.get("name") or item.get("title") or url).strip(),
                    "url": url,
                    "content": summary,
                    "summary": summary,
                    "source": "bocha",
                    "published_at": str(item.get("datePublished") or ""),
                }
            )
        if not results:
            raise BochaSearchError(f"Bocha returned no traceable results for: {normalized_query}")
        return results

    raise BochaSearchError(last_error or "Bocha search failed")
