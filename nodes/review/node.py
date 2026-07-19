from typing import Any
from nodes.review.config import ReviewConfig
from protocol.artifact_utils import file_fingerprint

# Each check: (condition_ok, fail_level, fail_msg, pass_msg)
# fail_level is "error" or "warning"
type CheckSpec = tuple[bool, str, str, str]


MIN_AUDIO_DURATION_WARN = 30  # seconds – warn below this
MIN_AUDIO_DURATION_ERROR = 10  # seconds – error below this
MIN_SEGMENTS = 2  # at least 2 segments for meaningful content
MIN_AVG_SEGMENT_CHARS = 20  # average chars per segment; below this suggests placeholder text


def _build_checks(
    state: dict[str, Any], audio_artifact: dict[str, Any] | None = None
) -> list[CheckSpec]:
    """Define all pre-publish checks as data. Easy to extend."""
    script = state.get("edited_script", {})
    segments = script.get("segments", []) if isinstance(script, dict) else []
    cover_path = state.get("cover_path", "")
    audio_outputs = state.get("audio_outputs", {})
    actual_duration = audio_outputs.get("duration_seconds", 0) if isinstance(audio_outputs, dict) else 0

    avg_chars = sum(len(s.get("text", "")) for s in segments) / len(segments) if segments else 0

    checks: list[CheckSpec] = [
        (
            bool(audio_artifact),
            "error",
            "No readable audio file generated",
            "Audio file ready",
        ),
        (bool(cover_path), "warning", "No cover art generated", "Cover art ready"),
        (bool(script.get("title")), "warning", "Episode has no title", "Title set"),
        (
            len(segments) >= MIN_SEGMENTS,
            "error",
            f"Too few segments ({len(segments)}); min={MIN_SEGMENTS}",
            f"{len(segments)} segments ready",
        ),
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
        else:
            checks.append((True, "error", "", f"Audio duration OK: {actual_duration:.1f}s"))

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
    cover_path = state.get("cover_path", "")
    audio_artifact = file_fingerprint(audio_path)
    ctx.log_start(
        f"输入: script={bool(script)}, segments={len(segments)}, audio={bool(audio_path)}, cover={bool(cover_path)}"
    )

    checks: list[dict[str, str]] = []
    for ok, fail_level, fail_msg, pass_msg in _build_checks(state, audio_artifact):
        checks.append(
            {"level": "pass", "message": pass_msg}
            if ok
            else {"level": fail_level, "message": fail_msg}
        )

    pass_count = sum(1 for c in checks if c["level"] == "pass")
    review = {
        "title": script.get("title", "Untitled"),
        "description": script.get("description", ""),
        "segment_count": len(segments),
        "estimated_duration": sum(s.get("estimated_seconds", 0) for s in segments),
        "has_audio": bool(audio_artifact),
        "has_cover": bool(cover_path),
        "audio_artifact": audio_artifact,
        "audio_outputs": audio_outputs,
        "checks": checks,
        "score": f"{pass_count}/{len(checks)}",
    }
    state["review_summary"] = review

    failed_checks = [c for c in checks if c["level"] != "pass"]
    detail = f"输出: score={review['score']} | {review['title']}"
    if failed_checks:
        for check in failed_checks:
            detail += f"\n[ReviewNode]   [{check['level'].upper()}] {check['message']}"
    ctx.log_end(detail)
    return ctx.finalize(state)
