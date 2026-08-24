import copy
import json
from pathlib import Path

import pytest

from protocol.artifact_utils import file_fingerprint
from protocol.release_readiness import build_release_readiness
from tests.mock_data import create_base_state


GOLDEN_PATH = Path(__file__).parent / "fixtures" / "premium_automation_golden.json"
GOLDEN_CASES = json.loads(GOLDEN_PATH.read_text(encoding="utf-8"))


def _ready_state(tmp_path: Path) -> dict:
    audio = tmp_path / "final.mp3"
    audio.write_bytes(b"podflow-audio" * 200)
    artifact = file_fingerprint(audio)
    state = create_base_state()
    state["facts"] = [{
        "id": "fact_001",
        "title": "核验事实",
        "summary": "公开证据支持这项事实。",
        "confidence": "high",
        "evidence": [
            {"id": "evidence_1", "url": "https://primary.example/item", "title": "一手来源", "published_at": "2026-08-16", "source_role": "primary", "excerpt": "事实证据"},
            {"id": "evidence_2", "url": "https://independent-a.example/item", "title": "独立来源一", "published_at": "2026-08-16", "source_role": "independent", "excerpt": "事实证据"},
            {"id": "evidence_3", "url": "https://independent-b.example/item", "title": "独立来源二", "published_at": "2026-08-16", "source_role": "independent", "excerpt": "事实证据"},
        ],
        "claims": [{
            "id": "claim_001", "text": "公开证据支持这项事实。", "evidence_ids": ["evidence_1"],
            "status": "supported", "confidence": "high", "verifier_model": "fact-model",
            "verified_at": "2026-08-16T00:00:00Z",
        }],
    }]
    state["script"] = {"generated_by": "llm"}
    state["edited_script"] = {"segments": [
        *[
            {"id": f"quick_{index}", "type": "quick_news", "text": "快讯", "source_fact_ids": ["fact_001"], "source_claim_ids": ["claim_001"]}
            for index in range(6)
        ],
        {"id": "deep_1", "type": "deep_dive", "text": "深度稿", "source_fact_ids": ["fact_001"], "source_claim_ids": ["claim_001"]},
    ]}
    state["generation_meta"] = {"editorial_quality": {
        "version": "editorial_quality_v1", "status": "passed", "model": "editor-model",
        "scores": {name: 4 for name in ("relevance", "information_gain", "synthesis", "coherence", "spoken_naturalness", "non_repetition")},
        "hard_errors": [], "repair_count": 0,
    }}
    state["audio_outputs"] = {"final_audio_path": str(audio), "contains_mock_audio": False, "source_engines": ["doubao_tts"]}
    state["review_summary"] = {"status": "passed", "audio_artifact": artifact}
    state["voice_segments"] = [{"segment_id": "voice_001", "engine": "doubao_tts", "path": str(audio)}]
    state["audio_approval"] = {}
    return state


def _mutate(state: dict, mutation: str) -> None:
    if mutation == "none":
        return
    if mutation == "missing_source":
        state["facts"][0]["evidence"] = []
    elif mutation in {"conflicted_claim", "unsupported_claim"}:
        state["facts"][0]["claims"][0]["status"] = "conflicted" if mutation == "conflicted_claim" else "insufficient"
    elif mutation == "editorial_failed":
        state["generation_meta"]["editorial_quality"]["status"] = "failed"
    elif mutation == "pronunciation_unresolved":
        state["voice_segments"] = [{"pronunciation_review": {"unresolved_terms": ["PodFlow"]}}]
    elif mutation == "audio_failed":
        state["review_summary"]["status"] = "failed"
    elif mutation == "mock_provider":
        state["voice_segments"][0]["engine"] = "edge-tts"
    elif mutation == "stale_approval":
        state["audio_approval"] = {
            "status": "approved", "audio_sha256": "0" * 64, "reviewer": "reviewer",
            "acknowledgements": ["full_listen_confirmed", "pronunciation_confirmed", "editorial_final_confirmed"],
        }
    else:
        raise AssertionError(f"unknown golden mutation: {mutation}")


@pytest.mark.parametrize("case", GOLDEN_CASES, ids=[item["id"] for item in GOLDEN_CASES])
def test_premium_automation_golden_cases(case: dict, tmp_path: Path):
    state = _ready_state(tmp_path)
    _mutate(state, case["mutation"])

    readiness = build_release_readiness(copy.deepcopy(state))
    codes = {
        code
        for gate in readiness["gates"].values()
        for code in gate["codes"]
    }

    assert readiness["status"] == case["expected_status"]
    assert case["expected_code"] in codes


def test_current_human_approval_promotes_preview_to_publish_ready(tmp_path: Path):
    state = _ready_state(tmp_path)
    digest = file_fingerprint(state["audio_outputs"]["final_audio_path"])["sha256"]
    state["audio_approval"] = {
        "status": "approved", "audio_sha256": digest, "reviewer": "reviewer",
        "acknowledgements": ["full_listen_confirmed", "pronunciation_confirmed", "editorial_final_confirmed"],
    }

    assert build_release_readiness(state)["status"] == "publish_ready"
