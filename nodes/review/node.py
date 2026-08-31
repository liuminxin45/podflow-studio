from typing import Any
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
from nodes.review.config import ReviewConfig
from protocol.artifact_utils import file_fingerprint
from protocol.release_readiness import build_release_readiness

# Each check: (condition_ok, fail_level, fail_msg, pass_msg)
# fail_level is "error" or "warning"
type CheckSpec = tuple[bool, str, str, str]


MIN_AUDIO_DURATION_WARN = 30  # seconds – warn below this
MIN_AUDIO_DURATION_ERROR = 10  # seconds – error below this
MIN_SEGMENTS = 2  # at least 2 segments for meaningful content
MIN_AVG_SEGMENT_CHARS = 20  # average chars per segment; below this suggests placeholder text
MAX_CLIP_SECONDS = 30.0
INTRO_OPERATION = "mix_intro_music_8000ms_solo_4000ms_voice_overlap"
OUTRO_OPERATION = "mix_outro_music_4000ms_voice_overlap_6000ms_tail"


def _measure_final_audio(path: str) -> dict[str, Any]:
    """Measure the encoded artifact rather than trusting requested render settings."""

    audio = Path(path)
    ffmpeg = os.environ.get("PODFLOW_FFMPEG_PATH") or shutil.which("ffmpeg")
    ffprobe = shutil.which("ffprobe")
    if not audio.is_file() or not ffmpeg or not ffprobe:
        return {}
    probe = subprocess.run(
        [ffprobe, "-v", "error", "-select_streams", "a:0", "-show_entries",
         "stream=codec_name,sample_rate,bit_rate:format=duration,size,bit_rate", "-of", "json", str(audio)],
        check=True, capture_output=True, text=True,
    )
    probe_data = json.loads(probe.stdout)
    stream = (probe_data.get("streams") or [{}])[0]
    format_data = probe_data.get("format") or {}
    measured = subprocess.run(
        [ffmpeg, "-hide_banner", "-nostats", "-i", str(audio), "-af",
         "loudnorm=I=-16:TP=-1:LRA=11:print_format=json", "-f", "null", os.devnull],
        check=True, capture_output=True, text=True,
    )
    blocks = re.findall(r'\{\s*"input_i".*?\}', measured.stderr, flags=re.DOTALL)
    loudness = json.loads(blocks[-1]) if blocks else {}
    bitrate = stream.get("bit_rate") or format_data.get("bit_rate") or 0
    return {
        "codec": str(stream.get("codec_name") or ""),
        "sample_rate_hz": int(stream.get("sample_rate") or 0),
        "bitrate_kbps": round(int(bitrate) / 1000),
        "duration_seconds": round(float(format_data.get("duration") or 0), 3),
        "file_size": int(format_data.get("size") or audio.stat().st_size),
        "integrated_lufs": float(loudness.get("input_i")) if loudness.get("input_i") not in {None, "-inf"} else None,
        "true_peak_db": float(loudness.get("input_tp")) if loudness.get("input_tp") not in {None, "-inf"} else None,
    }


