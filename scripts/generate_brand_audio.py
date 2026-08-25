"""Derive the four PodFlow v4 brand cues from HoliznaCC0's CC0 Make Funk."""

from __future__ import annotations

import argparse
import hashlib
import json
from datetime import date
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = ROOT / "assets" / "audio"


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _cue(source, start_ms: int, duration_ms: int, fade_in_ms: int, fade_out_ms: int):
    clip = source[start_ms : start_ms + duration_ms]
    if len(clip) != duration_ms:
        raise ValueError(f"Make Funk is too short for {start_ms}+{duration_ms}ms cue")
    peak_adjustment_db = min(0.0, -1.0 - clip.max_dBFS)
    return (
        clip.apply_gain(peak_adjustment_db)
        .fade_in(fade_in_ms)
        .fade_out(fade_out_ms)
        .set_frame_rate(48_000)
        .set_channels(2)
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", required=True, type=Path)
    args = parser.parse_args()
    source_path = args.source.resolve()
    if not source_path.is_file():
        raise ValueError(f"Make Funk source is missing: {source_path}")
    from pydub import AudioSegment

    source = AudioSegment.from_file(source_path)
    cues = {
        "podflow-intro.wav": (0, 12_000, 120, 1000),
        "podflow-transition.wav": (42_000, 1350, 50, 220),
        "podflow-bridge.wav": (82_000, 2400, 80, 350),
        "podflow-outro.wav": (153_000, 10_000, 900, 1200),
    }
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    records = []
    for filename, values in cues.items():
        path = OUTPUT_DIR / filename
        _cue(source, *values).export(path, format="wav")
        records.append({"filename": filename, "startMs": values[0], "durationMs": values[1], "sha256": _sha256(path)})
    metadata = {
        "title": "Make Funk", "artist": "HoliznaCC0", "license": "CC0 1.0 Universal",
        "sourceUrl": "https://freemusicarchive.org/music/holiznacc0/",
        "trackUrl": "https://freemusicarchive.org/music/holiznacc0/bassic/make-funk/",
        "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/",
        "downloadedAt": date.today().isoformat(), "originalFilename": source_path.name,
        "originalSha256": _sha256(source_path), "edits": "Cropped, faded and loudness-adjusted during final mixing.",
        "cues": records,
    }
    metadata_path = OUTPUT_DIR / "make-funk-source.json"
    with metadata_path.open("w", encoding="utf-8", newline="\n") as stream:
        stream.write(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(metadata, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
