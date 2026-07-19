"""
Test module for preprocess node
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from tests.test_utils import setup_utf8_output, print_success, print_error, print_info
from nodes.preprocess.node import run
from nodes.preprocess.config import PreprocessConfig
from tests.mock_data import create_state_for_node

setup_utf8_output()


def test_preprocess_node():
    """Test preprocess node with mock data"""
    print_info("Testing preprocess node...")

    state = create_state_for_node("preprocess")

    config = PreprocessConfig(
        min_content_length=50,
        max_content_length=10000,
        remove_duplicates=True,
        similarity_threshold=0.85,
    )

    initial_count = len(state["fetch_contents"])
    result = run(state, config)

    assert "cleaned_contents" in result, "Should have cleaned_contents"
    assert isinstance(result["cleaned_contents"], list), "cleaned_contents should be a list"
    assert len(result["cleaned_contents"]) > 0, "Should have cleaned content"
    assert len(result["cleaned_contents"]) <= initial_count, "Should filter some content"

    for item in result["cleaned_contents"]:
        assert len(item.get("content", "")) >= config.min_content_length, (
            "All content should meet minimum length"
        )

    state = result

    print_success(
        f"Preprocess node test passed: {initial_count} -> {len(state['cleaned_contents'])} items"
    )
    return True


if __name__ == "__main__":
    try:
        test_preprocess_node()
        sys.exit(0)
    except AssertionError as e:
        print_error(f"Test failed: {e}")
        sys.exit(1)
    except Exception as e:
        print_error(f"Test error: {e}")
        import traceback

        traceback.print_exc()
        sys.exit(1)
