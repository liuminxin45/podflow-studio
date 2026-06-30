from pathlib import Path
from typing import Any
from nodes.audio_postprocess.config import AudioPostprocessConfig


def run(state: dict[str, Any], config: AudioPostprocessConfig = None) -> dict[str, Any]:
    config = config or AudioPostprocessConfig()
    logs = state.get("logs", [])
    errors = state.get("errors", [])

    logs.append("[AudioPostprocessNode] Starting audio postprocess")
    segments = state.get("audio_segments", []) or [
        item.get("path") for item in state.get("recording_segments", []) if isinstance(item, dict)
    ]

    try:
        Path(config.output_dir).mkdir(parents=True, exist_ok=True)
        episode_id = state.get("episode_id", "unknown")

        if not segments:
            logs.append("[AudioPostprocessNode] No audio segments to process")
            state["logs"] = logs
            state["errors"] = errors
            return state

        from pydub import AudioSegment

        combined = AudioSegment.empty()
        used_segments = []
        for item in segments:
            seg_path = _resolve_segment_path(item)
            if not seg_path:
                continue
            path = Path(seg_path)
            if path.exists() and path.is_file():
                combined += AudioSegment.from_file(path)
                used_segments.append(str(path))
            else:
                logs.append(f"[AudioPostprocessNode] Missing segment skipped: {seg_path}")

        if not used_segments or len(combined) == 0:
            raise RuntimeError(
                "No readable audio segments found. Check TTS output, recording files, and ffmpeg installation."
            )

        output_path = str(Path(config.output_dir) / f"{episode_id}.{config.output_format}")
        combined.export(output_path, format=config.output_format)

        state["final_audio_path"] = output_path
        state["audio_metadata"] = {
            "duration_seconds": len(combined) / 1000.0,
            "format": config.output_format,
            "segments_count": len(used_segments),
            "source_segments": used_segments,
            "file_size": Path(output_path).stat().st_size if Path(output_path).exists() else 0,
        }
        logs.append(f"[AudioPostprocessNode] Output: {output_path} ({len(combined) / 1000:.1f}s)")
    except Exception as e:
        errors.append({"node": "audio_postprocess", "message": str(e), "detail": str(e)})

    state["logs"] = logs
    state["errors"] = errors
    return state


def _resolve_segment_path(item: Any) -> str:
    if isinstance(item, str):
        return item
    if isinstance(item, dict):
        return str(item.get("path") or item.get("file") or item.get("audio_path") or "")
    return ""
