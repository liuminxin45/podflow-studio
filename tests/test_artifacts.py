from __future__ import annotations

import json
import tempfile
from pathlib import Path

from src.store.artifacts import write_cluster_artifacts
from src.utils.models import StoryCluster, StoryClusterSignals


def _make_cluster(idx: int) -> StoryCluster:
    return StoryCluster(
        cluster_id=f"clu:{idx}",
        headline=f"新闻{idx}",
        topic="ai",
        items=[f"item:{idx}"],
        first_seen_at="2025-12-26T00:00:00+00:00",
        last_seen_at="2025-12-26T01:00:00+00:00",
        cooldown_until="2025-12-28T01:00:00+00:00",
        signals=StoryClusterSignals(freshness=1.0),
    )


def test_write_cluster_artifacts_outputs_all_files():
    clusters = [_make_cluster(1), _make_cluster(2)]
    selection = {
        "selected": [
            {
                "cluster": {"cluster_id": "clu:1"},
                "metadata": {"topic": "ai"},
                "items": [{"id": "item:1"}],
                "reasons": [],
                "selected": True,
            }
        ],
        "rejected": [
            {
                "cluster": {"cluster_id": "clu:2"},
                "metadata": {"topic": "ai"},
                "items": [{"id": "item:2"}],
                "reasons": ["cooldown"],
                "selected": False,
            }
        ],
    }

    with tempfile.TemporaryDirectory() as tmpdir:
        out_dir = Path(tmpdir)
        metrics = write_cluster_artifacts(out_dir=out_dir, clusters=clusters, selection=selection)

        dedup_dir = out_dir / "dedup"
        artifacts_dir = dedup_dir / "artifacts"

        assert (artifacts_dir / "clusters.jsonl").exists()
        assert (artifacts_dir / "selected_clusters.jsonl").exists()
        assert (artifacts_dir / "rejected_clusters.jsonl").exists()
        assert (dedup_dir / "metrics.json").exists()

        metrics_data = json.loads((dedup_dir / "metrics.json").read_text(encoding="utf-8"))
        assert metrics_data["clusters_total"] == 2
        assert metrics_data["selected_clusters"] == 1
        assert metrics_data["rejected_clusters"] == 1
        assert metrics_data["rejection_reasons"]["cooldown"] == 1
        assert metrics == metrics_data
