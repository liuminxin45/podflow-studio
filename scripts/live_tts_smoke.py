"""Live TTS smoke test for real provider validation."""

# ruff: noqa: E402

from __future__ import annotations

import argparse
import os
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from nodes.audio_postprocess.config import AudioPostprocessConfig
from nodes.audio_postprocess.node import run as audio_run
from nodes.tts.config import TTSConfig
from nodes.tts.node import run as tts_run
from protocol.morning_news import build_run_report, write_json
from protocol.presets import get_default_preset


def run_live_tts_smoke(engine: str, output_dir: Path) -> dict:
    output_dir.mkdir(parents=True, exist_ok=True)
    voice_dir = output_dir / "voice_segments"
    voice_dir.mkdir(parents=True, exist_ok=True)
    state = {
        "schema_version": 1,
        "episode_id": f"live_tts_smoke_{engine.replace('-', '_')}",
        "created_at": datetime.now().isoformat(),
        "preset": get_default_preset(),
        "source_inputs": [],
        "facts": [
            {
                "id": "fact_001",
                "title": "真实 TTS 验证",
                "summary": "用于确认真实语音服务可以生成音频。",
                "source_title": "PodFlow Studio",
                "source_url": "https://podflow.local/live-tts-smoke",
                "published_at": datetime.now().isoformat(),
                "claim": "真实 TTS smoke test 必须产出可读音频文件。",
                "confidence": "high",
                "used_in_segments": ["seg_001"],
            }
        ],
        "selected_topics": [{"id": "topic_001", "title": "真实 TTS 验证", "fact_id": "fact_001"}],
        "script": {},
        "edited_script": {
            "id": "live_tts_smoke_script",
            "title": "真实 TTS 验证",
            "description": "PodFlow Studio 真实语音服务连通性验证。",
            "content_type": "news_brief",
            "preset_id": "morning_news_brief",
            "num_hosts": 1,
            "language": "zh-CN",
            "segments": [
                {
                    "id": "seg_001",
                    "type": "quick_news",
                    "title": "真实语音验证",
                    "text": "这是一段 PodFlow Studio 真实语音合成验证音频。",
                    "source_fact_ids": ["fact_001"],
                    "estimated_seconds": 8,
                    "speaker": "Host A",
                }
            ],
        },
        "voice_segments": [],
        "audio_outputs": {},
        "publish_outputs": {},
        "run_report": {},
        "logs": [],
        "errors": [],
        "runtime_config": {},
    }
    tts_config = _build_tts_config(engine, voice_dir)
    state = tts_run(state, tts_config)
    tts_errors = [err for err in state.get("errors", []) if err.get("node") == "tts"]
    if tts_errors:
        raise RuntimeError(f"Live TTS failed: {tts_errors[0].get('message')}")
    if not state.get("voice_segments") or not Path(state["voice_segments"][0]["path"]).exists():
        raise RuntimeError("Live TTS did not produce a readable voice segment")

    state = audio_run(
        state,
        AudioPostprocessConfig(output_dir=str(output_dir), output_format="mp3", final_basename="final"),
    )
    final_audio_path = state.get("audio_outputs", {}).get("final_audio_path", "")
    if not final_audio_path or not Path(final_audio_path).exists():
        raise RuntimeError("AudioAssembly did not produce final audio after live TTS")

    validation = {
        "ok": True,
        "engine": engine,
        "voice_segments": len(state.get("voice_segments", [])),
        "final_audio_path": final_audio_path,
        "validated_at": datetime.now().isoformat(),
    }
    state.setdefault("run_report", {})["tts_live_validation"] = validation
    write_json(output_dir / "tts_live_report.json", build_run_report(state))
    return state


def _build_tts_config(engine: str, voice_dir: Path) -> TTSConfig:
    if engine == "openai-compatible":
        api_key = os.environ.get("PODFLOW_TTS_API_KEY") or os.environ.get("OPENAI_API_KEY", "")
        api_base = os.environ.get("PODFLOW_TTS_API_BASE") or os.environ.get("OPENAI_API_BASE", "")
        model = os.environ.get("PODFLOW_TTS_MODEL", "tts-1")
        if not api_key or not api_base or not model:
            raise RuntimeError("OpenAI-compatible live TTS requires PODFLOW_TTS_API_KEY/API_BASE/MODEL or OPENAI_API_KEY/API_BASE")
        return TTSConfig(
            engine="openai-compatible",
            api_key=api_key,
            api_base=api_base,
            model=model,
            output_format=os.environ.get("PODFLOW_TTS_OUTPUT_FORMAT", "mp3"),
            output_dir=str(voice_dir),
            default_voice=os.environ.get("PODFLOW_TTS_VOICE", "alloy"),
        )

    return TTSConfig(
        engine="edge-tts",
        output_format="mp3",
        output_dir=str(voice_dir),
        default_voice=os.environ.get("PODFLOW_EDGE_TTS_VOICE", "zh-CN-XiaoxiaoNeural"),
        voice_mapping={"Host A": os.environ.get("PODFLOW_EDGE_TTS_VOICE", "zh-CN-XiaoxiaoNeural")},
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="Run real TTS smoke test.")
    parser.add_argument("--engine", default="edge-tts", help="edge-tts or openai-compatible")
    parser.add_argument("--output", default=str(ROOT / "tmp" / "live_tts_smoke"), help="Output directory")
    args = parser.parse_args()
    state = run_live_tts_smoke(args.engine, Path(args.output))
    print("Live TTS smoke completed")
    print(f"engine: {args.engine}")
    print(f"voice_segments: {len(state.get('voice_segments', []))}")
    print(f"audio: {state.get('audio_outputs', {}).get('final_audio_path', '')}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
