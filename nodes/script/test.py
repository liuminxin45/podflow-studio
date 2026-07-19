"""
Test module for script node
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from tests.test_utils import setup_utf8_output, print_success, print_error, print_info
from tests.mock_data import create_state_for_node
from tests.mock_data import create_mock_script

setup_utf8_output()


def test_script_node():
    """Test script node with mock data"""
    print_info("Testing script node...")

    state = create_state_for_node("script")

    state["script"] = create_mock_script()

    assert "script" in state, "Should have script"
    assert isinstance(state["script"], dict), "script should be a dict"
    assert "title" in state["script"], "Script should have a title"
    assert isinstance(state["script"]["segments"], list), "segments should be a list"
    assert len(state["script"]["segments"]) > 0, "Should have script segments"

    for segment in state["script"]["segments"]:
        assert "id" in segment, "Each segment should have an id"
        assert "text" in segment, "Each segment should have text"

    print_success(
        f"Script node test passed: '{state['script']['title']}', {len(state['script']['segments'])} segments"
    )
    return True


if __name__ == "__main__":
    try:
        test_script_node()
        sys.exit(0)
    except AssertionError as e:
        print_error(f"Test failed: {e}")
        sys.exit(1)
    except Exception as e:
        print_error(f"Test error: {e}")
        import traceback

        traceback.print_exc()
        sys.exit(1)
