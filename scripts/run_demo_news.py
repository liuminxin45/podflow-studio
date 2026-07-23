"""Run the offline morning news brief demo without external API keys."""

# ruff: noqa: E402

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from nodes.audio_postprocess.config import AudioPostprocessConfig
from nodes.audio_postprocess.node import run as audio_run
from nodes.facts.config import FactsConfig
from nodes.facts.node import run as facts_run
from nodes.publish.config import PublishConfig
from nodes.publish.node import run as publish_run
from nodes.tts.config import TTSConfig
from nodes.tts.node import run as tts_run
from protocol.morning_news import (
    apply_manual_notes,
    build_run_report,
    generate_deterministic_script,
    write_json,
)
from protocol.presets import get_default_preset
from protocol.episode_models import validate_episode_run_payload


DEMO_DIR = ROOT / "examples" / "demo-news"
DEFAULT_OUTPUT_DIR = DEMO_DIR / "output"
DEFAULT_EPISODE_ID = "demo_morning_news_001"
PACK_MANIFEST_PATH = DEMO_DIR / "input" / "pack-manifest.json"


def load_demo_pack_manifest() -> list[dict[str, Any]]:
    manifest = json.loads(PACK_MANIFEST_PATH.read_text(encoding="utf-8"))
    if not isinstance(manifest, list) or not manifest:
        raise ValueError("Demo pack manifest must be a non-empty array")
    ids = [str(item.get("id") or "") for item in manifest if isinstance(item, dict)]
    if len(ids) != len(manifest) or any(not pack_id for pack_id in ids):
        raise ValueError("Every demo pack manifest entry must include an id")
    if len(ids) != len(set(ids)):
        raise ValueError("Demo pack ids must be unique")
    return manifest


def load_demo_pack(pack_id: str) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    manifest = load_demo_pack_manifest()
    pack = next((item for item in manifest if item["id"] == pack_id), None)
    if pack is None:
        available = ", ".join(item["id"] for item in manifest)
        raise ValueError(f"Unknown demo pack {pack_id!r}; choose one of: {available}")
    relative_path = Path(str(pack.get("file") or ""))
    if not relative_path.parts or relative_path.is_absolute() or ".." in relative_path.parts:
        raise ValueError(f"Demo pack {pack_id!r} has an invalid file path")
    pack_path = DEMO_DIR / "input" / relative_path
    items = json.loads(pack_path.read_text(encoding="utf-8"))
    if not isinstance(items, list) or not items:
        raise ValueError(f"Demo pack {pack_id!r} must contain a non-empty array")
    if not all(isinstance(item, dict) for item in items):
        raise ValueError(f"Demo pack {pack_id!r} contains a non-object item")
    return pack, items


def run_demo_news(
    *,
    output_dir: Path = DEFAULT_OUTPUT_DIR,
    episode_id: str = DEFAULT_EPISODE_ID,
    source_items: list[dict[str, Any]] | None = None,
    pack_id: str = "mixed",
) -> dict[str, Any]:
    input_dir = DEMO_DIR / "input"
    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "voice_segments").mkdir(parents=True, exist_ok=True)

    if source_items is None:
        pack, items = load_demo_pack(pack_id)
    else:
        pack = next(item for item in load_demo_pack_manifest() if item["id"] == "mixed")
        items = source_items
    items = [{**item, "_status": "ready"} for item in items]
    manual_notes = (input_dir / "manual-notes.md").read_text(encoding="utf-8").strip()
    preset = get_default_preset()
    state: dict[str, Any] = {
        "episode_id": episode_id,
        "created_at": datetime.now().isoformat(),
        "schema_version": 1,
        "preset": preset,
        "source_inputs": items,
        "fetch_contents": items,
        "cleaned_contents": items,
        "researched_contents": items,
        "facts": [],
        "selected_topic": {
            "title": pack["episode_title"],
            "description": pack["topic_description"],
            "keywords": pack["keywords"],
        },
        "selected_topics": [],
        "selected_materials": items,
        "script": {},
        "edited_script": {},
        "voice_segments": [],
        "audio_outputs": {},
        "cover_path": "",
        "intro_outro_paths": {},
        "review_summary": {},
        "publish_outputs": {},
        "subtitle_path": "",
        "run_report": {},
        "runtime_config": {},
        "errors": [],
        "logs": [],
    }

    state = facts_run(
        state,
        FactsConfig(
            max_facts=20,
            selected_topic_count=preset.get("recommended_news_item_count", 7),
        ),
    )
    facts = state["facts"]
    generated_script = generate_deterministic_script(
        facts,
        preset,
        episode_id=episode_id,
        title=pack["episode_title"],
    )
    edited_script = apply_manual_notes(generated_script, manual_notes)
    state["script"] = generated_script
    state["edited_script"] = edited_script

    write_json(output_dir / "facts.json", facts)
    write_json(output_dir / "script.generated.json", generated_script)
    write_json(output_dir / "script.edited.json", edited_script)

    tts_config = _tts_config_from_env(output_dir / "voice_segments")
    state = tts_run(state, tts_config)
    if not state.get("voice_segments") and tts_config.engine != "mock":
        state["logs"].append("[Demo] Real TTS did not produce segments; falling back to mock TTS.")
        state = tts_run(state, TTSConfig(engine="mock", output_dir=str(output_dir / "voice_segments")))

    state = audio_run(
        state,
        AudioPostprocessConfig(
            output_dir=str(output_dir),
            output_format=os.environ.get("PODFLOW_DEMO_AUDIO_FORMAT", "mp3"),
            final_basename="final",
        ),
    )
    state = publish_run(
        state,
        PublishConfig(
            local_base_dir=str(output_dir / "dist" / "episodes"),
            rss_output_dir=str(output_dir),
            public_base_url=os.environ.get("PODFLOW_PUBLIC_BASE_URL", ""),
            podcast_title="通勤早咖啡",
            podcast_description="PodFlow Studio 单人新闻早报 demo",
            podcast_category="News",
        ),
    )

    schema_ok, schema_errors = validate_episode_run_payload(state)
    state.setdefault("run_report", {})["schema_validation"] = {
        "ok": schema_ok,
        "errors": schema_errors,
    }
    write_json(output_dir / "episode.json", _episode_summary(state))
    write_json(output_dir / "run_report.json", build_run_report(state))
    return state


