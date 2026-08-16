import mimetypes
import os
import re
import shutil
from datetime import UTC, datetime
from email.utils import format_datetime
from html import escape
from pathlib import Path
from typing import Any

from nodes.publish.config import PublishConfig
from protocol.artifact_utils import file_fingerprint
from protocol.morning_news import build_run_report, write_json
from protocol.path_utils import safe_path_part
from protocol.rss_validator import validate_rss_feed


def run(state: dict[str, Any], config: PublishConfig = None) -> dict[str, Any]:
    config = config or PublishConfig()
    logs = state.get("logs", [])
    errors = state.get("errors", [])
    episode_id = state.get("episode_id", "unknown")
    state["publish_outputs"] = {}

    logs.append("[PublishNode] Phase 1: Building publish package")
    try:
        episode_dir = Path(config.local_base_dir) / safe_path_part(episode_id, "unknown")

        local_preview_only = not bool((config.public_base_url or "").strip())
        audio_outputs = state.get("audio_outputs")
        if not isinstance(audio_outputs, dict):
            audio_outputs = {}
        contains_mock_audio = bool(audio_outputs.get("contains_mock_audio"))
        audio_path = Path(str(audio_outputs.get("final_audio_path") or ""))
        audio_artifact = file_fingerprint(audio_path)
        if not audio_artifact:
            raise RuntimeError("No readable final audio artifact found for publishing.")
        if contains_mock_audio:
            raise RuntimeError("Formal publishing is blocked because final audio contains mock TTS.")
        review = state.get("review_summary") if isinstance(state.get("review_summary"), dict) else {}
        if review.get("status") != "passed" or review.get("audio_artifact") != audio_artifact:
            raise RuntimeError("Formal publishing requires a passing review bound to the final audio fingerprint.")
        readiness = state.get("release_readiness") if isinstance(state.get("release_readiness"), dict) else {}
        if readiness.get("audio_sha256") != audio_artifact.get("sha256"):
            raise RuntimeError("Formal publishing requires release readiness bound to the current audio fingerprint.")
        if readiness.get("status") != "publish_ready":
            raise RuntimeError(
                "Formal publishing is blocked until every machine gate and the current human approval pass."
            )
        if contains_mock_audio and not local_preview_only:
            raise RuntimeError("Public publishing is blocked because final audio contains mock TTS.")
        if not local_preview_only:
            if audio_outputs.get("status") != "ok":
                raise RuntimeError(
                    "Public publishing is blocked because audio assembly provenance is incomplete."
                )
            if audio_outputs.get("contains_mock_audio") is not False:
                raise RuntimeError(
                    "Public publishing requires contains_mock_audio to be explicitly false."
                )
            reported_audio_artifact = audio_outputs.get("audio_artifact")
            if not audio_artifact or reported_audio_artifact != audio_artifact:
                raise RuntimeError(
                    "Public publishing is blocked because audio provenance does not match final audio."
                )
            source_engine_values = audio_outputs.get("source_engines")
            if not isinstance(source_engine_values, list):
                source_engine_values = []
            source_engines = {
                str(engine).strip().casefold()
                for engine in source_engine_values
                if str(engine).strip()
            }
            if not source_engines or source_engines.intersection({"mock", "unknown"}):
                raise RuntimeError(
                    "Public publishing requires known, non-mock source engines."
                )
            if "doubao_tts" not in source_engines or not source_engines.issubset({"doubao_tts", "recording"}):
                raise RuntimeError(
                    "Public PodFlow 晨报 episodes require the fixed Doubao BigTTS baseline; recording replacements are optional."
                )
        if not audio_artifact:
            raise RuntimeError("No readable final audio artifact found for publishing.")
        if not local_preview_only:
            _validate_public_readiness(state, audio_outputs)

        episode_dir.mkdir(parents=True, exist_ok=True)

        stored_audio = ""
        if audio_path.exists() and audio_path.is_file():
            stored_audio_path = episode_dir / f"final{audio_path.suffix or '.mp3'}"
            shutil.copy2(audio_path, stored_audio_path)
            stored_audio = str(stored_audio_path)
        else:
            raise RuntimeError("No final audio artifact found for publish package.")

        cover_path = Path(state.get("cover_path", ""))
        stored_cover = ""
        if cover_path.exists() and cover_path.is_file():
            stored_cover_path = episode_dir / cover_path.name
            shutil.copy2(cover_path, stored_cover_path)
            stored_cover = str(stored_cover_path)

        enclosure_url = _build_enclosure_url(stored_audio, episode_dir, config, local_preview_only)
        public_artifacts = _write_public_artifacts(
            episode_dir,
            state,
            config,
            enclosure_url,
            stored_audio,
            stored_cover,
        )
        episode_json = _episode_payload(
            state,
            config,
            stored_audio,
            stored_cover,
            enclosure_url,
            public_artifacts,
        )
        episode_json_path = episode_dir / "episode.json"
        write_json(episode_json_path, episode_json)

        state["publish_outputs"] = {
            "episode_dir": str(episode_dir),
            "audio_path": stored_audio,
            "episode_json": str(episode_json_path),
            "enclosure_url": enclosure_url,
            "local_preview_only": local_preview_only,
            "contains_mock_audio": contains_mock_audio,
            **public_artifacts,
        }

        report = build_run_report(state)
        run_report_path = episode_dir / "run_report.json"
        write_json(run_report_path, report)
        state["publish_outputs"]["run_report_json"] = str(run_report_path)

        feed_content = _generate_rss(state, config, enclosure_url, stored_audio)
        rss_validation = validate_rss_feed(
            feed_content,
            public_base_url=config.public_base_url,
            expected_enclosure_url=enclosure_url,
        )
        state["publish_outputs"]["rss_validation"] = rss_validation
        feed_in_package = episode_dir / "feed.xml"
        feed_in_package.write_text(feed_content, encoding="utf-8")
        state["publish_outputs"]["feed_xml"] = str(feed_in_package)

        rss_output_dir = Path(config.rss_output_dir)
        rss_output_dir.mkdir(parents=True, exist_ok=True)
        rss_path = rss_output_dir / "feed.xml"
        rss_path.write_text(feed_content, encoding="utf-8")

        platform_results = {
            "local": "success",
            "rss": "success" if rss_validation.get("ok") else "failed",
        }
        publish_status = "success" if rss_validation.get("ok") else "partial_success"

        state["publish_outputs"].update({
            "feed_xml": str(rss_path),
            "package_feed_xml": str(feed_in_package),
            "published_at": datetime.now(UTC).isoformat(),
            "status": publish_status,
            "platforms": platform_results,
            "rss_validation_ok": rss_validation.get("ok", False),
            "warning": (
                "Final audio contains mock TTS; package is limited to local preview."
                if contains_mock_audio
                else "RSS is local-preview only, not publicly subscribable."
                if local_preview_only
                else ""
            ),
        })
        build_run_report(state)
        state["run_report"]["rss_validation"] = rss_validation
        write_json(run_report_path, state["run_report"])
        logs.append(f"[PublishNode] Package: {episode_dir}")
        logs.append(f"[PublishNode] RSS: {rss_path}")
    except Exception as e:
        errors.append({"node": "publish", "message": str(e), "detail": str(e)})

    state["logs"] = logs
    state["errors"] = errors
    return state
