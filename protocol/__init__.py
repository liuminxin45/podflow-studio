"""Protocol package exports with lazy imports.

Keeping these exports lazy lets lightweight modules such as the LLM gateway
start without importing every workflow dependency up front.
"""

from importlib import import_module
from typing import Any

_EXPORTS = {
    "LLMConfigMixin": ("protocol.config_base", "LLMConfigMixin"),
    "LLMRuntime": ("protocol.llm_runtime", "LLMRuntime"),
    "LLMRuntimeTarget": ("protocol.llm_runtime", "LLMRuntimeTarget"),
    "NodeConfigBase": ("protocol.config_base", "NodeConfigBase"),
    "NodeContext": ("protocol.node_runner", "NodeContext"),
    "run_node_cli": ("protocol.node_runner", "run_node_cli"),
    "PodcastState": ("protocol.state", "PodcastState"),
}

__all__ = list(_EXPORTS)


def __getattr__(name: str) -> Any:
    if name not in _EXPORTS:
        raise AttributeError(f"module {__name__!r} has no attribute {name!r}")

    module_name, attr_name = _EXPORTS[name]
    value = getattr(import_module(module_name), attr_name)
    globals()[name] = value
    return value
