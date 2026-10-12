"""One current format policy shared by readiness, review and publication.

Quantity is an editorial choice, not proof of quality. Evidence, editorial
assessment and artifact-bound audio approval are checked separately.
"""

from typing import Any

MIN_EPISODE_SECONDS = 30
MAX_EPISODE_SECONDS = 7200


def valid_episode_structure(script: dict[str, Any]) -> bool:
    segments = script.get("segments")
    if not isinstance(segments, list) or not segments:
        return False
    if any(not isinstance(segment, dict) for segment in segments):
        return False
    ids = [str(segment.get("id") or "") for segment in segments]
    types = [segment.get("type") for segment in segments]
    return (
        all(ids)
        and len(set(ids)) == len(ids)
        and all(str(segment.get("text") or "").strip() for segment in segments)
        and all(kind in {"opening", "quick_news", "deep_dive", "closing"} for kind in types)
        and 1 <= types.count("quick_news") + types.count("deep_dive") <= 20
        and types.count("deep_dive") <= 1
        and types.count("opening") == 1 and types[0] == "opening"
        and types.count("closing") == 1 and types[-1] == "closing"
    )
