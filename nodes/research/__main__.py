from protocol.node_runner import run_node_cli
from nodes.research.node import run
from nodes.research.config import ResearchConfig

if __name__ == "__main__":
    run_node_cli("research", run, ResearchConfig)
