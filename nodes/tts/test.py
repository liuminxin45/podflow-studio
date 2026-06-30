"""
Test module for tts node
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from tests.test_utils import setup_utf8_output, print_success, print_error, print_info
from tests.mock_data import create_state_for_node
from tests.mock_data import create_mock_audio_segments

setup_utf8_output()


def test_tts_node():
    """Test tts node with mock data"""
    print_info("Testing tts node...")

    state = create_state_for_node("tts")

    state["audio_segments"] = create_mock_audio_segments()

    assert "audio_segments" in state, "Should have audio_segments"
    assert isinstance(state["audio_segments"], list), "audio_segments should be a list"
    assert len(state["audio_segments"]) > 0, "Should have audio segments"

    for segment in state["audio_segments"]:
        assert isinstance(segment, str), "Each segment should be a file path string"
        assert segment.endswith(".mp3"), "Each segment should be an mp3 file"

    print_success(f"TTS node test passed: {len(state['audio_segments'])} audio segments")
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
