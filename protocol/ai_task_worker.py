"""Isolated AI task worker so cancellation can terminate real provider work."""

from __future__ import annotations

import json
import sys

from pydantic import ValidationError

from protocol.ai_provider import LLMError
from protocol.ai_contract import AITaskEvent
from protocol.ai_tasks import run_ai_task


def _emit(payload: dict) -> None:
    sys.stdout.write(json.dumps(payload, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def main() -> None:
    request: dict = {}
    sequence = 0
    try:
        payload = json.loads(sys.stdin.read() or "{}")
        request = payload.get("request", {})
        for event_type, event_payload in (("started", {}), ("progress", {"phase": "executing"})):
            event = AITaskEvent(
                request_id=request.get("request_id", "unknown"),
                task_id=request.get("task_id", "unknown"),
                sequence=sequence,
                type=event_type,
                payload=event_payload,
            )
            _emit({"kind": "event", "event": event.model_dump(mode="json")})
            sequence += 1
        result = run_ai_task(payload.get("request", {}), payload.get("target", {}))
        event = AITaskEvent(
            request_id=request["request_id"],
            task_id=request["task_id"],
            sequence=sequence,
            type="completed",
            payload={"usage": result["usage"]},
        )
        _emit({"kind": "event", "event": event.model_dump(mode="json")})
        response = {"kind": "result", "result": result}
    except ValidationError as error:
        response = {
            "kind": "error",
            "error": {"code": "CONFIG", "message": "AI task contract validation failed", "details": {"errors": error.errors(include_input=False, include_url=False)}},
        }
    except LLMError as error:
        response = {
            "kind": "error",
            "error": {"code": error.code, "message": str(error), "details": error.details or {}},
        }
    except Exception as error:
        response = {
            "kind": "error",
            "error": {"code": "UNKNOWN", "message": "AI task worker failed", "details": {"type": type(error).__name__}},
        }
    if response["kind"] == "error" and request.get("request_id") and request.get("task_id"):
        event = AITaskEvent(
            request_id=request["request_id"],
            task_id=request["task_id"],
            sequence=sequence,
            type="failed",
            payload={"code": response["error"]["code"], "message": response["error"]["message"]},
        )
        _emit({"kind": "event", "event": event.model_dump(mode="json")})
    _emit(response)


if __name__ == "__main__":
    main()
