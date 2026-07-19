from protocol.node_runner import run_node_cli
from nodes.audio_postprocess.node import run
from nodes.audio_postprocess.config import AudioPostprocessConfig

if __name__ == "__main__":
    run_node_cli("audio_postprocess", run, AudioPostprocessConfig)
