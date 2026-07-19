import json
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator

from protocol.episode_models import SCHEMA_VERSION, validate_episode_run_payload
from tests.mock_data import create_base_state


def _episode_run_schema() -> dict:
    schema_path = (
        Path(__file__).resolve().parents[1]
        / "protocol"
        / "schemas"
        / "episode_run.schema.json"
    )
    return json.loads(schema_path.read_text(encoding="utf-8"))


def test_episode_run_schema_file_requires_primary_contract_fields():
    schema = _episode_run_schema()
    assert schema["properties"]["schema_version"]["const"] == SCHEMA_VERSION
    required = set(schema["required"])
    assert {
        "schema_version",
        "episode_id",
        "preset",
        "source_inputs",
        "facts",
        "selected_topics",
        "script",
        "edited_script",
        "voice_segments",
        "audio_outputs",
        "publish_outputs",
        "run_report",
    } <= required


def test_episode_run_payload_validates_with_model():
    state = create_base_state()
    ok, errors = validate_episode_run_payload(state)
    assert ok, errors


def test_episode_run_accepts_legacy_publish_platform_metadata():
    state = create_base_state()
    state["publish_outputs"]["enabled_platforms"] = ["rss", "apple"]

    ok, errors = validate_episode_run_payload(state)
    schema_errors = list(Draft202012Validator(_episode_run_schema()).iter_errors(state))

    assert ok, errors
    assert schema_errors == []


def test_generation_request_rejects_unknown_modes():
    state = create_base_state()
    state["generation_request"] = {"mode": "regnerate", "requested_at": "2026-07-15T00:00:00Z"}

    ok, errors = validate_episode_run_payload(state)

    assert ok is False
    assert any("generation_request.mode" in error for error in errors)


@pytest.mark.parametrize(
    ("target", "obsolete_field"),
    [
        ("state", "stages"),
        ("script", "sections"),
        ("script", "dialogue"),
        ("audio_outputs", "final_audio"),
    ],
)
def test_episode_run_rejects_unknown_contract_fields(target: str, obsolete_field: str):
    state = create_base_state()
    if target == "state":
        state[obsolete_field] = []
    else:
        state[target][obsolete_field] = [] if obsolete_field != "final_audio" else "old.mp3"

    ok, errors = validate_episode_run_payload(state)
    schema_errors = list(Draft202012Validator(_episode_run_schema()).iter_errors(state))

    assert ok is False
    assert schema_errors
    assert any(obsolete_field in error for error in errors)


@pytest.mark.parametrize(
    ("generation_request", "expected_valid"),
    [
        ({}, True),
        (
            {
                "mode": "regenerate",
                "requested_at": "2026-07-15T00:00:00Z",
                "status": None,
                "draft_snapshot": None,
            },
            True,
        ),
        ({"requested_at": "2026-07-15T00:00:00Z"}, False),
    ],
)
def test_generation_request_json_schema_and_model_validation_stay_aligned(
    generation_request: dict,
    expected_valid: bool,
):
    state = create_base_state()
    state["generation_request"] = generation_request

    schema_errors = list(Draft202012Validator(_episode_run_schema()).iter_errors(state))
    model_valid, _ = validate_episode_run_payload(state)

    assert (not schema_errors) is expected_valid
    assert model_valid is expected_valid
