import asyncio
import base64
import json
import math
import os
import struct
import urllib.request
import uuid
import wave
from pathlib import Path
from typing import Any

from nodes.tts.config import TTSConfig
from protocol.node_runner import NodeContext
from protocol.path_utils import safe_path_part as _safe_path_part
from protocol.production_plan import (
    build_production_plan,
    update_plan_clip,
    voice_generation_key,
)


def run(state: dict[str, Any], config: TTSConfig = None) -> dict[str, Any]:
    config = config or TTSConfig()
    ctx = NodeContext("TTSNode", state)

    script = state.get("edited_script")
    script_segments = script.get("segments", []) if isinstance(script, dict) else []
    previous_voice_segments = [
        segment for segment in state.get("voice_segments", []) if isinstance(segment, dict)
    ]
    production_plan = build_production_plan(script_segments, state.get("production_plan"))
    state["production_plan"] = production_plan
    state["voice_segments"] = []

    ctx.log_start(
        f"Starting TTS conversion | source=edited_script, segments={len(script_segments)}, "
        f"clips={len(production_plan.get('clips', []))}"
    )
    if not script_segments:
        ctx.log("无脚本段落，跳过 TTS 生成")
        ctx.log_end("输出: voice_segments=0")
        return ctx.finalize(state)

    try:
        Path(config.output_dir).mkdir(parents=True, exist_ok=True)
        episode_id = _safe_path_part(state.get("episode_id", "unknown"), "unknown")

        ctx.log(f"使用引擎: {config.engine}（已有可用片段会直接复用）")
        voice_segments, reused_count = asyncio.run(
            _synthesize_plan(
                production_plan,
                previous_voice_segments,
                config,
                episode_id,
            )
        )
        state["voice_segments"] = voice_segments
        ctx.log(
            f"音频片段生成完成: {len(voice_segments)} clips, "
            f"reused={reused_count}, generated={len(voice_segments) - reused_count}"
        )
    except Exception as e:
        ctx.add_error("tts", str(e), detail=str(e))
        ctx.log(f"错误: {str(e)}")

    ctx.log_end(f"输出: voice_segments={len(state.get('voice_segments', []))}")
    return ctx.finalize(state)


async def _synthesize_plan(
    production_plan: dict[str, Any],
    previous_voice_segments: list[dict[str, Any]],
    config: TTSConfig,
    episode_id: str,
) -> tuple[list[dict[str, Any]], int]:
    engine = (config.engine or "mock").lower()
    supported_engines = {
        "mock",
        "edge-tts",
        "openai-compatible",
        "doubao_tts",
        "voice_clone",
    }
    clips = [clip for clip in production_plan.get("clips", []) if isinstance(clip, dict)]
    if any(clip.get("source", "tts") == "tts" for clip in clips) and engine not in supported_engines:
        raise ValueError(f"Unsupported TTS engine: {config.engine}")

    previous_by_id = {
        str(segment.get("segment_id")): segment
        for segment in previous_voice_segments
        if segment.get("segment_id")
    }
    segments: list[dict[str, Any]] = []
    reused_count = 0

    for clip_index, clip in enumerate(clips, start=1):
        clip_id = str(clip.get("id") or f"clip_{clip_index:03d}")
        text = str(clip.get("text") or "").strip()
        if not text:
            continue
        source = str(clip.get("source") or "tts")
        previous = previous_by_id.get(clip_id, {})

        if source in {"recording", "local"}:
            filepath = str(clip.get("path") or previous.get("path") or "")
            if not filepath or not Path(filepath).is_file():
                raise RuntimeError(f"Audio source for clip {clip_id} is missing: {filepath or '(empty)'}")
            segment_engine = "recording" if source == "recording" else "local"
            voice = str(previous.get("voice") or source)
            duration_seconds = _audio_duration_seconds(filepath)
            generation_key = ""
            reused_count += 1
        else:
            voice = config.voice_mapping.get(str(clip.get("speaker") or ""), config.default_voice)
            generation_key = voice_generation_key(
                text=text,
                engine=engine,
                voice=voice,
                rate=config.rate,
                volume=config.volume,
            )
            previous_path = str(previous.get("path") or "")
            if (
                previous.get("generation_key") == generation_key
                and previous_path
                and Path(previous_path).is_file()
            ):
                filepath = previous_path
                duration_seconds = float(previous.get("duration_seconds") or _audio_duration_seconds(filepath))
                reused_count += 1
            else:
                output_format = "wav" if engine == "mock" else _normalize_output_format(config.output_format)
                safe_clip_id = _safe_path_part(clip_id, f"clip_{clip_index:03d}")
                filepath = os.path.join(config.output_dir, f"{episode_id}_{safe_clip_id}.{output_format}")
                if engine == "mock":
                    _write_mock_wav(filepath, text)
                elif engine == "edge-tts":
                    await _synthesize_edge_tts(text, voice, filepath, config)
                elif engine == "openai-compatible":
                    _synthesize_openai_compatible(text, voice, filepath, config)
                elif engine in {"doubao_tts", "voice_clone"}:
                    _synthesize_doubao(text, voice, filepath, config)
                duration_seconds = _audio_duration_seconds(filepath)
            segment_engine = engine

        segment = _voice_segment(
            clip,
            filepath,
            segment_engine,
            voice,
            clip_index,
            duration_seconds=duration_seconds,
            generation_key=generation_key,
        )
        segments.append(segment)
        update_plan_clip(
            production_plan,
            clip_id,
            {
                "path": filepath,
                "duration_seconds": duration_seconds,
                "generation_key": generation_key,
            },
        )

    return segments, reused_count


