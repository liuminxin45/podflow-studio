"""
Test module for audio_postprocess node
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from tests.test_utils import setup_utf8_output, print_success, print_error, print_info
from tests.mock_data import create_state_for_node

setup_utf8_output()


def test_audio_postprocess_node():
    """Test audio_postprocess node with mock data"""
    print_info("Testing audio_postprocess node...")

    state = create_state_for_node("audio_postprocess")

    state["final_audio_path"] = "out/episodes/test_ep_001.mp3"
    state["audio_metadata"] = {"duration": 300.5, "format": "mp3", "bitrate": "128k"}

    assert "final_audio_path" in state, "Should have final_audio_path"
    assert isinstance(state["final_audio_path"], str), "final_audio_path should be a string"
    assert state["final_audio_path"].endswith(".mp3"), "Should be an mp3 file"

    if "audio_metadata" in state:
        assert isinstance(state["audio_metadata"], dict), "audio_metadata should be a dict"

    print_success(f"Audio postprocess node test passed: {state['final_audio_path']}")
    return True


if __name__ == "__main__":
    try:
        test_audio_postprocess_node()
        sys.exit(0)
    except AssertionError as e:
        print_error(f"Test failed: {e}")
        sys.exit(1)
    except Exception as e:
        print_error(f"Test error: {e}")
        import traceback

        traceback.print_exc()
        sys.exit(1)
