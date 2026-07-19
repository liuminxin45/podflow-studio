from protocol.node_runner import run_node_cli
from nodes.publish.node import run
from nodes.publish.config import PublishConfig

if __name__ == "__main__":
    run_node_cli("publish", run, PublishConfig)