def _build_checks(
    state: dict[str, Any], audio_artifact: dict[str, Any] | None = None,
    measured_audio: dict[str, Any] | None = None,
) -> list[CheckSpec]:
    """Define all pre-publish checks as data. Easy to extend."""
    script = state.get("edited_script", {})
    segments = script.get("segments", []) if isinstance(script, dict) else []
    audio_outputs = state.get("audio_outputs", {})
    actual_duration = audio_outputs.get("duration_seconds", 0) if isinstance(audio_outputs, dict) else 0

    avg_chars = sum(len(s.get("text", "")) for s in segments) / len(segments) if segments else 0
    plan = state.get("production_plan") if isinstance(state.get("production_plan"), dict) else {}
    joins = [join for join in plan.get("joins", []) if isinstance(join, dict)]
    operations = audio_outputs.get("operations", []) if isinstance(audio_outputs, dict) else []
    clip_metrics = [segment for segment in state.get("voice_segments", []) if isinstance(segment, dict)]
    overlong = [segment.get("segment_id") for segment in clip_metrics if float(segment.get("duration_seconds") or 0) > MAX_CLIP_SECONDS]
    prosody_failures = [segment.get("segment_id") for segment in clip_metrics if (segment.get("prosody_quality") or {}).get("status") != "ok"]
    expected_stings = sum(join.get("type") == "sting" for join in joins)
    expected_bridges = sum(join.get("type") == "bridge" for join in joins)
    rendered_stings = sum(str(item).startswith("sting_after_") for item in operations)
    rendered_bridges = sum(str(item).startswith("bridge_after_") for item in operations)
    measured_audio = measured_audio or {}

    checks: list[CheckSpec] = [
        (
            bool(audio_artifact),
            "error",
            "No readable audio file generated",
            "Audio file ready",
        ),
        (bool(script.get("title")), "warning", "Episode has no title", "Title set"),
        (
            len(segments) >= MIN_SEGMENTS,
            "error",
            f"Too few segments ({len(segments)}); min={MIN_SEGMENTS}",
            f"{len(segments)} segments ready",
        ),
        (plan.get("version") == 4 and plan.get("quality_profile") == "podflow_morning_v4", "error", "Production plan is not v4", "Production plan v4 ready"),
        (not overlong, "error", f"TTS clips exceed 30 seconds: {', '.join(map(str, overlong))}", "All TTS clips are at most 30 seconds"),
        (not prosody_failures, "error", f"Prosody checks require review: {', '.join(map(str, prosody_failures))}", "Speech rate and non-silent dynamics passed"),
        (expected_stings == 5 and rendered_stings == 5, "error", f"Expected/rendered quick-news stings: {expected_stings}/{rendered_stings}", "Exactly 5 quick-news stings rendered"),
        (expected_bridges == 1 and rendered_bridges == 1, "error", f"Expected/rendered deep-dive bridges: {expected_bridges}/{rendered_bridges}", "Exactly 1 deep-dive bridge rendered"),
        (INTRO_OPERATION in operations, "error", "Intro cue is missing from final timeline", "Intro cue rendered with voice overlap"),
        (OUTRO_OPERATION in operations, "error", "Outro cue is missing from final timeline", "Outro cue rendered with voice overlap"),
        (measured_audio.get("codec") == "mp3", "error", "Final audio codec is not MP3", "Final codec is MP3"),
        (measured_audio.get("sample_rate_hz") == 48_000, "error", "Final audio sample rate is not 48 kHz", "Final sample rate is 48 kHz"),
        (measured_audio.get("bitrate_kbps") in range(156, 165), "error", f"Final MP3 bitrate is not 160 kbps: {measured_audio.get('bitrate_kbps')}", "Final MP3 bitrate is 160 kbps"),
        (measured_audio.get("integrated_lufs") is not None and -17 <= measured_audio["integrated_lufs"] <= -15,
         "error", f"Measured integrated loudness is outside -16 LUFS ±1: {measured_audio.get('integrated_lufs')}", "Measured loudness is within -16 LUFS ±1"),
        (measured_audio.get("true_peak_db") is not None and measured_audio["true_peak_db"] <= -1,
         "error", f"Measured true peak exceeds -1 dBTP: {measured_audio.get('true_peak_db')}", "Measured true peak is at most -1 dBTP"),
    ]
    if isinstance(audio_outputs, dict) and audio_outputs.get("contains_mock_audio"):
        checks.append(
            (
                False,
                "warning",
                "Audio contains mock TTS and is limited to local preview",
                "Audio source is publishable",
            )
        )

    if actual_duration > 0:
        if actual_duration < MIN_AUDIO_DURATION_ERROR:
            checks.append(
                (
                    False,
                    "error",
                    f"Audio too short: {actual_duration:.1f}s (min {MIN_AUDIO_DURATION_ERROR}s)",
                    f"Audio duration OK: {actual_duration:.1f}s",
                )
            )
        elif actual_duration < MIN_AUDIO_DURATION_WARN:
            checks.append(
                (
                    False,
                    "warning",
                    f"Audio very short: {actual_duration:.1f}s (recommended ≥{MIN_AUDIO_DURATION_WARN}s)",
                    f"Audio duration OK: {actual_duration:.1f}s",
                )
            )
        elif actual_duration > 900:
            checks.append((False, "error", f"Audio exceeds 15 minutes: {actual_duration:.1f}s", "Audio is within the 12-15 minute range"))
        elif actual_duration < 720:
            checks.append((False, "error", f"Audio is below 12 minutes: {actual_duration:.1f}s", "Audio is within the 12-15 minute range"))
        else:
            checks.append((True, "error", "", f"Audio is within the 12-15 minute range: {actual_duration:.1f}s"))

    if segments:
        checks.append(
            (
                avg_chars >= MIN_AVG_SEGMENT_CHARS,
                "warning",
                f"Segments appear thin: avg {avg_chars:.0f} chars (min {MIN_AVG_SEGMENT_CHARS})",
                f"Segment density OK: avg {avg_chars:.0f} chars/segment",
            )
        )

    return checks


