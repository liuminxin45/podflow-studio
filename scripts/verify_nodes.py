#!/usr/bin/env python
"""
Node Verification Script

Tests that all nodes can be executed via `python -m nodes.<name>` and properly handle JSON I/O.
Validates output structure and error handling.
"""

import sys
import json
import subprocess
import os
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

NODES = [
    # discover
    "fetch",
    "manual",
    "merge",
    # organize
    "preprocess",
    # ideate
    "research",
    "topic_selection",
    # write
    "script",
    # produce
    "tts",
    "audio_postprocess",
    "assets",
    # publish
    "review",
    "publish",
]


def test_node(node_name: str) -> bool:
    """Test a single node with minimal input."""
    test_state = {
        "episode_id": "test_ep",
        "created_at": "2026-02-08T00:00:00",
        "runtime_config": {
            # Use offline-only source to avoid network timeouts during verification
            "fetch": {"enabled_sources": ["example_custom"]},
        },
        "logs": [],
        "errors": [],
        "fetch_contents": [],
        "manual_contents": [],
        "raw_contents": [],
        "cleaned_contents": [],
        "researched_contents": [],
        "selected_topic": {},
        "selected_materials": [],
        "script": {},
        "stages": [],
        "audio_segments": [],
        "final_audio_path": "",
        "audio_metadata": {},
        "cover_path": "",
        "review_summary": {},
        "storage_info": {},
        "rss_path": "",
        "publish_status": {},
    }
    try:
        env = {
            **os.environ,
            "PYTHONPATH": str(PROJECT_ROOT),
            "PYTHONIOENCODING": "utf-8",
        }
        proc = subprocess.run(
            [sys.executable, "-m", f"nodes.{node_name}"],
            input=json.dumps(test_state),
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=10,
            cwd=PROJECT_ROOT,
            env=env,
        )

        if proc.returncode != 0:
            print(f"❌ {node_name}: Exit code {proc.returncode}")
            print(f"   stderr: {proc.stderr[:200]}")
            return False

        try:
            result = json.loads(proc.stdout)

            if not isinstance(result, dict):
                print(f"❌ {node_name}: Output is not a dict")
                return False

            required_fields = ["logs", "errors"]
            missing = [f for f in required_fields if f not in result]
            if missing:
                print(f"⚠️  {node_name}: Missing fields: {missing}")

            if result.get("errors") and len(result["errors"]) > 0:
                print(
                    f"⚠️  {node_name}: Completed with errors: {result['errors'][0].get('message', 'Unknown')}"
                )

            print(f"✅ {node_name}: OK")
            return True
        except json.JSONDecodeError as e:
            print(f"❌ {node_name}: Invalid JSON output")
            print(f"   Error: {e}")
            print(f"   stdout: {proc.stdout[:200]}")
            return False

    except subprocess.TimeoutExpired:
        print(f"❌ {node_name}: Timeout")
        return False
    except Exception as e:
        print(f"❌ {node_name}: {type(e).__name__}: {e}")
        return False


def main():
    print("=" * 60)
    print("Node Verification Test")
    print("=" * 60)
    print()

    results = {}
    for node in NODES:
        results[node] = test_node(node)

    print()
    print("=" * 60)
    passed = sum(results.values())
    total = len(results)
    print(f"Results: {passed}/{total} passed")

    if passed == total:
        print("✅ All nodes verified successfully!")
        sys.exit(0)
    else:
        print("❌ Some nodes failed verification")
        sys.exit(1)


if __name__ == "__main__":
    main()
