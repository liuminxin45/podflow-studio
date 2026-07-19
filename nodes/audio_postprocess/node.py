import math
import wave
from pathlib import Path
from typing import Any

from nodes.audio_postprocess.config import AudioPostprocessConfig
from protocol.artifact_utils import file_fingerprint
from protocol.morning_news import build_run_report, write_json
from protocol.node_runner import NodeContext
from protocol.path_utils import safe_path_part as _safe_path_part


def run(state: dict[str, Any], config: AudioPostprocessConfig = None) -> dict[str, Any]:
    config = config or AudioPostprocessConfig()
    ctx = NodeContext("AudioPostprocessNode", state)
    segments = _collect_segments(state)
    production_plan = state.get("production_plan") if isinstance(state.get("production_plan"), dict) else {}
    has_production_plan = bool(production_plan.get("clips"))
    plan_render = production_plan.get("render") if isinstance(production_plan.get("render"), dict) else {}
    requested_format = _normalize_format(plan_render.get("output_format") or config.output_format)

    ctx.log_start(
        f"AudioAssembly starting | segments={len(segments)}, output={requested_format}, "
        f"plan={'v1' if has_production_plan else 'legacy'}"
    )

    state["audio_outputs"] = {}

    try:
        output_dir = _episode_output_dir(config.output_dir, state.get("episode_id", "unknown"))
        output_dir.mkdir(parents=True, exist_ok=True)
        if not segments:
            ctx.log("No audio segments to process")
            state["audio_outputs"] = {"status": "skipped", "reason": "no_voice_segments"}
            build_run_report(state)
            ctx.log_end("输出: final_audio_path=(empty)")
            return ctx.finalize(state)

        readable = [seg for seg in segments if seg.get("path") and Path(seg["path"]).is_file()]
        missing = [
            str(seg.get("path") or f"(clip:{seg.get('segment_id') or 'unknown'})")
            for seg in segments
            if not seg.get("path") or not Path(seg["path"]).is_file()
        ]
        if not readable:
            raise RuntimeError("No readable audio segments found.")
        if missing and not config.allow_missing_segments:
            raise RuntimeError(
                f"Audio assembly stopped because {len(missing)} source segment(s) are missing: "
                + ", ".join(missing)
            )
        bgm_path: Path | None = None
        if config.add_bgm:
            bgm_path = Path(config.bgm_path).expanduser().resolve()
            if not config.bgm_path or not bgm_path.is_file():
                raise RuntimeError(f"Configured BGM file does not exist: {config.bgm_path or '(empty)'}")

        final_basename = _safe_path_part(config.final_basename, "final")
        output_path = output_dir / f"{final_basename}.{requested_format}"
        degraded = False
        operations = ["merge_voice_segments"]
        if has_production_plan:
            operations.append("production_plan_v1")
        else:
            operations.append(f"segment_pause_{config.segment_pause_ms}ms")

        try:
            final_path, duration_seconds = _assemble_with_pydub(
                readable,
                output_path,
                requested_format,
                config,
                operations,
                bgm_path,
                production_plan,
            )
        except Exception as pydub_error:
            if config.add_bgm or has_production_plan:
                raise RuntimeError(
                    f"Production-plan rendering requires a working pydub/ffmpeg path: {pydub_error}"
                ) from pydub_error
            degraded = True
            ctx.log(f"pydub/ffmpeg path unavailable, falling back to WAV assembly: {pydub_error}")
            final_path, duration_seconds = _assemble_wav_fallback(
                readable,
                output_dir / f"{final_basename}.wav",
                config.segment_pause_ms,
            )
            operations.append("fallback_wave_assembly")

        final_path = Path(final_path)
        source_engines = sorted(
            {
                str(segment.get("engine") or "unknown")
                for segment in readable
            }
        )
        contains_mock_audio = "mock" in source_engines
        audio_outputs = {
            "status": "ok",
            "final_audio_path": str(final_path),
            "format": final_path.suffix.lstrip("."),
            "requested_format": requested_format,
            "degraded": degraded,
            "duration_seconds": duration_seconds,
            "segments_count": len(readable),
            "source_segments": [seg["path"] for seg in readable],
            "source_engines": source_engines,
            "contains_mock_audio": contains_mock_audio,
            "missing_segments": missing,
            "operations": operations,
            "file_size": final_path.stat().st_size if final_path.exists() else 0,
            "audio_artifact": file_fingerprint(final_path),
        }
        audio_report_path = output_dir / "audio_report.json"
        audio_outputs["audio_report_path"] = str(audio_report_path)
        write_json(audio_report_path, audio_outputs)
        state["audio_outputs"] = audio_outputs
        build_run_report(state)
        ctx.log(f"AudioAssembly output: {final_path} ({duration_seconds:.1f}s)")
    except Exception as e:
        ctx.add_error("audio_postprocess", str(e), detail=str(e))
        state["audio_outputs"] = {"status": "error", "message": str(e)}
        build_run_report(state)

    ctx.log_end(
        f"输出: final_audio_path={state.get('audio_outputs', {}).get('final_audio_path', '')}"
    )
    return ctx.finalize(state)


