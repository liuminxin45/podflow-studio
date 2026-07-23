"""Evaluate a source-verified offline demo pack with the local Codex CLI."""

# ruff: noqa: E402

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from nodes.facts.config import FactsConfig
from nodes.facts.node import run as facts_run
from nodes.script.config import ScriptConfig
from nodes.script.editorial_plan import (
    EDITORIAL_PLAN_SYSTEM_PROMPT,
    build_editorial_plan_prompt,
    validate_editorial_plan,
)
from nodes.script.node import _normalize_script, _resolve_script_structure
from nodes.script.prompts import EPISODE_SCRIPT_SYSTEM_PROMPT, build_episode_script_prompt
from nodes.script.quality import assess_script_quality
from protocol.presets import get_default_preset
from scripts.run_demo_news import load_demo_pack


def _codex_json(codex_path: str, system_prompt: str, user_prompt: str) -> dict[str, Any]:
    prompt = f"{system_prompt}\n\n{user_prompt}"
    completed = subprocess.run(
        [
            codex_path,
            "exec",
            "--ephemeral",
            "--ignore-user-config",
            "--sandbox",
            "read-only",
            "--ignore-rules",
            "--color",
            "never",
            "-C",
            str(ROOT),
            "-",
        ],
        input=prompt,
        text=True,
        encoding="utf-8",
        capture_output=True,
        timeout=600,
        check=False,
    )
    if completed.returncode:
        raise RuntimeError(
            f"Codex CLI failed with exit code {completed.returncode}: "
            f"{completed.stderr.strip()}"
        )
    payload = completed.stdout.strip()
    if payload.startswith("```"):
        payload = payload.removeprefix("```json").removeprefix("```")
        payload = payload.removesuffix("```").strip()
    result = json.loads(payload)
    if not isinstance(result, dict):
        raise ValueError("Codex CLI must return a JSON object")
    return result


def evaluate_pack(pack_id: str, codex_path: str) -> dict[str, Any]:
    pack, source_items = load_demo_pack(pack_id)
    items = [{**item, "_status": "ready"} for item in source_items]
    preset = get_default_preset()
    state: dict[str, Any] = {
        "schema_version": 1,
        "selected_materials": items,
        "facts": [],
        "selected_topics": [],
        "errors": [],
        "logs": [],
    }
    state = facts_run(
        state,
        FactsConfig(max_facts=20, selected_topic_count=len(items)),
    )
    facts = state["facts"]
    config = ScriptConfig()
    structure = _resolve_script_structure(facts, preset)
    plan_prompt = build_editorial_plan_prompt(
        facts,
        target_chars_min=config.episode_chars_min,
        target_chars_max=config.episode_chars_max,
        deep_dive_count=int(structure["actual_deep_dive_count"]),
    )
    raw_plan = _codex_json(codex_path, EDITORIAL_PLAN_SYSTEM_PROMPT, plan_prompt)
    plan = validate_editorial_plan(
        raw_plan,
        facts,
        expected_deep_dive_count=int(structure["actual_deep_dive_count"]),
    )
    topic = {
        "title": pack["episode_title"],
        "description": pack["topic_description"],
    }
    script_prompt = build_episode_script_prompt(
        topic,
        config,
        facts,
        structure,
        plan,
    )
    raw_script = _codex_json(codex_path, EPISODE_SCRIPT_SYSTEM_PROMPT, script_prompt)
    script = _normalize_script(raw_script, topic, facts, config, plan)
    quality = assess_script_quality(script, facts, plan)
    return {
        "pack": pack,
        "facts": facts,
        "editorial_plan": plan,
        "script": script,
        "quality": quality,
        "total_chars": sum(
            len(str(segment.get("text") or "")) for segment in script["segments"]
        ),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("pack", choices=["lifestyle-consumer", "ai-technology"])
    parser.add_argument("--codex", default="codex", help="Path to the Codex executable")
    parser.add_argument("--output", type=Path, help="Optional JSON report path")
    args = parser.parse_args()
    report = evaluate_pack(args.pack, args.codex)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(
            json.dumps(report, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
    print(
        json.dumps(
            {
                "pack": args.pack,
                "segments": len(report["script"]["segments"]),
                "total_chars": report["total_chars"],
                "quality": report["quality"],
                "output": str(args.output or ""),
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    return 1 if report["quality"]["hard"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
