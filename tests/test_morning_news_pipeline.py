import json
import os
import wave
from pathlib import Path

import pytest

from nodes.audio_postprocess.config import AudioPostprocessConfig
from nodes.audio_postprocess.node import run as audio_run
from nodes.facts.config import FactsConfig
from nodes.facts.node import run as facts_run
from nodes.publish.config import PublishConfig
from nodes.publish.node import run as publish_run
from nodes.script.config import ScriptConfig
from nodes.script.node import run as script_run
from nodes.tts.config import TTSConfig
from nodes.tts.node import run as tts_run
from protocol.morning_news import build_fact_cards, generate_deterministic_script, resolve_morning_news_structure
from protocol.presets import get_default_preset
from scripts.run_demo_news import run_demo_news
from tests.mock_data import create_base_state, create_mock_fetch_contents


def test_default_preset_is_morning_news_brief():
    preset = get_default_preset()
    script_config = ScriptConfig()
    assert preset["id"] == "morning_news_brief"
    assert preset["template_variant"] == "quick_9_plus_deep_1"
    assert preset["recommended_news_item_count"] == 10
    assert preset["allow_custom_news_item_count"] is True
    assert preset["target_duration_minutes"] == 22
    assert script_config.preset_id == "morning_news_brief"
    assert script_config.num_hosts == 1
    assert script_config.content_type == "news_brief"
    assert script_config.target_duration_minutes == 22
    assert script_config.recommended_news_item_count == 10
    assert script_config.quick_news_recommended_count == 9
    assert script_config.deep_dive_recommended_count == 1
    assert [script_config.episode_chars_min, script_config.episode_chars_max] == [5200, 6200]
    assert script_config.words_per_minute == 250


def test_script_config_rejects_obsolete_and_inconsistent_fields():
    with pytest.raises(ValueError, match="Extra inputs are not permitted"):
        ScriptConfig(news_item_count=7)
    with pytest.raises(ValueError, match="recommended_news_item_count must equal"):
        ScriptConfig(
            recommended_news_item_count=7,
            quick_news_recommended_count=9,
            deep_dive_recommended_count=1,
        )
    with pytest.raises(ValueError, match="quick_news_chars_min"):
        ScriptConfig(quick_news_chars_min=500, quick_news_chars_max=200)
    with pytest.raises(ValueError, match="target_duration_minutes"):
        ScriptConfig(
            words_per_minute=390,
            episode_chars_min=5200,
            episode_chars_max=6200,
        )


def test_demo_data_generates_fact_cards():
    facts = build_fact_cards(create_mock_fetch_contents(), limit=5)
    assert len(facts) >= 3
    assert facts[0]["id"] == "fact_001"
    assert {"title", "summary", "source_url", "claim", "confidence"} <= set(facts[0])


def test_fact_cards_build_from_plain_materials():
    facts = build_fact_cards(
        [
            {
                "title": "官方通报一项公共事件",
                "content": "官方通报称相关处置已经完成，后续将继续公开进展。",
                "source": "Local Gov",
                "url": "https://example.com/notice",
                "published": "2026-07-03T00:00:00Z",
            },
            {
                "title": "监管文件披露重要更新",
                "content": "监管文件显示，这项更新将影响市场预期和行业供给。",
                "source": "SEC",
                "url": "https://www.sec.gov/example",
                "published": "2026-07-03T00:00:00Z",
            },
        ],
        limit=5,
    )

    assert len(facts) == 2
    assert facts[0]["title"] == "官方通报一项公共事件"
    assert facts[0]["confidence"] == "high"
    assert facts[0]["summary"] == "官方通报称相关处置已经完成，后续将继续公开进展。"


def test_fact_card_confidence_uses_source_and_time():
    facts = build_fact_cards(
        [
            {
                "title": "多来源报道一项政策调整",
                "content": "这项政策调整可能影响消费者价格和企业成本。",
                "url": "https://example.com/news",
            }
        ],
        limit=5,
    )

    assert facts[0]["confidence"] == "medium"


def test_fact_cards_use_first_sentence_as_claim():
    facts = build_fact_cards(
        [
            {
                "title": "公司声明产品计划",
                "content": "公司声明称产品将在今年发布。第二句补充说明市场影响。",
                "source": "Company Newsroom",
                "url": "https://example.com/newsroom",
            }
        ],
        limit=5,
    )

    assert len(facts) == 1
    assert facts[0]["claim"] == "公司声明称产品将在今年发布。"


