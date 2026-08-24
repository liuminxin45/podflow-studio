from unittest.mock import ANY, Mock, patch

from protocol.ai_provider import LLMError
from protocol.llm_gateway import ACTIVE_TASKS, LLMGatewayHandler, _cancel_task


def test_project_error_ignores_client_disconnect() -> None:
    handler = object.__new__(LLMGatewayHandler)
    handler._send_json = Mock(side_effect=ConnectionAbortedError("client canceled"))

    handler._send_project_error(LLMError("provider failed", "UNKNOWN"))

    handler._send_json.assert_called_once()


def _post_handler_with_disconnected_writer() -> LLMGatewayHandler:
    handler = object.__new__(LLMGatewayHandler)
    handler.path = "/ai/tasks/run"
    handler._read_json = Mock(return_value={"request": {}, "target": {}})
    handler.send_response = Mock()
    handler.send_header = Mock()
    handler.end_headers = Mock()
    handler.wfile = Mock()
    handler.wfile.write = Mock(side_effect=BrokenPipeError("client disconnected"))
    return handler


def test_post_ignores_disconnect_while_writing_task_stream() -> None:
    handler = _post_handler_with_disconnected_writer()
    with patch("protocol.llm_gateway._run_task_in_worker", return_value={"ok": True}) as run_task:
        handler.do_POST()

    run_task.assert_called_once_with({"request": {}, "target": {}}, on_event=ANY)
    assert handler.wfile.write.call_count >= 1


def test_cancel_task_terminates_registered_worker() -> None:
    process = Mock()
    ACTIVE_TASKS["request-1"] = process
    try:
        with patch("protocol.llm_gateway._terminate_task_process") as terminate:
            assert _cancel_task("request-1") is True
        terminate.assert_called_once_with(process)
    finally:
        ACTIVE_TASKS.pop("request-1", None)
