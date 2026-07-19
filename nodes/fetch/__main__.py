from protocol.node_runner import run_node_cli
from nodes.fetch.node import run
from nodes.fetch.config import FetchConfig

if __name__ == "__main__":
    run_node_cli("fetch", run, FetchConfig)