def test_script_segments_reference_fact_ids():
    facts = build_fact_cards(create_mock_fetch_contents(), limit=7)
    script = generate_deterministic_script(facts, get_default_preset(), episode_id="test_ep")
    news_segments = [seg for seg in script["segments"] if seg["type"] in {"quick_news", "deep_dive"}]
    assert news_segments
    assert all(seg["source_fact_ids"] for seg in news_segments)
    assert all(seg["estimated_seconds"] > 0 for seg in news_segments)


def test_deterministic_script_uses_recommended_quick_plus_deep_structure():
    facts = [
        {
            "id": f"fact_{idx + 1:03d}",
            "title": f"新闻 {idx + 1}",
            "summary": f"第 {idx + 1} 条新闻摘要。",
            "claim": f"第 {idx + 1} 条新闻发生。",
            "confidence": "high",
        }
        for idx in range(10)
    ]
    script = generate_deterministic_script(facts, get_default_preset(), episode_id="test_ep")
    assert [seg["type"] for seg in script["segments"]] == [
        "opening",
        "quick_news",
        "quick_news",
        "quick_news",
        "quick_news",
        "quick_news",
        "quick_news",
        "quick_news",
        "quick_news",
        "quick_news",
        "deep_dive",
        "closing",
    ]


def test_deterministic_script_allows_non_recommended_counts():
    facts = [
        {
            "id": f"fact_{idx + 1:03d}",
            "title": f"新闻 {idx + 1}",
            "summary": f"第 {idx + 1} 条新闻摘要。",
            "claim": f"第 {idx + 1} 条新闻发生。",
            "confidence": "high",
        }
        for idx in range(3)
    ]
    state = create_base_state()
    state["facts"] = facts
    state["edited_script"] = generate_deterministic_script(facts, get_default_preset(), episode_id="test_ep")
    report = state["run_report"] = {}
    from protocol.morning_news import build_run_report

    report = build_run_report(state)
    news_segments = [seg for seg in state["edited_script"]["segments"] if seg["type"] in {"quick_news", "deep_dive"}]
    assert len(news_segments) == 3
    assert [seg["type"] for seg in news_segments] == ["quick_news", "quick_news", "deep_dive"]
    assert any(warning["code"] == "below_recommended_news_items" for warning in report["warnings"])


def test_morning_news_structure_honors_custom_count_and_preserves_sparse_days():
    medium = get_default_preset()
    dense = resolve_morning_news_structure(12, medium)
    sparse = resolve_morning_news_structure(2, medium)

    assert dense["actual_news_item_count"] == 12
    assert dense["actual_quick_news_count"] == 11
    assert dense["actual_deep_dive_count"] == 1
    assert sparse["actual_news_item_count"] == 2
    assert sparse["actual_quick_news_count"] == 2
    assert sparse["actual_deep_dive_count"] == 0


def test_morning_news_structure_caps_dense_days_when_custom_count_is_disabled():
    preset = {**get_default_preset(), "allow_custom_news_item_count": False}
    dense = resolve_morning_news_structure(12, preset)

    assert dense["actual_news_item_count"] == 10
    assert dense["actual_quick_news_count"] == 9
    assert dense["actual_deep_dive_count"] == 1


def test_script_node_honors_more_curated_topics_when_custom_count_is_enabled():
    facts = [
        {
            "id": f"fact_{index + 1:03d}",
            "title": f"新闻 {index + 1}",
            "summary": f"新闻 {index + 1} 的事实。",
            "claim": f"新闻 {index + 1} 已发生。",
            "confidence": "high",
            "source_url": f"https://example.com/{index + 1}",
        }
        for index in range(12)
    ]
    state = create_base_state()
    state["facts"] = facts
    state["selected_topics"] = [
        {"id": f"topic_{index + 1:03d}", "fact_id": fact["id"], "title": fact["title"]}
        for index, fact in enumerate(facts)
    ]

    result = script_run(state, ScriptConfig(allow_custom_news_item_count=True))

    news_segments = [
        segment
        for segment in result["script"]["segments"]
        if segment["type"] in {"quick_news", "deep_dive"}
    ]
    assert len(news_segments) == 12
    assert result["script"]["actual_news_item_count"] == 12


