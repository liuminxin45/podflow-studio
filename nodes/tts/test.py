"""
Test module for tts node
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from tests.test_utils import setup_utf8_output, print_success, print_error, print_info
from tests.mock_data import create_state_for_node

setup_utf8_output()


def test_tts_node():
    """Test tts node with mock data"""
    print_info("Testing tts node...")

    state = create_state_for_node("tts")

    segments = state["edited_script"]["segments"]
    assert segments, "Should have canonical edited script segments"
    assert all(segment.get("text") for segment in segments)

    print_success(f"TTS node input test passed: {len(segments)} script segments")
    return True


if __name__ == "__main__":
    try:
        test_tts_node()
        sys.exit(0)
    except AssertionError as e:
        print_error(f"Test failed: {e}")
        sys.exit(1)
    except Exception as e:
        print_error(f"Test error: {e}")
        import traceback

        traceback.print_exc()
        sys.exit(1)