def _collect_segments(state: dict[str, Any]) -> list[dict[str, Any]]:
    voice_segments = state.get("voice_segments", [])
    production_plan = state.get("production_plan")
    if isinstance(production_plan, dict) and production_plan.get("clips"):
        voice_by_id = {
            str(segment.get("segment_id")): segment
            for segment in voice_segments
            if isinstance(segment, dict) and segment.get("segment_id")
        }
        return [
            {
                "path": str(clip.get("path") or voice_by_id.get(str(clip.get("id")), {}).get("path") or ""),
                "segment_id": str(clip.get("id") or ""),
                "engine": str(
                    voice_by_id.get(str(clip.get("id")), {}).get("engine")
                    or clip.get("source")
                    or "unknown"
                ),
                "trim_start_ms": max(0, int(clip.get("trim_start_ms") or 0)),
                "trim_end_ms": max(0, int(clip.get("trim_end_ms") or 0)),
            }
            for clip in production_plan.get("clips", [])
            if isinstance(clip, dict)
        ]
    if voice_segments:
        return [
            {
                "path": str(seg.get("path", "")),
                "segment_id": seg.get("segment_id", ""),
                "engine": str(seg.get("engine") or "unknown"),
            }
            for seg in voice_segments
            if isinstance(seg, dict) and seg.get("path")
        ]
    return []


