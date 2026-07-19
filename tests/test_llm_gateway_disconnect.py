from unittest.mock import Mock

from protocol.llm_client import LLMError
from protocol.llm_gateway import LLMGatewayHandler


def test_project_error_ignores_client_disconnect() -> None:
    handler = object.__new__(LLMGatewayHandler)
    handler._send_json = Mock(side_effect=ConnectionAbortedError("client canceled"))

    handler._send_project_error(LLMError("provider failed", "UNKNOWN"))

    handler._send_json.assert_called_once()


def _post_handler_with_disconnected_writer() -> LLMGatewayHandler:
    handler = object.__new__(LLMGatewayHandler)
    handler.path = "/chat/completions"
    handler._read_json = Mock(return_value={})
    handler.send_response = Mock()
    handler.send_header = Mock()
    handler.end_headers = Mock()
    handler.wfile = Mock()
    handler.wfile.write = Mock(side_effect=BrokenPipeError("client disconnected"))
    return handler


def test_post_ignores_disconnect_while_writing_normal_json() -> None:
    handler = _post_handler_with_disconnected_writer()
    handler._handle_chat = Mock(side_effect=lambda _payload: handler._send_json({"ok": True}))

    handler.do_POST()

    handler._handle_chat.assert_called_once_with({})
    handler.wfile.write.assert_called_once()


def test_post_ignores_disconnect_while_writing_sse() -> None:
    handler = _post_handler_with_disconnected_writer()
    handler._handle_chat = Mock(side_effect=lambda _payload: handler._write_sse({"delta": "text"}))

    handler.do_POST()

    handler._handle_chat.assert_called_once_with({})
    handler.wfile.write.assert_called_once()
