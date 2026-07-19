from nodes.facts.config import FactsConfig
from nodes.facts.node import run as facts_run
from tests.mock_data import create_base_state, create_mock_cleaned_contents, create_mock_materials


def test_facts_node_uses_selected_materials_first():
    state = create_base_state()
    state["selected_materials"] = create_mock_materials()
    state["cleaned_contents"] = []
    result = facts_run(state, FactsConfig(max_facts=3, selected_topic_count=2))
    assert len(result["facts"]) == 2
    assert len(result["selected_topics"]) == 2
    assert result["run_report"]["facts"]["total"] == 2


def test_facts_node_requires_selected_materials():
    state = create_base_state()
    state["cleaned_contents"] = create_mock_cleaned_contents()
    result = facts_run(state, FactsConfig(max_facts=2, selected_topic_count=2))
    assert result["facts"] == []
    assert any("No selected_materials" in error["message"] for error in result["errors"])


def test_facts_node_preserves_the_unique_deep_dive_and_its_richer_packet():
    state = create_base_state()
    state["selected_materials"] = [
        {
            "title": f"新闻 {index}",
            "content": ("已核验的深度资料。" * 100) if index == 4 else f"新闻 {index} 的事实。",
            "source": f"来源 {index}",
            "url": f"https://example.com/{index}",
            "published": "2026-07-15",
            "_status": "ready",
            **({"_isDeepDive": True} if index == 4 else {}),
        }
        for index in range(1, 5)
    ]

    result = facts_run(state, FactsConfig(max_facts=4, selected_topic_count=3))

    marked_topics = [topic for topic in result["selected_topics"] if topic.get("is_deep_dive")]
    assert len(marked_topics) == 1
    assert marked_topics[0]["fact_id"] == "fact_004"
    assert result["selected_topics"][-1]["fact_id"] == "fact_004"
    assert len({topic["id"] for topic in result["selected_topics"]}) == 3
    assert result["facts"][-1]["is_deep_dive"] is True
    assert len(result["facts"][-1]["summary"]) > 260


def test_facts_node_preserves_an_explicit_deep_dive_on_a_sparse_day():
    state = create_base_state()
    state["selected_materials"] = [
        {
            "title": "唯一新闻",
            "content": "已核验的深度资料。" * 80,
            "source": "来源一",
            "url": "https://example.com/only",
            "published": "2026-07-15",
            "_isDeepDive": True,
            "_status": "ready",
        }
    ]

    result = facts_run(state, FactsConfig(max_facts=3, selected_topic_count=3))

    assert len(result["selected_topics"]) == 1
    assert result["selected_topics"][0]["is_deep_dive"] is True
    assert result["selected_topics"][0]["fact_id"] == "fact_001"


def test_facts_node_keeps_a_late_deep_dive_inside_the_fact_limit_and_matches_by_url():
    state = create_base_state()
    state["selected_materials"] = [
        {
            "title": "同名新闻",
            "content": "普通来源一。",
            "source": "来源一",
            "url": "https://example.com/ordinary",
            "_status": "ready",
        },
        {
            "title": "普通新闻二",
            "content": "普通来源二。",
            "source": "来源二",
            "url": "https://example.com/second",
            "_status": "ready",
        },
        {
            "title": "同名新闻",
            "content": "深度资料。" * 100,
            "source": "深度来源",
            "url": "https://example.com/deep",
            "_isDeepDive": True,
            "_status": "ready",
        },
    ]

    result = facts_run(state, FactsConfig(max_facts=2, selected_topic_count=2))

    assert len(result["facts"]) == 2
    marked = [fact for fact in result["facts"] if fact.get("is_deep_dive")]
    assert len(marked) == 1
    assert marked[0]["source_url"] == "https://example.com/deep"
    assert result["selected_topics"][-1]["fact_id"] == marked[0]["id"]


def test_facts_node_uses_url_to_disambiguate_same_title_deep_materials():
    state = create_base_state()
    state["selected_materials"] = [
        {
            "title": "同名新闻",
            "content": "普通来源。",
            "url": "https://example.com/ordinary",
            "_status": "ready",
        },
        {
            "title": "同名新闻",
            "content": "深度来源证据。" * 100,
            "url": "https://example.com/deep",
            "_isDeepDive": True,
            "_status": "ready",
        },
    ]

    result = facts_run(state, FactsConfig(max_facts=2, selected_topic_count=2))

    marked = [fact for fact in result["facts"] if fact.get("is_deep_dive")]
    assert len(marked) == 1
    assert marked[0]["source_url"] == "https://example.com/deep"
    assert "深度来源证据" in marked[0]["summary"]
    ordinary = next(fact for fact in result["facts"] if fact["source_url"].endswith("ordinary"))
    assert ordinary.get("is_deep_dive") is not True


def test_facts_node_rejects_a_mixed_unfinished_organize_payload():
    state = create_base_state()
    state["selected_materials"] = [
        {
            "title": "实习新闻",
            "summary": "一句话导语",
            "content": "一句话导语\n\n关键事实与数字\n\n背景与影响",
            "source": "牛客",
            "url": "https://example.com/intern",
            "published": "2026-07-16",
            "_status": "ready",
            "_isDeepDive": True,
            "_references": [
                {
                    "title": "独立报道一",
                    "source": "媒体甲",
                    "url": "https://example.com/intern/report-1",
                },
                {
                    "title": "独立报道二",
                    "source": "媒体乙",
                    "url": "https://example.com/intern/report-2",
                },
            ],
        },
        {
            "title": "股市新闻",
            "summary": "股市导语",
            "content": "股市导语\n\n监管规则与关键数字\n\n风险边界",
            "source": "财经来源",
            "url": "https://example.com/market",
            "published": "2026-07-16",
            "_status": "ready",
        },
        {
            "title": "痴迷",
            "content": "电影热榜短句",
            "source": "豆瓣",
            "url": "https://example.com/movie",
            "_status": "needs_context",
        },
    ]

    result = facts_run(state, FactsConfig(max_facts=20, selected_topic_count=10))

    assert result["facts"] == []
    assert any("Every selected_material" in error["message"] for error in result["errors"])
