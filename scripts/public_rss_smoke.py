"""Validate public RSS URL generation using the demo-news pipeline."""

# ruff: noqa: E402

from __future__ import annotations

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.run_demo_news import run_demo_news


def main() -> int:
    public_base_url = os.environ.get("PODFLOW_PUBLIC_BASE_URL", "").strip().rstrip("/")
    if not public_base_url:
        print("PODFLOW_PUBLIC_BASE_URL is required for public RSS smoke.", file=sys.stderr)
        return 2

    output_dir = ROOT / ".codex-run" / "rss-public"
    state = run_demo_news(output_dir=output_dir, episode_id="public_rss_smoke")
    validation = state.get("publish_outputs", {}).get("rss_validation", {})
    enclosure_url = validation.get("enclosure_url") or state.get("publish_outputs", {}).get("enclosure_url", "")

    failures: list[str] = []
    if not validation.get("ok"):
        failures.append(f"RSS validation failed: {validation}")
    if validation.get("local_preview_only"):
        failures.append("RSS is still local-preview only.")
    if not enclosure_url.startswith(public_base_url + "/"):
        failures.append(f"enclosure_url does not start with public base: {enclosure_url}")
    if enclosure_url.startswith("file://") or ":\\" in enclosure_url:
        failures.append(f"enclosure_url is local: {enclosure_url}")

    if failures:
        for failure in failures:
            print(f"ERROR: {failure}", file=sys.stderr)
        return 1

    print("Public RSS smoke completed")
    print(f"public_base_url: {public_base_url}")
    print(f"enclosure_url: {enclosure_url}")
    print(f"feed_xml: {state.get('publish_outputs', {}).get('feed_xml', '')}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
