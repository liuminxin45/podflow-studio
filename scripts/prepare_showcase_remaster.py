"""Create a private PodFlow workflow from one existing showcase transcript.

This migration helper never copies audio. It reconstructs the editable script and
source facts so the revision must pass the current v3 render, review and approval
pipeline before it can be packaged again.
"""

from __future__ import annotations

import argparse
from datetime import datetime
import json
from pathlib import Path
import re

from protocol.state import PodcastState


TIMESTAMP = r"\d{2}:\d{2}:\d{2}\.\d{3}"
TIMED_CUE = re.compile(
    rf"^\d+\n(?P<start>{TIMESTAMP}) --> (?P<end>{TIMESTAMP})\n(?P<text>.*?)"
    rf"(?=^\d+\n{TIMESTAMP} --> {TIMESTAMP}\n|\Z)",
    flags=re.DOTALL | re.MULTILINE,
)


def _seconds(value: str) -> int:
    hours, minutes, rest = value.split(":")
    return round(int(hours) * 3600 + int(minutes) * 60 + float(rest))


def build_workflow(episode_dir: Path, episode_id: str) -> dict:
    episode = json.loads((episode_dir / "episode.json").read_text(encoding="utf-8"))
    sources = json.loads((episode_dir / "sources.json").read_text(encoding="utf-8"))
    chapters = json.loads((episode_dir / "chapters.json").read_text(encoding="utf-8"))["chapters"]
    transcript = (episode_dir / "transcript.vtt").read_text(encoding="utf-8")
    cues = list(TIMED_CUE.finditer(transcript))
    if len(cues) != 9 or len(chapters) != 9:
        raise ValueError("Remaster input must contain opening, 6 quick news, deep dive and closing")
    types = ["opening", *("quick_news" for _ in range(6)), "deep_dive", "closing"]
    facts = [{
        "id": f"fact_{index:03d}", "title": item["title"], "summary": item["title"], "confidence": "low",
        "evidence": [{"id": f"evidence_{index:03d}", "url": item["url"], "title": item["title"], "published_at": "", "source_role": "background", "excerpt": item["title"]}],
        "claims": [{"id": f"claim_{index:03d}", "text": item["title"], "evidence_ids": [f"evidence_{index:03d}"], "status": "insufficient", "confidence": "low", "verifier_model": "", "verified_at": ""}],
    } for index, item in enumerate(sources, start=1)]
    source_ids = [[], *([f"fact_{index:03d}"] for index in range(1, 7)),
                  [f"fact_{index:03d}" for index in range(7, len(facts) + 1)], []]
    deep_claim_ids = [f"claim_{index:03d}" for index in range(7, len(facts) + 1)]
    claim_ids = [[], *([f"claim_{index:03d}"] for index in range(1, 7)),
                 deep_claim_ids, []]
    segments = []
    for index, (cue, segment_type, fact_ids, bound_claim_ids) in enumerate(zip(cues, types, source_ids, claim_ids), start=1):
        start = _seconds(cue.group("start"))
        end = _seconds(cue.group("end"))
        segments.append({
            "id": f"segment_{index:03d}",
            "type": segment_type,
            "title": str(chapters[index - 1]["title"]),
            "text": re.sub(r"\s+", "", cue.group("text")).strip(),
            "speaker": "Host A",
            "source_fact_ids": fact_ids,
            "source_claim_ids": bound_claim_ids,
            "estimated_seconds": max(1, end - start),
        })
    state = PodcastState().to_dict()
    state.update({
        "episode_id": episode_id,
        "created_at": datetime.fromisoformat(episode["publishedAt"]).isoformat(),
        "facts": facts,
        "script": {"title": episode["title"], "description": episode["summary"], "segments": segments},
        "edited_script": {"title": episode["title"], "description": episode["summary"], "segments": segments},
    })
    return {"id": episode_id, "name": episode["title"], "state": state}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--episode-dir", required=True, type=Path)
    parser.add_argument("--episode-id", required=True)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    payload = build_workflow(args.episode_dir.resolve(), args.episode_id)
    if args.output.is_file():
        previous = json.loads(args.output.read_text(encoding="utf-8"))
        previous_state = previous.get("state", previous) if isinstance(previous, dict) else {}
        payload["state"]["voice_segments"] = previous_state.get("voice_segments", [])
        payload["state"]["production_plan"] = previous_state.get("production_plan", {})
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"ok": True, "workflow": str(args.output.resolve())}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
