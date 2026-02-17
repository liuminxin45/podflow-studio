"""
Test module for review node
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from tests.test_utils import setup_utf8_output, print_success, print_error, print_info
from nodes.review.node import run
from nodes.review.config import ReviewConfig
from tests.mock_data import create_state_for_node

setup_utf8_output()


def test_review_node():
    """Test review node with mock data"""
    print_info("Testing review node...")

    state = create_state_for_node("review")
    config = ReviewConfig(require_approval=False)

    result = run(state, config)

    assert "review_summary" in result, "Should have review_summary"
    assert isinstance(result["review_summary"], dict), "review_summary should be a dict"

    summary = result["review_summary"]
    assert "checks" in summary and isinstance(summary["checks"], list), "Should contain checks list"
    assert "score" in summary, "Should contain score"

    print_success(f"Review node test passed: {summary.get('score')}")
    return True


if __name__ == "__main__":
    try:
        test_review_node()
        sys.exit(0)
    except AssertionError as e:
        print_error(f"Test failed: {e}")
        sys.exit(1)
    except Exception as e:
        print_error(f"Test error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
