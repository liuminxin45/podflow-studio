from protocol.node_runner import run_node_cli
from nodes.review.node import run
from nodes.review.config import ReviewConfig

if __name__ == "__main__":
    run_node_cli("review", run, ReviewConfig)
