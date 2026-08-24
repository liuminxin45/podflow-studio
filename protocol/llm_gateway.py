"""Local task-only Python AI gateway for the Electron desktop process."""

from __future__ import annotations

import argparse
import json
import os
import signal
import subprocess
import sys
import threading
import time
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any, Callable

from protocol.ai_provider import LLMError

GATEWAY_VERSION = "2"
SERVER_NAME = "PodFlowAIGateway"
PROJECT_ERROR_STATUS = {
    "AUTH": HTTPStatus.UNAUTHORIZED,
    "RATE_LIMIT": HTTPStatus.TOO_MANY_REQUESTS,
    "TIMEOUT": HTTPStatus.GATEWAY_TIMEOUT,
    "NETWORK": HTTPStatus.BAD_GATEWAY,
    "PARSE": HTTPStatus.BAD_GATEWAY,
    "CONFIG": HTTPStatus.BAD_REQUEST,
    "PROVIDER": HTTPStatus.BAD_GATEWAY,
    "CANCELLED": HTTPStatus.CONFLICT,
    "QUALITY_GATE": HTTPStatus.UNPROCESSABLE_ENTITY,
    "UNKNOWN": HTTPStatus.INTERNAL_SERVER_ERROR,
}
CLIENT_DISCONNECT_ERRORS = (BrokenPipeError, ConnectionAbortedError, ConnectionResetError)
ACTIVE_TASKS: dict[str, subprocess.Popen[str]] = {}
ACTIVE_TASKS_LOCK = threading.Lock()


def _json_error(error: LLMError) -> dict[str, Any]:
    return {"error": {"message": str(error), "code": error.code, "details": error.details}}


def _terminate_task_process(process: subprocess.Popen[str]) -> None:
    if process.poll() is not None:
        return
    if os.name == "nt":
        subprocess.run(
            ["taskkill", "/PID", str(process.pid), "/T", "/F"],
            check=False,
            capture_output=True,
            text=True,
        )
    else:
        try:
            os.killpg(process.pid, signal.SIGTERM)
        except ProcessLookupError:
            return


def _run_task_in_worker(
    payload: dict[str, Any],
    on_event: Callable[[dict[str, Any]], None] | None = None,
) -> dict[str, Any]:
    request = payload.get("request")
    request_id = str(request.get("request_id") or "") if isinstance(request, dict) else ""
    if not request_id:
        raise LLMError("AI task request_id is required", "CONFIG")
    creation_flags = subprocess.CREATE_NEW_PROCESS_GROUP if os.name == "nt" else 0
    process = subprocess.Popen(
        [sys.executable, "-m", "protocol.ai_task_worker"],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        creationflags=creation_flags,
        start_new_session=os.name != "nt",
    )
    with ACTIVE_TASKS_LOCK:
        if request_id in ACTIVE_TASKS:
            _terminate_task_process(process)
            raise LLMError(f"Duplicate AI request_id: {request_id}", "CONFIG")
        ACTIVE_TASKS[request_id] = process
    try:
        assert process.stdin is not None and process.stdout is not None
        process.stdin.write(json.dumps(payload, ensure_ascii=False))
        process.stdin.close()
        final: dict[str, Any] | None = None
        for line in process.stdout:
            try:
                item = json.loads(line)
            except json.JSONDecodeError as error:
                raise LLMError("AI task worker returned an invalid stream event", "UNKNOWN") from error
            if item.get("kind") == "event":
                if on_event is not None:
                    on_event(item["event"])
            else:
                final = item
        process.wait()
    except Exception:
        _terminate_task_process(process)
        raise
    finally:
        with ACTIVE_TASKS_LOCK:
            if ACTIVE_TASKS.get(request_id) is process:
                ACTIVE_TASKS.pop(request_id, None)
    if process.returncode != 0:
        raise LLMError("AI task was cancelled" if process.returncode else "AI task worker failed", "CANCELLED")
    if final is None:
        raise LLMError("AI task worker omitted its final response", "UNKNOWN")
    if final.get("kind") == "error":
        error = final.get("error") or {}
        raise LLMError(
            str(error.get("message") or "AI task failed"),
            str(error.get("code") or "UNKNOWN"),
            error.get("details") or {},
        )
    result = final.get("result")
    if not isinstance(result, dict):
        raise LLMError("AI task worker omitted the result", "UNKNOWN")
    return result


