"""
Unified Node Runner

Provides:
  - run_node_cli(): Standard CLI entry point (stdin JSON → stdout JSON)
  - NodeContext: Logging/timing helper to eliminate per-node boilerplate
"""

import sys
import json
import time
from datetime import datetime
from typing import Any

from collections.abc import Callable
from protocol.config_base import NodeConfigBase
from protocol.manifest import PipelineManifest

type RunFunc = Callable[[dict[str, Any], Any], dict[str, Any]]


class NodeContext:
    """
    Lightweight helper that every node.run() can use to avoid repeating
    ~20 lines of start/end logging, timing, and debug-mode detection.

    Usage in node.py::

        def run(state, config=None):
            config = config or MyConfig()
            ctx = NodeContext("MyNode", state)
            ctx.log_start(f"input_count={len(state.get('items', []))}")
            # ... core logic ...
            ctx.log_end(f"output_count={len(results)}")
            return ctx.finalize(state)
    """

    def __init__(self, label: str, state: dict[str, Any]):
        self.label = label
        self.logs: list[str] = state.get("logs", [])
        self.errors: list[str] = state.get("errors", [])
        self._t0 = time.time()
        self._start_ts = datetime.now().isoformat()
        rc = state.get("runtime_config", {})
        self.debug_mode: bool = rc.get("debug_mode", {}).get("enabled", False)
        self.auto_execute: bool = rc.get("auto_execute", False)
        self.episode_id: str = state.get("episode_id", "N/A")

    def log(self, msg: str) -> None:
        self.logs.append(f"[{self.label}] {msg}")

    def log_start(self, detail: str = "", *, uses_llm: bool = False) -> None:
        self.log("========== 节点启动 ==========")
        self.log(f"启动时间: {self._start_ts}")
        self.log(f"输入状态: episode_id={self.episode_id}")
        if detail:
            self.log(detail)
        if uses_llm and self.debug_mode:
            self.log("⚡ DEBUG MODE ACTIVE")
        elif not uses_llm:
            self.log(f"debug_mode={self.debug_mode} (此节点不使用LLM, 不受debug_mode影响)")

    def log_end(self, detail: str = "") -> None:
        elapsed = time.time() - self._t0
        self.log("========== 节点完成 ==========")
        self.log(f"完成时间: {datetime.now().isoformat()} | 耗时: {elapsed:.2f}s")
        if detail:
            self.log(detail)
        node_name = self.label.replace("Node", "").lower()
        err_count = sum(
            1 for error in self.errors if isinstance(error, dict) and error.get("node") == node_name
        )
        self.log(f"错误数: {err_count}")

    def add_error(self, node_name: str, message: str, detail: str | None = None) -> None:
        self.errors.append(
            {
                "node": node_name,
                "message": message,
                "detail": detail or message,
            }
        )

    @property
    def elapsed(self) -> float:
        return time.time() - self._t0

    def finalize(self, state: dict[str, Any]) -> dict[str, Any]:
        state["logs"] = self.logs
        state["errors"] = self.errors
        # Record completion in pipeline manifest
        node_name = self.label.replace("Node", "").lower()
        err_count = sum(
            1 for error in self.errors if isinstance(error, dict) and error.get("node") == node_name
        )
        PipelineManifest.record(state, node_name, self.elapsed, error_count=err_count)
        return state


def run_node_cli(
    node_name: str,
    run_func: RunFunc,
    config_class: type[NodeConfigBase],
) -> None:
    """
    Standard CLI entry point for nodes.

    Args:
        node_name: Node identifier for error messages
        run_func: The node's run() function
        config_class: The node's config class

    Reads JSON state from stdin, executes node, writes result to stdout.
    Exit code 0 on success, 1 on failure.
    """
    try:
        input_data = json.loads(sys.stdin.read())
        config_data = input_data.get("runtime_config", {}).get(node_name, {})
        config = config_class.from_dict(config_data) if config_data else config_class()

        result = run_func(input_data, config)
        print(json.dumps(result, ensure_ascii=False))
        sys.exit(0)

    except json.JSONDecodeError as e:
        error_output = {
            "errors": [
                {"node": node_name, "message": f"Invalid JSON input: {str(e)}", "detail": str(e)}
            ]
        }
        print(json.dumps(error_output, ensure_ascii=False), file=sys.stderr)
        sys.exit(1)

    except Exception as e:
        error_output = {"errors": [{"node": node_name, "message": str(e), "detail": str(e)}]}
        print(json.dumps(error_output, ensure_ascii=False), file=sys.stderr)
        sys.exit(1)
