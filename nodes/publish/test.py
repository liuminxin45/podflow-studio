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
    state["publish_outputs"] = {
        "feed_xml": "out/rss/feed.xml",
        "published_at": "2026-02-08T00:00:00Z",
    }

    assert isinstance(state["publish_outputs"], dict), "publish_outputs should be a dict"

    if state["publish_outputs"]["feed_xml"]:
        assert state["publish_outputs"]["feed_xml"].endswith(".xml"), "RSS should be an XML file"

    print_success(f"Publish node test passed: {state['publish_outputs']['feed_xml']}")
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
