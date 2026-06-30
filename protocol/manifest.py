"""
Pipeline Manifest — artifact tracking and resume support.

Records which nodes have completed, their output state keys,
timing, and error counts. Stored as `_manifest` in the pipeline state.

Usage:
    from protocol.manifest import PipelineManifest

    # After node completes (automatically called by NodeContext.finalize):
    PipelineManifest.record(state, "fetch", 2.3, ["fetch_contents"])

    # Check which nodes have completed:
    manifest = PipelineManifest.load(state)
    completed = manifest.completed_nodes()

    # Resume from a specific node:
    resume_idx = manifest.resume_index(PIPELINE_ORDER)
"""

from typing import Any
from datetime import datetime


PIPELINE_ORDER = [
    "fetch",
    "manual",
    "merge",
    "preprocess",
    "research",
    "topic_selection",
    "script",
    "tts",
    "audio_postprocess",
    "assets",
    "review",
    "publish",
]

# Map of node name → state keys it produces
NODE_OUTPUT_KEYS: dict[str, list[str]] = {
    "fetch": ["fetch_contents"],
    "manual": ["manual_contents"],
    "merge": ["raw_contents"],
    "preprocess": ["cleaned_contents"],
    "research": ["researched_contents"],
    "topic_selection": ["selected_topic", "selected_materials"],
    "script": ["script", "stages"],
    "tts": ["audio_segments"],
    "audio_postprocess": ["final_audio_path"],
    "assets": ["cover_path"],
    "review": ["review_summary"],
    "publish": ["publish_status"],
}


class PipelineManifest:
    """Reads/writes the `_manifest` dict inside pipeline state."""

    @staticmethod
    def load(state: dict[str, Any]) -> "PipelineManifest":
        return PipelineManifest(state.get("_manifest", {}))

    def __init__(self, data: dict[str, Any]):
        self._data = data

    @property
    def nodes(self) -> dict[str, Any]:
        return self._data.get("nodes", {})

    def completed_nodes(self) -> list[str]:
        """Return node names that completed successfully, in pipeline order."""
        return [
            n for n in PIPELINE_ORDER if n in self.nodes and self.nodes[n].get("status") == "ok"
        ]

    def resume_index(self, pipeline: list[str] | None = None) -> int:
        """Return the index of the first incomplete node in the pipeline.
        Returns 0 if nothing completed, len(pipeline) if all completed."""
        pipeline = pipeline or PIPELINE_ORDER
        completed = set(self.completed_nodes())
        for i, node in enumerate(pipeline):
            if node not in completed:
                return i
        return len(pipeline)

    def last_completed_node(self) -> str | None:
        completed = self.completed_nodes()
        return completed[-1] if completed else None

    @staticmethod
    def record(
        state: dict[str, Any],
        node_name: str,
        elapsed_seconds: float,
        output_keys: list[str] | None = None,
        error_count: int = 0,
    ) -> None:
        """Record a node completion into the state's _manifest."""
        if "_manifest" not in state:
            state["_manifest"] = {"created_at": datetime.now().isoformat(), "nodes": {}}
        manifest = state["_manifest"]
        if "nodes" not in manifest:
            manifest["nodes"] = {}

        keys = output_keys or NODE_OUTPUT_KEYS.get(node_name, [])
        output_summary = {}
        for k in keys:
            val = state.get(k)
            if isinstance(val, list):
                output_summary[k] = len(val)
            elif isinstance(val, dict):
                output_summary[k] = list(val.keys())[:5]
            elif val is not None:
                output_summary[k] = type(val).__name__
            else:
                output_summary[k] = None

        manifest["nodes"][node_name] = {
            "status": "ok" if error_count == 0 else "error",
            "completed_at": datetime.now().isoformat(),
            "elapsed_s": round(elapsed_seconds, 2),
            "errors": error_count,
            "outputs": output_summary,
        }
        manifest["last_node"] = node_name
        manifest["updated_at"] = datetime.now().isoformat()
