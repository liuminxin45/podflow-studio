"""Single fail-closed release-readiness policy for preview and publication."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from urllib.parse import urlparse

from protocol.artifact_utils import file_fingerprint


GATE_VERSION = 1
REQUIRED_ACKNOWLEDGEMENTS = {
    "full_listen_confirmed",
    "pronunciation_confirmed",
    "editorial_final_confirmed",
}


def _gate(status: str, code: str, message: str, evidence: list[str] | None = None) -> dict[str, Any]:
    return {
        "status": status,
        "codes": [] if status == "passed" else [code],
        "messages": [message],
        "evidence": evidence or [],
    }


def _fact_urls(fact: dict[str, Any]) -> list[str]:
    urls = [
        str(item.get("url") or "")
        for item in fact.get("evidence", [])
        if isinstance(item, dict)
    ]
    return list(dict.fromkeys(url for url in urls if url.startswith(("http://", "https://"))))


def _source_and_fact_gates(state: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
    facts = [fact for fact in state.get("facts", []) if isinstance(fact, dict)]
    by_id = {str(fact.get("id") or ""): fact for fact in facts if fact.get("id")}
    script = state.get("edited_script") if isinstance(state.get("edited_script"), dict) else {}
    news = [
        segment for segment in script.get("segments", [])
        if isinstance(segment, dict) and segment.get("type") in {"quick_news", "deep_dive"}
    ]
    if not news:
        failed = _gate("failed", "NO_NEWS_SEGMENTS", "No news segments are available for release.")
        return failed, failed

    missing_facts: list[str] = []
    unsupported_claims: list[str] = []
    missing_sources: list[str] = []
    deep_source_failures: list[str] = []
    for segment in news:
        segment_id = str(segment.get("id") or "unknown")
        fact_ids = [str(value) for value in segment.get("source_fact_ids", []) if str(value)]
        if not fact_ids or any(fact_id not in by_id for fact_id in fact_ids):
            missing_facts.append(segment_id)
            continue
        claim_ids = [str(value) for value in segment.get("source_claim_ids", []) if str(value)]
        available_claims = {
            str(claim.get("id") or ""): claim
            for fact_id in fact_ids
            for claim in by_id[fact_id].get("claims", [])
            if isinstance(claim, dict)
        }
        evidence_by_id = {
            str(evidence.get("id") or ""): evidence
            for fact_id in fact_ids
            for evidence in by_id[fact_id].get("evidence", [])
            if isinstance(evidence, dict)
        }
        def claim_has_sufficient_evidence(claim: dict[str, Any]) -> bool:
            evidence = [evidence_by_id.get(str(value)) for value in claim.get("evidence_ids", [])]
            roles = [str(item.get("source_role") or "") for item in evidence if isinstance(item, dict)]
            return "primary" in roles or roles.count("independent") >= 2
        if not claim_ids or any(
            claim_id not in available_claims
            or available_claims[claim_id].get("status") != "supported"
            or not str(available_claims[claim_id].get("verifier_model") or "")
            or not claim_has_sufficient_evidence(available_claims[claim_id])
            for claim_id in claim_ids
        ):
            unsupported_claims.append(segment_id)
        urls = [url for fact_id in fact_ids for url in _fact_urls(by_id[fact_id])]
        if not urls:
            missing_sources.append(segment_id)
        if segment.get("type") == "deep_dive":
            hosts = {
                parsed.hostname.lower().removeprefix("www.")
                for url in urls
                if (parsed := urlparse(url)).hostname
            }
            if len(hosts) < 3:
                deep_source_failures.append(segment_id)

    facts_gate = (
        _gate("failed", "FACT_BINDING_INCOMPLETE", "News segments lack model-supported claim bindings.", [*missing_facts, *unsupported_claims])
        if missing_facts or unsupported_claims
        else _gate("passed", "", "Every news segment is bound to model-supported claims.")
    )
    source_failures = [*missing_sources, *deep_source_failures]
    source_gate = (
        _gate("failed", "SOURCE_VERIFICATION_INCOMPLETE", "Traceable source coverage is incomplete.", source_failures)
        if source_failures
        else _gate("passed", "", "Quick news has traceable sources and the deep dive has three independent domains.")
    )
    return source_gate, facts_gate


def build_release_readiness(state: dict[str, Any]) -> dict[str, Any]:
    """Derive all six gates from current state; never trust stored readiness."""

    audio_outputs = state.get("audio_outputs") if isinstance(state.get("audio_outputs"), dict) else {}
    artifact = file_fingerprint(audio_outputs.get("final_audio_path"))
    digest = str(artifact.get("sha256") or "")
    source_gate, facts_gate = _source_and_fact_gates(state)

    script = state.get("edited_script") if isinstance(state.get("edited_script"), dict) else {}
    news = [segment for segment in script.get("segments", []) if isinstance(segment, dict)]
    quick_count = sum(segment.get("type") == "quick_news" for segment in news)
    deep_count = sum(segment.get("type") == "deep_dive" for segment in news)
    generated_by = str((state.get("script") or {}).get("generated_by") or "")
    editorial = (state.get("generation_meta") or {}).get("editorial_quality") or {}
    script_ok = (
        quick_count == 6
        and deep_count == 1
        and generated_by == "llm"
        and editorial.get("version") == "editorial_quality_v1"
        and editorial.get("status") == "passed"
        and bool(str(editorial.get("model") or ""))
    )
    script_gate = (
        _gate("passed", "", "The 6+1 LLM script passed editorial quality checks.")
        if script_ok
        else _gate("failed", "SCRIPT_QUALITY_INCOMPLETE", "The script lacks a passing LLM editorial-quality result or the required 6+1 structure.")
    )

    unresolved = sorted({
        str(term)
        for segment in state.get("voice_segments", [])
        if isinstance(segment, dict)
        for term in (segment.get("pronunciation_review") or {}).get("unresolved_terms", [])
    })
    pronunciation_gate = (
        _gate("failed", "PRONUNCIATION_REVIEW_INCOMPLETE", "Pronunciation review has unresolved terms.", unresolved)
        if unresolved
        else _gate("passed", "", "Pronunciation preflight passed.")
    )

    review = state.get("review_summary") if isinstance(state.get("review_summary"), dict) else {}
    review_artifact = review.get("audio_artifact") if isinstance(review.get("audio_artifact"), dict) else {}
    audio_ok = (
        bool(digest)
        and review.get("status") == "passed"
        and review_artifact == artifact
        and audio_outputs.get("contains_mock_audio") is False
    )
    declared_engines = {
        str(value).strip()
        for value in audio_outputs.get("source_engines", [])
        if str(value).strip()
    }
    actual_engines = {
        str(segment.get("engine") or "").strip()
        for segment in state.get("voice_segments", [])
        if isinstance(segment, dict) and str(segment.get("engine") or "").strip()
    }
    provider_ok = (
        bool(declared_engines)
        and actual_engines == declared_engines
        and not declared_engines.intersection({"mock", "unknown"})
    )
    if not audio_ok:
        audio_gate = _gate("failed", "AUDIO_QUALITY_INCOMPLETE", "Measured audio review is missing, failed, stale, or contains mock audio.")
    elif not provider_ok:
        audio_gate = _gate("failed", "AUDIO_PROVIDER_PROVENANCE_INVALID", "Audio provider metadata does not match the rendered voice segments.")
    else:
        audio_gate = _gate("passed", "", "Measured audio quality and provider provenance are bound to the current artifact.", [digest])

    approval = state.get("audio_approval") if isinstance(state.get("audio_approval"), dict) else {}
    acknowledgements = {str(value) for value in approval.get("acknowledgements", [])}
    approval_ok = (
        bool(digest)
        and approval.get("status") == "approved"
        and approval.get("audio_sha256") == digest
        and bool(str(approval.get("reviewer") or "").strip())
        and REQUIRED_ACKNOWLEDGEMENTS.issubset(acknowledgements)
    )
    human_gate = (
        _gate("passed", "", "Human final review is bound to the current MP3 SHA256.", [digest])
        if approval_ok
        else _gate("pending", "HUMAN_APPROVAL_REQUIRED", "Human final review is pending for the current MP3.")
    )

    gates = {
        "sources": source_gate,
        "facts": facts_gate,
        "script": script_gate,
        "pronunciation": pronunciation_gate,
        "audio": audio_gate,
        "human_approval": human_gate,
    }
    machine_passed = all(gates[name]["status"] == "passed" for name in (
        "sources", "facts", "script", "pronunciation", "audio"
    ))
    status = "publish_ready" if machine_passed and approval_ok else "preview_ready" if machine_passed else "blocked"
    return {
        "version": GATE_VERSION,
        "status": status,
        "audio_sha256": digest,
        "evaluated_at": datetime.now(UTC).isoformat(),
        "gates": gates,
    }