def run(state: dict[str, Any], config: ReviewConfig = None) -> dict[str, Any]:
    """Review node - 成品审阅：发布前的最终检查"""
    from protocol.node_runner import NodeContext

    config = config or ReviewConfig()
    ctx = NodeContext("ReviewNode", state)
    script = state.get("edited_script", {})
    segments = script.get("segments", []) if isinstance(script, dict) else []
    audio_outputs = state.get("audio_outputs", {})
    audio_path = audio_outputs.get("final_audio_path", "") if isinstance(audio_outputs, dict) else ""
    audio_artifact = file_fingerprint(audio_path)
    try:
        measured_audio = _measure_final_audio(audio_path)
    except (OSError, ValueError, subprocess.SubprocessError, json.JSONDecodeError):
        measured_audio = {}
    plan = state.get("production_plan") if isinstance(state.get("production_plan"), dict) else {}
    operations = audio_outputs.get("operations", []) if isinstance(audio_outputs, dict) else []
    clip_metrics = [segment for segment in state.get("voice_segments", []) if isinstance(segment, dict)]
    rendered_stings = sum(str(item).startswith("sting_after_") for item in operations)
    rendered_bridges = sum(str(item).startswith("bridge_after_") for item in operations)
    ctx.log_start(
        f"输入: script={bool(script)}, segments={len(segments)}, audio={bool(audio_path)}"
    )

    checks: list[dict[str, str]] = []
    for ok, fail_level, fail_msg, pass_msg in _build_checks(state, audio_artifact, measured_audio):
        checks.append(
            {"level": "pass", "message": pass_msg}
            if ok
            else {"level": fail_level, "message": fail_msg}
        )

    pass_count = sum(1 for c in checks if c["level"] == "pass")
    review = {
        "status": "passed" if all(check["level"] != "error" for check in checks) else "failed",
        "title": script.get("title", "Untitled"),
        "description": script.get("description", ""),
        "segment_count": len(segments),
        "estimated_duration": sum(s.get("estimated_seconds", 0) for s in segments),
        "has_audio": bool(audio_artifact),
        "audio_artifact": audio_artifact,
        "audio_outputs": audio_outputs,
        "checks": checks,
        "score": f"{pass_count}/{len(checks)}",
    }
    state["review_summary"] = review
    state["release_readiness"] = build_release_readiness(state)
    report = {
        "qualityProfile": plan.get("quality_profile"),
        "audioSha256": (audio_artifact or {}).get("sha256", ""),
        "clipMetrics": [
            {
                "id": segment.get("segment_id"),
                "durationSeconds": segment.get("duration_seconds", 0),
                **(segment.get("prosody_quality") or {}),
            }
            for segment in clip_metrics
        ],
        "musicEvents": {"intro": 1 if INTRO_OPERATION in operations else 0,
                        "stings": rendered_stings, "bridge": rendered_bridges,
                        "outro": 1 if OUTRO_OPERATION in operations else 0},
        "output": {**{key: audio_outputs.get(key) for key in ("duration_seconds", "sample_rate_hz", "bitrate_kbps", "target_lufs", "true_peak_db", "file_size")},
                   "measured": measured_audio},
        "status": review["status"],
        "checks": checks,
    }
    if audio_path:
        report_path = Path(audio_path).with_name("audio-quality-report.json")
        report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        review["audio_quality_report"] = str(report_path)

    failed_checks = [c for c in checks if c["level"] != "pass"]
    detail = f"输出: score={review['score']} | {review['title']}"
    if failed_checks:
        for check in failed_checks:
            detail += f"\n[ReviewNode]   [{check['level'].upper()}] {check['message']}"
    ctx.log_end(detail)
    return ctx.finalize(state)
