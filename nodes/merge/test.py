"""
Test module for merge node
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from tests.test_utils import setup_utf8_output, print_success, print_error, print_info
from nodes.merge.node import run
from nodes.merge.config import MergeConfig
from tests.mock_data import create_state_for_node

setup_utf8_output()


def test_merge_node():
    """Test merge node with mock data"""
    print_info("Testing merge node...")

    state = create_state_for_node("merge")
    config = MergeConfig(deduplicate=True, similarity_threshold=1.0)

    result = run(state, config)

    assert "raw_contents" in result, "Should have raw_contents"
    assert isinstance(result["raw_contents"], list), "raw_contents should be a list"
    assert len(result["raw_contents"]) >= 1, "Merged result should not be empty"

    channels = {item.get("_source_channel") for item in result["raw_contents"]}
    assert "auto" in channels, "Should include auto source channel"
    assert "manual" in channels, "Should include manual source channel"

    print_success(f"Merge node test passed: {len(result['raw_contents'])} merged items")
    return True


if __name__ == "__main__":
    try:
        test_merge_node()
        sys.exit(0)
    except AssertionError as e:
        print_error(f"Test failed: {e}")
        sys.exit(1)
    except Exception as e:
        print_error(f"Test error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
