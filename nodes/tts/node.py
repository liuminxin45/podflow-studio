import os
import asyncio
import json
import urllib.request
from pathlib import Path
from typing import Dict, Any
import requests
from nodes.tts.config import TTSConfig
from protocol.node_runner import NodeContext


def run(state: Dict[str, Any], config: TTSConfig = None) -> Dict[str, Any]:
    config = config or TTSConfig()
    ctx = NodeContext("TTSNode", state)

    ctx.log_start("Starting TTS conversion")
    stages = state.get("stages", [])

    try:
        Path(config.output_dir).mkdir(parents=True, exist_ok=True)
        episode_id = state.get("episode_id", "unknown")

        ctx.log(f"使用引擎: {config.engine}")
        engine = (config.engine or "edge-tts").lower()
        if engine in {"edge-tts", "edge", "openai-compatible", "openai", "openai-audio"}:
            segments = asyncio.run(_synthesize_all(stages, config, episode_id))
        else:
            raise ValueError(f"Unsupported TTS engine: {config.engine}")
        state["audio_segments"] = segments
        ctx.log(f"音频生成完成: {len(segments)} segments")
    except Exception as e:
        ctx.add_error("tts", str(e), detail=str(e))
        ctx.log(f"错误: {str(e)}")

    ctx.log_end(f"输出: audio_segments={len(state.get('audio_segments', []))}")
    return ctx.finalize(state)


async def _synthesize_all(stages, config, episode_id):
    segments = []
    for fallback_idx, stage in enumerate(stages):
        speaker = stage.get("speaker", "")
        text = stage.get("text", "")
        idx = stage.get("index", stage.get("order", fallback_idx + 1))
        if not text:
            continue

        voice = config.voice_mapping.get(speaker, config.default_voice)
        try:
            idx_num = int(idx)
        except (TypeError, ValueError):
            idx_num = fallback_idx + 1
        output_format = _normalize_output_format(config.output_format)
        filename = f"{episode_id}_{idx_num:03d}.{output_format}"
        filepath = os.path.join(config.output_dir, filename)
        engine = (config.engine or "edge-tts").lower()
        if engine in {"edge-tts", "edge"}:
            await _synthesize_edge_tts(text, voice, filepath, config)
        elif engine in {"openai-compatible", "openai", "openai-audio"}:
            _synthesize_openai_compatible(text, voice, filepath, config)
        else:
            raise ValueError(f"Unsupported TTS engine: {config.engine}")
        segments.append(filepath)

    return segments


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