def _episode_payload(
    state: dict[str, Any],
    config: PublishConfig,
    stored_audio: str,
    stored_cover: str,
    enclosure_url: str,
    public_artifacts: dict[str, str],
) -> dict[str, Any]:
    script = state.get("edited_script", {})
    audio_outputs = state.get("audio_outputs", {})
    sources = _collect_sources(state.get("facts", []))
    episode_dir = Path(public_artifacts["chapters_json"]).parent
    cover_url = _public_asset_url(config.public_base_url, episode_dir.name, Path(stored_cover).name) if stored_cover else ""
    return {
        "episode_id": state.get("episode_id", ""),
        "preset": state.get("preset", {}),
        "title": script.get("title", config.podcast_title),
        "description": script.get("description", config.podcast_description),
        "facts": state.get("facts", []),
        "selected_topics": state.get("selected_topics", []),
        "script": state.get("script", {}),
        "edited_script": state.get("edited_script", {}),
        "audio": {
            "final_audio_path": stored_audio,
            "cover_path": stored_cover,
            "outputs": state.get("audio_outputs", {}),
        },
        "created_at": state.get("created_at", ""),
        "showcase": {
            "id": state.get("episode_id", ""),
            "title": script.get("title", config.podcast_title),
            "summary": script.get("description", config.podcast_description),
            "publishedAt": state.get("created_at", ""),
            "durationSeconds": audio_outputs.get("duration_seconds", 0),
            "audioUrl": enclosure_url,
            "audioBytes": Path(stored_audio).stat().st_size,
            "coverUrl": cover_url,
            "transcriptUrl": _public_asset_url(config.public_base_url, episode_dir.name, "transcript.vtt"),
            "chaptersUrl": _public_asset_url(config.public_base_url, episode_dir.name, "chapters.json"),
            "sources": sources,
            "credits": [{"role": "制作", "name": "PodFlow Studio"}],
            "ttsProvider": _tts_provider_label(audio_outputs.get("source_engines", [])),
            "aiAssisted": True,
            "explicit": False,
        },
    }


