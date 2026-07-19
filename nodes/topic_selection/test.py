"""
Test module for topic_selection node
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from tests.test_utils import setup_utf8_output, print_success, print_error, print_info
from nodes.topic_selection.node import run
from nodes.topic_selection.config import TopicSelectionConfig
from tests.mock_data import create_state_for_node

setup_utf8_output()


def test_topic_selection_node():
    """Test topic_selection node with mock data"""
    print_info("Testing topic_selection node...")

    state = create_state_for_node("topic_selection")

    config = TopicSelectionConfig(min_cluster_size=1, max_topics=1, use_llm_scoring=False)
    result = run(state, config)

    assert "selected_topic" in result, "Should have selected_topic"
    assert "selected_materials" in result, "Should have selected_materials"
    assert isinstance(result["selected_topic"], dict), "selected_topic should be a dict"
    assert isinstance(result["selected_materials"], list), "selected_materials should be a list"

    state = result

    print_success(
        f"Topic selection node test passed: topic='{state['selected_topic'].get('title', 'N/A')}', {len(state['selected_materials'])} materials"
    )
    return True


if __name__ == "__main__":
    try:
        test_topic_selection_node()
        sys.exit(0)
    except AssertionError as e:
        print_error(f"Test failed: {e}")
        sys.exit(1)
    except Exception as e:
        print_error(f"Test error: {e}")
        import traceback

        traceback.print_exc()
        sys.exit(1)
