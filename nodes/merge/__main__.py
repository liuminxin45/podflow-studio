from protocol.node_runner import run_node_cli
from nodes.merge.node import run
from nodes.merge.config import MergeConfig

if __name__ == "__main__":
    run_node_cli("merge", run, MergeConfig)