def _assemble_with_pydub(
    segments: list[dict[str, Any]],
    output_path: Path,
    output_format: str,
    config: AudioPostprocessConfig,
    operations: list[str],
    bgm_path: Path | None,
    production_plan: dict[str, Any] | None = None,
) -> tuple[Path, float]:
    from pydub import AudioSegment, effects, silence

    production_plan = production_plan if isinstance(production_plan, dict) else {}
    has_plan = bool(production_plan.get("clips"))
    plan_render = production_plan.get("render") if isinstance(production_plan.get("render"), dict) else {}
    normalize_loudness = (
        plan_render.get("normalize_loudness", True) if has_plan else config.normalize_loudness
    )
    joins = {
        str(join.get("after_clip_id")): join
        for join in production_plan.get("joins", [])
        if isinstance(join, dict) and join.get("after_clip_id")
    }
    music = production_plan.get("music") if isinstance(production_plan.get("music"), dict) else {}

    combined = AudioSegment.empty()
    for idx, segment in enumerate(segments):
        chunk = AudioSegment.from_file(segment["path"])
        if config.trim_silence:
            chunks = silence.split_on_silence(chunk, silence_thresh=chunk.dBFS - 16)
            if chunks:
                chunk = sum(chunks, AudioSegment.empty())
                operations.append("trim_silence")
        trim_start_ms = min(len(chunk), max(0, int(segment.get("trim_start_ms") or 0)))
        trim_end_ms = min(len(chunk) - trim_start_ms, max(0, int(segment.get("trim_end_ms") or 0)))
        if trim_start_ms or trim_end_ms:
            end_at = len(chunk) - trim_end_ms if trim_end_ms else len(chunk)
            if end_at <= trim_start_ms:
                raise RuntimeError(f"Clip {segment.get('segment_id')} is fully removed by trim settings.")
            chunk = chunk[trim_start_ms:end_at]
            operations.append(f"trim_clip_{segment.get('segment_id')}")
        micro_fade = min(10, max(0, len(chunk) // 4))
        if micro_fade:
            chunk = chunk.fade_in(micro_fade).fade_out(micro_fade)
        if normalize_loudness:
            chunk = effects.normalize(chunk)
        combined += chunk
        if idx < len(segments) - 1:
            join = joins.get(str(segment.get("segment_id"))) if has_plan else None
            if join and join.get("type") == "transition":
                transition = _music_clip(AudioSegment, music.get("transition"), join.get("duration_ms"))
                combined += transition
                operations.append(f"transition_after_{segment.get('segment_id')}")
            else:
                pause_ms = int(join.get("duration_ms", 600)) if join else config.segment_pause_ms
                if pause_ms:
                    combined += AudioSegment.silent(duration=pause_ms)
                    if has_plan:
                        operations.append(f"pause_{segment.get('segment_id')}_{pause_ms}ms")

    if normalize_loudness:
        combined = effects.normalize(combined)
        operations.append("normalize_loudness")

    if has_plan:
        bed_slot = music.get("bed") if isinstance(music.get("bed"), dict) else {}
        if bed_slot.get("enabled"):
            background = _looping_music(AudioSegment, bed_slot, len(combined))
            combined = combined.overlay(background)
            operations.extend(["mix_bgm", "mix_bed_music"])

        intro_slot = music.get("intro") if isinstance(music.get("intro"), dict) else {}
        if intro_slot.get("enabled"):
            intro = _music_clip(AudioSegment, intro_slot)
            crossfade = min(int(intro_slot.get("fade_out_ms") or 0), len(intro), len(combined))
            combined = intro.append(combined, crossfade=crossfade)
            operations.append("mix_intro_music")

        outro_slot = music.get("outro") if isinstance(music.get("outro"), dict) else {}
        if outro_slot.get("enabled"):
            outro = _music_clip(AudioSegment, outro_slot)
            crossfade = min(int(outro_slot.get("fade_in_ms") or 0), len(outro), len(combined))
            combined = combined.append(outro, crossfade=crossfade)
            operations.append("mix_outro_music")
    elif config.add_bgm:
        if bgm_path is None:
            raise RuntimeError("Configured BGM path was not resolved.")
        bgm = AudioSegment.from_file(str(bgm_path))
        if len(bgm) <= 0:
            raise RuntimeError("Configured BGM file is empty.")
        repeats = max(1, math.ceil(len(combined) / len(bgm)))
        background = (bgm * repeats)[: len(combined)]
        volume = max(0.0001, min(1.0, config.bgm_volume))
        background = background.apply_gain(20 * math.log10(volume))
        combined = combined.overlay(background)
        operations.extend(
            [
                "mix_bgm",
                f"bgm_volume_{round(volume * 100)}pct",
                f"bgm_source_{bgm_path.name}",
            ]
        )

    combined.export(str(output_path), format=output_format)
    return output_path, len(combined) / 1000.0


def _resolve_music_path(slot: Any) -> Path:
    if not isinstance(slot, dict):
        raise RuntimeError("Music slot is invalid.")
    raw_path = str(slot.get("path") or "")
    path = Path(raw_path).expanduser().resolve() if raw_path else None
    if path is None or not path.is_file():
        raise RuntimeError(f"Configured music file does not exist: {raw_path or '(empty)'}")
    return path


def _music_clip(AudioSegment, slot: Any, requested_duration_ms: Any = None):
    path = _resolve_music_path(slot)
    audio = AudioSegment.from_file(str(path))
    if len(audio) <= 0:
        raise RuntimeError(f"Configured music file is empty: {path}")
    duration_ms = max(1, int(requested_duration_ms or slot.get("duration_ms") or len(audio)))
    repeats = max(1, math.ceil(duration_ms / len(audio)))
    audio = (audio * repeats)[:duration_ms]
    volume = max(0.0001, min(1.0, float(slot.get("volume", 0.15))))
    audio = audio.apply_gain(20 * math.log10(volume))
    fade_in_ms = min(len(audio), max(0, int(slot.get("fade_in_ms") or 0)))
    fade_out_ms = min(len(audio), max(0, int(slot.get("fade_out_ms") or 0)))
    if fade_in_ms:
        audio = audio.fade_in(fade_in_ms)
    if fade_out_ms:
        audio = audio.fade_out(fade_out_ms)
    return audio


def _looping_music(AudioSegment, slot: Any, target_duration_ms: int):
    path = _resolve_music_path(slot)
    audio = AudioSegment.from_file(str(path))
    if len(audio) <= 0:
        raise RuntimeError(f"Configured music file is empty: {path}")
    repeats = max(1, math.ceil(target_duration_ms / len(audio)))
    background = (audio * repeats)[:target_duration_ms]
    volume = max(0.0001, min(1.0, float(slot.get("volume", 0.15))))
    return background.apply_gain(20 * math.log10(volume))


def _assemble_wav_fallback(
    segments: list[dict[str, Any]],
    output_path: Path,
    segment_pause_ms: int,
) -> tuple[Path, float]:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    params = None
    frames: list[bytes] = []
    total_frames = 0

    for index, segment in enumerate(segments):
        with wave.open(segment["path"], "rb") as wav:
            current = wav.getparams()
            if params is None:
                params = current
            elif (
                current.nchannels != params.nchannels
                or current.sampwidth != params.sampwidth
                or current.framerate != params.framerate
            ):
                raise RuntimeError("WAV fallback requires matching channel count, width and rate.")
            data = wav.readframes(current.nframes)
            frames.append(data)
            total_frames += current.nframes
            pause_frames = int(current.framerate * (segment_pause_ms / 1000)) if index < len(segments) - 1 else 0
            if pause_frames:
                frames.append(b"\x00" * pause_frames * current.nchannels * current.sampwidth)
                total_frames += pause_frames

    if params is None:
        raise RuntimeError("No WAV segments available for fallback assembly.")

    with wave.open(str(output_path), "wb") as out:
        out.setnchannels(params.nchannels)
        out.setsampwidth(params.sampwidth)
        out.setframerate(params.framerate)
        out.writeframes(b"".join(frames))

    return output_path, total_frames / params.framerate


def _normalize_format(output_format: str) -> str:
    fmt = (output_format or "mp3").lower().lstrip(".")
    return fmt if fmt in {"mp3", "wav", "aac", "flac", "opus"} else "mp3"


def _episode_output_dir(base_dir: str, episode_id: Any) -> Path:
    return Path(base_dir).expanduser() / _safe_path_part(episode_id, "unknown")
