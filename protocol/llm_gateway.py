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
from typing import Any

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


def _run_task_in_worker(payload: dict[str, Any]) -> dict[str, Any]:
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
        stdout, _stderr = process.communicate(json.dumps(payload, ensure_ascii=False))
    finally:
        with ACTIVE_TASKS_LOCK:
            if ACTIVE_TASKS.get(request_id) is process:
                ACTIVE_TASKS.pop(request_id, None)
    if process.returncode != 0:
        raise LLMError("AI task was cancelled" if process.returncode else "AI task worker failed", "CANCELLED")
    try:
        response = json.loads(stdout)
    except json.JSONDecodeError as error:
        raise LLMError("AI task worker returned an invalid response", "UNKNOWN") from error
    if not response.get("ok"):
        error = response.get("error") or {}
        raise LLMError(
            str(error.get("message") or "AI task failed"),
            str(error.get("code") or "UNKNOWN"),
            error.get("details") or {},
        )
    result = response.get("result")
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
            self._send_json(_run_task_in_worker(payload))
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
