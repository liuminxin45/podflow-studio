"""Morning news brief domain model and deterministic local pipeline helpers."""

from __future__ import annotations

import copy
import json
import re
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

from protocol.presets import get_default_preset


CHARS_PER_SECOND = 6.5
NEWS_SEGMENT_TYPES = {"quick_news", "deep_dive"}


@dataclass
class FactCard:
    id: str
    title: str
    summary: str
    source_title: str
    source_url: str
    published_at: str
    claim: str
    confidence: str
    used_in_segments: list[str] = field(default_factory=list)


@dataclass
class ScriptSegment:
    id: str
    type: str
    title: str
    text: str
    source_fact_ids: list[str]
    estimated_seconds: int
    speaker: str = "Host A"


@dataclass
class EpisodeRun:
    episode_id: str
    preset: dict[str, Any]
    source_inputs: list[dict[str, Any]] = field(default_factory=list)
    facts: list[dict[str, Any]] = field(default_factory=list)
    selected_topics: list[dict[str, Any]] = field(default_factory=list)
    script: dict[str, Any] = field(default_factory=dict)
    edited_script: dict[str, Any] = field(default_factory=dict)
    voice_segments: list[dict[str, Any]] = field(default_factory=list)
    audio_outputs: dict[str, Any] = field(default_factory=dict)
    publish_outputs: dict[str, Any] = field(default_factory=dict)
    run_report: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def build_fact_cards(source_inputs: list[dict[str, Any]], limit: int = 20) -> list[dict[str, Any]]:
    """Convert normalized news inputs into deduplicated FactCard dicts."""

    facts: list[FactCard] = []
    seen: set[str] = set()
    for item in source_inputs:
        if len(facts) >= limit:
            break
        if not isinstance(item, dict):
            continue
        title = _clean_text(item.get("title") or item.get("headline") or "Untitled")
        body = _clean_text(item.get("summary") or item.get("content") or item.get("description") or "")
        if not title or not body:
            continue
        dedup_key = _dedup_key(title, item.get("url") or "")
        if dedup_key in seen:
            continue
        seen.add(dedup_key)
        source_url = str(item.get("url") or "")
        source_title = str(item.get("source_title") or item.get("source_name") or item.get("source") or title)
        published_at = str(item.get("published_at") or item.get("published") or "")
        claim = _first_sentence(body, max_chars=180)
        confidence = "high" if source_url and published_at else "medium" if source_url else "low"
        facts.append(
            FactCard(
                id=f"fact_{len(facts) + 1:03d}",
                title=title,
                summary=_truncate(body, 260),
                source_title=source_title,
                source_url=source_url,
                published_at=published_at,
                claim=claim,
                confidence=confidence,
            )
        )
    return [asdict(fact) for fact in facts]


def select_news_topics(facts: list[dict[str, Any]], count: int | None = None) -> list[dict[str, Any]]:
    preset = get_default_preset()
    selected_count = count or preset["recommended_news_item_count"]
    return [
        {
            "id": f"topic_{idx + 1:03d}",
            "title": fact.get("title", ""),
            "fact_id": fact.get("id", ""),
        }
        for idx, fact in enumerate(facts[:selected_count])
    ]


def resolve_morning_news_structure(
    available_fact_count: int,
    preset: dict[str, Any] | None = None,
) -> dict[str, int | str]:
    """Resolve the best morning-news density without inventing material.

    The preset describes an editorial target. Sparse source material produces
    fewer items. Abundant material is capped only when the preset explicitly
    disables custom item counts.
    """

    preset = preset or get_default_preset()
    recommended_total = max(
        1,
        int(preset.get("recommended_news_item_count", 10)),
    )
    recommended_quick = max(0, int(preset.get("quick_news_recommended_count", 9)))
    recommended_deep = max(0, int(preset.get("deep_dive_recommended_count", 1)))
    available_total = max(0, int(available_fact_count))
    actual_total = (
        available_total
        if bool(preset.get("allow_custom_news_item_count", True))
        else min(available_total, recommended_total)
    )

    # A deep dive needs enough surrounding headlines to feel like a deliberate
    # focus rather than a forced expansion of a thin news day.
    actual_deep = min(recommended_deep, 1) if actual_total >= 3 else 0
    actual_quick = max(0, actual_total - actual_deep)

    return {
        "recommended_news_item_count": recommended_total,
        "recommended_quick_news_count": recommended_quick,
        "recommended_deep_dive_count": recommended_deep,
        "actual_news_item_count": actual_total,
        "actual_quick_news_count": actual_quick,
        "actual_deep_dive_count": actual_deep,
        "template_variant": str(preset.get("template_variant", "quick_9_plus_deep_1")),
    }


