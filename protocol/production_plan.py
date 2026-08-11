"""Versioned production-plan helpers shared by TTS and audio assembly."""

from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone
import hashlib
import json
import re
from typing import Any


PRODUCTION_PLAN_VERSION = 2
MAX_TTS_CHARS = 320
MAX_TTS_SENTENCES = 5

_DIRECTION_PROFILES: dict[str, dict[str, Any]] = {
    "opening": {"intent": "opening_warm", "emotion": "warm", "energy": 0.72, "pace": 0.96, "pitch": 0.03},
    "quick_news": {"intent": "quick_news", "emotion": "focused", "energy": 0.68, "pace": 1.03, "pitch": 0.0},
    "deep_dive": {"intent": "deep_dive", "emotion": "thoughtful", "energy": 0.55, "pace": 0.92, "pitch": -0.02},
    "closing": {"intent": "closing_relaxed", "emotion": "warm", "energy": 0.48, "pace": 0.9, "pitch": -0.03},
    "custom": {"intent": "natural_narration", "emotion": "neutral", "energy": 0.58, "pace": 0.97, "pitch": 0.0},
}


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
        "intro": {
            **_music_slot(),
            "enabled": True,
            "path": "assets/audio/podflow-intro.wav",
        },
        "transition": {
            **_music_slot(duration_ms=1000, fade_in_ms=100, fade_out_ms=250),
            "enabled": True,
            "path": "assets/audio/podflow-transition.wav",
        },
        "bed": _music_slot(),
        "outro": {
            **_music_slot(duration_ms=4000, fade_in_ms=400, fade_out_ms=1000),
            "enabled": True,
            "path": "assets/audio/podflow-outro.wav",
        },
    }


def default_render() -> dict[str, Any]:
    return {
        "output_format": "mp3",
        "normalize_loudness": True,
        "target_lufs": -16.0,
        "true_peak_db": -1.0,
    }


def split_script_text(
    text: str,
    max_chars: int = MAX_TTS_CHARS,
    max_sentences: int = MAX_TTS_SENTENCES,
) -> list[str]:
    """Create semantic TTS scenes while preserving sentence-level continuity."""

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
        sentence_count = 0
        for sentence in sentences:
            oversized = [
                sentence[index : index + max_chars]
                for index in range(0, len(sentence), max_chars)
            ]
            for part in oversized:
                if current and (
                    len(current) + len(part) > max_chars
                    or sentence_count >= max_sentences
                ):
                    units.append(current)
                    current = ""
                    sentence_count = 0
                current += part
                sentence_count += 1
                if len(current) >= max_chars:
                    units.append(current)
                    current = ""
                    sentence_count = 0
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
    direction: dict[str, Any],
    context_before: str,
    context_after: str,
    model: str,
    output_format: str,
    performance_prompt: str,
) -> str:
    payload = {
        "text": text,
        "engine": engine,
        "voice": voice,
        "rate": rate,
        "volume": volume,
        "direction": direction,
        "context_before": context_before,
        "context_after": context_after,
        "model": model,
        "output_format": output_format,
        "performance_prompt": performance_prompt,
    }
    return hashlib.sha256(
        json.dumps(payload, ensure_ascii=False, sort_keys=True).encode("utf-8")
    ).hexdigest()


def _merge_slot(current: Any, fallback: dict[str, Any]) -> dict[str, Any]:
    candidate = current if isinstance(current, dict) else {}
    return {**fallback, **{key: candidate[key] for key in fallback if key in candidate}}


def _clip_id(parent_segment_id: str, index: int, count: int) -> str:
    return parent_segment_id if count == 1 else f"{parent_segment_id}__{index + 1:03d}"


def _emphasis_terms(text: str) -> list[str]:
    terms: list[str] = []
    for match in re.findall(r"“([^”]{2,12})”|([A-Za-z][A-Za-z0-9.-]{1,15})|(\d+(?:\.\d+)?%?)", text):
        term = next((item for item in match if item), "")
        if term and term not in terms:
            terms.append(term)
        if len(terms) == 2:
            break
    return terms


def direction_for_segment(segment_type: str, text: str) -> dict[str, Any]:
    profile = deepcopy(_DIRECTION_PROFILES.get(segment_type, _DIRECTION_PROFILES["custom"]))
    profile.update(
        {
            "pause_before_ms": 0,
            "pause_after_ms": 450 if segment_type == "quick_news" else 650,
            "emphasis": _emphasis_terms(text),
        }
    )
    if any(marker in text for marker in ("但是", "不过", "然而", "值得注意")):
        profile["emotion"] = "concerned"
        profile["pace"] = round(max(0.75, float(profile["pace"]) - 0.05), 2)
    if "？" in text or "?" in text:
        profile["intent"] = "rhetorical_question"
    return profile


def _default_join(
    clip: dict[str, Any],
    next_clip: dict[str, Any],
) -> dict[str, Any]:
    same_segment = clip["parent_segment_id"] == next_clip["parent_segment_id"]
    direction = clip.get("direction") if isinstance(clip.get("direction"), dict) else {}
    directed_pause = int(direction.get("pause_after_ms") or 0)
    if not same_segment and next_clip["segment_type"] == "deep_dive":
        return {"after_clip_id": clip["id"], "type": "transition", "duration_ms": 1000}
    duration_ms = (
        min(450, directed_pause)
        if same_segment
        else max(directed_pause, 600)
    )
    return {"after_clip_id": clip["id"], "type": "pause", "duration_ms": duration_ms}


def build_production_plan(
    script_segments: list[dict[str, Any]],
    existing: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Reconcile a saved plan with the current edited script."""

    existing = existing if isinstance(existing, dict) else {}
    if existing and existing.get("version") != PRODUCTION_PLAN_VERSION:
        raise ValueError(
            f"Unsupported production_plan version {existing.get('version')}; "
            f"expected {PRODUCTION_PLAN_VERSION}. Regenerate the production plan."
        )
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
                    "context_before": "",
                    "context_after": "",
                    "direction": deepcopy(previous.get("direction"))
                    if text_matches and isinstance(previous.get("direction"), dict)
                    else direction_for_segment(str(segment.get("type") or "custom"), part),
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

    for index, clip in enumerate(clips):
        clip["context_before"] = clips[index - 1]["text"][-120:] if index else ""
        clip["context_after"] = clips[index + 1]["text"][:120] if index + 1 < len(clips) else ""

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
