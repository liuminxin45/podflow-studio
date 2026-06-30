"""
E2E Pipeline Test — runs the full 12-node pipeline without external services.

Verifies that state flows correctly through all nodes and that the
pipeline manifest tracks completion properly.

Usage:
    python tests/test_e2e_pipeline.py
    python -m pytest tests/test_e2e_pipeline.py -v
"""

import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from tests.mock_data import create_base_state, create_mock_raw_contents
from protocol.manifest import PipelineManifest, PIPELINE_ORDER


# ============================================================
# Node imports
# ============================================================
from nodes.merge.node import run as merge_run
from nodes.preprocess.node import run as preprocess_run
from nodes.research.node import run as research_run
from nodes.topic_selection.node import run as topic_selection_run
from nodes.script.node import run as script_run
from nodes.tts.node import run as tts_run
from nodes.audio_postprocess.node import run as audio_postprocess_run
from nodes.assets.node import run as assets_run
from nodes.review.node import run as review_run
from nodes.publish.node import run as publish_run
from nodes.manual.node import run as manual_run


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
    """Run all 12 nodes sequentially, mock-only, no API keys needed."""
    state = create_base_state()

    # ---- 1. Fetch: skip (needs network), inject mock data directly ----
    state["fetch_contents"] = create_mock_raw_contents()
    check("fetch (mock inject)", len(state["fetch_contents"]) == 4)

    # ---- 2. Manual: empty input ----
    state = manual_run(state)
    check("manual", "manual_contents" in state)

    # ---- 3. Merge ----
    state = merge_run(state)
    check(
        "merge",
        len(state.get("raw_contents", [])) > 0,
        f"raw_contents={len(state.get('raw_contents', []))}",
    )

    # ---- 4. Preprocess ----
    state = preprocess_run(state)
    check(
        "preprocess",
        len(state.get("cleaned_contents", [])) > 0,
        f"cleaned={len(state.get('cleaned_contents', []))}",
    )

    # ---- 5. Research (no LLM — basic passthrough mode) ----
    state = research_run(state)
    check(
        "research",
        len(state.get("researched_contents", [])) > 0,
        f"researched={len(state.get('researched_contents', []))}",
    )

    # ---- 6. Topic Selection (cluster mode, no LLM) ----
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

    # ---- 7. Script (no API key — should error gracefully) ----
    state = script_run(state)
    # Script node adds error when no API key, but doesn't crash
    script_errors = [
        e for e in state.get("errors", []) if isinstance(e, dict) and e.get("node") == "script"
    ]
    check(
        "script (no api, graceful)",
        len(script_errors) > 0 or state.get("script", {}).get("title", "") != "",
        f"errors={len(script_errors)}, script.title='{state.get('script', {}).get('title', '')}'",
    )

    # ---- Inject mock script/stages for downstream nodes ----
    from tests.mock_data import create_mock_script, create_mock_stages

    state["script"] = create_mock_script()
    state["stages"] = create_mock_stages()

    # ---- 8. TTS (no engine available — should error gracefully) ----
    state = tts_run(state)
    # TTS will fail without edge-tts installed or configured, that's OK
    check("tts (graceful)", True)  # Just verify no crash

    # ---- 9. Audio Postprocess (no segments — should handle gracefully) ----
    state = audio_postprocess_run(state)
    check("audio_postprocess", True)  # Verify no crash

    # ---- 10. Assets (skip cover generation flag) ----
    from nodes.assets.config import AssetsConfig

    assets_config = AssetsConfig(skip_cover=True)
    state = assets_run(state, config=assets_config)
    check("assets (skip_cover)", True)

    # ---- 11. Review ----
    state["final_audio_path"] = "out/episodes/test_ep_001.mp3"
    state = review_run(state)
    check(
        "review",
        "review_summary" in state,
        f"review_summary keys={list(state.get('review_summary', {}).keys())}",
    )

    # ---- 12. Publish ----
    state = publish_run(state)
    check("publish", "publish_status" in state)

    return state


def test_manifest_tracking():
    """Verify that the pipeline manifest is populated correctly after running nodes."""
    state = create_base_state()

    # Run a few nodes and check manifest
    state = manual_run(state)
    state["fetch_contents"] = create_mock_raw_contents()
    state = merge_run(state)
    state = preprocess_run(state)

    manifest = PipelineManifest.load(state)

    check("manifest_exists", state.get("_manifest") is not None)
    check("manifest_has_nodes", len(manifest.nodes) > 0, f"nodes={list(manifest.nodes.keys())}")

    # Check that completed nodes are tracked
    completed = manifest.completed_nodes()
    check("manifest_completed", "preprocess" in completed, f"completed={completed}")

    # Check resume index — fetch was mock-injected (no NodeContext), so manifest
    # has manual/merge/preprocess but not fetch. resume_index correctly returns 0.
    # Verify against a sub-pipeline starting from manual:
    sub_pipeline = ["manual", "merge", "preprocess", "research", "topic_selection"]
    sub_idx = manifest.resume_index(sub_pipeline)
    check(
        "manifest_resume_index",
        sub_idx == 3,
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
            "manual": {"status": "ok", "elapsed_s": 0.1, "errors": 0, "outputs": {}},
            "merge": {"status": "ok", "elapsed_s": 0.2, "errors": 0, "outputs": {}},
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
    state = test_full_pipeline_no_external_services()

    print("\n=== Manifest Tracking Test ===\n")
    test_manifest_tracking()

    print("\n=== Manifest Resume Detection Test ===\n")
    test_manifest_resume_detection()

    print(f"\n{'=' * 60}")
    print(f"Results: {passed} passed, {failed} failed, {passed + failed} total")
    sys.exit(1 if failed > 0 else 0)
