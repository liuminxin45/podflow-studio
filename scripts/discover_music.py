"""Discover review-only CC0 music candidates using PodFlow style profiles."""

from __future__ import annotations

import argparse
import json

from protocol.music_profiles import load_music_profiles
from protocol.music_sources import discover_openverse_music


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--list-styles", action="store_true")
    parser.add_argument("--style", default="morning_coffee_warm")
    parser.add_argument("--limit", type=int, default=10)
    args = parser.parse_args()
    if args.list_styles:
        print(json.dumps(load_music_profiles(), ensure_ascii=False, indent=2))
        return 0
    print(json.dumps(discover_openverse_music(args.style, limit=args.limit), ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
