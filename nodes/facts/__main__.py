from nodes.facts.node import run
from nodes.facts.config import FactsConfig
from protocol.node_runner import run_node_cli


if __name__ == "__main__":
    run_node_cli("facts", run, FactsConfig)
