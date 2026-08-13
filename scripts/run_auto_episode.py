"""Run a full auto episode: fetch -> facts -> script -> TTS -> assembly.

This is the CLI / GitHub Actions automation path. It produces an episode that
is explicitly marked ``unreviewed`` (no human approval); it never touches the
formal publish gate. LLM calls default to DeepSeek (OpenAI-compatible) and TTS
defaults to the free edge-tts engine.

Topic selection is driven by ``PODFLOW_TARGET_TOPIC`` (or ``--topic``). Without
a topic the pipeline falls back to hotlist clustering.

Exit code 0 on success, non-zero when the episode cannot be assembled.
"""

# ruff: noqa: E402

from __future__ import annotations

import argparse
import os
import sys
import time
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
DEFAULT_LLM_PROVIDER = "deepseek"
DEFAULT_LLM_MODEL = "deepseek-chat"
DEFAULT_TTS_ENGINE = "edge-tts"


def _env(name: str, default: str = "") -> str:
    return os.environ.get(name, default).strip()


def _list_env(name: str) -> list[str]:
    return [part.strip() for part in os.environ.get(name, "").split(",") if part.strip()]


def _resolve_rss_urls(state: dict[str, Any]) -> list[str]:
    urls = _list_env("PODFLOW_RSS_URLS")
    rc_rss = state.get("runtime_config", {}).get("fetch", {}).get("rss_urls", [])
    urls.extend(u.strip() for u in (rc_rss or []) if isinstance(u, str) and u.strip())
    seen: set[str] = set()
    out: list[str] = []
    for u in urls:
        if u not in seen:
            seen.add(u)
            out.append(u)
    return out


def _llm_kwargs() -> dict[str, Any]:
    """LLM config for research / topic_selection / script nodes.

    The API key is intentionally left empty: ``protocol.llm_runtime`` resolves
    it from the environment (``DEEPSEEK_API_KEY`` / ``PODFLOW_LLM_API_KEY``) so
    secrets never persist into the workflow state.
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


def _stage(label: str, count: int) -> None:
    print(f"[stage] {label}: {count} items", flush=True)


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

    # 1. Discover (with one retry for transient source failures)
    fetch_sources = _env("PODFLOW_FETCH_SOURCES")
    rss_urls = _resolve_rss_urls(state)
    fetch_config = FetchConfig(
        enabled_sources=[s for s in fetch_sources.split(",") if s.strip()] if fetch_sources else [],
        rss_urls=rss_urls,
    )
    state = fetch_run(state, fetch_config)
    if not state.get("fetch_contents"):
        fetch_errs = [e for e in state.get("errors", []) if e.get("node") == "fetch"]
        print(
            f"[retry] fetch returned 0 items; retrying once after cooldown "
            f"({len(fetch_errs)} fetch error(s))",
            flush=True,
        )
        time.sleep(15)
        state = fetch_run(state, fetch_config)
    _stage("fetch", len(state.get("fetch_contents", [])))

    # 2. Organize
    state = preprocess_run(state, PreprocessConfig())
    _stage("preprocess", len(state.get("cleaned_contents", [])))

    # 3. Research (auto-execute passes items through; topic_selection filters)
    state = research_run(state, ResearchConfig(**_llm_kwargs()))
    _stage("research", len(state.get("researched_contents", [])))

    # 4. Topic selection (AI-driven, env target_topic or hotlist clustering)
    state = topic_selection_run(state, TopicSelectionConfig(**_llm_kwargs()))
    _stage("topic_selection", len(state.get("selected_materials", [])))

    # 5. Facts
    materials = _mark_ready(state.get("selected_materials", []))
    if not materials:
        fetch_errs = [e for e in state.get("errors", []) if e.get("node") == "fetch"]
        fetch_summary = "; ".join(
            f"{e.get('source', '?')}: {e.get('message', '')}" for e in fetch_errs[:5]
        )
        state["errors"].append(
            {
                "node": "run_auto_episode",
                "message": "No materials survived topic selection; cannot build facts",
                "detail": (
                    "fetch produced "
                    f"{len(state.get('fetch_contents', []))} items; "
                    f"fetch errors: {fetch_summary or 'none'}"
                ),
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
    _stage("facts", len(state.get("facts", [])))

    # 6. Script
    state = script_run(state, ScriptConfig(**_llm_kwargs()))
    _stage("script", len(state.get("script", {}).get("segments", [])))

    # 7. TTS (free engine by default; Doubao optional via env)
    engine = (tts_engine or _env("PODFLOW_TTS_ENGINE") or DEFAULT_TTS_ENGINE).strip()
    state = tts_run(state, _tts_config(engine, output_dir))
    _stage("tts", len(state.get("voice_segments", [])))

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


def _script_generated_by(state: dict[str, Any]) -> str:
    return str(state.get("script", {}).get("generated_by") or "")


def _write_player(state: dict[str, Any], output_dir: Path) -> None:
    """Write a self-contained play.html so the downloaded zip opens a local
    player (GitHub Artifacts cannot stream audio in the browser)."""
    audio_rel = Path(str(state.get("audio_outputs", {}).get("final_audio_path") or ""))
    audio_name = audio_rel.name or "final.mp3"
    title = state.get("script", {}).get("title") or state.get("episode_id") or "PodFlow 晨报"
    generated_by = _script_generated_by(state)
    llm_label = "DeepSeek" if generated_by == "llm" else f"deterministic 兜底 ({generated_by or 'unknown'})"
    segments = state.get("script", {}).get("segments", []) or []
    notes = "".join(
        f"<li><span class='t'>{i:02d}</span> {s.get('title','')}</li>"
        for i, s in enumerate(segments, 1)
        if isinstance(s, dict)
    )
    html_doc = f"""<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{title}</title>
