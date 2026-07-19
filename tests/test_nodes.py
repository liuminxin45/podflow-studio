"""
Smoke Tests for All Pipeline Nodes

Tests each node independently using mock data from tests/mock_data.py.
No external services or API keys required — all LLM-dependent paths
are bypassed by providing empty api_key.

Run:
    python -m pytest tests/test_nodes.py -v
    # or without pytest:
    python tests/test_nodes.py
"""

import sys
import os
from pathlib import Path

# Ensure project root is on sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from tests.mock_data import create_base_state, create_state_for_node  # noqa: E402


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _run_node(node_name: str, state: dict, config=None):
    """Import and run a node, returning the updated state."""
    mod = __import__(f"nodes.{node_name}.node", fromlist=["run"])
    return mod.run(state, config)


def _assert_no_crash(state: dict, node_name: str):
    """Basic assertions that apply to every node result."""
    assert isinstance(state, dict), f"{node_name} must return dict"
    assert "logs" in state, f"{node_name} must preserve logs"
    assert "errors" in state, f"{node_name} must preserve errors"
    # Errors list should contain only dicts (structured errors)
    for err in state.get("errors", []):
        if isinstance(err, dict):
            assert "node" in err, f"Error missing 'node' field: {err}"
            assert "message" in err, f"Error missing 'message' field: {err}"


# ---------------------------------------------------------------------------
# Fetch Node
# ---------------------------------------------------------------------------


def test_fetch_node_empty():
    """Fetch with no sources configured produces empty fetch_contents."""
    state = create_state_for_node("fetch")
    # Override config to use no sources (empty list prevents any actual fetch)
    from nodes.fetch.config import FetchConfig

    config = FetchConfig(enabled_sources=["__nonexistent_source__"])
    result = _run_node("fetch", state, config)
    _assert_no_crash(result, "fetch")
    assert "fetch_contents" in result
    assert isinstance(result["fetch_contents"], list)
    assert result["fetch_contents"] == []


def test_fetch_node_newsnow_source_ids(monkeypatch):
    """NewsNow source uses configured sub-source IDs and preserves source metadata."""
    state = create_state_for_node("fetch")
    from nodes.fetch.config import FetchConfig

    calls = []

    class FakeResponse:
        def __init__(self, source_id: str):
            self.source_id = source_id

        def raise_for_status(self):
            return None

        def json(self):
            return {
                "status": "cache",
                "id": self.source_id,
                "updatedTime": 1783305130529,
                "items": [
                    {
                        "id": f"{self.source_id}-hot-{index}",
                        "title": f"{self.source_id} 测试热搜 {index}",
                        "url": f"https://example.com/{self.source_id}/hot-{index}",
                        "extra": {"hover": f"{self.source_id} 测试热搜说明 {index}"},
                    }
                    for index in range(1, 4)
                ],
            }

    def fake_get(url, params=None, timeout=None, headers=None):
        calls.append({"url": url, "params": params, "timeout": timeout, "headers": headers})
        return FakeResponse(params["id"])

    import requests

    monkeypatch.setattr(requests, "get", fake_get)
    config = FetchConfig(
        enabled_sources=["newsnow"],
        newsnow_source_ids=["weibo", "zhihu"],
        result_limit=2,
        quality=1,
        freshness=1,
        min_relevance=1,
        allow_duplicates=True,
        event_detection=False,
        group_by_topic=False,
        max_articles=10,
    )
    result = _run_node("fetch", state, config)
    _assert_no_crash(result, "fetch")

    assert calls
    assert calls[0]["params"]["id"] == "weibo"
    assert calls[1]["params"]["id"] == "zhihu"
    assert len(result["fetch_contents"]) == 4
    assert len([item for item in result["fetch_contents"] if item["source"] == "newsnow:weibo"]) == 2
    assert len([item for item in result["fetch_contents"] if item["source"] == "newsnow:zhihu"]) == 2
    assert result["fetch_contents"][0]["source"] == "newsnow:weibo"
    assert result["fetch_contents"][0]["source_id"] == "weibo"
    assert result["fetch_contents"][0]["source_name"] == "微博"
    assert result["fetch_contents"][0]["rank"] == 1


