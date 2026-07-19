"""Smoke test for facts node."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from nodes.facts.config import FactsConfig
from nodes.facts.node import run
from tests.mock_data import create_state_for_node
from tests.test_utils import print_error, print_success, setup_utf8_output

setup_utf8_output()


def test_facts_node():
    state = create_state_for_node("facts")
    state = run(state, FactsConfig())
    assert state["facts"], "Should generate fact cards"
    assert state["selected_topics"], "Should select topics from facts"
    print_success(f"Facts node test passed: {len(state['facts'])} fact cards")
    return True


if __name__ == "__main__":
    try:
        test_facts_node()
        sys.exit(0)
    except AssertionError as exc:
        print_error(f"Test failed: {exc}")
        sys.exit(1)
    except Exception as exc:
        print_error(f"Test error: {exc}")
        import traceback

        traceback.print_exc()
        sys.exit(1)
