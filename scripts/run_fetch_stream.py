"""Run the fetch node with source-level progress events.

This script is intentionally separate from the normal node CLI because the
generic node protocol writes one final JSON object to stdout. Here stdout is an
NDJSON event stream consumed by Electron, while the final event still carries
the complete workflow state.
"""

from __future__ import annotations

from contextlib import redirect_stdout
from datetime import datetime, UTC
import json
import sys
import time
from pathlib import Path
from typing import Any

from nodes.fetch.config import FetchConfig
from nodes.fetch.node import (
    _apply_discover_filters,
    _cap_items_per_content_source,
    _fetch_source_items,
    _list_sources,
    _load_source_module,
    _normalize_items,
    _resolve_enabled_sources,
    _resolve_per_source_cap,
)


EVENT_OUT = sys.stdout


def emit(event: dict[str, Any]) -> None:
    event.setdefault("timestamp", datetime.now(UTC).isoformat())
    print(json.dumps(event, ensure_ascii=False), file=EVENT_OUT, flush=True)


def main() -> int:
    started_at = time.time()
    try:
        state = json.loads(sys.stdin.read() or "{}")
    except json.JSONDecodeError as exc:
        emit({"type": "failed", "message": f"Invalid JSON input: {exc}", "detail": str(exc)})
        return 1

    config_data = state.get("runtime_config", {}).get("fetch", {})
    config = FetchConfig.from_dict(config_data) if config_data else FetchConfig()
    logs = state.get("logs", [])
    errors = state.get("errors", [])

    logs.append("[FetchNode] Starting streaming fetch")
    sources_dir = Path(__file__).resolve().parents[1] / "nodes" / "fetch" / "sources"
    if not sources_dir.exists():
        message = f"Sources directory not found: {sources_dir}"
        errors.append({"node": "fetch", "message": message, "detail": message})
        state["fetch_contents"] = []
        state["logs"] = logs
        state["errors"] = errors
        emit({"type": "failed", "message": message, "state": state})
        return 1

    available_sources = _list_sources(sources_dir)
    enabled_sources = _resolve_enabled_sources(config, available_sources)
    logs.append(f"[FetchNode] Enabled sources: {enabled_sources}")
    emit({"type": "started", "sources": enabled_sources, "totalSources": len(enabled_sources)})

    if not enabled_sources:
        logs.append("[FetchNode] No sources selected; skipping fetch")
        state["fetch_contents"] = []
        state["logs"] = logs
        state["errors"] = errors
        emit(
            {
                "type": "completed",
                "rawCount": 0,
                "itemCount": 0,
                "duration": time.time() - started_at,
                "state": state,
            }
        )
        return 0

    all_contents: list[dict[str, Any]] = []
    per_source_cap = _resolve_per_source_cap(config)

    for index, source_name in enumerate(enabled_sources):
        source_file = sources_dir / f"{source_name}.py"
        if not source_file.exists():
            message = f"Source file '{source_name}.py' not found"
            logs.append(f"[FetchNode] Warning: {message}, skipping")
            errors.append({"node": "fetch", "source": source_name, "message": message, "detail": message})
            emit(
                {
                    "type": "source_error",
                    "sourceId": source_name,
                    "sourceIndex": index,
                    "message": message,
                }
            )
            continue

        source_label = source_name
        try:
            logs.append(f"[FetchNode] Loading source: {source_name}")
            with redirect_stdout(sys.stderr):
                source_module = _load_source_module(source_name, source_file)

            if not hasattr(source_module, "source"):
                message = f"Source '{source_name}' has no 'source' instance"
                logs.append(f"[FetchNode] Warning: {message}, skipping")
                errors.append({"node": "fetch", "source": source_name, "message": message, "detail": message})
                emit(
                    {
                        "type": "source_error",
                        "sourceId": source_name,
                        "sourceName": source_label,
                        "sourceIndex": index,
                        "message": message,
                    }
                )
                continue

            source_instance = source_module.source
            source_label = getattr(source_instance, "name", source_name) or source_name
            emit(
                {
                    "type": "source_started",
                    "sourceId": source_name,
                    "sourceName": source_label,
                    "sourceIndex": index,
                }
            )
            logs.append(f"[FetchNode] Fetching from: {source_label}")

            with redirect_stdout(sys.stderr):
                items = _fetch_source_items(source_instance, config, logs)
            normalized = _normalize_items(items, source_name, logs)

            if per_source_cap > 0:
                capped = _cap_items_per_content_source(normalized, per_source_cap)
                if len(capped) < len(normalized):
                    logs.append(
                        f"[FetchNode] Capping {source_name} from {len(normalized)} to {len(capped)} ({per_source_cap} per content source)"
                    )
                    normalized = capped

            logs.append(f"[FetchNode] Fetched {len(normalized)} valid items from {source_name}")
            all_contents.extend(normalized)
            emit(
                {
                    "type": "source_items",
                    "sourceId": source_name,
                    "sourceName": source_label,
                    "sourceIndex": index,
                    "items": normalized,
                    "itemCount": len(normalized),
                    "rawCount": len(all_contents),
                }
            )
            emit(
                {
                    "type": "source_done",
                    "sourceId": source_name,
                    "sourceName": source_label,
                    "sourceIndex": index,
                    "itemCount": len(normalized),
                    "rawCount": len(all_contents),
                }
            )
        except Exception as exc:  # noqa: BLE001 - source adapters should not abort the whole run
            message = f"Failed to fetch from {source_name}: {exc}"
            logs.append(f"[FetchNode] Error: {message}")
            errors.append({"node": "fetch", "source": source_name, "message": message, "detail": str(exc)})
            emit(
                {
                    "type": "source_error",
                    "sourceId": source_name,
                    "sourceName": source_label,
                    "sourceIndex": index,
                    "message": message,
                    "detail": str(exc),
                    "rawCount": len(all_contents),
                }
            )

    logs.append(f"[FetchNode] Total items fetched: {len(all_contents)}")
    emit({"type": "filtering_started", "rawCount": len(all_contents)})
    filtered_contents = _apply_discover_filters(all_contents, config, logs)
    logs.append(f"[FetchNode] Final items after discover filtering: {len(filtered_contents)}")
    emit(
        {
            "type": "filtering_done",
            "rawCount": len(all_contents),
            "itemCount": len(filtered_contents),
        }
    )

    state["fetch_contents"] = filtered_contents
    state["logs"] = logs
    state["errors"] = errors
    emit(
        {
            "type": "completed",
            "rawCount": len(all_contents),
            "itemCount": len(filtered_contents),
            "duration": time.time() - started_at,
            "state": state,
        }
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
