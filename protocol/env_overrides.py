"""Environment variable overrides for the CLI / GitHub Actions automation path.

Maps ``PODFLOW_*`` process environment variables into a workflow state's
``runtime_config`` so the auto-episode entry point can drive topic selection,
LLM provider, TTS engine and fetch sources without a desktop UI.

LLM secrets are deliberately NOT written into ``runtime_config``. The Gemini
provider resolves its key from ``GEMINI_API_KEY`` / ``GOOGLE_API_KEY`` /
``PODFLOW_LLM_API_KEY`` at runtime (see ``protocol.llm_runtime``), so keys never
persist into the workflow state.
"""

from __future__ import annotations

import os
from typing import Any

_ENV_TRUE = {"1", "true", "yes", "on"}


def _env(name: str) -> str:
    return os.environ.get(name, "").strip()


def _int_env(name: str, default: int) -> int:
    raw = _env(name)
    if not raw:
        return default
    try:
        return int(raw)
    except ValueError:
        return default


def _list_env(name: str) -> list[str]:
    return [part.strip() for part in _env(name).split(",") if part.strip()]


def _nested(rc: dict[str, Any], key: str) -> dict[str, Any]:
    node = rc.setdefault(key, {})
    if not isinstance(node, dict):
        node = {}
        rc[key] = node
    return node


def apply_env_overrides(state: dict[str, Any]) -> dict[str, Any]:
    """Apply PODFLOW_* env vars to ``state["runtime_config"]`` in place."""
    rc = state.setdefault("runtime_config", {})
    if not isinstance(rc, dict):
        rc = {}
        state["runtime_config"] = rc

    if _env("PODFLOW_AUTO_EXECUTE").lower() in _ENV_TRUE:
        rc["auto_execute"] = True

    if _env("PODFLOW_TARGET_TOPIC"):
        _nested(rc, "discover")["target_topic"] = _env("PODFLOW_TARGET_TOPIC")
    if _env("PODFLOW_TIME_RANGE_HOURS"):
        _nested(rc, "discover")["time_range_hours"] = _int_env("PODFLOW_TIME_RANGE_HOURS", 24)
    if _env("PODFLOW_MAX_ITEMS"):
        _nested(rc, "discover")["max_items"] = _int_env("PODFLOW_MAX_ITEMS", 10)

    if _env("PODFLOW_ORGANIZE_MODE"):
        _nested(rc, "organize")["mode"] = _env("PODFLOW_ORGANIZE_MODE")

    if _env("PODFLOW_LLM_PROVIDER"):
        _nested(rc, "script")["provider_kind"] = _env("PODFLOW_LLM_PROVIDER")
    if _env("PODFLOW_LLM_API_BASE"):
        _nested(rc, "script")["api_base"] = _env("PODFLOW_LLM_API_BASE")
    if _env("PODFLOW_LLM_MODEL"):
        _nested(rc, "script")["llm_model"] = _env("PODFLOW_LLM_MODEL")
    if _env("PODFLOW_LLM_API_KEY_ENV_VAR"):
        _nested(rc, "script")["api_key_env_var"] = _env("PODFLOW_LLM_API_KEY_ENV_VAR")

    if _env("PODFLOW_TTS_ENGINE"):
        _nested(rc, "tts")["engine"] = _env("PODFLOW_TTS_ENGINE")
    if _env("PODFLOW_TTS_VOICE"):
        _nested(rc, "tts")["default_voice"] = _env("PODFLOW_TTS_VOICE")

    sources = _list_env("PODFLOW_FETCH_SOURCES")
    if sources:
        _nested(rc, "fetch")["enabled_sources"] = sources
    rss_urls = _list_env("PODFLOW_RSS_URLS")
    if rss_urls:
        _nested(rc, "fetch")["rss_urls"] = rss_urls
    newsnow_ids = _list_env("PODFLOW_NEWSNOW_SOURCE_IDS")
    if newsnow_ids:
        _nested(rc, "fetch")["newsnow_source_ids"] = newsnow_ids

    return state
