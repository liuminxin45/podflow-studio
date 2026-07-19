"""Versioned production-plan helpers shared by TTS and audio assembly."""

from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone
import hashlib
import json
import re
from typing import Any


PRODUCTION_PLAN_VERSION = 1
MAX_TTS_CHARS = 180


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _music_slot(
    *,
    duration_ms: int = 5000,
    fade_in_ms: int = 500,
    fade_out_ms: int = 1000,
) -> dict[str, Any]:
    return {
        "enabled": False,
        "path": "",
        "volume": 0.15,
        "duration_ms": duration_ms,
        "fade_in_ms": fade_in_ms,
        "fade_out_ms": fade_out_ms,
    }


def default_music() -> dict[str, Any]:
    return {
        "intro": _music_slot(),
        "transition": _music_slot(duration_ms=1500, fade_in_ms=150, fade_out_ms=300),
        "bed": _music_slot(),
        "outro": _music_slot(),
    }


def default_render() -> dict[str, Any]:
    return {
        "output_format": "mp3",
        "normalize_loudness": True,
        "target_lufs": -16.0,
        "true_peak_db": -1.0,
    }


def split_script_text(text: str, max_chars: int = MAX_TTS_CHARS) -> list[str]:
    """Split narration at paragraph/sentence boundaries without tiny fragments."""

    normalized = re.sub(r"[ \t]+", " ", str(text or "")).strip()
    if not normalized:
        return []

    paragraphs = [part.strip() for part in re.split(r"\n+", normalized) if part.strip()]
    units: list[str] = []
    for paragraph in paragraphs:
        sentences = [
            part.strip()
            for part in re.findall(r".*?(?:[。！？!?；;]+|$)", paragraph)
            if part.strip()
        ]
        if not sentences:
            sentences = [paragraph]

        current = ""
        for sentence in sentences:
            oversized = [
                sentence[index : index + max_chars]
                for index in range(0, len(sentence), max_chars)
            ]
            for part in oversized:
                if current and len(current) + len(part) > max_chars:
                    units.append(current)
                    current = ""
                current += part
                if len(current) >= max_chars:
                    units.append(current)
                    current = ""
        if current:
            units.append(current)

    return units or [normalized]


def script_hash(script_segments: list[dict[str, Any]]) -> str:
    payload = [
        {
            "id": str(segment.get("id") or ""),
            "text": str(segment.get("text") or ""),
            "speaker": str(segment.get("speaker") or "Host A"),
        }
        for segment in script_segments
        if isinstance(segment, dict)
    ]
    return hashlib.sha256(
        json.dumps(payload, ensure_ascii=False, sort_keys=True).encode("utf-8")
    ).hexdigest()


def voice_generation_key(
    *,
    text: str,
    engine: str,
    voice: str,
    rate: str,
    volume: str,
) -> str:
    payload = {
        "text": text,
        "engine": engine,
        "voice": voice,
        "rate": rate,
        "volume": volume,
    }
    return hashlib.sha256(
        json.dumps(payload, ensure_ascii=False, sort_keys=True).encode("utf-8")
    ).hexdigest()


def _merge_slot(current: Any, fallback: dict[str, Any]) -> dict[str, Any]:
    candidate = current if isinstance(current, dict) else {}
    return {**fallback, **{key: candidate[key] for key in fallback if key in candidate}}


def _clip_id(parent_segment_id: str, index: int, count: int) -> str:
    return parent_segment_id if count == 1 else f"{parent_segment_id}__{index + 1:03d}"


def _default_join(
    clip: dict[str, Any],
    next_clip: dict[str, Any],
) -> dict[str, Any]:
    same_segment = clip["parent_segment_id"] == next_clip["parent_segment_id"]
    duration_ms = 150 if same_segment else 1200 if next_clip["segment_type"] == "deep_dive" else 600
    return {"after_clip_id": clip["id"], "type": "pause", "duration_ms": duration_ms}


def build_production_plan(
    script_segments: list[dict[str, Any]],
    existing: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Reconcile a saved plan with the current edited script."""

    existing = existing if isinstance(existing, dict) else {}
    existing_clips = {
        str(item.get("id")): item
        for item in existing.get("clips", [])
        if isinstance(item, dict) and item.get("id")
    }

    clips: list[dict[str, Any]] = []
    for segment_index, segment in enumerate(script_segments):
        if not isinstance(segment, dict):
            continue
        text = str(segment.get("text") or "").strip()
        if not text:
            continue
        parent_id = str(segment.get("id") or f"seg_{segment_index + 1:03d}")
        parts = split_script_text(text)
        for part_index, part in enumerate(parts):
            clip_id = _clip_id(parent_id, part_index, len(parts))
            previous = existing_clips.get(clip_id, {})
            text_matches = str(previous.get("text") or "") == part
            source = str(previous.get("source") or "tts") if text_matches else "tts"
            if source not in {"tts", "recording", "local"}:
                source = "tts"
            clips.append(
                {
                    "id": clip_id,
                    "parent_segment_id": parent_id,
                    "segment_type": str(segment.get("type") or "custom"),
                    "segment_title": str(segment.get("title") or f"第 {segment_index + 1} 段"),
                    "text": part,
                    "speaker": str(segment.get("speaker") or "Host A"),
                    "source_fact_ids": list(segment.get("source_fact_ids") or []),
                    "source": source,
                    "path": str(previous.get("path") or "") if text_matches else "",
                    "duration_seconds": float(previous.get("duration_seconds") or 0) if text_matches else 0.0,
                    "trim_start_ms": max(0, int(previous.get("trim_start_ms") or 0)) if text_matches else 0,
                    "trim_end_ms": max(0, int(previous.get("trim_end_ms") or 0)) if text_matches else 0,
                    "generation_key": str(previous.get("generation_key") or "") if text_matches else "",
                }
            )

    saved_joins = {
        str(item.get("after_clip_id")): item
        for item in existing.get("joins", [])
        if isinstance(item, dict) and item.get("after_clip_id")
    }
    joins: list[dict[str, Any]] = []
    for index, clip in enumerate(clips[:-1]):
        fallback = _default_join(clip, clips[index + 1])
        saved = saved_joins.get(clip["id"], {})
        join_type = saved.get("type") if saved.get("type") in {"pause", "transition"} else fallback["type"]
        duration_ms = max(0, min(15000, int(saved.get("duration_ms", fallback["duration_ms"]))))
        joins.append({"after_clip_id": clip["id"], "type": join_type, "duration_ms": duration_ms})

    music_defaults = default_music()
    saved_music = existing.get("music") if isinstance(existing.get("music"), dict) else {}
    music = {
        name: _merge_slot(saved_music.get(name), fallback)
        for name, fallback in music_defaults.items()
    }
    render = {
        **default_render(),
        **{
            key: existing.get("render", {}).get(key)
            for key in default_render()
            if isinstance(existing.get("render"), dict) and key in existing["render"]
        },
    }

    return {
        "version": PRODUCTION_PLAN_VERSION,
        "script_hash": script_hash(script_segments),
        "clips": clips,
        "joins": joins,
        "music": music,
        "render": render,
        "updated_at": _now_iso(),
    }


def update_plan_clip(plan: dict[str, Any], clip_id: str, patch: dict[str, Any]) -> None:
    for clip in plan.get("clips", []):
        if isinstance(clip, dict) and clip.get("id") == clip_id:
            clip.update(deepcopy(patch))
            plan["updated_at"] = _now_iso()
            return
