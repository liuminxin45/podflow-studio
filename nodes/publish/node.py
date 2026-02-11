import os
import json
import shutil
from pathlib import Path
from typing import Dict, Any
from nodes.publish.config import PublishConfig


def run(state: Dict[str, Any], config: PublishConfig = None) -> Dict[str, Any]:
    config = config or PublishConfig()
    logs = state.get("logs", [])
    errors = state.get("errors", [])

    # === Phase 1: Store files locally (merged from store node) ===
    logs.append("[PublishNode] Phase 1: Storing files")
    episode_id = state.get("episode_id", "unknown")

    try:
        episode_dir = os.path.join(config.local_base_dir, episode_id)
        Path(episode_dir).mkdir(parents=True, exist_ok=True)

        audio_path = state.get("final_audio_path", "")
        if audio_path and os.path.exists(audio_path):
            dest = os.path.join(episode_dir, os.path.basename(audio_path))
            shutil.copy2(audio_path, dest)

        cover_path = state.get("cover_path", "")
        if cover_path and os.path.exists(cover_path):
            dest = os.path.join(episode_dir, os.path.basename(cover_path))
            shutil.copy2(cover_path, dest)

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

        state["storage_info"] = {"type": config.storage_type, "base_dir": episode_dir}
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
        state["publish_status"] = {"rss_generated": True, "rss_path": rss_path}
        logs.append(f"[PublishNode] RSS: {rss_path}")
    except Exception as e:
        errors.append({"node": "publish", "message": str(e), "detail": str(e)})

    state["logs"] = logs
    state["errors"] = errors
    return state


def _generate_rss(state: Dict, config: PublishConfig) -> str:
    script = state.get("script", {})
    title = script.get("title", config.podcast_title)
    desc = script.get("description", config.podcast_description)
    audio_path = state.get("final_audio_path", "")

    return f"""<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
  <channel>
    <title>{config.podcast_title}</title>
    <description>{config.podcast_description}</description>
    <language>{config.podcast_language}</language>
    <itunes:author>{config.podcast_author}</itunes:author>
    <itunes:category text="{config.podcast_category}"/>
    <item>
      <title>{title}</title>
      <description>{desc}</description>
      <enclosure url="{audio_path}" type="audio/mpeg"/>
    </item>
  </channel>
</rss>"""
