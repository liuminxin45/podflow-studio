"""Derive the four PodFlow v3 brand cues from Ondrosik's CC0 Quick Spark."""

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
        raise ValueError(f"Quick Spark is too short for {start_ms}+{duration_ms}ms cue")
    return clip.fade_in(fade_in_ms).fade_out(fade_out_ms).set_frame_rate(48_000).set_channels(2)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", required=True, type=Path)
    args = parser.parse_args()
    source_path = args.source.resolve()
    if not source_path.is_file():
        raise ValueError(f"Quick Spark source is missing: {source_path}")
    from pydub import AudioSegment

    source = AudioSegment.from_file(source_path)
    cues = {
        "podflow-intro.wav": (0, 8000, 120, 700),
        "podflow-transition.wav": (11_500, 1350, 50, 220),
        "podflow-bridge.wav": (20_000, 2400, 80, 350),
        "podflow-outro.wav": (34_500, 7000, 700, 900),
    }
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    records = []
    for filename, values in cues.items():
        path = OUTPUT_DIR / filename
        _cue(source, *values).export(path, format="wav")
        records.append({"filename": filename, "startMs": values[0], "durationMs": values[1], "sha256": _sha256(path)})
    metadata = {
        "title": "Quick Spark", "artist": "Ondrosik", "license": "CC0 1.0 Universal",
        "sourceUrl": "https://ondrosik.sk/music/",
        "trackUrl": "https://freemusicarchive.org/music/Ondrosik/no-words/quick-spark/",
        "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/",
        "downloadedAt": date.today().isoformat(), "originalFilename": source_path.name,
        "originalSha256": _sha256(source_path), "edits": "Cropped, faded and loudness-adjusted during final mixing.",
        "cues": records,
    }
    (OUTPUT_DIR / "quick-spark-source.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(metadata, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
