import sys
import json
import datetime as dt
from pathlib import Path

sys.path.insert(0, 'src')
from store.clusters import cluster_items, ClusterConfig

# Find latest run
runs_dir = Path('out/runs/20251230')
latest_run = sorted(runs_dir.iterdir(), key=lambda x: x.stat().st_mtime)[-1]
items_file = latest_run / '1_fetch/artifacts/normalized_items.jsonl'

# Load items
items = []
with open(items_file) as f:
    for line in f:
        items.append(json.loads(line))

print(f"Loaded {len(items)} items")

# Test clustering
cfg = ClusterConfig(time_window_days=7)
now = dt.datetime.now(dt.timezone.utc)
cutoff = now - dt.timedelta(days=7)

print(f"\nNow: {now}")
print(f"Cutoff (7 days ago): {cutoff}")

# Check each item
for i, item in enumerate(items):
    pub = item.get('published_at')
    if isinstance(pub, str):
        pub_dt = dt.datetime.fromisoformat(pub)
    else:
        pub_dt = pub
    
    passes = pub_dt >= cutoff
    print(f"\nItem {i}: {item.get('title', 'NO TITLE')[:50]}")
    print(f"  Published: {pub}")
    print(f"  Parsed: {pub_dt}")
    print(f"  Passes filter (>= cutoff): {passes}")
    print(f"  Has fingerprints: {item.get('fingerprints') is not None}")

# Run clustering
clusters = cluster_items(items, config=cfg)
print(f"\n{'='*60}")
print(f"Clustering result: {len(clusters)} clusters from {len(items)} items")
print(f"{'='*60}")
