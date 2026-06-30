from typing import Any
from nodes.review.config import ReviewConfig

# Each check: (condition_ok, fail_level, fail_msg, pass_msg)
# fail_level is "error" or "warning"
type CheckSpec = tuple[bool, str, str, str]


MIN_AUDIO_DURATION_WARN = 30  # seconds – warn below this
MIN_AUDIO_DURATION_ERROR = 10  # seconds – error below this
MIN_SEGMENTS = 2  # at least 2 segments for meaningful content
MIN_AVG_SEGMENT_CHARS = 20  # average chars per segment; below this suggests placeholder text


def _build_checks(state: dict[str, Any]) -> list[CheckSpec]:
    """Define all pre-publish checks as data. Easy to extend."""
    script = state.get("script", {})
    stages = state.get("stages", [])
    audio_path = state.get("final_audio_path", "")
    cover_path = state.get("cover_path", "")
    audio_metadata = state.get("audio_metadata", {})
    actual_duration = audio_metadata.get("duration", 0) if isinstance(audio_metadata, dict) else 0

    avg_chars = sum(len(s.get("text", "")) for s in stages) / len(stages) if stages else 0

    checks: list[CheckSpec] = [
        (bool(audio_path), "error", "No audio file generated", "Audio file ready"),
        (bool(cover_path), "warning", "No cover art generated", "Cover art ready"),
        (bool(script.get("title")), "warning", "Episode has no title", "Title set"),
        (
            len(stages) >= MIN_SEGMENTS,
            "error",
            f"Too few segments ({len(stages)}); min={MIN_SEGMENTS}",
            f"{len(stages)} segments ready",
        ),
    ]

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

    if stages:
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
    script = state.get("script", {})
    stages = state.get("stages", [])
    audio_path = state.get("final_audio_path", "")
    cover_path = state.get("cover_path", "")
    ctx.log_start(
        f"输入: script={bool(script)}, stages={len(stages)}, audio={bool(audio_path)}, cover={bool(cover_path)}"
    )

    checks: list[dict[str, str]] = []
    for ok, fail_level, fail_msg, pass_msg in _build_checks(state):
        checks.append(
            {"level": "pass", "message": pass_msg}
            if ok
            else {"level": fail_level, "message": fail_msg}
        )

    pass_count = sum(1 for c in checks if c["level"] == "pass")
    review = {
        "title": script.get("title", "Untitled"),
        "description": script.get("description", ""),
        "segment_count": len(stages),
        "estimated_duration": sum(s.get("estimated_duration", 0) for s in stages),
        "has_audio": bool(audio_path),
        "has_cover": bool(cover_path),
        "audio_metadata": state.get("audio_metadata", {}),
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
