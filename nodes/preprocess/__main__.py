from protocol.node_runner import run_node_cli
from nodes.preprocess.node import run
from nodes.preprocess.config import PreprocessConfig

if __name__ == "__main__":
    run_node_cli("preprocess", run, PreprocessConfig)
