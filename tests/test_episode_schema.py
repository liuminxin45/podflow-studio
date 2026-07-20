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


def test_episode_run_accepts_versioned_production_plan():
    state = create_base_state()
    state["production_plan"] = {
        "version": 1,
        "script_hash": "script-hash",
        "clips": [{
            "id": "seg_001__001",
            "parent_segment_id": "seg_001",
            "segment_type": "opening",
            "segment_title": "开场",
            "text": "欢迎收听。",
            "speaker": "Host A",
            "source_fact_ids": [],
            "source": "tts",
            "path": "",
            "duration_seconds": 0,
            "trim_start_ms": 0,
            "trim_end_ms": 0,
            "generation_key": "",
        }],
        "joins": [],
        "music": {
            name: {
                "enabled": False,
                "path": "",
                "volume": 0.15,
                "duration_ms": 1500 if name == "transition" else 5000,
                "fade_in_ms": 150 if name == "transition" else 500,
                "fade_out_ms": 300 if name == "transition" else 1000,
            }
            for name in ("intro", "transition", "bed", "outro")
        },
        "render": {
            "output_format": "mp3",
            "normalize_loudness": True,
            "target_lufs": -16,
            "true_peak_db": -1,
        },
        "updated_at": "2026-07-19T00:00:00Z",
    }

    ok, errors = validate_episode_run_payload(state)
    schema_errors = list(Draft202012Validator(_episode_run_schema()).iter_errors(state))

    assert ok, errors
    assert schema_errors == []


def test_episode_run_accepts_series_and_playback_contracts():
    state = create_base_state()
    state["series"] = {
        "id": "daily-tech",
        "title": "每日科技",
        "description": "科技新闻",
        "coverPath": "cover.png",
        "cadence": "daily",
        "defaults": {
            "language": "zh-CN",
            "targetDurationMinutes": 18,
            "author": "编辑部",
            "hostName": "小流",
            "defaultVoice": "voice-a",
            "enabledPlatforms": ["local", "rss"],
            "templateVariant": "quick_9_plus_deep_1",
        },
    }
    state["playback"] = {
        "positionSeconds": 30,
        "durationSeconds": 120,
        "completed": False,
        "speed": 1.25,
        "playCount": 1,
        "updatedAt": "2026-07-20T00:00:00Z",
    }

    ok, errors = validate_episode_run_payload(state)
    schema_errors = list(Draft202012Validator(_episode_run_schema()).iter_errors(state))

    assert ok, errors
    assert schema_errors == []


def test_episode_run_rejects_partial_active_series():
    state = create_base_state()
    state["series"] = {"id": "daily-tech"}

    ok, errors = validate_episode_run_payload(state)
    schema_errors = list(Draft202012Validator(_episode_run_schema()).iter_errors(state))

    assert ok is False
    assert errors
    assert schema_errors


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
