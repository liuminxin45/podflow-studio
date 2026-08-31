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


@pytest.mark.parametrize("legacy_version", [1, 2])
def test_legacy_episode_runs_are_rejected_without_migration(legacy_version: int):
    state = create_base_state()
    state["schema_version"] = legacy_version

    ok, errors = validate_episode_run_payload(state)

    assert ok is False
    assert "Input should be 3" in errors[0]


def test_episode_cover_field_is_rejected():
    state = create_base_state()
    state["cover_path"] = "cover.png"

    ok, errors = validate_episode_run_payload(state)

    assert ok is False
    assert "cover_path" in errors[0]


def test_fact_card_legacy_source_fields_are_rejected():
    state = create_base_state()
    state["facts"] = [{
        "id": "fact_001", "title": "旧事实", "summary": "旧结构", "confidence": "high",
        "source_url": "https://example.com/legacy", "claim": "旧字段",
    }]

    ok, errors = validate_episode_run_payload(state)

    assert ok is False
    assert "source_url" in errors[0]


def test_news_segment_requires_claim_binding_in_both_contracts():
    state = create_base_state()
    state["script"] = {
        "segments": [{
            "id": "segment_001", "type": "quick_news", "text": "新闻事实。",
            "source_fact_ids": ["fact_001"], "estimated_seconds": 5,
        }],
    }

    schema_errors = list(Draft202012Validator(_episode_run_schema()).iter_errors(state))
    model_valid, model_errors = validate_episode_run_payload(state)

    assert schema_errors
    assert model_valid is False
    assert "source_claim_ids" in model_errors[0]


def test_episode_run_accepts_versioned_production_plan():
    state = create_base_state()
    state["production_plan"] = {
        "version": 4,
        "quality_profile": "podflow_morning_v4",
        "script_hash": "script-hash",
        "clips": [{
            "id": "seg_001__001",
            "parent_segment_id": "seg_001",
            "segment_type": "opening",
            "segment_title": "开场",
            "text": "欢迎收听。",
            "context_before": "",
            "context_after": "",
            "direction": {
                "intent": "opening_warm",
                "provider_emotion": "happy",
                "emotion_scale": 2,
                "energy": 0.72,
                "pace": 0.96,
                "pause_before_ms": 0,
                "pause_after_ms": 650,
                "emphasis": [],
            },
                "speaker": "Host A",
                "source_fact_ids": [],
                "source_claim_ids": [],
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
                "asset_id": f"make-funk-{name}",
                "path": "",
                "gain_db": -4,
                "duration_ms": 1500,
                "fade_in_ms": 150,
                "fade_out_ms": 300,
                "voice_overlap_ms": 0,
                "duck_db": 0,
                "rights_ref": "assets/audio/RIGHTS.md#make-funk",
            }
            for name in ("intro", "sting", "bridge", "outro")
        },
        "render": {
            "output_format": "mp3",
            "sample_rate_hz": 48000,
            "mp3_bitrate": "160k",
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


def test_episode_run_rejects_unversioned_non_empty_production_plan():
    state = create_base_state()
    state["production_plan"] = {"clips": []}

    ok, errors = validate_episode_run_payload(state)
    schema_errors = list(Draft202012Validator(_episode_run_schema()).iter_errors(state))

    assert not ok
    assert "version=4" in "\n".join(errors)
    assert schema_errors


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
            "templateVariant": "quick_6_plus_deep_1",
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
