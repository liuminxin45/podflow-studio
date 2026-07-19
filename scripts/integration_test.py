#!/usr/bin/env python
"""
Integration Test Script

Tests the complete workflow execution with mock data.
"""

# This executable smoke script reports boolean results from main(); the pytest
# suite has dedicated integration tests with assertion-based semantics.
__test__ = False

import sys
from pathlib import Path

# Fix Windows gbk encoding for emoji output
if sys.platform == "win32":
    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if callable(reconfigure):
            reconfigure(encoding="utf-8", errors="replace")

# Add project root to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from protocol.state import PodcastState
from nodes.preprocess.node import run as preprocess_run
from nodes.preprocess.config import PreprocessConfig
from nodes.review.node import run as review_run
from nodes.review.config import ReviewConfig


def test_fetch_to_preprocess_pipeline():
    """Test basic pipeline: fetch output -> preprocess."""
    print("=" * 60)
    print("Integration Test: Fetch -> Preprocess")
    print("=" * 60)

    # Initialize state with mock fetch data
    state = PodcastState().to_dict()
    state["fetch_contents"] = [
        {
            "title": "AI Breakthrough in Natural Language Processing",
            "content": "Researchers developed a new transformer architecture achieving state-of-the-art NLP results. "
            * 10,
            "url": "https://example.com/1",
            "source": "test",
            "type": "rss",
            "published": "",
        },
        {
            "title": "Quantum Computing Reaches New Milestone",
            "content": "Scientists demonstrated quantum supremacy with a 100-qubit processor solving complex optimization problems. "
            * 10,
            "url": "https://example.com/2",
            "source": "test",
            "type": "rss",
            "published": "",
        },
    ]

    print(f"  Initial: fetch={len(state['fetch_contents'])}")

    # Run preprocess
    preprocess_config = PreprocessConfig(
        min_content_length=50, max_content_length=10000, remove_duplicates=True
    )
    state = preprocess_run(state, preprocess_config)

    print(f"  After preprocess: cleaned_contents={len(state.get('cleaned_contents', []))}")
    print(f"  Logs: {len(state.get('logs', []))} entries, Errors: {len(state.get('errors', []))}")

    assert len(state["cleaned_contents"]) == 2, "Should filter out short content"
    assert len(state["errors"]) == 0, "Should have no errors"
    assert len(state["logs"]) > 0, "Should have log entries"

    print("\n  PASSED")
    return True


def test_review_node():
    """Test review node with mock complete state"""
    print("\n" + "=" * 60)
    print("Integration Test: Review Node")
    print("=" * 60)

    state = PodcastState().to_dict()
    state["edited_script"] = {
        "title": "Test Episode",
        "description": "Test",
        "segments": [
            {"id": "seg_1", "type": "quick_news", "title": "One", "speaker": "Host A", "text": "Hello world " * 20, "source_fact_ids": [], "estimated_seconds": 30},
            {"id": "seg_2", "type": "quick_news", "title": "Two", "speaker": "Host A", "text": "Welcome back " * 20, "source_fact_ids": [], "estimated_seconds": 30},
        ],
    }
    state["audio_outputs"] = {"final_audio_path": "out/episodes/test.mp3", "duration_seconds": 60}
    state["cover_path"] = "out/assets/test_cover.png"

    state = review_run(state, ReviewConfig())
    review = state.get("review_summary", {})

    print(f"  Review score: {review.get('score', 'N/A')}")
    print(f"  Checks: {len(review.get('checks', []))}")
    assert "review_summary" in state, "Should produce review_summary"
    assert len(review.get("checks", [])) > 0, "Should have check results"

    print("\n  PASSED")
    return True


def test_state_serialization():
    """Test state serialization/deserialization"""
    print("\n" + "=" * 60)
    print("Test: State Serialization")
    print("=" * 60)

    # Create state
    state = PodcastState()
    state.fetch_contents = [{"test": "data"}]
    state.logs.append("Test log")

    # Serialize
    json_str = state.to_json()
    state_dict = state.to_dict()

    # Deserialize
    restored = PodcastState.from_json(json_str)
    PodcastState.from_dict(state_dict)

    assert restored.episode_id == state.episode_id
    assert len(restored.fetch_contents) == 1
    assert len(restored.logs) == 1

    print("✓ JSON serialization works")
    print("✓ Dict conversion works")
    print("\n✅ Serialization test PASSED")
    return True


def main():
    print("\n🧪 Running Integration Tests\n")

    tests = [
        ("Fetch->Preprocess Pipeline", test_fetch_to_preprocess_pipeline),
        ("State Serialization", test_state_serialization),
        ("Review Node", test_review_node),
    ]

    results = {}
    for name, test_func in tests:
        try:
            results[name] = test_func()
        except Exception as e:
            print(f"\n❌ Test '{name}' FAILED: {e}")
            import traceback

            traceback.print_exc()
            results[name] = False

    print("\n" + "=" * 60)
    print("Summary")
    print("=" * 60)

    passed = sum(1 for v in results.values() if v)
    total = len(results)

    for name, result in results.items():
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status}: {name}")

    print(f"\nTotal: {passed}/{total} passed")

    if passed == total:
        print("\n🎉 All integration tests passed!")
        sys.exit(0)
    else:
        print("\n❌ Some tests failed")
        sys.exit(1)


if __name__ == "__main__":
    main()