def test_fetch_node_newsnow_retries_timeout(monkeypatch):
    """NewsNow retries transient source timeouts once."""
    state = create_state_for_node("fetch")
    from nodes.fetch.config import FetchConfig

    calls = []

    class FakeResponse:
        def raise_for_status(self):
            return None

        def json(self):
            return {
                "status": "success",
                "id": "aihot",
                "updatedTime": 1783305130529,
                "items": [
                    {
                        "id": "aihot-1",
                        "title": "AIHOT 重试后热搜",
                        "url": "https://example.com/aihot/1",
                    }
                ],
            }

    def fake_get(url, params=None, timeout=None, headers=None):
        calls.append(params["id"])
        if len(calls) == 1:
            raise requests.exceptions.ReadTimeout("timed out")
        return FakeResponse()

    import requests

    monkeypatch.setattr(requests, "get", fake_get)
    config = FetchConfig(
        enabled_sources=["newsnow"],
        newsnow_source_ids=["aihot"],
        quality=1,
        freshness=1,
        min_relevance=1,
        allow_duplicates=True,
        event_detection=False,
        group_by_topic=False,
        max_articles=10,
    )
    result = _run_node("fetch", state, config)
    _assert_no_crash(result, "fetch")

    assert calls == ["aihot", "aihot"]
    assert len(result["fetch_contents"]) == 1
    assert any("Retrying aihot" in log for log in result["logs"])


# ---------------------------------------------------------------------------
# Preprocess Node
# ---------------------------------------------------------------------------


def test_preprocess_node():
    """Preprocess filters and deduplicates fetch_contents."""
    state = create_state_for_node("preprocess")
    result = _run_node("preprocess", state)
    _assert_no_crash(result, "preprocess")
    assert "cleaned_contents" in result
    # Should have filtered out the short article
    assert len(result["cleaned_contents"]) < len(state["fetch_contents"])
    assert len(result["cleaned_contents"]) > 0


def test_preprocess_auto_execute():
    """In auto_execute mode, min_content_length is 0 (allows hotlist items)."""
    state = create_state_for_node("preprocess")
    state["runtime_config"] = {"auto_execute": True}
    result = _run_node("preprocess", state)
    _assert_no_crash(result, "preprocess")
    # All items should pass since min_length=0
    assert len(result["cleaned_contents"]) == len(state["fetch_contents"])


# ---------------------------------------------------------------------------
# Research Node
# ---------------------------------------------------------------------------


def test_research_node_no_llm():
    """Research without LLM config passes items through with empty research fields."""
    state = create_state_for_node("research")
    result = _run_node("research", state)
    _assert_no_crash(result, "research")
    assert "researched_contents" in result
    assert len(result["researched_contents"]) == len(state["cleaned_contents"])
    for item in result["researched_contents"]:
        assert "research_notes" in item
        assert "key_points" in item


# ---------------------------------------------------------------------------
# Topic Selection Node
# ---------------------------------------------------------------------------


def test_topic_selection_node_cluster():
    """Topic selection with cluster mode produces selected_topic and selected_materials."""
    state = create_state_for_node("topic_selection")
    result = _run_node("topic_selection", state)
    _assert_no_crash(result, "topic_selection")
    assert "selected_topic" in result
    assert "selected_materials" in result
    assert isinstance(result["selected_topic"], dict)
    assert isinstance(result["selected_materials"], list)
    assert len(result["selected_materials"]) > 0


# ---------------------------------------------------------------------------
# Script Node (without real LLM — should use deterministic fallback)
# ---------------------------------------------------------------------------


def test_script_node_no_api():
    """Script node without API key should generate a source-grounded fallback script."""
    state = create_state_for_node("script")
    # Ensure no api_key is set to test error handling
    os.environ.pop("OPENAI_API_KEY", None)
    result = _run_node("script", state)
    _assert_no_crash(result, "script")
    assert result["preset"]["id"] == "morning_news_brief"
    assert result["script"]["content_type"] == "news_brief"
    assert result["script"]["num_hosts"] == 1
    assert result["facts"], "Should generate fact cards from selected materials"
    assert result["script"]["segments"], "Should generate structured script segments"


# ---------------------------------------------------------------------------
# TTS Node (without real TTS — will error but should not crash)
# ---------------------------------------------------------------------------


def test_tts_node_empty_script():
    """TTS with no edited script produces empty voice segments."""
    state = create_base_state()
    result = _run_node("tts", state)
    _assert_no_crash(result, "tts")


# ---------------------------------------------------------------------------
# Audio Postprocess Node
# ---------------------------------------------------------------------------


def test_audio_postprocess_no_segments():
    """Audio postprocess with no segments returns gracefully."""
    state = create_base_state()
    result = _run_node("audio_postprocess", state)
    _assert_no_crash(result, "audio_postprocess")
    # No segments → no final audio
    assert result.get("audio_outputs", {}).get("final_audio_path", "") == ""


