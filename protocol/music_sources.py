"""Read-only music discovery adapters; formal assets are never installed here."""

from __future__ import annotations

import json
from typing import Any, Callable
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from protocol.music_profiles import (
    evaluate_music_candidate,
    music_profile,
    normalize_openverse_candidate,
)


OPENVERSE_AUDIO_ENDPOINT = "https://api.openverse.org/v1/audio/"


def discover_openverse_music(
    profile_id: str,
    *,
    limit: int = 10,
    timeout: float = 15,
    fetch: Callable[[Request, float], bytes] | None = None,
) -> dict[str, Any]:
    """Fetch CC0 music metadata and return ranked, review-only candidates."""

    profile = music_profile(profile_id)
    requested = max(1, min(25, int(limit)))
    # Openverse treats a long free-text query as increasingly restrictive.
    # Keep remote discovery broad and apply the full profile locally.
    query = " ".join(profile["query_terms"][:2])
    url = OPENVERSE_AUDIO_ENDPOINT + "?" + urlencode(
        {
            "q": query,
            "license": "cc0",
            "page_size": min(80, requested * 5),
        }
    )
    request = Request(
        url,
        headers={
            "Accept": "application/json",
            "User-Agent": "PodFlow-Studio/0.2 music-discovery",
        },
    )
    if fetch is None:
        def fetch(current: Request, current_timeout: float) -> bytes:
            with urlopen(current, timeout=current_timeout) as response:  # noqa: S310 - fixed HTTPS endpoint
                return response.read()

    try:
        payload = json.loads(fetch(request, timeout).decode("utf-8"))
    except Exception as exc:
        raise RuntimeError(f"Openverse music discovery failed: {exc}") from exc

    results = payload.get("results")
    if not isinstance(results, list):
        raise RuntimeError("Openverse music discovery returned an invalid result shape")
    evaluated = [
        evaluate_music_candidate(normalize_openverse_candidate(item), profile_id)
        for item in results
        if isinstance(item, dict)
    ]
    eligible = [item for item in evaluated if item["eligible_for_review"]]
    eligible.sort(key=lambda item: (-item["score"], item["title"].casefold(), item["id"]))
    return {
        "source": "openverse",
        "style_profile": profile,
        "query_url": url,
        "candidates": eligible[:requested],
        "rejected_count": len(evaluated) - len(eligible),
        "notice": "Candidates require upstream license verification and human listening before cue-pack installation.",
    }
