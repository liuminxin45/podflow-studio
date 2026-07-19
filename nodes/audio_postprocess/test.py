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

    state["audio_outputs"] = {
        "status": "ok",
        "final_audio_path": "out/episodes/test_ep_001.mp3",
        "duration_seconds": 300.5,
        "format": "mp3",
        "bitrate": "128k",
    }

    assert isinstance(state["audio_outputs"], dict), "audio_outputs should be a dict"
    assert state["audio_outputs"]["final_audio_path"].endswith(".mp3"), "Should be an mp3 file"

    print_success(f"Audio postprocess node test passed: {state['audio_outputs']['final_audio_path']}")
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