def _validate_public_readiness(state: dict[str, Any], audio_outputs: dict[str, Any]) -> None:
    episode_id = str(state.get("episode_id") or "")
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}(?:-[a-z0-9]+(?:-[a-z0-9]+)*)?", episode_id):
        raise RuntimeError("Public publishing requires an immutable date-based episode ID.")
    if int(audio_outputs.get("sample_rate_hz") or 0) != 48_000:
        raise RuntimeError("Public publishing requires 48 kHz final audio.")
    if str(audio_outputs.get("format") or "").lower() != "mp3":
        raise RuntimeError("Public publishing requires a final MP3 artifact.")
    if int(audio_outputs.get("bitrate_kbps") or 0) != 160:
        raise RuntimeError("Public publishing requires a 160 kbps MP3.")
    target_lufs = audio_outputs.get("target_lufs")
    if target_lufs is None or not -17.0 <= float(target_lufs) <= -15.0:
        raise RuntimeError("Public publishing requires integrated loudness of -16 LUFS ±1.")
    true_peak_db = audio_outputs.get("true_peak_db")
    if true_peak_db is None or float(true_peak_db) > -1.0:
        raise RuntimeError("Public publishing requires true peak no higher than -1 dBTP.")
    duration_seconds = int(float(audio_outputs.get("duration_seconds") or 0))
    if not 720 <= duration_seconds <= 900:
        raise RuntimeError("Public publishing requires a 12-15 minute final episode.")
    audio_artifact = audio_outputs.get("audio_artifact") or {}
    if int(audio_artifact.get("size_bytes") or 0) < duration_seconds * 16_000:
        raise RuntimeError("Public publishing requires at least a 128 kbps MP3 payload size.")
    plan = state.get("production_plan") if isinstance(state.get("production_plan"), dict) else {}
    if plan.get("version") != 3 or plan.get("quality_profile") != "podflow_morning_v3":
        raise RuntimeError("Public publishing requires production_plan v3 / podflow_morning_v3.")
    review = state.get("review_summary") if isinstance(state.get("review_summary"), dict) else {}
    if review.get("status") != "passed" or review.get("audio_artifact") != audio_artifact:
        raise RuntimeError("Public publishing requires a passing review bound to the final audio fingerprint.")
    approval = state.get("audio_approval") if isinstance(state.get("audio_approval"), dict) else {}
    if approval.get("status") != "approved" or approval.get("audio_sha256") != audio_artifact.get("sha256"):
        raise RuntimeError("Public publishing requires human approval bound to the final MP3 SHA256.")
    script = state.get("edited_script") if isinstance(state.get("edited_script"), dict) else {}
    segments = [segment for segment in script.get("segments", []) if isinstance(segment, dict)]
    quick_count = sum(segment.get("type") == "quick_news" for segment in segments)
    deep_count = sum(segment.get("type") == "deep_dive" for segment in segments)
    if (quick_count, deep_count) != (6, 1):
        raise RuntimeError("Public PodFlow 晨报 episodes require exactly 6 quick news segments and 1 deep dive.")
    cover_path = Path(str(state.get("cover_path") or ""))
    if not cover_path.is_file():
        raise RuntimeError("Public publishing requires a generated PodFlow 晨报 cover.")
    if not _collect_sources(state.get("facts", [])):
        raise RuntimeError("Public publishing requires at least one traceable source.")
    pending_terms = sorted({
        str(term)
        for segment in state.get("voice_segments", [])
        if isinstance(segment, dict)
        for term in (segment.get("pronunciation_review") or {}).get("unresolved_terms", [])
    })
    if pending_terms:
        raise RuntimeError(
            "Public publishing requires pronunciation review for: " + ", ".join(pending_terms)
        )


