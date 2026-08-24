import json
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator
from pydantic import ValidationError

from protocol.ai_contract import AIErrorPayload, AITaskEvent, AITaskRequest, AITaskResult


def test_ai_task_contract_accepts_current_shape():
    request = AITaskRequest(
        request_id="request-1",
        task_id="connection_test",
        target_id="api-openai",
        input={"probe": "ready"},
        stream=True,
    )
    result = AITaskResult(
        request_id=request.request_id,
        task_id=request.task_id,
        output={"ok": True},
    )
    event = AITaskEvent(
        request_id=request.request_id,
        task_id=request.task_id,
        sequence=0,
        type="started",
    )

    assert result.output == {"ok": True}
    assert event.sequence == 0


def test_ai_task_contract_rejects_unknown_fields():
    with pytest.raises(ValidationError):
        AITaskRequest.model_validate({
            "request_id": "request-1",
            "task_id": "connection_test",
            "target_id": "api-openai",
            "input": {},
            "messages": [],
        })


def test_ai_error_contract_includes_quality_and_cancel_codes():
    for code in ("QUALITY_GATE", "CANCELLED"):
        error = AIErrorPayload(code=code, message="blocked")
        assert error.code == code


def test_ai_task_json_schema_matches_request_boundary():
    schema = json.loads(
        (Path(__file__).parents[1] / "protocol" / "schemas" / "ai_task.schema.json")
        .read_text(encoding="utf-8")
    )
    request = {
        "version": 1,
        "request_id": "request-1",
        "task_id": "connection_test",
        "target_id": "api-openai",
        "input": {},
        "stream": False,
    }
    assert list(Draft202012Validator(schema["$defs"]["request"]).iter_errors(request)) == []
