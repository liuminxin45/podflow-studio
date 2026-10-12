from copy import deepcopy

from nodes.review.node import INTRO_OPERATION, OUTRO_OPERATION, _build_checks
from nodes.publish.node import _validate_public_readiness
from protocol.production_plan import build_production_plan


def state_and_measurement():
    script = {"title": "一个问题", "segments": [
        {"id": "intro", "type": "opening", "text": "欢迎收听，这期讲清楚一个具体问题。"},
        {"id": "body1", "type": "quick_news", "text": "这是一段有事实支撑的口播内容。" * 5},
        {"id": "body2", "type": "quick_news", "text": "这是另一段明确说明边界的口播内容。" * 5},
        {"id": "outro", "type": "closing", "text": "本期到这里，所有来源可在节目说明中查看。"},
    ]}
    plan = build_production_plan(script["segments"])
    cues = [f"{join['type']}_after_{join['after_clip_id']}" for join in plan["joins"] if join["type"] in {"sting", "bridge"}]
    state = {"episode_id": "2026-10-12-focus", "edited_script": script, "production_plan": plan,
             "audio_outputs": {"operations": [INTRO_OPERATION, OUTRO_OPERATION, *cues]}, "voice_segments": []}
    measured = {"codec": "mp3", "sample_rate_hz": 48000, "bitrate_kbps": 160, "integrated_lufs": -16,
                "true_peak_db": -1.2, "duration_seconds": 180}
    return state, measured


def test_short_episode_matches_its_real_plan_not_fixed_music_counts():
    state, measured = state_and_measurement()
    checks = _build_checks(state, {"sha256": "test"}, measured)
    assert not [message for ok, level, message, _ in checks if not ok and level == "error"]


def test_missing_or_moved_music_is_rejected():
    state, measured = state_and_measurement()
    state["audio_outputs"]["operations"][-1] = "sting_after_wrong_clip"
    checks = _build_checks(state, {"sha256": "test"}, measured)
    assert any(not ok and "boundaries" in message for ok, _, message, _ in checks)


def test_empty_plan_and_forged_duration_do_not_pass():
    state, measured = state_and_measurement()
    state["production_plan"]["clips"] = []
    measured["duration_seconds"] = 0
    state["audio_outputs"]["duration_seconds"] = 180
    checks = _build_checks(state, {"sha256": "test"}, measured)
    failures = [message for ok, level, message, _ in checks if not ok and level == "error"]
    assert any("cover every script" in message for message in failures)
    assert any("duration is missing" in message for message in failures)


def test_public_validation_accepts_short_format_but_not_stale_approval():
    state, _ = state_and_measurement()
    artifact = {"size_bytes": 4_000_000, "sha256": "current"}
    state["review_summary"] = {"status": "passed", "audio_artifact": artifact}
    state["audio_approval"] = {"status": "approved", "audio_sha256": "current"}
    state["facts"] = [{"evidence": [{"url": "https://example.com/source", "title": "来源"}]}]
    audio = {"sample_rate_hz": 48000, "format": "mp3", "bitrate_kbps": 160, "target_lufs": -16,
             "true_peak_db": -1.2, "duration_seconds": 180, "audio_artifact": artifact}
    _validate_public_readiness(state, audio)
    import pytest
    changed = deepcopy(state)
    changed["audio_approval"]["audio_sha256"] = "old"
    with pytest.raises(RuntimeError, match="human approval"):
        _validate_public_readiness(changed, audio)
