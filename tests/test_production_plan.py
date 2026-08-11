import pytest

from protocol.production_plan import build_production_plan, split_script_text


def _segment(**overrides):
    value = {
        "id": "seg_001",
        "type": "quick_news",
        "title": "新闻",
        "text": "第一句。第二句。",
        "speaker": "Host A",
        "source_fact_ids": ["fact_001"],
    }
    value.update(overrides)
    return value


def test_split_script_text_preserves_content_and_bounds_units():
    text = "第一部分内容。" * 20 + "第二部分内容。" * 20

    clips = split_script_text(text, max_chars=60)

    assert len(clips) > 2
    assert "".join(clips) == text
    assert all(len(item) <= 60 for item in clips)


def test_build_production_plan_preserves_edits_for_unchanged_text():
    initial = build_production_plan([_segment()])
    initial["clips"][0].update(
        {
            "path": "D:/audio/clip.wav",
            "duration_seconds": 3.5,
            "trim_start_ms": 120,
            "source": "recording",
        }
    )

    restored = build_production_plan([_segment()], initial)

    assert restored["clips"][0]["path"] == "D:/audio/clip.wav"
    assert restored["clips"][0]["trim_start_ms"] == 120
    assert restored["clips"][0]["source"] == "recording"


def test_build_production_plan_invalidates_changed_text():
    initial = build_production_plan([_segment()])
    initial["clips"][0].update({"path": "old.wav", "generation_key": "old-key"})

    changed = build_production_plan([_segment(text="已经修改的稿件。")], initial)

    assert changed["clips"][0]["path"] == ""
    assert changed["clips"][0]["generation_key"] == ""
    assert changed["clips"][0]["source"] == "tts"


def test_build_production_plan_uses_section_aware_default_joins():
    plan = build_production_plan(
        [
            _segment(id="quick", text="短句。" * 80),
            _segment(id="deep", type="deep_dive", title="深度", text="进入深度解读。"),
        ]
    )

    assert any(join["duration_ms"] == 450 for join in plan["joins"])
    assert plan["joins"][-1] == {
        "after_clip_id": plan["clips"][-2]["id"],
        "type": "transition",
        "duration_ms": 1000,
    }
    assert plan["music"]["intro"]["path"] == "assets/audio/podflow-intro.wav"
    assert plan["music"]["intro"]["duration_ms"] == 5000
    assert plan["music"]["transition"]["duration_ms"] == 1000
    assert plan["music"]["bed"]["enabled"] is False
    assert plan["music"]["outro"]["duration_ms"] == 4000


def test_build_production_plan_adds_context_and_speech_direction():
    plan = build_production_plan([
        _segment(text="第一句说明背景。第二句包含数字 42%。第三句给出结论。" * 6),
    ])

    assert plan["version"] == 2
    assert len(plan["clips"]) > 1
    assert plan["clips"][0]["context_after"]
    assert plan["clips"][1]["context_before"]
    assert plan["clips"][0]["direction"]["intent"] == "quick_news"
    assert plan["clips"][0]["direction"]["emphasis"] == ["42%"]


def test_build_production_plan_rejects_unversioned_existing_shape():
    with pytest.raises(ValueError, match="expected 2"):
        build_production_plan([_segment()], {"clips": []})


def test_build_production_plan_carries_context_across_script_segments():
    plan = build_production_plan([
        _segment(id="first", text="第一段只有一句。"),
        _segment(id="second", text="第二段也只有一句。"),
    ])

    assert plan["clips"][0]["context_after"] == "第二段也只有一句。"
    assert plan["clips"][1]["context_before"] == "第一段只有一句。"