def generate_deterministic_script(
    facts: list[dict[str, Any]],
    preset: dict[str, Any] | None = None,
    *,
    episode_id: str = "",
    title: str = "通勤早咖啡：今日新闻简报",
) -> dict[str, Any]:
    """Generate a source-grounded solo news script without an external model."""

    preset = preset or get_default_preset()
    structure = resolve_morning_news_structure(len(facts), preset)
    recommended_count = int(structure["recommended_news_item_count"])
    selected = facts[: int(structure["actual_news_item_count"])]
    content_tendency = str(preset.get("content_tendency", "news"))
    tone_line = _editorial_opening_line(str(preset.get("editorial_voice", "human")))
    source_ids = [str(f.get("id", "")) for f in selected if f.get("id")]
    if not selected:
        return _script_dict(title, preset, [], episode_id, generated_by="deterministic_mock")

    segments: list[dict[str, Any]] = [
        _segment(
            "seg_001",
            "opening",
            "开场",
            "早上好，欢迎来到通勤早咖啡。"
            f"今天按实际素材整理 {len(selected)} 条新闻，"
            f"其中 {structure['actual_quick_news_count']} 条快讯"
            f"和 {structure['actual_deep_dive_count']} 段重点展开。{tone_line}",
            source_ids,
        )
    ]

    quick_news_count = int(structure["actual_quick_news_count"])
    for idx, fact in enumerate(selected):
        segment_type = "quick_news" if idx < quick_news_count else "deep_dive"
        label = "深度解读" if segment_type == "deep_dive" else f"快讯 {idx + 1}"
        text = (
            _deep_dive_text(fact, content_tendency)
            if segment_type == "deep_dive"
            else _quick_news_text(fact, content_tendency)
        )
        segments.append(
            _segment(
                f"seg_{idx + 2:03d}",
                segment_type,
                str(fact.get("title", label)),
                text,
                [str(fact.get("id", ""))] if fact.get("id") else [],
            )
        )

    segments.append(
        _segment(
            f"seg_{len(segments) + 1:03d}",
            "closing",
            "收束",
            "以上就是今天的单人新闻早报。你可以在发布前继续编辑稿件、替换单段录音，确认无误后再导出 RSS 或发布包。",
            source_ids,
        )
    )

    updated_facts = _mark_used_facts(selected, segments)
    script = _script_dict(title, preset, segments, episode_id, generated_by="deterministic_mock")
    script["facts_snapshot"] = updated_facts
    script.update(structure)
    script["generation_profile"] = {
        "content_tendency": content_tendency,
    }
    script["warnings"] = _recommendation_warnings(len(selected), recommended_count)
    return script


def apply_manual_notes(script: dict[str, Any], manual_notes: str = "") -> dict[str, Any]:
    """Create an edited script version that proves manual edits feed production."""

    edited = copy.deepcopy(script)
    edited["id"] = f"{script.get('id', 'script')}_edited"
    edited["edited_from"] = script.get("id", "script.generated")
    edited["edit_mode"] = "manual_notes"
    note = _clean_text(manual_notes)
    if note:
        edited["manual_notes"] = note
        for segment in edited.get("segments", []):
            if segment.get("type") == "opening":
                segment["text"] = f"{segment.get('text', '')} {note}"
                segment["estimated_seconds"] = estimate_seconds(segment["text"])
                break
    return edited


