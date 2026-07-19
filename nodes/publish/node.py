import mimetypes
import os
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
        episode_dir.mkdir(parents=True, exist_ok=True)

        local_preview_only = not bool((config.public_base_url or "").strip())
        audio_outputs = state.get("audio_outputs")
        if not isinstance(audio_outputs, dict):
            audio_outputs = {}
        contains_mock_audio = bool(audio_outputs.get("contains_mock_audio"))
        audio_path = Path(str(audio_outputs.get("final_audio_path") or ""))
        audio_artifact = file_fingerprint(audio_path)
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
        if not audio_artifact:
            raise RuntimeError("No readable final audio artifact found for publishing.")

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

        episode_json = _episode_payload(state, config, stored_audio, stored_cover)
        episode_json_path = episode_dir / "episode.json"
        write_json(episode_json_path, episode_json)

        enclosure_url = _build_enclosure_url(stored_audio, episode_dir, config, local_preview_only)
        state["publish_outputs"] = {
            "episode_dir": str(episode_dir),
            "audio_path": stored_audio,
            "episode_json": str(episode_json_path),
            "enclosure_url": enclosure_url,
            "local_preview_only": local_preview_only,
            "contains_mock_audio": contains_mock_audio,
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
) -> dict[str, Any]:
    script = state.get("edited_script", {})
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
    }


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
