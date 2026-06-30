"""
Mock Data Factory for Node Testing

Provides standardized mock data for testing all nodes.
"""

from typing import Any
from datetime import datetime


def create_base_state() -> dict[str, Any]:
    """Create base state with all required fields"""
    return {
        "episode_id": "test_ep_001",
        "created_at": datetime.now().isoformat(),
        "runtime_config": {},
        "logs": [],
        "errors": [],
        "fetch_contents": [],
        "manual_contents": [],
        "raw_contents": [],
        "cleaned_contents": [],
        "researched_contents": [],
        "selected_topic": {},
        "selected_materials": [],
        "script": {},
        "stages": [],
        "audio_segments": [],
        "final_audio_path": "",
        "audio_metadata": {},
        "cover_path": "",
        "intro_outro_paths": {},
        "storage_info": {},
        "rss_path": "",
        "publish_status": {},
        "subtitle_path": "",
    }


def create_mock_raw_contents() -> list[dict[str, Any]]:
    """Create mock raw contents for fetch node output"""
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
    raw = create_mock_raw_contents()
    return raw[:3]


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
    return create_mock_researched_contents()[:2]


def create_mock_script() -> dict[str, Any]:
    """Create mock podcast script"""
    return {
        "title": "Tech Frontiers: AI and Quantum Breakthroughs",
        "description": "Exploring the latest advances in AI and quantum computing",
        "dialogue": [
            {
                "speaker": "主持人A",
                "text": "大家好，欢迎来到本期科技前沿播客。今天我们要聊聊人工智能和量子计算的最新突破。",
            },
            {
                "speaker": "主持人B",
                "text": "是的，最近在自然语言处理领域有一个重大突破，研究人员开发了一种新的 Transformer 架构。",
            },
            {"speaker": "主持人A", "text": "这个新架构有什么特别之处呢？"},
            {
                "speaker": "主持人B",
                "text": "它使用了一种新颖的注意力机制，在保持高准确度的同时降低了计算复杂度。",
            },
            {
                "speaker": "主持人A",
                "text": "另外，量子计算方面也有好消息。科学家们成功展示了 100 量子比特处理器的量子优势。",
            },
            {
                "speaker": "主持人B",
                "text": "这标志着实用量子计算应用迈出了重要一步。他们能够解决经典计算机需要数千年才能完成的复杂优化问题。",
            },
            {"speaker": "主持人A", "text": "这些技术进步将如何影响我们的未来呢？"},
            {
                "speaker": "主持人B",
                "text": "AI 的进步将使机器更好地理解和处理人类语言，而量子计算将解决以前无法解决的问题。",
            },
            {
                "speaker": "主持人A",
                "text": "好的，今天的节目就到这里。感谢大家收听，我们下期再见！",
            },
            {"speaker": "主持人B", "text": "再见！"},
        ],
    }


def create_mock_stages() -> list[dict[str, Any]]:
    """Create mock dialogue stages"""
    script = create_mock_script()
    stages = []
    for i, line in enumerate(script["dialogue"]):
        stages.append(
            {
                "order": i,
                "speaker": line["speaker"],
                "text": line["text"],
                "duration": len(line["text"]) / 150 * 60,
            }
        )
    return stages


def create_mock_audio_segments() -> list[str]:
    """Create mock audio segment paths"""
    return [
        "out/audio_segments/segment_000.mp3",
        "out/audio_segments/segment_001.mp3",
        "out/audio_segments/segment_002.mp3",
        "out/audio_segments/segment_003.mp3",
        "out/audio_segments/segment_004.mp3",
        "out/audio_segments/segment_005.mp3",
        "out/audio_segments/segment_006.mp3",
        "out/audio_segments/segment_007.mp3",
        "out/audio_segments/segment_008.mp3",
        "out/audio_segments/segment_009.mp3",
    ]


def create_state_for_node(node_name: str) -> dict[str, Any]:
    """
    Create appropriate state for testing a specific node.

    Each node requires certain fields to be populated from previous nodes.
    """
    state = create_base_state()

    if node_name == "fetch":
        return state

    if node_name == "manual":
        return state

    if node_name == "merge":
        state["fetch_contents"] = create_mock_raw_contents()[:2]
        state["manual_contents"] = [
            {
                "title": "Manual insight on AI policy",
                "content": "A manual note discussing policy implications of AI deployment.",
                "url": "",
                "published": "",
                "source": "manual_input",
                "type": "manual",
            }
        ]
        return state

    if node_name == "preprocess":
        state["raw_contents"] = create_mock_raw_contents()
        return state

    if node_name == "research":
        state["cleaned_contents"] = create_mock_cleaned_contents()
        return state

    if node_name == "topic_selection":
        state["researched_contents"] = create_mock_researched_contents()
        return state

    if node_name == "script":
        state["selected_topic"] = create_mock_topic()
        state["selected_materials"] = create_mock_materials()
        return state

    if node_name == "tts":
        state["stages"] = create_mock_stages()
        return state

    if node_name == "audio_postprocess":
        state["audio_segments"] = create_mock_audio_segments()
        return state

    if node_name == "assets":
        state["script"] = create_mock_script()
        state["final_audio_path"] = "out/episodes/test_ep_001.mp3"
        return state

    if node_name == "review":
        state["script"] = create_mock_script()
        state["stages"] = create_mock_stages()
        state["final_audio_path"] = "out/episodes/test_ep_001.mp3"
        state["cover_path"] = "out/assets/test_ep_001_cover.jpg"
        return state

    if node_name == "publish":
        state["storage_info"] = {
            "audio_url": "https://storage.example.com/test_ep_001.mp3",
            "cover_url": "https://storage.example.com/test_ep_001_cover.jpg",
        }
        state["script"] = create_mock_script()
        return state

    return state
