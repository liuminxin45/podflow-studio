from protocol.node_runner import run_node_cli
from nodes.topic_selection.node import run
from nodes.topic_selection.config import TopicSelectionConfig

if __name__ == "__main__":
    run_node_cli("topic_selection", run, TopicSelectionConfig)
