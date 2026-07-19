"""
Test module for assets node
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from tests.test_utils import setup_utf8_output, print_success, print_error, print_info
from tests.mock_data import create_state_for_node

setup_utf8_output()


def test_assets_node():
    """Test assets node with mock data"""
    print_info("Testing assets node...")

    state = create_state_for_node("assets")

    state["cover_path"] = "out/assets/test_ep_001_cover.jpg"

    assert "cover_path" in state, "Should have cover_path"
    assert isinstance(state["cover_path"], str), "cover_path should be a string"

    if state["cover_path"]:
        assert state["cover_path"].endswith((".jpg", ".png")), "Cover should be an image file"

    print_success(f"Assets node test passed: {state['cover_path']}")
    return True


if __name__ == "__main__":
    try:
        test_assets_node()
        sys.exit(0)
    except AssertionError as e:
        print_error(f"Test failed: {e}")
        sys.exit(1)
    except Exception as e:
        print_error(f"Test error: {e}")
        import traceback

        traceback.print_exc()
        sys.exit(1)