# ---------------------------------------------------------------------------
# Assets Node
# ---------------------------------------------------------------------------


def test_assets_node():
    """Assets node generates a cover image."""
    import tempfile

    state = create_state_for_node("assets")
    from nodes.assets.config import AssetsConfig

    with tempfile.TemporaryDirectory() as tmpdir:
        config = AssetsConfig(output_dir=tmpdir, generate_cover=True)
        result = _run_node("assets", state, config)
    _assert_no_crash(result, "assets")
    assert result.get("cover_path", "")


def test_assets_node_skip_cover():
    """Assets node skips cover when generate_cover=False."""
    state = create_state_for_node("assets")
    from nodes.assets.config import AssetsConfig

    config = AssetsConfig(generate_cover=False)
    result = _run_node("assets", state, config)
    _assert_no_crash(result, "assets")


# ---------------------------------------------------------------------------
# Review Node
# ---------------------------------------------------------------------------


def test_review_node():
    """Review node produces review_summary with checks."""
    state = create_state_for_node("review")
    result = _run_node("review", state)
    _assert_no_crash(result, "review")
    assert "review_summary" in result
    review = result["review_summary"]
    assert "checks" in review
    assert "score" in review
    assert isinstance(review["checks"], list)


# ---------------------------------------------------------------------------
# Publish Node
# ---------------------------------------------------------------------------


def test_publish_node():
    """Publish node generates RSS and stores files."""
    import tempfile
    import wave

    state = create_state_for_node("publish")
    from nodes.publish.config import PublishConfig

    with tempfile.TemporaryDirectory() as tmpdir:
        audio_path = os.path.join(tmpdir, "final.wav")
        with wave.open(audio_path, "wb") as wav:
            wav.setnchannels(1)
            wav.setsampwidth(2)
            wav.setframerate(16000)
            wav.writeframes(b"\x00" * 1600)
        state["audio_outputs"] = {"final_audio_path": audio_path}
        config = PublishConfig(
            local_base_dir=os.path.join(tmpdir, "dist", "episodes"),
            rss_output_dir=os.path.join(tmpdir, "rss"),
        )
        result = _run_node("publish", state, config)
    _assert_no_crash(result, "publish")
    assert result["publish_outputs"].get("feed_xml")
    assert result["publish_outputs"].get("local_preview_only") is True


# ---------------------------------------------------------------------------
# NodeContext (protocol/node_runner)
# ---------------------------------------------------------------------------


def test_node_context():
    """NodeContext correctly manages logs, errors, and timing."""
    from protocol.node_runner import NodeContext

    state = create_base_state()
    ctx = NodeContext("TestNode", state)
    ctx.log_start("detail info")
    ctx.log("doing work")
    ctx.add_error("test", "something failed")
    ctx.log_end("output info")
    result = ctx.finalize(state)

    assert len(result["logs"]) >= 4  # start banner + detail + work + end banner
    assert len(result["errors"]) == 1
    assert result["errors"][0]["node"] == "test"
    assert result["_manifest"]["nodes"]["test"]["status"] == "error"
    assert ctx.elapsed >= 0


def test_node_context_manifest_ignores_historical_node_errors_on_clean_rerun():
    """A successful rerun must not inherit the prior attempt's manifest status."""
    from protocol.node_runner import NodeContext

    state = create_base_state()
    state["errors"] = [
        {"node": "script", "message": "old model outage", "detail": "old model outage"}
    ]

    ctx = NodeContext("ScriptNode", state)
    ctx.log_start("clean rerun")
    ctx.log_end("new script generated")
    result = ctx.finalize(state)

    manifest_entry = result["_manifest"]["nodes"]["script"]
    assert manifest_entry["status"] == "ok"
    assert manifest_entry["errors"] == 0


# ---------------------------------------------------------------------------
# Runner
# ---------------------------------------------------------------------------


def _run_all():
    """Run all tests without pytest."""
    import traceback

    tests = [
        (name, obj) for name, obj in globals().items() if name.startswith("test_") and callable(obj)
    ]
    passed = 0
    failed = 0
    for name, fn in sorted(tests):
        try:
            fn()
            passed += 1
            print(f"  PASS  {name}")
        except Exception as e:
            failed += 1
            print(f"  FAIL  {name}: {e}")
            traceback.print_exc()
    print(f"\n{'=' * 60}")
    print(f"Results: {passed} passed, {failed} failed, {passed + failed} total")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(_run_all())
