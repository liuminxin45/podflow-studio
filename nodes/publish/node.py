import os
import json
import shutil
import mimetypes
from datetime import datetime, UTC
from email.utils import format_datetime
from html import escape
from pathlib import Path
from typing import Any
from nodes.publish.config import PublishConfig


def run(state: dict[str, Any], config: PublishConfig = None) -> dict[str, Any]:
    config = config or PublishConfig()
    logs = state.get("logs", [])
    errors = state.get("errors", [])

    # === Phase 1: Store files locally (merged from store node) ===
    logs.append("[PublishNode] Phase 1: Storing files")
    episode_id = state.get("episode_id", "unknown")

    try:
        episode_dir = os.path.join(config.local_base_dir, episode_id)
        Path(episode_dir).mkdir(parents=True, exist_ok=True)
        stored_files = {}

        audio_path = state.get("final_audio_path", "")
        if audio_path and os.path.exists(audio_path):
            dest = os.path.join(episode_dir, os.path.basename(audio_path))
            shutil.copy2(audio_path, dest)
            stored_files["audio"] = dest

        cover_path = state.get("cover_path", "")
        if cover_path and os.path.exists(cover_path):
            dest = os.path.join(episode_dir, os.path.basename(cover_path))
            shutil.copy2(cover_path, dest)
            stored_files["cover"] = dest

        if config.generate_metadata:
            meta = {
                "episode_id": episode_id,
                "title": state.get("script", {}).get("title", ""),
                "description": state.get("script", {}).get("description", ""),
                "audio_metadata": state.get("audio_metadata", {}),
                "created_at": state.get("created_at", ""),
            }
            meta_path = os.path.join(episode_dir, "metadata.json")
            with open(meta_path, "w", encoding="utf-8") as f:
                json.dump(meta, f, ensure_ascii=False, indent=2)
            stored_files["metadata"] = meta_path

        state["storage_info"] = {
            "type": config.storage_type,
            "base_dir": episode_dir,
            "files": stored_files,
        }
        logs.append(f"[PublishNode] Stored: {episode_dir}")
    except Exception as e:
        errors.append({"node": "publish", "message": f"Storage failed: {str(e)}", "detail": str(e)})

    # === Phase 2: Generate RSS and publish ===
    logs.append("[PublishNode] Phase 2: Publishing")

    try:
        Path(config.rss_output_dir).mkdir(parents=True, exist_ok=True)

        rss_path = os.path.join(config.rss_output_dir, "feed.xml")
        rss_content = _generate_rss(state, config)

        with open(rss_path, "w", encoding="utf-8") as f:
            f.write(rss_content)

        state["rss_path"] = rss_path
        state["publish_status"] = {
            "rss_generated": True,
            "rss_path": rss_path,
            "storage_dir": state.get("storage_info", {}).get("base_dir", ""),
            "published_at": datetime.now(UTC).isoformat(),
            "platforms": {"local": "success", "rss": "success"},
        }
        logs.append(f"[PublishNode] RSS: {rss_path}")
    except Exception as e:
        errors.append({"node": "publish", "message": str(e), "detail": str(e)})

    state["logs"] = logs
    state["errors"] = errors
    return state


def _generate_rss(state: dict, config: PublishConfig) -> str:
    script = state.get("script", {})
    title = script.get("title", config.podcast_title)
    desc = script.get("description", config.podcast_description)
    audio_path = state.get("final_audio_path", "")
    episode_id = state.get("episode_id", "unknown")
    created_at = state.get("created_at", "")
    pub_date = _format_pub_date(created_at)
    mime_type = mimetypes.guess_type(audio_path)[0] or "audio/mpeg"
    audio_size = os.path.getsize(audio_path) if audio_path and os.path.exists(audio_path) else 0
    duration = state.get("audio_metadata", {}).get("duration_seconds", "")

    return f"""<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
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
      <enclosure url="{escape(audio_path)}" length="{audio_size}" type="{escape(mime_type)}"/>
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
