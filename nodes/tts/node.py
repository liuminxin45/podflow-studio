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


def run(state: dict[str, Any], config: TTSConfig = None) -> dict[str, Any]:
    config = config or TTSConfig()
    ctx = NodeContext("TTSNode", state)

    script = state.get("edited_script")
    script_segments = script.get("segments", []) if isinstance(script, dict) else []
    # A failed regeneration must not leave a previous run looking current.
    state["voice_segments"] = []

    ctx.log_start(f"Starting TTS conversion | source=edited_script, segments={len(script_segments)}")
    if not script_segments:
        ctx.log("无脚本段落，跳过 TTS 生成")
        ctx.log_end("输出: voice_segments=0")
        return ctx.finalize(state)

    try:
        Path(config.output_dir).mkdir(parents=True, exist_ok=True)
        episode_id = _safe_path_part(state.get("episode_id", "unknown"), "unknown")

        ctx.log(f"使用引擎: {config.engine}")
        engine = (config.engine or "mock").lower()
        if engine == "mock":
            voice_segments = _synthesize_mock_all(script_segments, config, episode_id)
        elif engine in {
            "edge-tts",
            "openai-compatible",
            "doubao_tts",
            "voice_clone",
        }:
            voice_segments = asyncio.run(_synthesize_all(script_segments, config, episode_id))
        else:
            raise ValueError(f"Unsupported TTS engine: {config.engine}")
        state["voice_segments"] = voice_segments
        ctx.log(f"音频片段生成完成: {len(voice_segments)} segments")
    except Exception as e:
        ctx.add_error("tts", str(e), detail=str(e))
        ctx.log(f"错误: {str(e)}")

    ctx.log_end(f"输出: voice_segments={len(state.get('voice_segments', []))}")
    return ctx.finalize(state)


async def _synthesize_all(script_segments: list[dict[str, Any]], config: TTSConfig, episode_id: str):
    segments = []
    for segment_index, segment in enumerate(script_segments, start=1):
        text = segment.get("text", "")
        if not text:
            continue
        output_format = _normalize_output_format(config.output_format)
        filepath = os.path.join(config.output_dir, f"{episode_id}_{segment_index:03d}.{output_format}")
        voice = config.voice_mapping.get(segment.get("speaker", ""), config.default_voice)
        engine = (config.engine or "mock").lower()
        if engine == "edge-tts":
            await _synthesize_edge_tts(text, voice, filepath, config)
        elif engine == "openai-compatible":
            _synthesize_openai_compatible(text, voice, filepath, config)
        elif engine in {"doubao_tts", "voice_clone"}:
            _synthesize_doubao(text, voice, filepath, config)
        else:
            raise ValueError(f"Unsupported TTS engine: {config.engine}")
        segments.append(_voice_segment(segment, filepath, engine, voice, segment_index))
    return segments


def _synthesize_mock_all(
    script_segments: list[dict[str, Any]], config: TTSConfig, episode_id: str
) -> list[dict[str, Any]]:
    segments = []
    for segment_index, segment in enumerate(script_segments, start=1):
        text = segment.get("text", "")
        if not text:
            continue
        filepath = os.path.join(config.output_dir, f"{episode_id}_{segment_index:03d}.wav")
        _write_mock_wav(filepath, text)
        segments.append(_voice_segment(segment, filepath, "mock", config.default_voice, segment_index))
    return segments


def _voice_segment(
    segment: dict[str, Any],
    filepath: str,
    engine: str,
    voice: str,
    segment_index: int,
) -> dict[str, Any]:
    return {
        "segment_id": segment.get("id") or f"seg_{segment_index:03d}",
        "path": filepath,
        "text": segment.get("text", ""),
        "speaker": segment.get("speaker", "Host A"),
        "source_fact_ids": segment.get("source_fact_ids", []),
        "engine": engine,
        "voice": voice,
    }
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