def _voice_segment(
    segment: dict[str, Any],
    filepath: str,
    engine: str,
    voice: str,
    segment_index: int,
    *,
    duration_seconds: float = 0.0,
    generation_key: str = "",
) -> dict[str, Any]:
    return {
        "segment_id": segment.get("id") or f"seg_{segment_index:03d}",
        "parent_segment_id": segment.get("parent_segment_id") or segment.get("id") or "",
        "path": filepath,
        "text": segment.get("text", ""),
        "speaker": segment.get("speaker", "Host A"),
        "source_fact_ids": segment.get("source_fact_ids", []),
        "engine": engine,
        "voice": voice,
        "duration_seconds": duration_seconds,
        "generation_key": generation_key,
    }


def _audio_duration_seconds(filepath: str) -> float:
    try:
        from pydub import AudioSegment

        return round(len(AudioSegment.from_file(filepath)) / 1000.0, 3)
    except Exception:
        try:
            with wave.open(filepath, "rb") as wav:
                return round(wav.getnframes() / wav.getframerate(), 3)
        except Exception:
            return 0.0


def _normalize_output_format(output_format: str) -> str:
    fmt = (output_format or "mp3").lower().lstrip(".")
    return fmt if fmt in {"mp3", "wav", "opus", "aac", "flac"} else "mp3"


async def _synthesize_edge_tts(text: str, voice: str, filepath: str, config: TTSConfig) -> None:
    import edge_tts

    communicate = edge_tts.Communicate(text, voice, rate=config.rate, volume=config.volume)
    await communicate.save(filepath)


def _synthesize_openai_compatible(text: str, voice: str, filepath: str, config: TTSConfig) -> None:
    api_key = (config.api_key or "").strip()
    api_base = (config.api_base or "").strip().rstrip("/")
    model = (config.model or "").strip()
    if not api_key or not api_base or not model:
        raise ValueError("OpenAI-compatible TTS requires api_key, api_base and model")

    output_format = _normalize_output_format(config.output_format)
    payload = {
        "model": model,
        "voice": voice or config.default_voice or "alloy",
        "input": text,
        "response_format": output_format,
    }
    req = urllib.request.Request(
        f"{api_base}/audio/speech",
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=config.timeout_seconds) as response:
        body = response.read()
    Path(filepath).write_bytes(body)


def _synthesize_doubao(text: str, voice: str, filepath: str, config: TTSConfig) -> None:
    app_id = (config.doubao_app_id or "").strip()
    access_token = (config.doubao_access_token or "").strip()
    cluster = (config.doubao_cluster or "").strip()
    voice_type = (voice or config.doubao_voice_type or config.default_voice or "").strip()
    endpoint = (config.doubao_endpoint or "").strip()
    resource_id = (config.doubao_resource_id or "").strip()
    if not app_id or not access_token or not cluster or not voice_type or not endpoint:
        raise ValueError(
            "Doubao TTS requires doubao_app_id, doubao_access_token, "
            "doubao_cluster, doubao_voice_type and doubao_endpoint"
        )

    output_format = _normalize_output_format(config.output_format)
    encoding = "ogg_opus" if output_format == "opus" else output_format
    if encoding not in {"mp3", "wav", "ogg_opus"}:
        raise ValueError(f"Doubao TTS does not support output format: {output_format}")

    payload = {
        "app": {
            "appid": app_id,
            "token": access_token,
            "cluster": cluster,
        },
        "user": {"uid": "podflow-studio"},
        "audio": {
            "voice_type": voice_type,
            "encoding": encoding,
            "speed_ratio": _doubao_speed_ratio(config.rate),
        },
        "request": {
            "reqid": str(uuid.uuid4()),
            "text": text,
            "operation": "query",
        },
    }
    headers = {
        "Authorization": f"Bearer;{access_token}",
        "Content-Type": "application/json",
    }
    if resource_id:
        headers["Resource-Id"] = resource_id
    req = urllib.request.Request(
        endpoint,
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers=headers,
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=config.timeout_seconds) as response:
        response_body = response.read()

    try:
        result = json.loads(response_body.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ValueError("Doubao TTS returned an invalid JSON response") from exc
    if result.get("code") != 3000:
        message = result.get("message") or "unknown error"
        raise ValueError(f"Doubao TTS failed: {message} (code={result.get('code')})")
    audio_data = result.get("data")
    if not isinstance(audio_data, str) or not audio_data:
        raise ValueError("Doubao TTS response did not contain audio data")
    try:
        decoded_audio = base64.b64decode(audio_data, validate=True)
    except (ValueError, TypeError) as exc:
        raise ValueError("Doubao TTS returned invalid base64 audio data") from exc
    if not decoded_audio:
        raise ValueError("Doubao TTS returned empty audio data")
    Path(filepath).write_bytes(decoded_audio)


def _doubao_speed_ratio(rate: str) -> float:
    value = (rate or "+0%").strip()
    if value.endswith("%"):
        try:
            ratio = 1.0 + float(value[:-1]) / 100.0
        except ValueError:
            ratio = 1.0
    else:
        try:
            ratio = float(value)
        except ValueError:
            ratio = 1.0
    return round(min(2.0, max(0.1, ratio)), 2)


def _write_mock_wav(filepath: str, text: str) -> None:
    Path(filepath).parent.mkdir(parents=True, exist_ok=True)
    sample_rate = 16_000
    duration = min(3.0, max(0.45, len(text) / 85.0))
    total_frames = int(sample_rate * duration)
    frequency = 440.0
    amplitude = 1200
    with wave.open(filepath, "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(sample_rate)
        for i in range(total_frames):
            sample = int(amplitude * math.sin(2 * math.pi * frequency * (i / sample_rate)))
            wav.writeframes(struct.pack("<h", sample))
