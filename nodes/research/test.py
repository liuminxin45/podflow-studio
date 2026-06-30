"""
Test module for research node
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from tests.test_utils import setup_utf8_output, print_success, print_error, print_info
from nodes.research.node import run
from nodes.research.config import ResearchConfig
from tests.mock_data import create_state_for_node

setup_utf8_output()


def test_research_node():
    """Test research node with mock data"""
    print_info("Testing research node...")

    state = create_state_for_node("research")

    config = ResearchConfig(enable_web_search=False, max_search_results=5)
    initial_count = len(state["cleaned_contents"])
    result = run(state, config)

    assert "researched_contents" in result, "Should have researched_contents"
    assert isinstance(result["researched_contents"], list), "researched_contents should be a list"
    assert len(result["researched_contents"]) == initial_count, (
        "Should have same number of items as input"
    )

    state = result

    print_success(
        f"Research node test passed: {len(state['researched_contents'])} items researched"
    )
    return True


if __name__ == "__main__":
    try:
        test_research_node()
        sys.exit(0)
    except AssertionError as e:
        print_error(f"Test failed: {e}")
        sys.exit(1)
    except Exception as e:
        print_error(f"Test error: {e}")
        import traceback

        traceback.print_exc()
        sys.exit(1)
