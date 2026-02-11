from typing import Dict, Any, List, Tuple
from nodes.review.config import ReviewConfig

# Each check: (condition_ok, fail_level, fail_msg, pass_msg)
# fail_level is "error" or "warning"
CheckSpec = Tuple[bool, str, str, str]


def _build_checks(state: Dict[str, Any]) -> List[CheckSpec]:
    """Define all pre-publish checks as data. Easy to extend."""
    script = state.get("script", {})
    stages = state.get("stages", [])
    audio_path = state.get("final_audio_path", "")
    cover_path = state.get("cover_path", "")

    return [
        (bool(audio_path),     "error",   "No audio file generated",  "Audio file ready"),
        (bool(cover_path),     "warning", "No cover art generated",   "Cover art ready"),
        (bool(script.get("title")), "warning", "Episode has no title", "Title set"),
        (len(stages) > 0,     "error",   "No dialogue segments",     f"{len(stages)} segments ready"),
    ]


def run(state: Dict[str, Any], config: ReviewConfig = None) -> Dict[str, Any]:
    """Review node - 成品审阅：发布前的最终检查"""
    config = config or ReviewConfig()
    logs = state.get("logs", [])
    errors = state.get("errors", [])

    logs.append("[ReviewNode] Starting final review")

    script = state.get("script", {})
    stages = state.get("stages", [])
    audio_path = state.get("final_audio_path", "")
    cover_path = state.get("cover_path", "")

    checks: List[Dict[str, str]] = []
    for ok, fail_level, fail_msg, pass_msg in _build_checks(state):
        checks.append({"level": "pass", "message": pass_msg} if ok
                       else {"level": fail_level, "message": fail_msg})

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
    logs.append(f"[ReviewNode] Review complete: {review['score']} checks passed")
    logs.append(f"[ReviewNode] Title: {review['title']}")

    state["logs"] = logs
    state["errors"] = errors
    return state
