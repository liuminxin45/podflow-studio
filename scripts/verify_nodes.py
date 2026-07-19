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
import math
import struct
import wave
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
SMOKE_DIR = PROJECT_ROOT / ".codex-run" / "verify_nodes"
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from protocol.manifest import NODE_OUTPUT_KEYS  # noqa: E402
from protocol.node_validator import ALLOW_EMPTY_NODES, NODE_EXPECTED_OUTPUTS  # noqa: E402

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

NODES = [
    # discover
    "fetch",
    # organize
    "preprocess",
    # ideate
    "research",
    "topic_selection",
    "facts",
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

VERIFY_EXPECTED_OUTPUTS = {
    node_name: list(output_keys)
    for node_name, output_keys in NODE_EXPECTED_OUTPUTS.items()
}
FILE_OUTPUTS = {
    "tts": ["voice_segments"],
    "audio_postprocess": ["audio_outputs"],
    "assets": ["cover_path"],
    "publish": ["publish_outputs"],
}


def _write_smoke_wav(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    sample_rate = 16_000
    duration_seconds = 1.0
    total_frames = int(sample_rate * duration_seconds)
    with wave.open(str(path), "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(sample_rate)
        for i in range(total_frames):
            sample = int(900 * math.sin(2 * math.pi * 440 * (i / sample_rate)))
            wav.writeframes(struct.pack("<h", sample))


def _test_state() -> dict:
    """Build a non-empty state so node verification checks structure, not empty-input warnings."""
    smoke_audio = SMOKE_DIR / "segment.wav"
    _write_smoke_wav(smoke_audio)
    article = {
        "title": "测试早报素材：央行公开市场操作",
        "summary": "央行公告公开市场操作，维护银行体系流动性合理充裕。",
        "content": "央行公告公开市场操作，维护银行体系流动性合理充裕，市场利率保持平稳。",
        "url": "https://example.com/news/central-bank-liquidity",
        "source": "示例财经",
        "source_name": "示例财经",
        "published": "2026-07-02T08:00:00+08:00",
    }
    fact = {
        "id": "fact_001",
        "title": article["title"],
        "summary": article["summary"],
        "source_title": article["source_name"],
        "source_url": article["url"],
        "published_at": article["published"],
        "claim": "央行公告公开市场操作，维护流动性合理充裕。",
        "confidence": "high",
        "used_in_segments": ["seg_quick_1"],
    }
    script = {
        "id": "test_ep_script",
        "title": "通勤早咖啡测试早报",
        "description": "用于 verify:nodes 的最小早报节目",
        "content_type": "news_brief",
        "preset_id": "morning_news_brief",
        "num_hosts": 1,
        "language": "zh-CN",
        "segments": [
            {
                "id": "seg_opening",
                "type": "opening",
                "title": "开场导语",
                "text": "早上好，欢迎收听今天的通勤早咖啡。",
                "source_fact_ids": [],
                "estimated_seconds": 12,
                "speaker": "Host A",
            },
            {
                "id": "seg_quick_1",
                "type": "quick_news",
                "title": "央行公开市场操作",
                "text": "第一条新闻，央行公告公开市场操作，维护银行体系流动性合理充裕。",
                "source_fact_ids": ["fact_001"],
                "estimated_seconds": 18,
                "speaker": "Host A",
            },
            {
                "id": "seg_closing",
                "type": "closing",
                "title": "结尾总结",
                "text": "以上就是本次测试早报，感谢收听。",
                "source_fact_ids": [],
                "estimated_seconds": 10,
                "speaker": "Host A",
            },
        ],
    }
    return {
        "episode_id": "test_ep",
        "created_at": "2026-07-02T00:00:00+08:00",
        "schema_version": 1,
        "preset": {},
        "source_inputs": [],
        "runtime_config": {
            "auto_execute": True,
            "fetch": {"enabled_sources": ["__nonexistent_source__"]},
            "topic_selection": {"mode": "cluster", "min_cluster_size": 1},
            "tts": {
                "engine": "mock",
                "output_dir": str(SMOKE_DIR / "tts"),
                "output_format": "wav",
            },
            "audio_postprocess": {
                "output_dir": str(SMOKE_DIR / "episodes"),
                "output_format": "wav",
            },
            "assets": {"output_dir": str(SMOKE_DIR / "assets")},
            "publish": {
                "local_base_dir": str(SMOKE_DIR / "dist" / "episodes"),
                "rss_output_dir": str(SMOKE_DIR / "rss"),
            },
        },
        "logs": [],
        "errors": [],
        "fetch_contents": [article],
        "cleaned_contents": [article],
        "researched_contents": [{**article, "research_notes": "", "key_points": [], "verified": False}],
        "facts": [fact],
        "selected_topic": {
            "title": "通勤早咖啡测试早报",
            "description": "用于 verify:nodes 的测试主题",
            "keywords": ["早报"],
        },
        "selected_topics": [{"id": "topic_1", "title": fact["title"], "fact_id": "fact_001"}],
        "selected_materials": [{**article, "_status": "ready"}],
        "script": script,
        "edited_script": script,
        "voice_segments": [
            {
                "segment_id": "seg_news_1",
                "path": str(smoke_audio),
                "text": script["segments"][1]["text"],
                "speaker": "Host A",
                "source_fact_ids": ["fact_001"],
                "engine": "mock",
                "voice": "zh-CN-XiaoxiaoNeural",
            }
        ],
        "audio_outputs": {
            "status": "ok",
            "final_audio_path": str(smoke_audio),
            "duration_seconds": 1,
            "format": "wav",
            "file_size": smoke_audio.stat().st_size,
            "segments_count": 1,
        },
        "cover_path": "",
        "review_summary": {},
        "publish_outputs": {},
    }


def test_node(node_name: str) -> bool:
    """Test a single node with minimal input."""
    test_state = _test_state()
    for output_key in NODE_OUTPUT_KEYS.get(node_name, []):
        test_state.pop(output_key, None)
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
                print(f"❌ {node_name}: Missing fields: {missing}")
                return False

            if not isinstance(result["logs"], list) or not isinstance(result["errors"], list):
                print(f"❌ {node_name}: logs and errors must be lists")
                return False

            if result["errors"]:
                first_error = result["errors"][0]
                message = (
                    first_error.get("message", "Unknown")
                    if isinstance(first_error, dict)
                    else str(first_error)
                )
                print(f"❌ {node_name}: Completed with errors: {message}")
                return False

            expected_outputs = VERIFY_EXPECTED_OUTPUTS.get(node_name, [])
            missing_outputs = [key for key in expected_outputs if key not in result]
            if missing_outputs:
                print(f"❌ {node_name}: Missing node outputs: {missing_outputs}")
                return False

            if node_name not in ALLOW_EMPTY_NODES:
                empty_outputs = [
                    key
                    for key in expected_outputs
                    if result.get(key) is None
                    or isinstance(result.get(key), (list, dict, str))
                    and not result.get(key)
                ]
                if empty_outputs:
                    print(f"❌ {node_name}: Empty node outputs: {empty_outputs}")
                    return False

            for output_key in FILE_OUTPUTS.get(node_name, []):
                raw_paths = result.get(output_key)
                if output_key == "voice_segments":
                    paths = [item.get("path") for item in raw_paths if isinstance(item, dict)]
                elif output_key == "audio_outputs":
                    paths = [raw_paths.get("final_audio_path"), raw_paths.get("audio_report_path")]
                elif output_key == "publish_outputs":
                    paths = [raw_paths.get("feed_xml"), raw_paths.get("episode_json")]
                else:
                    paths = raw_paths if isinstance(raw_paths, list) else [raw_paths]
                missing_files = [
                    str(path)
                    for path in paths
                    if not path or not Path(str(path)).is_file()
                ]
                if missing_files:
                    print(
                        f"❌ {node_name}: Output artifacts do not exist "
                        f"for {output_key}: {missing_files}"
                    )
                    return False

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