def _write_public_artifacts(
    episode_dir: Path,
    state: dict[str, Any],
    config: PublishConfig,
    enclosure_url: str,
    stored_audio: str,
    stored_cover: str,
) -> dict[str, str]:
    script = state.get("edited_script") if isinstance(state.get("edited_script"), dict) else {}
    segments = [segment for segment in script.get("segments", []) if isinstance(segment, dict)]
    duration_seconds = max(1, int(float(state.get("audio_outputs", {}).get("duration_seconds") or 0)))
    chapters = _build_chapters(segments, duration_seconds)
    sources = _collect_sources(state.get("facts", []))

    chapters_path = episode_dir / "chapters.json"
    transcript_path = episode_dir / "transcript.vtt"
    sources_path = episode_dir / "sources.json"
    show_notes_path = episode_dir / "show-notes.md"
    write_json(chapters_path, {"version": "1.2.0", "chapters": chapters})
    write_json(sources_path, sources)
    transcript_path.write_text(_build_transcript_vtt(segments, chapters, duration_seconds), encoding="utf-8")
    show_notes_path.write_text(
        _build_show_notes(
            title=str(script.get("title") or config.podcast_title),
            summary=str(script.get("description") or config.podcast_description),
            chapters=chapters,
            sources=sources,
            enclosure_url=enclosure_url,
            stored_audio=stored_audio,
            stored_cover=stored_cover,
            tts_provider=_tts_provider_label(state.get("audio_outputs", {}).get("source_engines", [])),
        ),
        encoding="utf-8",
    )
    return {
        "show_notes": str(show_notes_path),
        "transcript_vtt": str(transcript_path),
        "chapters_json": str(chapters_path),
        "sources_json": str(sources_path),
    }


def _build_chapters(segments: list[dict[str, Any]], duration_seconds: int) -> list[dict[str, Any]]:
    if not segments:
        return [{"startTime": 0, "title": "PodFlow 晨报"}]
    weights = [
        max(1, int(segment.get("estimated_seconds") or max(1, len(str(segment.get("text") or "")) / 4)))
        for segment in segments
    ]
    total_weight = max(1, sum(weights))
    elapsed = 0
    chapters: list[dict[str, Any]] = []
    for index, (segment, weight) in enumerate(zip(segments, weights)):
        start_time = min(duration_seconds - 1, int(elapsed * duration_seconds / total_weight))
        if chapters:
            start_time = max(chapters[-1]["startTime"] + 1, start_time)
            start_time = min(duration_seconds - 1, start_time)
        chapters.append({
            "startTime": max(0, start_time),
            "title": str(segment.get("title") or _segment_label(str(segment.get("type") or ""), index)),
        })
        elapsed += weight
    return chapters


def _build_transcript_vtt(
    segments: list[dict[str, Any]],
    chapters: list[dict[str, Any]],
    duration_seconds: int,
) -> str:
    cues = ["WEBVTT", ""]
    for index, segment in enumerate(segments):
        start = int(chapters[index]["startTime"]) if index < len(chapters) else 0
        end = (
            int(chapters[index + 1]["startTime"])
            if index + 1 < len(chapters)
            else duration_seconds
        )
        end = max(start + 1, end)
        cues.extend([
            str(index + 1),
            f"{_vtt_timestamp(start)} --> {_vtt_timestamp(end)}",
            str(segment.get("text") or "").strip(),
            "",
        ])
    return "\n".join(cues)


def _collect_sources(raw_facts: Any) -> list[dict[str, str]]:
    facts = raw_facts if isinstance(raw_facts, list) else []
    collected: list[dict[str, str]] = []
    seen: set[str] = set()
    for fact in facts:
        if not isinstance(fact, dict):
            continue
        for evidence in fact.get("evidence", []):
            if not isinstance(evidence, dict):
                continue
            url = str(evidence.get("url") or "")
            if not re.match(r"^https?://", url) or url in seen:
                continue
            seen.add(url)
            collected.append({"title": str(evidence.get("title") or fact.get("title") or "来源"), "url": url})
    return collected


def _tts_provider_label(source_engines: Any) -> str:
    engines = {str(engine).strip().casefold() for engine in source_engines or [] if str(engine).strip()}
    if "doubao_tts" in engines and "recording" in engines:
        return "豆包 BigTTS + 真人录音"
    if "doubao_tts" in engines:
        return "豆包 BigTTS"
    if engines == {"recording"}:
        return "真人录音"
    return ", ".join(sorted(engines))


