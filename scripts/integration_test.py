#!/usr/bin/env python
"""
Integration Test Script

Tests the complete workflow execution with mock data.
"""

import sys
import io
from pathlib import Path

# Fix Windows gbk encoding for emoji output
if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

# Add project root to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from protocol.state import PodcastState
from nodes.preprocess.node import run as preprocess_run
from nodes.preprocess.config import PreprocessConfig
from nodes.merge.node import run as merge_run
from nodes.merge.config import MergeConfig
from nodes.review.node import run as review_run
from nodes.review.config import ReviewConfig


def test_merge_to_preprocess_pipeline():
    """Test basic pipeline: merge -> preprocess"""
    print("=" * 60)
    print("Integration Test: Merge -> Preprocess")
    print("=" * 60)

    # Initialize state with mock fetch + manual data
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
    state["manual_contents"] = [
        {
            "title": "Short Manual",
            "content": "Too short",
            "url": "",
            "source": "manual_input",
            "type": "manual",
            "published": "",
        }
    ]

    print(
        f"  Initial: fetch={len(state['fetch_contents'])}, manual={len(state['manual_contents'])}"
    )

    # Run merge with exact-match dedup (threshold=1.0) to avoid fuzzy false positives
    state = merge_run(state, MergeConfig(deduplicate=True, similarity_threshold=1.0))
    print(f"  After merge: raw_contents={len(state.get('raw_contents', []))}")
    assert len(state["raw_contents"]) == 3, (
        f"Merge should combine all items, got {len(state['raw_contents'])}"
    )

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
    state["script"] = {"title": "Test Episode", "description": "Test"}
    state["stages"] = [
        {"order": 0, "speaker": "Host A", "text": "Hello world " * 20, "estimated_duration": 30},
        {"order": 1, "speaker": "Host B", "text": "Welcome back " * 20, "estimated_duration": 30},
    ]
    state["final_audio_path"] = "out/episodes/test.mp3"
    state["cover_path"] = "out/assets/test_cover.png"
    state["audio_metadata"] = {"duration": 60}

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
    state.raw_contents = [{"test": "data"}]
    state.logs.append("Test log")

    # Serialize
    json_str = state.to_json()
    state_dict = state.to_dict()

    # Deserialize
    restored = PodcastState.from_json(json_str)
    PodcastState.from_dict(state_dict)

    assert restored.episode_id == state.episode_id
    assert len(restored.raw_contents) == 1
    assert len(restored.logs) == 1

    print("✓ JSON serialization works")
    print("✓ Dict conversion works")
    print("\n✅ Serialization test PASSED")
    return True


def main():
    print("\n🧪 Running Integration Tests\n")

    tests = [
        ("Merge->Preprocess Pipeline", test_merge_to_preprocess_pipeline),
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
