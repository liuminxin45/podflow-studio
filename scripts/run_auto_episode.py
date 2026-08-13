"""Run a full auto episode: fetch -> facts -> script -> free TTS -> assembly.

This is the CLI / GitHub Actions automation path. It produces a *preview*
episode (free TTS, no human approval) and never touches the formal publish
gate. LLM calls default to Gemini via Google AI Studio's free tier.

Topic selection is driven by ``PODFLOW_TARGET_TOPIC`` (or ``--topic``). Without
a topic the pipeline falls back to hotlist clustering.

Exit code 0 on success, non-zero when the preview cannot be assembled.
"""

# ruff: noqa: E402

from __future__ import annotations

import argparse
import os
import sys
from datetime import datetime
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from nodes.assets.config import AssetsConfig
from nodes.assets.node import run as assets_run
from nodes.audio_postprocess.config import AudioPostprocessConfig
from nodes.audio_postprocess.node import run as audio_run
from nodes.facts.config import FactsConfig
from nodes.facts.node import run as facts_run
from nodes.fetch.config import FetchConfig
from nodes.fetch.node import run as fetch_run
from nodes.preprocess.config import PreprocessConfig
from nodes.preprocess.node import run as preprocess_run
from nodes.research.config import ResearchConfig
from nodes.research.node import run as research_run
from nodes.script.config import ScriptConfig
from nodes.script.node import run as script_run
from nodes.topic_selection.config import TopicSelectionConfig
from nodes.topic_selection.node import run as topic_selection_run
from nodes.tts.config import TTSConfig
from nodes.tts.node import run as tts_run
from protocol.env_overrides import apply_env_overrides
from protocol.episode_models import validate_episode_run_payload
from protocol.morning_news import build_run_report, write_json
from protocol.presets import get_default_preset

DEFAULT_OUTPUT_ROOT = ROOT / "out" / "auto-episode"
DEFAULT_LLM_PROVIDER = "gemini"
DEFAULT_LLM_MODEL = "gemini-2.5-flash"
DEFAULT_TTS_ENGINE = "edge-tts"


def _env(name: str, default: str = "") -> str:
    return os.environ.get(name, default).strip()


def _llm_kwargs() -> dict[str, Any]:
    """LLM config for research / topic_selection / script nodes.

    The API key is intentionally left empty: ``protocol.llm_runtime`` resolves
    it from the environment (``GEMINI_API_KEY`` / ``GOOGLE_API_KEY`` /
    ``PODFLOW_LLM_API_KEY``) so secrets never persist into the workflow state.
    """
    return {
        "provider_kind": _env("PODFLOW_LLM_PROVIDER", DEFAULT_LLM_PROVIDER),
        "api_base": _env("PODFLOW_LLM_API_BASE"),
        "llm_model": _env("PODFLOW_LLM_MODEL", DEFAULT_LLM_MODEL),
    }


def _tts_config(engine: str, output_dir: Path) -> TTSConfig:
    return TTSConfig(
        engine=engine,
        default_voice=_env("PODFLOW_TTS_VOICE", "zh-CN-XiaoxiaoNeural"),
        output_dir=str(output_dir / "voice_segments"),
        output_format="mp3",
        doubao_app_id=_env("PODFLOW_DOUBAO_APP_ID"),
        doubao_access_token=_env("PODFLOW_DOUBAO_ACCESS_TOKEN"),
    )


def _default_episode_id() -> str:
    return f"auto_{datetime.now().strftime('%Y%m%d_%H%M')}"