def _build_show_notes(
    *,
    title: str,
    summary: str,
    chapters: list[dict[str, Any]],
    sources: list[dict[str, str]],
    enclosure_url: str,
    stored_audio: str,
    stored_cover: str,
    tts_provider: str,
) -> str:
    chapter_lines = "\n".join(
        f"- {_human_timestamp(int(chapter['startTime']))} {chapter['title']}" for chapter in chapters
    )
    source_lines = "\n".join(f"- [{source['title']}]({source['url']})" for source in sources) or "- 本期暂无可公开来源"
    return f"""# {title}

{summary}

## 章节

{chapter_lines}

## 来源

{source_lines}

## 制作说明

- 制作：PodFlow Studio
- 配音服务：{tts_provider or '真人录音'}
- AI 辅助：素材整理、事实卡片与初稿生成；事实、成稿、发音和听感需人工终审
- 音频：{enclosure_url or Path(stored_audio).name}
- 封面：{Path(stored_cover).name if stored_cover else '未提供'}
"""


def _segment_label(segment_type: str, index: int) -> str:
    labels = {"opening": "开场", "deep_dive": "重点解读", "closing": "收尾"}
    return labels.get(segment_type, f"快讯 {index}")


def _vtt_timestamp(value: int) -> str:
    hours, remainder = divmod(max(0, value), 3600)
    minutes, seconds = divmod(remainder, 60)
    return f"{hours:02d}:{minutes:02d}:{seconds:02d}.000"


def _human_timestamp(value: int) -> str:
    minutes, seconds = divmod(max(0, value), 60)
    return f"{minutes:02d}:{seconds:02d}"


def _public_asset_url(base_url: str, episode_id: str, filename: str) -> str:
    relative = f"episodes/{episode_id}/{filename}"
    return f"{base_url.rstrip('/')}/{relative}" if base_url else relative


def _build_enclosure_url(
    stored_audio: str,
    episode_dir: Path,
    config: PublishConfig,
    local_preview_only: bool,
) -> str:
    if not stored_audio:
        return ""
    audio_path = Path(stored_audio)
    if local_preview_only:
        rss_dir = Path(config.rss_output_dir)
        try:
            return os.path.relpath(audio_path, start=rss_dir).replace("\\", "/")
        except ValueError:
            return audio_path.name
    audio_relative = f"episodes/{episode_dir.name}/{audio_path.name}"
    return f"{config.public_base_url.rstrip('/')}/{audio_relative}"


def _generate_rss(
    state: dict[str, Any],
    config: PublishConfig,
    enclosure_url: str,
    stored_audio: str,
) -> str:
    script = state.get("edited_script", {})
    title = script.get("title", config.podcast_title)
    desc = script.get("description", config.podcast_description)
    episode_id = state.get("episode_id", "unknown")
    created_at = state.get("created_at", "")
    pub_date = _format_pub_date(created_at)
    mime_type = mimetypes.guess_type(stored_audio)[0] or "audio/mpeg"
    audio_size = os.path.getsize(stored_audio) if stored_audio and os.path.exists(stored_audio) else 0
    duration = state.get("audio_outputs", {}).get("duration_seconds", "")
    preview_note = (
        "\n      <podflow:preview>RSS is local-preview only, not publicly subscribable.</podflow:preview>"
        if not config.public_base_url
        else ""
    )

    return f"""<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
     xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"
     xmlns:podflow="https://podflow.local/rss">
  <channel>
    <title>{escape(config.podcast_title)}</title>
    <description>{escape(config.podcast_description)}</description>
    <language>{escape(config.podcast_language)}</language>
    <itunes:author>{escape(config.podcast_author)}</itunes:author>
    <itunes:category text="{escape(config.podcast_category)}"/>
    <item>
      <guid isPermaLink="false">{escape(episode_id)}</guid>
      <title>{escape(title)}</title>
      <description>{escape(desc)}</description>
      <pubDate>{escape(pub_date)}</pubDate>
      <itunes:duration>{escape(_format_duration(duration))}</itunes:duration>
      <enclosure url="{escape(enclosure_url)}" length="{audio_size}" type="{escape(mime_type)}"/>{preview_note}
    </item>
  </channel>
</rss>"""


def _format_pub_date(value: str) -> str:
    try:
        dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=UTC)
        return format_datetime(dt)
    except Exception:
        return format_datetime(datetime.now(UTC))


def _format_duration(value: Any) -> str:
    try:
        seconds = int(float(value))
    except (TypeError, ValueError):
        return ""
    hours = seconds // 3600
    minutes = (seconds % 3600) // 60
    secs = seconds % 60
    if hours:
        return f"{hours:02d}:{minutes:02d}:{secs:02d}"
    return f"{minutes:02d}:{secs:02d}"
