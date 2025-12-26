"""
Helpers for serializing clusters and writing artifact files.
"""

from __future__ import annotations

import dataclasses
import datetime as dt
import json
from collections import Counter
from pathlib import Path
from typing import Iterable, Mapping, Sequence

from src.utils.models import StoryCluster

__all__ = [
    "serialize_cluster",
    "write_jsonl",
    "write_json_file",
    "write_cluster_artifacts",
]


def serialize_cluster(cluster: StoryCluster) -> dict:
    data = dataclasses.asdict(cluster)
    for key in ("first_seen_at", "last_seen_at", "cooldown_until"):
        value = data.get(key)
        if isinstance(value, dt.datetime):
            data[key] = value.isoformat()
    return data


def write_jsonl(path: Path, rows: Iterable[Mapping]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as fh:
        for row in rows:
            fh.write(json.dumps(row, ensure_ascii=False))
            fh.write("\n")


def write_json_file(path: Path, payload: Mapping) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def write_cluster_artifacts(*, out_dir: Path, clusters: Sequence[StoryCluster], selection: Mapping) -> dict:
    dedup_dir = out_dir / "dedup"
    artifacts_dir = dedup_dir / "artifacts"
    artifacts_dir.mkdir(parents=True, exist_ok=True)

    write_jsonl(artifacts_dir / "clusters.jsonl", (serialize_cluster(cluster) for cluster in clusters))
    write_jsonl(artifacts_dir / "selected_clusters.jsonl", selection.get("selected", []))
    write_jsonl(artifacts_dir / "rejected_clusters.jsonl", selection.get("rejected", []))

    reasons_counter: Counter[str] = Counter()
    for entry in selection.get("rejected", []):
        for reason in entry.get("reasons") or []:
            reasons_counter[reason] += 1

    metrics = {
        "clusters_total": len(clusters),
        "selected_clusters": len(selection.get("selected", [])),
        "rejected_clusters": len(selection.get("rejected", [])),
        "selected_items": sum(len(entry.get("items") or []) for entry in selection.get("selected", [])),
        "rejection_reasons": dict(reasons_counter),
        "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(),
    }

    write_json_file(dedup_dir / "metrics.json", metrics)
    return metrics