def test_duration_config_controls_quick_and_deep_structure():
    facts = [
        {
            "id": f"fact_{idx + 1:03d}",
            "title": f"新闻 {idx + 1}",
            "summary": f"第 {idx + 1} 条新闻摘要。",
            "claim": f"第 {idx + 1} 条新闻发生。",
            "confidence": "high",
        }
        for idx in range(9)
    ]
    short_result = script_run(
        {
            **create_base_state(),
            "facts": facts,
            "selected_topic": {"title": "短早报"},
            "selected_topics": [{"id": f"topic_{idx + 1}", "fact_id": fact["id"], "title": fact["title"]} for idx, fact in enumerate(facts)],
        },
        ScriptConfig(recommended_news_item_count=4, quick_news_recommended_count=4, deep_dive_recommended_count=0, allow_custom_news_item_count=False),
    )
    long_result = script_run(
        {
            **create_base_state(),
            "facts": facts,
            "selected_topic": {"title": "长早报"},
            "selected_topics": [{"id": f"topic_{idx + 1}", "fact_id": fact["id"], "title": fact["title"]} for idx, fact in enumerate(facts)],
        },
        ScriptConfig(recommended_news_item_count=8, quick_news_recommended_count=7, deep_dive_recommended_count=1, allow_custom_news_item_count=False),
    )

    short_news = [segment for segment in short_result["script"]["segments"] if segment["type"] in {"quick_news", "deep_dive"}]
    long_news = [segment for segment in long_result["script"]["segments"] if segment["type"] in {"quick_news", "deep_dive"}]
    assert [segment["type"] for segment in short_news] == ["quick_news"] * 4
    assert [segment["type"] for segment in long_news] == ["quick_news"] * 7 + ["deep_dive"]


def test_script_node_places_the_user_selected_fact_in_the_deep_dive_slot():
    os.environ.pop("OPENAI_API_KEY", None)
    os.environ.pop("OPENAI_API_BASE", None)
    facts = [
        {
            "id": f"fact_{idx + 1:03d}",
            "title": f"新闻 {idx + 1}",
            "summary": f"第 {idx + 1} 条新闻的核验资料。",
            "claim": f"第 {idx + 1} 条新闻发生。",
            "confidence": "high",
            "source_url": f"https://example.com/{idx + 1}",
            **({"is_deep_dive": True} if idx == 1 else {}),
        }
        for idx in range(4)
    ]
    state = {
        **create_base_state(),
        "facts": facts,
        "selected_topic": {"title": "自选深度稿"},
        "selected_topics": [
            {
                "id": f"topic_{idx + 1}",
                "fact_id": fact["id"],
                "title": fact["title"],
                **({"is_deep_dive": True} if fact["id"] == "fact_002" else {}),
            }
            for idx, fact in enumerate(facts)
        ],
    }

    result = script_run(
        state,
        ScriptConfig(recommended_news_item_count=4, quick_news_recommended_count=3, deep_dive_recommended_count=1),
    )
    news_segments = [
        segment
        for segment in result["script"]["segments"]
        if segment["type"] in {"quick_news", "deep_dive"}
    ]

    assert news_segments[-1]["type"] == "deep_dive"
    assert news_segments[-1]["source_fact_ids"] == ["fact_002"]


def test_script_node_keeps_an_explicit_deep_dive_when_it_is_the_only_story():
    os.environ.pop("OPENAI_API_KEY", None)
    os.environ.pop("OPENAI_API_BASE", None)
    fact = {
        "id": "fact_001",
        "title": "唯一新闻",
        "summary": "这是整理页提供的、已经核验过的深度资料。" * 40,
        "claim": "唯一新闻已经发生。",
        "source_url": "https://example.com/only",
        "confidence": "high",
    }
    state = create_base_state()
    state["facts"] = [fact]
    state["selected_topics"] = [
        {
            "id": "topic_001",
            "title": fact["title"],
            "fact_id": fact["id"],
            "is_deep_dive": True,
        }
    ]

    result = script_run(
        state,
        ScriptConfig(recommended_news_item_count=4, quick_news_recommended_count=4, deep_dive_recommended_count=0),
    )

    news_segments = [
        segment
        for segment in result["script"]["segments"]
        if segment["type"] in {"quick_news", "deep_dive"}
    ]
    assert [segment["type"] for segment in news_segments] == ["deep_dive"]
    assert news_segments[0]["source_fact_ids"] == ["fact_001"]
    assert result["script"]["actual_deep_dive_count"] == 1


