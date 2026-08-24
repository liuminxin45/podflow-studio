"""Built-in music style rules and candidate evaluation."""

from __future__ import annotations

from copy import deepcopy
import json
from pathlib import Path
import re
from typing import Any


PROFILE_PATH = Path(__file__).with_name("music_profiles.json")


def _slug(value: Any) -> str:
    return re.sub(r"[^a-z0-9]+", "-", str(value or "").strip().lower()).strip("-")


def _tags(values: Any) -> set[str]:
    if not isinstance(values, list):
        return set()
    normalized: set[str] = set()
    for value in values:
        name = value.get("name") if isinstance(value, dict) else value
        tag = _slug(name)
        if tag:
            normalized.add(tag)
    return normalized


def load_music_profiles(path: Path = PROFILE_PATH) -> dict[str, Any]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if payload.get("version") != 1:
        raise ValueError("Unsupported music profile registry version")
    profiles = payload.get("profiles")
    if not isinstance(profiles, list) or not profiles:
        raise ValueError("Music profile registry must contain profiles")
    ids = [str(item.get("id") or "") for item in profiles if isinstance(item, dict)]
    if not all(ids) or len(ids) != len(set(ids)):
        raise ValueError("Music profile ids must be present and unique")
    if payload.get("default_profile_id") not in ids:
        raise ValueError("Default music profile does not exist")
    return deepcopy(payload)


def music_profile(profile_id: str) -> dict[str, Any]:
    registry = load_music_profiles()
    for profile in registry["profiles"]:
        if profile["id"] == profile_id:
            return profile
    raise ValueError(f"Unknown music style profile: {profile_id}")


def normalize_openverse_candidate(value: dict[str, Any]) -> dict[str, Any]:
    duration_ms = value.get("duration")
    duration_seconds = round(float(duration_ms) / 1000, 3) if duration_ms is not None else None
    tags = sorted(_tags(value.get("tags")) | _tags(value.get("genres")))
    return {
        "id": str(value.get("id") or ""),
        "title": str(value.get("title") or "Untitled"),
        "creator": str(value.get("creator") or "Unknown creator"),
        "provider": str(value.get("provider") or ""),
        "source": str(value.get("source") or ""),
        "license": _slug(value.get("license")),
        "license_url": str(value.get("license_url") or ""),
        "landing_url": str(value.get("foreign_landing_url") or ""),
        "audio_url": str(value.get("url") or ""),
        "duration_seconds": duration_seconds,
        "bpm": value.get("bpm"),
        "tags": tags,
        "sample_rate_hz": value.get("sample_rate"),
        "bit_rate": value.get("bit_rate"),
    }


def evaluate_music_candidate(candidate: dict[str, Any], profile_id: str) -> dict[str, Any]:
    """Apply hard publication-safety filters, then rank style affinity."""

    profile = music_profile(profile_id)
    required = profile["required"]
    preferred = profile["preferred"]
    tags = _tags(candidate.get("tags"))
    rejected: list[str] = []
    review: list[str] = []

    license_id = _slug(candidate.get("license"))
    allowed_licenses = {_slug(item) for item in required["licenses"]}
    if license_id not in allowed_licenses:
        rejected.append(f"license_not_allowed:{license_id or 'missing'}")
    if not str(candidate.get("audio_url") or "").strip():
        rejected.append("audio_url_missing")
    if not str(candidate.get("landing_url") or "").strip():
        rejected.append("landing_url_missing")

    duration = candidate.get("duration_seconds")
    minimum, maximum = required["duration_seconds"]
    if duration is None:
        rejected.append("duration_missing")
    elif not minimum <= float(duration) <= maximum:
        rejected.append(f"duration_out_of_range:{duration}")

    excluded = tags & {_slug(item) for item in profile["excluded_tags"]}
    if excluded:
        rejected.append("excluded_tags:" + ",".join(sorted(excluded)))

    vocal_tags = {"vocal", "vocals", "voice", "singing", "song-with-vocals"}
    instrumental_tags = {"instrumental", "no-vocals", "no-vocal"}
    if required.get("instrumental"):
        if tags & vocal_tags:
            rejected.append("vocals_detected")
        elif not tags & instrumental_tags:
            review.append("instrumental_status_unverified")

    score = 40
    preferred_tags = {_slug(item) for item in preferred["tags"]}
    preferred_instruments = {_slug(item) for item in preferred["instruments"]}
    score += min(30, len(tags & preferred_tags) * 6)
    score += min(15, len(tags & preferred_instruments) * 5)

    bpm = candidate.get("bpm")
    if bpm is None:
        review.append("bpm_unavailable")
    else:
        bpm_min, bpm_max = preferred["bpm"]
        if bpm_min <= float(bpm) <= bpm_max:
            score += 15
        else:
            review.append(f"bpm_outside_preferred_range:{bpm}")

    return {
        **deepcopy(candidate),
        "style_profile_id": profile_id,
        "eligible_for_review": not rejected,
        "score": max(0, min(100, score if not rejected else 0)),
        "rejection_reasons": rejected,
        "manual_review_reasons": review,
    }