def build_run_report(state: dict[str, Any]) -> dict[str, Any]:
    facts = state.get("facts", [])
    script_name = "edited_script"
    active_script = state.get("edited_script", {})
    segments = active_script.get("segments", []) if active_script else []
    preset = state.get("preset", {}) if isinstance(state.get("preset"), dict) else get_default_preset()
    recommended_count = int(preset.get("recommended_news_item_count", 7))
    news_segments = [
        segment for segment in segments if isinstance(segment, dict) and segment.get("type") in NEWS_SEGMENT_TYPES
    ]
    segment_counts_by_type: dict[str, int] = {}
    for segment in segments:
        if isinstance(segment, dict):
            segment_type = str(segment.get("type", "custom"))
            segment_counts_by_type[segment_type] = segment_counts_by_type.get(segment_type, 0) + 1
    used_fact_ids = {
        fact_id
        for segment in segments
        if isinstance(segment, dict)
        for fact_id in segment.get("source_fact_ids", [])
    }
    all_fact_ids = {fact.get("id") for fact in facts if isinstance(fact, dict)}
    warnings: list[dict[str, Any]] = []
    for segment in segments:
        if isinstance(segment, dict) and not segment.get("source_fact_ids"):
            warnings.append(
                {
                    "code": "segment_without_source",
                    "segment_id": segment.get("id", ""),
                    "message": "Script segment has no source_fact_ids.",
                }
            )
    publish_outputs = state.get("publish_outputs", {})
    if publish_outputs.get("local_preview_only"):
        warnings.append(
            {
                "code": "rss_local_preview_only",
                "message": "RSS is local-preview only, not publicly subscribable.",
            }
        )
    audio_outputs = state.get("audio_outputs", {})
    if isinstance(audio_outputs, dict) and audio_outputs.get("contains_mock_audio"):
        warnings.append(
            {
                "code": "mock_audio",
                "message": "Final audio contains mock TTS and must not be publicly published.",
            }
        )
    warnings.extend(_recommendation_warnings(len(news_segments), recommended_count))

    report = {
        "episode_id": state.get("episode_id", ""),
        "preset_id": preset.get("id", "morning_news_brief"),
        "facts": {
            "total": len(facts),
            "used": len(used_fact_ids),
            "unused": len(all_fact_ids - used_fact_ids),
        },
        "script": {
            "source_for_tts": script_name,
            "segments": len(segments),
            "template_variant": preset.get("template_variant", "quick_9_plus_deep_1"),
            "recommended_news_item_count": recommended_count,
            "actual_news_item_count": len(news_segments),
            "quick_news_count": segment_counts_by_type.get("quick_news", 0),
            "deep_dive_count": segment_counts_by_type.get("deep_dive", 0),
            "custom_count_allowed": bool(preset.get("allow_custom_news_item_count", True)),
            "target_duration_minutes": preset.get("target_duration_minutes", 22),
            "segment_counts_by_type": segment_counts_by_type,
            "segment_plan": preset.get("segment_plan", []),
            "segment_ids_without_sources": [
                warning.get("segment_id") for warning in warnings if warning.get("code") == "segment_without_source"
            ],
        },
        "audio": audio_outputs if isinstance(audio_outputs, dict) else {},
        "publish": state.get("publish_outputs", {}),
        "schema_validation": state.get("run_report", {}).get("schema_validation", {}),
        "rss_validation": state.get("publish_outputs", {}).get("rss_validation", {})
        or state.get("run_report", {}).get("rss_validation", {}),
        "tts_live_validation": state.get("run_report", {}).get("tts_live_validation", {}),
        "warnings": warnings,
    }
    state["run_report"] = report
    return report


def estimate_seconds(text: str) -> int:
    return max(6, round(len(_clean_text(text)) / CHARS_PER_SECOND))


def write_json(path: str | Path, payload: Any) -> None:
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def _script_dict(
    title: str,
    preset: dict[str, Any],
    segments: list[dict[str, Any]],
    episode_id: str,
    *,
    generated_by: str,
) -> dict[str, Any]:
    script = {
        "id": f"{episode_id or 'episode'}_script_generated",
        "title": title,
        "description": "单人新闻早报，面向通勤路上的快速收听。",
        "content_type": "news_brief",
        "preset_id": preset.get("id", "morning_news_brief"),
        "num_hosts": 1,
        "language": preset.get("language", "zh-CN"),
        "segments": segments,
        "generated_by": generated_by,
    }
    return script


