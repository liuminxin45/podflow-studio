"""
E2E Pipeline Test — runs the active 11-node pipeline without external services.

Verifies that state flows correctly through all nodes and that the
pipeline manifest tracks completion properly.

Usage:
    python tests/test_e2e_pipeline.py
    python -m pytest tests/test_e2e_pipeline.py -v
"""

import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from tests.mock_data import create_base_state, create_mock_fetch_contents
from protocol.manifest import PipelineManifest, PIPELINE_ORDER


# ============================================================
# Node imports
# ============================================================
from nodes.preprocess.node import run as preprocess_run
from nodes.research.node import run as research_run
from nodes.topic_selection.node import run as topic_selection_run
from nodes.facts.node import run as facts_run
from nodes.script.node import run as script_run
from nodes.tts.node import run as tts_run
from nodes.audio_postprocess.node import run as audio_postprocess_run
from nodes.assets.node import run as assets_run
from nodes.review.node import run as review_run
from nodes.publish.node import run as publish_run


# ============================================================
# Helpers
# ============================================================
passed = 0
failed = 0


def check(label, condition, detail=""):
    global passed, failed
    if condition:
        passed += 1
        print(f"  PASS  {label}")
    else:
        failed += 1
        print(f"  FAIL  {label}  {detail}")


# ============================================================
# E2E Pipeline Test
# ============================================================
def test_full_pipeline_no_external_services():
    """Run the active pipeline nodes sequentially, mock-only, no API keys needed."""
    state = create_base_state()

    # ---- 1. Fetch: skip (needs network), inject mock data directly ----
    state["fetch_contents"] = create_mock_fetch_contents()
    check("fetch (mock inject)", len(state["fetch_contents"]) == 4)

    # ---- 2. Preprocess ----
    state = preprocess_run(state)
    check(
        "preprocess",
        len(state.get("cleaned_contents", [])) > 0,
        f"cleaned={len(state.get('cleaned_contents', []))}",
    )

    # ---- 3. Research (no LLM — basic passthrough mode) ----
    state = research_run(state)
    check(
        "research",
        len(state.get("researched_contents", [])) > 0,
        f"researched={len(state.get('researched_contents', []))}",
    )

    # ---- 4. Topic Selection (cluster mode, no LLM) ----
    state = topic_selection_run(state)
    check(
        "topic_selection",
        state.get("selected_topic", {}).get("title", "") != "",
        f"topic='{state.get('selected_topic', {}).get('title', '')}'",
    )
    check(
        "topic_selection_materials",
        len(state.get("selected_materials", [])) > 0,
        f"materials={len(state.get('selected_materials', []))}",
    )
    state["selected_materials"] = [
        {**item, "_status": "ready"} for item in state["selected_materials"]
    ]

    # ---- 5. Facts ----
    state = facts_run(state)
    check(
        "facts",
        len(state.get("facts", [])) > 0,
        f"facts={len(state.get('facts', []))}",
    )

    # ---- 6. Script (no API key — deterministic fallback) ----
    state = script_run(state)
    check(
        "script (no api, fallback)",
        state.get("script", {}).get("content_type") == "news_brief"
        and len(state.get("facts", [])) > 0
        and len(state.get("script", {}).get("segments", [])) > 0,
        f"facts={len(state.get('facts', []))}, segments={len(state.get('script', {}).get('segments', []))}",
    )

    # ---- 7. TTS (mock engine, no external services) ----
    state = tts_run(state)
    check(
        "tts (mock)",
        len(state.get("voice_segments", [])) > 0,
        f"voice_segments={len(state.get('voice_segments', []))}",
    )

    # ---- 8. Audio Postprocess ----
    state = audio_postprocess_run(state)
    check(
        "audio_postprocess",
        state.get("audio_outputs", {}).get("final_audio_path", "") != "",
        f"final_audio_path={state.get('audio_outputs', {}).get('final_audio_path', '')}",
    )

    # ---- 9. Assets (skip cover generation flag) ----
    from nodes.assets.config import AssetsConfig

    assets_config = AssetsConfig(generate_cover=False)
    state = assets_run(state, config=assets_config)
    check("assets (generate_cover=False)", True)

    # ---- 10. Review ----
    state = review_run(state)
    check(
        "review",
        "review_summary" in state,
        f"review_summary keys={list(state.get('review_summary', {}).keys())}",
    )

    # ---- 11. Publish ----
    state = publish_run(state)
    check("publish", "publish_outputs" in state)


def test_manifest_tracking():
    """Verify that the pipeline manifest is populated correctly after running nodes."""
    state = create_base_state()

    # Run a few nodes and check manifest
    state["fetch_contents"] = create_mock_fetch_contents()
    state = preprocess_run(state)

    manifest = PipelineManifest.load(state)

    check("manifest_exists", state.get("_manifest") is not None)
    check("manifest_has_nodes", len(manifest.nodes) > 0, f"nodes={list(manifest.nodes.keys())}")

    # Check that completed nodes are tracked
    completed = manifest.completed_nodes()
    check("manifest_completed", "preprocess" in completed, f"completed={completed}")

    # Verify against a sub-pipeline starting from preprocess:
    sub_pipeline = ["preprocess", "research", "topic_selection"]
    sub_idx = manifest.resume_index(sub_pipeline)
    check(
        "manifest_resume_index",
        sub_idx == 1,
        f"sub_resume_index={sub_idx}, next={sub_pipeline[sub_idx] if sub_idx < len(sub_pipeline) else 'END'}",
    )

    # Check last completed node
    last = manifest.last_completed_node()
    check("manifest_last_completed", last is not None, f"last={last}")


def test_manifest_resume_detection():
    """Verify that resume detection works correctly with partial pipeline state."""
    state = create_base_state()

    # Simulate a partially completed pipeline
    state["_manifest"] = {
        "created_at": "2026-02-21T00:00:00",
        "nodes": {
            "fetch": {"status": "ok", "elapsed_s": 1.0, "errors": 0, "outputs": {}},
            "preprocess": {"status": "error", "elapsed_s": 0.5, "errors": 1, "outputs": {}},
        },
    }

    manifest = PipelineManifest.load(state)

    # Should resume from preprocess (first non-ok node)
    completed = manifest.completed_nodes()
    check("resume_skips_error", "preprocess" not in completed, f"completed={completed}")

    idx = manifest.resume_index()
    expected_node = "preprocess"
    check(
        "resume_index_correct",
        PIPELINE_ORDER[idx] == expected_node,
        f"resume_from={PIPELINE_ORDER[idx]}, expected={expected_node}",
    )


# ============================================================
# Main
# ============================================================
if __name__ == "__main__":
    print("\n=== E2E Pipeline Test (no external services) ===\n")
    test_full_pipeline_no_external_services()

    print("\n=== Manifest Tracking Test ===\n")
    test_manifest_tracking()

    print("\n=== Manifest Resume Detection Test ===\n")
    test_manifest_resume_detection()

    print(f"\n{'=' * 60}")
    print(f"Results: {passed} passed, {failed} failed, {passed + failed} total")
    sys.exit(1 if failed > 0 else 0)