def _cancel_task(request_id: str) -> bool:
    with ACTIVE_TASKS_LOCK:
        process = ACTIVE_TASKS.get(request_id)
    if process is None:
        return False
    _terminate_task_process(process)
    return True


class LLMGatewayHandler(BaseHTTPRequestHandler):
    server_version = SERVER_NAME
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt: str, *args: Any) -> None:
        print(f"[AIGateway] {self.address_string()} {fmt % args}", file=sys.stderr, flush=True)

    def do_GET(self) -> None:
        if self.path.split("?", 1)[0] == "/health":
            self._send_json({"ok": True, "service": SERVER_NAME, "version": GATEWAY_VERSION, "time": time.time()})
            return
        self._send_json({"error": {"message": "Not found", "code": "CONFIG"}}, HTTPStatus.NOT_FOUND)

    def do_POST(self) -> None:
        try:
            path = self.path.split("?", 1)[0]
            if path == "/ai/tasks/cancel":
                payload = self._read_json()
                if set(payload) != {"request_id"} or not isinstance(payload["request_id"], str):
                    raise LLMError("Cancellation requires only request_id", "CONFIG")
                self._send_json({"success": _cancel_task(payload["request_id"])})
                return
            if path != "/ai/tasks/run":
                self._send_json({"error": {"message": "Not found", "code": "CONFIG"}}, HTTPStatus.NOT_FOUND)
                return
            payload = self._read_json()
            self._send_task_stream(payload)
        except CLIENT_DISCONNECT_ERRORS:
            return
        except LLMError as error:
            self._send_project_error(error)
        except Exception as error:
            self._send_project_error(LLMError(str(error), "UNKNOWN"))

    def _read_json(self) -> dict[str, Any]:
        length = int(self.headers.get("Content-Length", "0") or "0")
        raw = self.rfile.read(length).decode("utf-8") if length > 0 else "{}"
        try:
            data = json.loads(raw)
        except json.JSONDecodeError as error:
            raise LLMError(f"Invalid JSON body: {error}", "PARSE") from error
        if not isinstance(data, dict):
            raise LLMError("JSON body must be an object", "CONFIG")
        return data

    def _send_project_error(self, error: LLMError) -> None:
        try:
            self._send_json(_json_error(error), PROJECT_ERROR_STATUS.get(error.code, HTTPStatus.INTERNAL_SERVER_ERROR))
        except CLIENT_DISCONNECT_ERRORS:
            return

    def _send_task_stream(self, payload: dict[str, Any]) -> None:
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "application/x-ndjson; charset=utf-8")
        self.send_header("Transfer-Encoding", "chunked")
        self.end_headers()

        def send_event(event: dict[str, Any]) -> None:
            self._write_chunk({"kind": "event", "event": event})

        try:
            result = _run_task_in_worker(payload, on_event=send_event)
            self._write_chunk({"kind": "result", "result": result})
        except LLMError as error:
            self._write_chunk({"kind": "error", **_json_error(error)})
        finally:
            self.wfile.write(b"0\r\n\r\n")
            self.wfile.flush()

    def _write_chunk(self, payload: dict[str, Any]) -> None:
        data = (json.dumps(payload, ensure_ascii=False) + "\n").encode("utf-8")
        self.wfile.write(f"{len(data):X}\r\n".encode("ascii"))
        self.wfile.write(data)
        self.wfile.write(b"\r\n")
        self.wfile.flush()

    def _send_json(self, payload: dict[str, Any], status: HTTPStatus = HTTPStatus.OK) -> None:
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)
        self.wfile.flush()


def run(host: str, port: int) -> None:
    server = ThreadingHTTPServer((host, port), LLMGatewayHandler)
    actual_host, actual_port = server.server_address
    ready = {"host": actual_host, "port": actual_port, "baseUrl": f"http://{actual_host}:{actual_port}", "version": GATEWAY_VERSION}
    print(f"LLM_GATEWAY_READY {json.dumps(ready, ensure_ascii=False)}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the PodFlow local AI task gateway.")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=0)
    args = parser.parse_args()
    run(args.host, args.port)


if __name__ == "__main__":
    main()
