from protocol.node_runner import run_node_cli
from nodes.script.node import run
from nodes.script.config import ScriptConfig

if __name__ == "__main__":
    run_node_cli("script", run, ScriptConfig)
