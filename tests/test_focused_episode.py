"""Default desktop journey keeps evidence contracts and sizes to real material."""

import pytest

from nodes.script.config import ScriptConfig
from nodes.script.node import _focused_episode_config, _preset_from_config, _resolve_script_structure
from nodes.script.prompts import build_episode_script_prompt


@pytest.mark.parametrize("count", [1, 2, 8, 20])
def test_focused_episode_uses_actual_selected_facts(count):
    facts = [{"id": f"f{i}"} for i in range(count)]
    state = {"selected_topics": [{"fact_id": fact["id"]} for fact in facts]}
    original = ScriptConfig()
    config = _focused_episode_config(original, state, facts)
    assert config.recommended_news_item_count == count
    assert config.quick_news_recommended_count == count
    assert config.deep_dive_recommended_count == 0
    assert config.episode_chars_min <= config.target_duration_minutes * config.words_per_minute <= config.episode_chars_max
    assert original.recommended_news_item_count == 7
    assert config.require_approval is True


def test_depth_is_not_invented_and_listener_intent_reaches_prompt():
    facts = [{"id": "f1", "title": "有依据的主题", "claims": [], "evidence": []}]
    config = _focused_episode_config(ScriptConfig(), {"selected_topics": [{"fact_id": "f1"}]}, facts)
    structure = _resolve_script_structure(facts, _preset_from_config(config))
    assert structure["actual_deep_dive_count"] == 0
    prompt = build_episode_script_prompt(
        {"title": "主题", "audience": "普通上班族", "takeaway": "理解工具的边界"}, config, facts, structure,
    )
    assert "普通上班族" in prompt
    assert "理解工具的边界" in prompt
    assert "不凑固定条数" in prompt


def test_focused_episode_rejects_missing_selection():
    with pytest.raises(ValueError, match="事实卡片"):
        _focused_episode_config(ScriptConfig(), {"selected_topics": []}, [{"id": "f1"}])


def test_existing_evidence_backed_depth_is_preserved():
    facts = [{"id": "f1", "is_deep_dive": True}]
    config = _focused_episode_config(ScriptConfig(), {"selected_topics": [{"fact_id": "f1"}]}, facts)
    structure = _resolve_script_structure(facts, _preset_from_config(config))
    assert structure["actual_deep_dive_count"] == 1
    assert structure["actual_quick_news_count"] == 0


def test_focused_selection_produces_an_organized_packet_without_claiming_verification(monkeypatch):
    from nodes.topic_selection.node import run
    from tests.mock_data import create_base_state

    state = create_base_state()
    state["runtime_config"] = {"auto_execute": True, "quick_brief": {"requested_at": "now", "topic": "主题"}}
    material = {"title": "来源", "url": "https://example.com/source", "content": "来源正文", "verified": False}
    state["researched_contents"] = [material]

    def select(contents, config, logs, debug_mode=False, *, require_llm=False):
        assert require_llm
        assert config.target_topic == "主题"
        return contents, []

    monkeypatch.setattr("nodes.topic_selection.node._analyze_relevance", select)
    result = run(state)
    assert not result["errors"]
    assert result["selected_materials"][0]["_status"] == "ready"
    assert result["selected_materials"][0]["verified"] is False


def test_focused_selection_rejects_missing_source(monkeypatch):
    from nodes.topic_selection.node import run
    from tests.mock_data import create_base_state

    state = create_base_state()
    state["runtime_config"] = {"auto_execute": True, "quick_brief": {"requested_at": "now", "topic": "主题"}}
    state["researched_contents"] = [{"title": "无来源笔记", "content": "正文"}]
    monkeypatch.setattr("nodes.topic_selection.node._analyze_relevance", lambda contents, *args, **kwargs: (contents, []))
    result = run(state)
    assert result["selected_materials"] == []
    assert any("缺少来源" in error["message"] for error in result["errors"])


def test_focused_facts_require_a_real_verifier():
    from nodes.facts.config import FactsConfig
    from nodes.facts.node import run
    from tests.mock_data import create_base_state

    state = create_base_state()
    state["runtime_config"] = {"quick_brief": {"requested_at": "now"}}
    state["selected_materials"] = [{"title": "事实", "url": "https://example.com/fact", "content": "正文", "_status": "ready"}]
    result = run(state, FactsConfig())
    assert result["facts"] == []
    assert any("verifier is required" in error["message"] for error in result["errors"])
