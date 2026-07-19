"""
Mock Data Factory for Node Testing

Provides standardized mock data for testing all nodes.
"""

from typing import Any
from datetime import datetime

from protocol.presets import get_default_preset
from protocol.episode_models import SCHEMA_VERSION


def create_base_state() -> dict[str, Any]:
    """Create base state with all required fields"""
    return {
        "episode_id": "test_ep_001",
        "created_at": datetime.now().isoformat(),
        "schema_version": SCHEMA_VERSION,
        "preset": get_default_preset(),
        "source_inputs": [],
        "runtime_config": {},
        "logs": [],
        "errors": [],
        "fetch_contents": [],
        "cleaned_contents": [],
        "researched_contents": [],
        "facts": [],
        "selected_topic": {},
        "selected_topics": [],
        "selected_materials": [],
        "auto_selected_items": [],
        "auto_rejected_items": [],
        "script": {},
        "edited_script": {},
        "generation_request": {},
        "generation_meta": {},
        "script_snapshots": [],
        "downstream_stale": {},
        "voice_segments": [],
        "audio_outputs": {},
        "cover_path": "",
        "intro_outro_paths": {},
        "publish_outputs": {},
        "subtitle_path": "",
        "run_report": {},
        "discover_meta": {},
        "discover_ui": {},
        "organize_ui": {},
        "episode_brief": {},
        "writing_meta": {},
        "_manifest": {},
    }


def create_mock_fetch_contents() -> list[dict[str, Any]]:
    """Create mock contents for fetch node output"""
    return [
        {
            "title": "AI Breakthrough in Natural Language Processing",
            "content": "Researchers have developed a new transformer architecture that achieves state-of-the-art results on multiple NLP benchmarks. The model uses a novel attention mechanism that reduces computational complexity while maintaining high accuracy. This breakthrough could revolutionize how we process and understand human language in AI systems. "
            * 5,
            "url": "https://example.com/ai-nlp-breakthrough",
            "published": "2026-02-07T10:00:00Z",
            "source": "https://tech-news.example.com/rss",
            "type": "rss",
        },
        {
            "title": "Quantum Computing Reaches New Milestone",
            "content": "Scientists at a leading research lab have successfully demonstrated quantum supremacy with a 100-qubit processor. The achievement marks a significant step forward in practical quantum computing applications. The team was able to solve complex optimization problems that would take classical computers thousands of years. "
            * 5,
            "url": "https://example.com/quantum-milestone",
            "published": "2026-02-07T12:30:00Z",
            "source": "https://science-daily.example.com/rss",
            "type": "rss",
        },
        {
            "title": "New Programming Language Gains Popularity",
            "content": "A modern programming language designed for systems programming has seen rapid adoption in the developer community. The language combines memory safety with performance, making it ideal for building reliable and efficient software. Major tech companies are already using it in production systems. "
            * 5,
            "url": "https://example.com/new-lang",
            "published": "2026-02-07T14:00:00Z",
            "source": "https://dev-news.example.com/rss",
            "type": "rss",
        },
        {
            "title": "Short article",
            "content": "Too short to process.",
            "url": "https://example.com/short",
            "published": "2026-02-07T15:00:00Z",
            "source": "https://example.com/rss",
            "type": "rss",
        },
    ]


def create_mock_cleaned_contents() -> list[dict[str, Any]]:
    """Create mock cleaned contents for preprocess node output"""
    fetched = create_mock_fetch_contents()
    return fetched[:3]


def create_mock_researched_contents() -> list[dict[str, Any]]:
    """Create mock researched contents for research node output"""
    cleaned = create_mock_cleaned_contents()
    for item in cleaned:
        item["research_summary"] = f"Research summary for: {item['title']}"
        item["key_points"] = ["Key point 1", "Key point 2", "Key point 3"]
    return cleaned


def create_mock_topic() -> dict[str, Any]:
    """Create mock selected topic"""
    return {
        "title": "AI and Quantum Computing Advances",
        "description": "Recent breakthroughs in artificial intelligence and quantum computing are reshaping the technology landscape",
        "keywords": ["AI", "quantum computing", "technology", "innovation"],
        "cluster_size": 2,
    }


def create_mock_materials() -> list[dict[str, Any]]:
    """Create mock selected materials"""
    return [{**item, "_status": "ready"} for item in create_mock_researched_contents()[:2]]


def create_mock_script() -> dict[str, Any]:
    """Create mock podcast script"""
    return {
        "title": "Tech Frontiers: AI and Quantum Breakthroughs",
        "description": "Exploring the latest advances in AI and quantum computing",
        "content_type": "news_brief",
        "preset_id": "morning_news_brief",
        "num_hosts": 1,
        "segments": [
            {
                "id": "seg_001",
                "type": "opening",
                "title": "开场",
                "text": "大家好，欢迎来到本期科技早报。今天我们快速看几条科技进展。",
                "source_fact_ids": ["fact_001"],
                "estimated_seconds": 8,
                "speaker": "Host A",
            },
            {
                "id": "seg_002",
                "type": "quick_news",
                "title": "AI Breakthrough",
                "text": "第一条，AI 自然语言处理有了新突破，研究人员提出了新的架构。",
                "source_fact_ids": ["fact_001"],
                "estimated_seconds": 10,
                "speaker": "Host A",
            },
            {
                "id": "seg_003",
                "type": "closing",
                "title": "结尾",
                "text": "今天的新闻早报就到这里，发布前请继续核对来源。",
                "source_fact_ids": ["fact_001"],
                "estimated_seconds": 8,
                "speaker": "Host A",
            },
        ],
    }


def create_state_for_node(node_name: str) -> dict[str, Any]:
    """
    Create appropriate state for testing a specific node.

    Each node requires certain fields to be populated from previous nodes.
    """
    state = create_base_state()

    if node_name == "fetch":
        return state

    if node_name == "preprocess":
        state["fetch_contents"] = create_mock_fetch_contents()
        return state

    if node_name == "research":
        state["cleaned_contents"] = create_mock_cleaned_contents()
        return state

    if node_name == "topic_selection":
        state["researched_contents"] = create_mock_researched_contents()
        return state

    if node_name == "facts":
        state["selected_materials"] = create_mock_materials()
        state["cleaned_contents"] = create_mock_cleaned_contents()
        return state

    if node_name == "script":
        state["selected_topic"] = create_mock_topic()
        state["selected_materials"] = create_mock_materials()
        from protocol.morning_news import build_fact_cards, select_news_topics

        state["facts"] = build_fact_cards(state["selected_materials"])
        state["selected_topics"] = select_news_topics(state["facts"])
        return state

    if node_name == "tts":
        state["edited_script"] = create_mock_script()
        return state

    if node_name == "audio_postprocess":
        state["voice_segments"] = []
        return state

    if node_name == "assets":
        state["script"] = create_mock_script()
        state["audio_outputs"] = {"final_audio_path": "out/episodes/test_ep_001.mp3"}
        return state

    if node_name == "review":
        state["edited_script"] = create_mock_script()
        state["audio_outputs"] = {"final_audio_path": "out/episodes/test_ep_001.mp3"}
        state["cover_path"] = "out/assets/test_ep_001_cover.jpg"
        return state

    if node_name == "publish":
        state["edited_script"] = create_mock_script()
        state["audio_outputs"] = {"final_audio_path": "out/episodes/test_ep_001.mp3"}
        return state

    return state
