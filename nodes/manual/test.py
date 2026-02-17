"""
Test module for manual node
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from tests.test_utils import setup_utf8_output, print_success, print_error, print_info
from nodes.manual.node import run
from nodes.manual.config import ManualConfig
from tests.mock_data import create_state_for_node

setup_utf8_output()


def test_manual_node():
    """Test manual node with mock data"""
    print_info("Testing manual node...")

    state = create_state_for_node("manual")
    config = ManualConfig(news_items=[
        {
            "title": "Manual item",
            "content": "A manually added material for testing",
            "url": "https://example.com/manual",
        }
    ])

    result = run(state, config)

    assert "manual_contents" in result, "Should have manual_contents"
    assert isinstance(result["manual_contents"], list), "manual_contents should be a list"
    assert len(result["manual_contents"]) == 1, "Should output one manual item"

    item = result["manual_contents"][0]
    assert item.get("source") == "manual_input", "Manual source should be tagged"
    assert item.get("type") == "manual", "Manual type should be tagged"

    print_success("Manual node test passed")
    return True


if __name__ == "__main__":
    try:
        test_manual_node()
        sys.exit(0)
    except AssertionError as e:
        print_error(f"Test failed: {e}")
        sys.exit(1)
    except Exception as e:
        print_error(f"Test error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
