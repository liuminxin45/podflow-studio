from protocol.node_runner import run_node_cli
from nodes.assets.node import run
from nodes.assets.config import AssetsConfig

if __name__ == "__main__":
    run_node_cli("assets", run, AssetsConfig)
