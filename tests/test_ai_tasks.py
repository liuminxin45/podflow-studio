from types import SimpleNamespace
import json
import subprocess
import sys

import pytest
from pydantic import ValidationError
from pydantic_ai.models.test import TestModel

from protocol.ai_provider import LLMError
from protocol import ai_tasks


def _request(task_id: str, task_input: dict) -> dict:
    return {
        "version": 1,
        "request_id": "request-1",
        "task_id": task_id,
        "target_id": "model:test",
        "input": task_input,
        "stream": False,
    }


def test_classification_task_uses_typed_output_and_usage(monkeypatch) -> None:
    model = TestModel(custom_output_args={"categories": ["market", "other"]})
    monkeypatch.setattr(
        ai_tasks,
        "_build_model",
        lambda _target: (SimpleNamespace(provider_kind="test", model="test"), model),
    )

    result = ai_tasks.run_ai_task(
        _request("discover.classify_news", {
            "titles": ["芯片公司发布财报", "无法判断"],
            "categories": [
                {"id": "market", "label": "市场"},
                {"id": "other", "label": "其他"},
            ],
        }),
        {},
    )

    assert result["output"] == {"categories": ["market", "other"]}
    assert result["usage"]["requests"] == 1


def test_task_input_rejects_unknown_fields_before_model_call(monkeypatch) -> None:
    monkeypatch.setattr(ai_tasks, "_build_model", lambda _target: pytest.fail("model must not run"))

    with pytest.raises(ValidationError):
        ai_tasks.run_ai_task(
            _request("settings.connection_test", {"probe": "ready", "messages": []}),
            {},
        )


def test_quality_validator_retries_then_fails_closed(monkeypatch) -> None:
    model = TestModel(custom_output_args={"categories": ["not-in-catalog"]})
    monkeypatch.setattr(
        ai_tasks,
        "_build_model",
        lambda _target: (SimpleNamespace(provider_kind="test", model="test"), model),
    )

    with pytest.raises(LLMError) as raised:
        ai_tasks.run_ai_task(
            _request("discover.classify_news", {
                "titles": ["新闻"],
                "categories": [{"id": "other", "label": "其他"}],
            }),
            {},
        )

    assert raised.value.code == "QUALITY_GATE"


def test_task_worker_emits_ordered_events_before_contract_error() -> None:
    payload = _request("settings.connection_test", {"probe": "invalid"})
    completed = subprocess.run(
        [sys.executable, "-m", "protocol.ai_task_worker"],
        input=json.dumps({"request": payload, "target": {}}),
        text=True,
        capture_output=True,
        check=True,
    )
    items = [json.loads(line) for line in completed.stdout.splitlines()]

    events = [item["event"] for item in items if item["kind"] == "event"]
    assert [event["sequence"] for event in events] == [0, 1, 2]
    assert [event["type"] for event in events] == ["started", "progress", "failed"]
    assert items[-1]["kind"] == "error"
    assert items[-1]["error"]["code"] == "CONFIG"