<style>
 body{{font-family:-apple-system,'Segoe UI',Roboto,'PingFang SC','Microsoft YaHei',sans-serif;
  background:#0b1020;color:#e8ecf6;margin:0;display:flex;justify-content:center;padding:40px 16px}}
 .card{{width:100%;max-width:640px;background:#151b30;border:1px solid #26304f;border-radius:16px;padding:28px}}
 h1{{font-size:20px;margin:0 0 6px}}
 .meta{{font-size:13px;color:#93a0c0;margin-bottom:20px}}
 audio{{width:100%;margin-bottom:20px}}
 ul{{list-style:none;padding:0;margin:0;max-height:320px;overflow:auto}}
 li{{padding:8px 10px;border-bottom:1px solid #232c4a;font-size:14px}}
 .t{{color:#5b6cff;font-weight:600;margin-right:8px}}
 .badge{{display:inline-block;background:#1d2a52;color:#9db0ff;border-radius:999px;
  padding:2px 10px;font-size:12px;margin-left:6px}}
</style></head><body>
<div class="card">
  <h1>{title}<span class="badge">{llm_label}</span></h1>
  <div class="meta">{state.get('episode_id','')} · 未人工终审 · 由自动化链路生成</div>
  <audio controls preload="metadata" src="{audio_name}">此浏览器不支持音频播放。</audio>
  <ul>{notes}</ul>
</div>
</body></html>"""
    (output_dir / "play.html").write_text(html_doc, encoding="utf-8")


def _finalize(state: dict[str, Any], output_dir: Path) -> None:
    state.setdefault("run_report", {})["unreviewed"] = True
    state["run_report"]["automated"] = True
    state["run_report"]["unreviewed_note"] = (
        "Automated episode without human approval."
    )
    # LLM signal: "llm" means the LLM wrote the script; anything else means a
    # deterministic fallback was used (LLM unavailable/failed).
    generated_by = _script_generated_by(state)
    state["run_report"]["script_generated_by"] = generated_by
    state["run_report"]["llm_used"] = generated_by == "llm"
    schema_ok, schema_errors = validate_episode_run_payload(state)
    state["run_report"]["schema_validation"] = {"ok": schema_ok, "errors": schema_errors}

    write_json(output_dir / "facts.json", state.get("facts", []))
    write_json(output_dir / "script.generated.json", state.get("script", {}))
    write_json(output_dir / "script.edited.json", state.get("edited_script", {}))
    write_json(output_dir / "state.json", state)
    write_json(output_dir / "run_report.json", build_run_report(state))
    _write_player(state, output_dir)


def assembly_failures(state: dict[str, Any]) -> list[str]:
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
    parser = argparse.ArgumentParser(description="Run an automated PodFlow episode.")
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
    print(f"unreviewed: {report.get('unreviewed', False)}")
    print(f"facts: {report.get('facts', {}).get('total', 0)}")
    print(f"segments: {report.get('script', {}).get('segments', 0)}")
    generated_by = report.get("script_generated_by") or _script_generated_by(state)
    print(f"llm_used: {report.get('llm_used', generated_by == 'llm')}")
    print(f"script_generated_by: {generated_by}")
    print(f"audio: {state.get('audio_outputs', {}).get('final_audio_path', '')}")

    # Surface per-node errors so CI logs show the real cause instead of a bare
    # "script has no segments".
    node_errors = state.get("errors", [])
    if node_errors:
        print(f"node errors: {len(node_errors)}")
        for err in node_errors:
            if not isinstance(err, dict):
                continue
            print(f"  [{err.get('node', '?')}] {err.get('message', '')}")

    failures = assembly_failures(state)
    for failure in failures:
        print(f"error: {failure}")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