def _segment(
    segment_id: str,
    segment_type: str,
    title: str,
    text: str,
    source_fact_ids: list[str],
) -> dict[str, Any]:
    return asdict(
        ScriptSegment(
            id=segment_id,
            type=segment_type,
            title=title,
            text=_clean_text(text),
            source_fact_ids=[fact_id for fact_id in source_fact_ids if fact_id],
            estimated_seconds=estimate_seconds(text),
        )
    )


def _mark_used_facts(facts: list[dict[str, Any]], segments: list[dict[str, Any]]) -> list[dict[str, Any]]:
    updated = copy.deepcopy(facts)
    by_id = {fact.get("id"): fact for fact in updated}
    for segment in segments:
        for fact_id in segment.get("source_fact_ids", []):
            fact = by_id.get(fact_id)
            if fact is not None:
                fact.setdefault("used_in_segments", [])
                if segment.get("id") not in fact["used_in_segments"]:
                    fact["used_in_segments"].append(segment.get("id"))
    return updated


def _clean_text(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def _truncate(value: str, max_chars: int) -> str:
    text = _clean_text(value)
    return text if len(text) <= max_chars else f"{text[: max_chars - 1]}…"


def _first_sentence(value: str, max_chars: int) -> str:
    text = _clean_text(value)
    match = re.search(r"(.+?[。！？.!?])", text)
    sentence = match.group(1) if match else text
    return _truncate(sentence, max_chars)


def _dedup_key(title: str, url: Any) -> str:
    normalized_title = re.sub(r"\W+", "", title.lower())
    return str(url or normalized_title)


def _impact_sentence(fact: dict[str, Any]) -> str:
    confidence = fact.get("confidence", "medium")
    if confidence == "high":
        return "它有明确来源和时间，可以作为本期的主信息点。"
    if confidence == "medium":
        return "来源信息基本可追踪，但发布前仍建议核对细节。"
    return "来源不足，发布前需要人工确认。"


def _quick_news_text(fact: dict[str, Any], content_tendency: str = "news") -> str:
    relevance = {
        "commentary": "这条消息对今天的关注重点有直接参考价值。",
        "analysis": "下一步可以继续留意官方信息和后续数据。",
        "narrative": "把它放回今天的新闻脉络里看，关键仍是后续进展。",
    }.get(content_tendency, "重点是先确认事件本身与最新进展。")
    return (
        f"快讯，{fact.get('title', '这条新闻')}。"
        f"{fact.get('claim') or fact.get('summary', '')} "
        f"{relevance} 发布前重点核对来源和时间。"
    )


def _deep_dive_text(fact: dict[str, Any], content_tendency: str = "news") -> str:
    framing = {
        "commentary": "从听众视角看，值得关注的是它会如何影响接下来的公开讨论。",
        "analysis": "从分析角度看，后续公开信息将决定影响范围是否进一步扩大。",
        "narrative": "从今天的新闻脉络看，它为后续发展提供了一个需要继续观察的节点。",
    }.get(content_tendency, "我们把已知事实和需要继续确认的部分分开来看。")
    return (
        f"深度解读来看，{fact.get('title', '这条新闻')}。"
        f"{fact.get('claim') or fact.get('summary', '')} "
        f"{framing} {_impact_sentence(fact)}"
    )


def _editorial_opening_line(editorial_voice: str) -> str:
    if editorial_voice == "professional":
        return "我们直接从事实和关键变化开始。"
    return "我们用轻松、清楚的方式陪你过一遍今天的重点。"


def _recommendation_warnings(actual: int, recommended: int) -> list[dict[str, Any]]:
    if actual <= 0:
        return []
    if actual < recommended:
        return [
            {
                "code": "below_recommended_news_items",
                "recommended": recommended,
                "actual": actual,
                "message": "News item count is below the recommended morning-news structure because fewer usable facts were available.",
            }
        ]
    if actual > recommended:
        return [
            {
                "code": "above_recommended_news_items",
                "recommended": recommended,
                "actual": actual,
                "message": "News item count is above the recommended morning-news structure.",
            }
        ]
    return []