def test_regeneration_snapshots_current_draft_and_invalidates_downstream_outputs():
    state = create_base_state()
    state["facts"] = build_fact_cards(create_mock_fetch_contents(), limit=3)
    state["selected_topics"] = [
        {"id": f"topic_{index + 1}", "fact_id": fact["id"], "title": fact["title"]}
        for index, fact in enumerate(state["facts"])
    ]
    state["edited_script"] = {
        "id": "old_edit",
        "title": "旧稿",
        "segments": [{"id": "seg_old", "type": "quick_news", "text": "当前人工修改", "source_fact_ids": ["fact_001"]}],
    }
    state["audio_outputs"] = {"final_audio_path": "out/old-final.mp3"}
    state["review_summary"] = {"status": "approved"}
    state["publish_outputs"] = {"feed_xml": "out/old-feed.xml"}
    state["generation_request"] = {
        "mode": "regenerate",
        "draft_snapshot": {
            "id": "ui_edit",
            "segments": [{"id": "seg_ui", "type": "quick_news", "text": "尚未离开页面的修改", "source_fact_ids": ["fact_001"]}],
        },
    }

    result = script_run(state, ScriptConfig(recommended_news_item_count=3, quick_news_recommended_count=2, deep_dive_recommended_count=1))

    assert result["edited_script"]["edit_mode"] == "regenerated"
    assert result["script_snapshots"][-1]["edited_script"]["segments"][0]["text"] == "尚未离开页面的修改"
    assert result["generation_request"] == {}
    assert result["downstream_stale"]["reason"] == "script_regenerated"
    assert result["downstream_stale"]["artifacts"]["audio_outputs"]["final_audio_path"] == "out/old-final.mp3"
    assert result["audio_outputs"] == {}
    assert result["review_summary"] == {}
    assert result["publish_outputs"] == {}


def test_script_node_requires_fact_and_topic_outputs():
    os.environ.pop("OPENAI_API_KEY", None)
    os.environ.pop("OPENAI_API_BASE", None)
    state = create_base_state()
    state["selected_topic"] = {"title": "通勤早咖啡"}
    result = script_run(state, ScriptConfig())
    assert result["script"] == {}
    assert any("Missing facts" in error["message"] for error in result["errors"])


def test_facts_node_runs_before_script_in_primary_path():
    state = create_base_state()
    state["selected_topic"] = {"title": "通勤早咖啡"}
    state["selected_materials"] = [{**item, "_status": "ready"} for item in create_mock_fetch_contents()]
    state = facts_run(state, FactsConfig(max_facts=20, selected_topic_count=7))
    assert state["facts"]
    result = script_run(state, ScriptConfig())
    assert result["_manifest"]["nodes"]["facts"]["status"] == "ok"
    assert result["_manifest"]["nodes"]["script"]["status"] == "ok"


def test_default_facts_and_script_nodes_share_the_ten_item_profile():
    state = create_base_state()
    state["selected_materials"] = [
        {
            "title": f"新闻 {index + 1}",
            "content": f"新闻 {index + 1} 的事实内容。",
            "url": f"https://example.com/{index + 1}",
            "published": "2026-07-16",
            "_status": "ready",
        }
        for index in range(12)
    ]

    state = facts_run(state, FactsConfig())
    result = script_run(state, ScriptConfig(allow_custom_news_item_count=False))

    assert len(state["selected_topics"]) == 10
    news_segments = [
        segment
        for segment in result["script"]["segments"]
        if segment["type"] in {"quick_news", "deep_dive"}
    ]
    assert len(news_segments) == 10


def test_tts_prefers_edited_script(tmp_path: Path):
    state = create_base_state()
    state["script"] = {
        "segments": [
            {
                "id": "seg_001",
                "type": "quick_news",
                "title": "Generated",
                "text": "generated text should not be used",
                "source_fact_ids": ["fact_001"],
                "estimated_seconds": 6,
            }
        ]
    }
    state["edited_script"] = {
        "segments": [
            {
                "id": "seg_001",
                "type": "quick_news",
                "title": "Edited",
                "text": "edited script text must be used",
                "source_fact_ids": ["fact_001"],
                "estimated_seconds": 6,
            }
        ]
    }
    result = tts_run(state, TTSConfig(engine="mock", output_dir=str(tmp_path)))
    assert result["voice_segments"][0]["text"] == "edited script text must be used"
    assert Path(result["voice_segments"][0]["path"]).exists()


def test_audio_assembly_outputs_final_artifact(tmp_path: Path):
    seg_path = tmp_path / "seg_001.wav"
    _write_test_wav(seg_path)
    state = create_base_state()
    state["voice_segments"] = [{"segment_id": "seg_001", "path": str(seg_path)}]
    result = audio_run(
        state,
        AudioPostprocessConfig(output_dir=str(tmp_path), output_format="wav", final_basename="final"),
    )
    assert result["audio_outputs"]["final_audio_path"]
    assert Path(result["audio_outputs"]["final_audio_path"]).exists()
    assert Path(result["audio_outputs"]["audio_report_path"]).exists()