def _mark_ready(materials: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [{**item, "_status": "ready"} for item in materials]


def run_auto_episode(
    *,
    output_dir: Path,
    episode_id: str,
    target_topic: str = "",
    tts_engine: str = "",
) -> dict[str, Any]:
    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "voice_segments").mkdir(parents=True, exist_ok=True)

    preset = get_default_preset()
    state: dict[str, Any] = {
        "episode_id": episode_id,
        "created_at": datetime.now().isoformat(),
        "schema_version": 1,
        "preset": preset,
        "source_inputs": [],
        "fetch_contents": [],
        "cleaned_contents": [],
        "researched_contents": [],
        "facts": [],
        "selected_topic": {},
        "selected_topics": [],
        "selected_materials": [],
        "auto_selected_items": [],
        "auto_rejected_items": [],
        "script": {},
        "edited_script": {},
        "generation_request": {},
        "voice_segments": [],
        "production_plan": {},
        "audio_outputs": {},
        "cover_path": "",
        "intro_outro_paths": {},
        "review_summary": {},
        "audio_approval": {},
        "publish_outputs": {},
        "subtitle_path": "",
        "run_report": {},
        "runtime_config": {},
        "errors": [],
        "logs": [],
    }

    apply_env_overrides(state)
    # Automation always runs in auto-execute mode unless explicitly disabled.
    state.setdefault("runtime_config", {}).setdefault("auto_execute", True)

    if target_topic:
        state["runtime_config"].setdefault("discover", {})["target_topic"] = target_topic

    # 1. Discover
    fetch_sources = _env("PODFLOW_FETCH_SOURCES")
    fetch_config = FetchConfig(
        enabled_sources=[s for s in fetch_sources.split(",") if s.strip()] if fetch_sources else [],
    )
    state = fetch_run(state, fetch_config)

    # 2. Organize
    state = preprocess_run(state, PreprocessConfig())

    # 3. Research (auto-execute passes items through; topic_selection filters)
    state = research_run(state, ResearchConfig(**_llm_kwargs()))

    # 4. Topic selection (AI-driven, env target_topic or hotlist clustering)
    state = topic_selection_run(state, TopicSelectionConfig(**_llm_kwargs()))

    # 5. Facts
    materials = _mark_ready(state.get("selected_materials", []))
    if not materials:
        state["errors"].append(
            {
                "node": "run_auto_episode",
                "message": "No materials survived topic selection; cannot build facts",
                "detail": "fetch/topic selection produced zero selected_materials",
            }
        )
        _finalize(state, output_dir)
        return state
    state["selected_materials"] = materials
    state = facts_run(
        state,
        FactsConfig(
            max_facts=20,
            selected_topic_count=preset.get("recommended_news_item_count", 7),
        ),
    )

    # 6. Script
    state = script_run(state, ScriptConfig(**_llm_kwargs()))

    # 7. TTS (free engine by default; Doubao optional via env)
    engine = (tts_engine or _env("PODFLOW_TTS_ENGINE") or DEFAULT_TTS_ENGINE).strip()
    state = tts_run(state, _tts_config(engine, output_dir))

    # 8. Assembly + cover
    state = audio_run(
        state,
        AudioPostprocessConfig(
            output_dir=str(output_dir),
            output_format="mp3",
            final_basename="final",
        ),
    )
    state = assets_run(
        state,
        AssetsConfig(output_dir=str(output_dir / "assets"), generate_cover=True),
    )

    _finalize(state, output_dir)
    return state


def _finalize(state: dict[str, Any], output_dir: Path) -> None:
    state.setdefault("run_report", {})["production_mode"] = "preview"
    state["run_report"]["preview"] = True
    state["run_report"]["preview_note"] = (
        "Free-TTS preview, no human approval. Not a formal public release."
    )
    schema_ok, schema_errors = validate_episode_run_payload(state)
    state["run_report"]["schema_validation"] = {"ok": schema_ok, "errors": schema_errors}

    write_json(output_dir / "facts.json", state.get("facts", []))
    write_json(output_dir / "script.generated.json", state.get("script", {}))
    write_json(output_dir / "script.edited.json", state.get("edited_script", {}))
    write_json(output_dir / "state.json", state)
    write_json(output_dir / "run_report.json", build_run_report(state))


def preview_failures(state: dict[str, Any]) -> list[str]:
    failures: list[str] = []
    errors = state.get("errors")
    if not isinstance(errors, list):
        failures.append("state.errors must be a list")
    audio_outputs = state.get("audio_outputs")
    audio_outputs = audio_outputs if isinstance(audio_outputs, dict) else {}
    if not Path(str(audio_outputs.get("final_audio_path") or "")).is_file():
        failures.append("final audio artifact is missing")
    if not state.get("script", {}).get("segments"):
        failures.append("script has no segments")
    return failures


def main() -> int:
    parser = argparse.ArgumentParser(description="Run an automated PodFlow preview episode.")
    parser.add_argument("--topic", default="", help="Target topic for AI selection")
    parser.add_argument("--output", default=str(DEFAULT_OUTPUT_ROOT), help="Output directory")
    parser.add_argument("--episode-id", default=_default_episode_id(), help="Episode id")
    parser.add_argument("--tts-engine", default="", help="TTS engine override")
    args = parser.parse_args()

    target_topic = args.topic.strip() or _env("PODFLOW_TARGET_TOPIC")
    state = run_auto_episode(
        output_dir=Path(args.output),
        episode_id=args.episode_id,
        target_topic=target_topic,
        tts_engine=args.tts_engine,
    )

    report = state.get("run_report", {})
    print("PodFlow Studio auto-episode completed")
    print(f"episode_id: {state.get('episode_id')}")
    print(f"mode: {report.get('production_mode', 'preview')}")
    print(f"facts: {report.get('facts', {}).get('total', 0)}")
    print(f"segments: {report.get('script', {}).get('segments', 0)}")
    print(f"audio: {state.get('audio_outputs', {}).get('final_audio_path', '')}")

    failures = preview_failures(state)
    for failure in failures:
        print(f"error: {failure}")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