def _tts_config_from_env(output_dir: Path) -> TTSConfig:
    engine = os.environ.get("PODFLOW_DEMO_TTS_ENGINE", "mock").strip() or "mock"
    return TTSConfig(
        engine=engine,
        api_key=os.environ.get("PODFLOW_TTS_API_KEY") or os.environ.get("OPENAI_API_KEY", ""),
        api_base=os.environ.get("PODFLOW_TTS_API_BASE") or os.environ.get("OPENAI_API_BASE", ""),
        model=os.environ.get("PODFLOW_TTS_MODEL", "tts-1"),
        output_format="wav" if engine == "mock" else os.environ.get("PODFLOW_TTS_OUTPUT_FORMAT", "mp3"),
        output_dir=str(output_dir),
    )


def _episode_summary(state: dict[str, Any]) -> dict[str, Any]:
    return {
        "episode_id": state.get("episode_id", ""),
        "preset": state.get("preset", {}),
        "facts": state.get("facts", []),
        "selected_topics": state.get("selected_topics", []),
        "script": state.get("script", {}),
        "edited_script": state.get("edited_script", {}),
        "audio_outputs": state.get("audio_outputs", {}),
        "publish_outputs": state.get("publish_outputs", {}),
    }


def demo_failures(state: dict[str, Any]) -> list[str]:
    """Return release-gate failures for the offline demo result."""

    failures: list[str] = []
    errors = state.get("errors")
    if not isinstance(errors, list) or errors:
        failures.append("state.errors must be an empty list")

    audio_outputs = state.get("audio_outputs")
    audio_outputs = audio_outputs if isinstance(audio_outputs, dict) else {}
    final_audio = Path(str(audio_outputs.get("final_audio_path") or ""))
    if not final_audio.is_file():
        failures.append("final audio artifact is missing")
    publish_outputs = state.get("publish_outputs")
    publish_outputs = publish_outputs if isinstance(publish_outputs, dict) else {}
    rss_path = Path(str(publish_outputs.get("feed_xml") or ""))
    if not rss_path.is_file():
        failures.append("RSS artifact is missing")

    if not isinstance(audio_outputs, dict) or audio_outputs.get("status") != "ok":
        failures.append("audio_outputs.status is not ok")
    report = state.get("run_report")
    if not isinstance(report, dict) or not report.get("schema_validation", {}).get("ok"):
        failures.append("EpisodeRun schema validation failed")
    if not isinstance(publish_outputs, dict) or not publish_outputs.get("rss_validation", {}).get("ok"):
        failures.append("RSS validation failed")
    return failures


def main() -> int:
    parser = argparse.ArgumentParser(description="Run offline PodFlow Studio morning news demo.")
    parser.add_argument("--output", default=str(DEFAULT_OUTPUT_DIR), help="Output directory")
    parser.add_argument("--episode-id", default=DEFAULT_EPISODE_ID, help="Episode id")
    parser.add_argument(
        "--pack",
        default="mixed",
        choices=[item["id"] for item in load_demo_pack_manifest()],
        help="Offline fact-card pack",
    )
    args = parser.parse_args()

    state = run_demo_news(
        output_dir=Path(args.output),
        episode_id=args.episode_id,
        pack_id=args.pack,
    )
    report = state.get("run_report", {})
    final_audio = state.get("audio_outputs", {}).get("final_audio_path", "")
    rss_path = state.get("publish_outputs", {}).get("feed_xml", "")
    print("PodFlow Studio demo-news completed")
    print(f"episode_id: {state.get('episode_id')}")
    print(f"pack: {args.pack}")
    print(f"facts: {report.get('facts', {}).get('total', 0)}")
    print(f"segments: {report.get('script', {}).get('segments', 0)}")
    print(f"audio: {final_audio}")
    print(f"rss: {rss_path}")
    if state.get("publish_outputs", {}).get("local_preview_only"):
        print("warning: RSS is local-preview only, not publicly subscribable.")
    failures = demo_failures(state)
    for failure in failures:
        print(f"error: {failure}")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
