import json
from types import SimpleNamespace

import pytest

from scripts import verify_nodes


@pytest.mark.parametrize(
    "payload",
    [
        {"logs": []},
        {"logs": [], "errors": [{"node": "script", "message": "boom"}]},
        {"logs": "not-a-list", "errors": []},
    ],
)
def test_verify_node_fails_closed_for_invalid_node_results(monkeypatch, payload):
    monkeypatch.setattr(
        verify_nodes.subprocess,
        "run",
        lambda *args, **kwargs: SimpleNamespace(
            returncode=0,
            stdout=json.dumps(payload),
            stderr="",
        ),
    )

    assert verify_nodes.test_node("script") is False


def test_verify_node_accepts_clean_structured_result(monkeypatch):
    monkeypatch.setattr(
        verify_nodes.subprocess,
        "run",
        lambda *args, **kwargs: SimpleNamespace(
            returncode=0,
            stdout=json.dumps(
                {
                    "logs": ["done"],
                    "errors": [],
                    "script": {"title": "verified"},
                    "edited_script": {"title": "verified"},
                }
            ),
            stderr="",
        ),
    )

    assert verify_nodes.test_node("script") is True


def test_verify_node_rejects_missing_output_artifact(monkeypatch, tmp_path):
    missing_audio = tmp_path / "missing.wav"
    monkeypatch.setattr(
        verify_nodes.subprocess,
        "run",
        lambda *args, **kwargs: SimpleNamespace(
            returncode=0,
            stdout=json.dumps(
                {
                    "logs": ["done"],
                    "errors": [],
                    "audio_outputs": {
                        "status": "ok",
                        "final_audio_path": str(missing_audio),
                        "audio_report_path": str(tmp_path / "missing.json"),
                    },
                }
            ),
            stderr="",
        ),
    )

    assert verify_nodes.test_node("audio_postprocess") is False
