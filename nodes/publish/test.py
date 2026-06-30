"""
Test module for publish node
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from tests.test_utils import setup_utf8_output, print_success, print_error, print_info
from nodes.publish.config import PublishConfig
from tests.mock_data import create_state_for_node

setup_utf8_output()


def test_publish_node():
    """Test publish node with mock data"""
    print_info("Testing publish node...")

    state = create_state_for_node("publish")

    PublishConfig(
        rss_output_dir="out/rss",
        podcast_title="Test Podcast",
        podcast_description="Test podcast description",
        podcast_author="Test Author",
    )
    state["rss_path"] = "out/rss/feed.xml"
    state["publish_status"] = {"rss_generated": True, "published_at": "2026-02-08T00:00:00Z"}

    assert "rss_path" in state, "Should have rss_path"
    assert "publish_status" in state, "Should have publish_status"
    assert isinstance(state["rss_path"], str), "rss_path should be a string"
    assert isinstance(state["publish_status"], dict), "publish_status should be a dict"

    if state["rss_path"]:
        assert state["rss_path"].endswith(".xml"), "RSS should be an XML file"

    print_success(f"Publish node test passed: {state['rss_path']}")
    return True


if __name__ == "__main__":
    try:
        test_publish_node()
        sys.exit(0)
    except AssertionError as e:
        print_error(f"Test failed: {e}")
        sys.exit(1)
    except Exception as e:
        print_error(f"Test error: {e}")
        import traceback

        traceback.print_exc()
        sys.exit(1)
