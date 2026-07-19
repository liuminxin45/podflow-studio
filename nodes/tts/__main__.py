from protocol.node_runner import run_node_cli
from nodes.tts.node import run
from nodes.tts.config import TTSConfig

if __name__ == "__main__":
    run_node_cli("tts", run, TTSConfig)