def test_publish_package_outputs_feed_and_marks_local_preview(tmp_path: Path):
    audio_path = tmp_path / "final.wav"
    _write_test_wav(audio_path)
    state = create_base_state()
    state["audio_outputs"] = {"final_audio_path": str(audio_path), "duration_seconds": 0.1}
    state["edited_script"] = {"title": "通勤早咖啡", "description": "demo", "segments": []}
    result = publish_run(
        state,
        PublishConfig(
            local_base_dir=str(tmp_path / "dist" / "episodes"),
            rss_output_dir=str(tmp_path),
            public_base_url="",
        ),
    )
    assert Path(result["publish_outputs"]["feed_xml"]).exists()
    assert result["publish_outputs"]["local_preview_only"] is True
    assert result["run_report"]["warnings"]
    feed = Path(result["publish_outputs"]["feed_xml"]).read_text(encoding="utf-8")
    assert "local-preview only" in feed
    assert "file://" not in feed


def test_demo_news_e2e_runs_without_external_api_keys(tmp_path: Path):
    os.environ.pop("OPENAI_API_KEY", None)
    os.environ.pop("OPENAI_API_BASE", None)
    output_dir = tmp_path / "output"
    state = run_demo_news(output_dir=output_dir, episode_id="test_demo_news")
    required = [
        "facts.json",
        "script.generated.json",
        "script.edited.json",
        "run_report.json",
        "episode.json",
        "feed.xml",
    ]
    for filename in required:
        assert (output_dir / filename).exists(), filename
    assert Path(state["audio_outputs"]["final_audio_path"]).exists()
    report = json.loads((output_dir / "run_report.json").read_text(encoding="utf-8"))
    assert report["preset_id"] == "morning_news_brief"
    assert report["facts"]["total"] == 10
    assert report["script"]["source_for_tts"] == "edited_script"
    assert report["script"]["target_duration_minutes"] == 22
    assert report["script"]["quick_news_count"] == 9
    assert report["script"]["deep_dive_count"] == 1
    assert report["schema_validation"]["ok"] is True
    assert report["rss_validation"]["ok"] is True
    assert state["errors"] == []
    assert state["audio_outputs"]["status"] == "ok"
    assert state["audio_outputs"]["contains_mock_audio"] is True
    assert state["publish_outputs"]["rss_validation"]["ok"] is True
    assert state["publish_outputs"]["local_preview_only"] is True


def test_demo_news_accepts_a_sparse_custom_eight_item_run(tmp_path: Path):
    sample_path = (
        Path(__file__).resolve().parents[1]
        / "examples"
        / "demo-news"
        / "input"
        / "sample-items.json"
    )
    source_items = json.loads(sample_path.read_text(encoding="utf-8"))[:8]

    state = run_demo_news(
        output_dir=tmp_path / "sparse-output",
        episode_id="test_sparse_demo_news",
        source_items=source_items,
    )
    report = state["run_report"]

    assert state["errors"] == []
    assert report["facts"]["total"] == 8
    assert report["script"]["actual_news_item_count"] == 8
    assert any(warning["code"] == "below_recommended_news_items" for warning in report["warnings"])


def test_user_requested_ai_generation_fails_without_overwriting_the_existing_draft():
    os.environ.pop("OPENAI_API_KEY", None)
    os.environ.pop("OPENAI_API_BASE", None)
    state = create_base_state()
    state["facts"] = [
        {
            "id": "fact_001",
            "title": "已整理新闻",
            "summary": "已核验事实。",
            "claim": "已核验事实。",
            "confidence": "high",
            "source_url": "https://example.com/news",
        }
    ]
    state["selected_topics"] = [
        {"id": "topic_001", "title": "已整理新闻", "fact_id": "fact_001"}
    ]
    existing_script = {
        "id": "existing-script",
        "title": "人工旧稿",
        "segments": [{"id": "old", "type": "quick_news", "text": "不要覆盖。"}],
    }
    state["script"] = existing_script.copy()
    state["edited_script"] = existing_script.copy()
    state["generation_request"] = {"mode": "regenerate", "require_llm": True}

    result = script_run(state, ScriptConfig(api_key="", api_base=""))

    assert result["generation_request"]["status"] == "failed"
    assert result["script"] == existing_script
    assert result["edited_script"] == existing_script
    assert any("未使用本地模板覆盖初稿" in error["message"] for error in result["errors"])


def _write_test_wav(path: Path) -> None:
    with wave.open(str(path), "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(16000)
        wav.writeframes(b"\x00" * 3200)
