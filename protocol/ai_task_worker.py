"""Isolated AI task worker so cancellation can terminate real provider work."""

from __future__ import annotations

import json
import sys

from pydantic import ValidationError

from protocol.ai_provider import LLMError
from protocol.ai_tasks import run_ai_task


def main() -> None:
    try:
        payload = json.loads(sys.stdin.read() or "{}")
        result = run_ai_task(payload.get("request", {}), payload.get("target", {}))
        response = {"ok": True, "result": result}
    except ValidationError as error:
        response = {
            "ok": False,
            "error": {"code": "CONFIG", "message": "AI task contract validation failed", "details": {"errors": error.errors(include_input=False, include_url=False)}},
        }
    except LLMError as error:
        response = {
            "ok": False,
            "error": {"code": error.code, "message": str(error), "details": error.details or {}},
        }
    except Exception as error:
        response = {
            "ok": False,
            "error": {"code": "UNKNOWN", "message": "AI task worker failed", "details": {"type": type(error).__name__}},
        }
    sys.stdout.write(json.dumps(response, ensure_ascii=False))
    sys.stdout.flush()


if __name__ == "__main__":
    main()
