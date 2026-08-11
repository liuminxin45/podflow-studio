"""Dry-run by default; publish an immutable episode MP3 to a GitHub Release with --publish."""

from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import tempfile
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--episode-id", required=True)
    parser.add_argument("--audio", required=True, type=Path)
    parser.add_argument("--notes", required=True, type=Path)
    parser.add_argument("--episode-json", required=True, type=Path)
    parser.add_argument("--repo", default="liuminxin45/podflow-morning-feed")
    parser.add_argument("--publish", action="store_true")
    args = parser.parse_args()

    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}(?:-[a-z0-9]+(?:-[a-z0-9]+)*)?", args.episode_id):
        raise SystemExit("episode-id must be an immutable date-based ID")
    audio = args.audio.resolve()
    notes = args.notes.resolve()
    episode_json = args.episode_json.resolve()
    if not audio.is_file() or audio.suffix.lower() != ".mp3":
        raise SystemExit("audio must be a readable MP3")
    if not notes.is_file():
        raise SystemExit("notes file is missing")
    if not episode_json.is_file():
        raise SystemExit("episode-json is missing")
    payload = json.loads(episode_json.read_text(encoding="utf-8"))
    showcase = payload.get("showcase") if isinstance(payload, dict) else None
    outputs = payload.get("audio", {}).get("outputs", {}) if isinstance(payload, dict) else {}
    if not isinstance(showcase, dict) or showcase.get("id") != args.episode_id:
        raise SystemExit("episode-json showcase ID does not match episode-id")
    if outputs.get("status") != "ok" or outputs.get("contains_mock_audio") is not False:
        raise SystemExit("public release requires successful non-mock audio provenance")
    if int(outputs.get("sample_rate_hz") or 0) != 48_000 or int(outputs.get("bitrate_kbps") or 0) < 128:
        raise SystemExit("public release audio must be 48 kHz and at least 128 kbps")
    if not -17 <= float(outputs.get("target_lufs") or 0) <= -15 or float(outputs.get("true_peak_db") or 0) > -1:
        raise SystemExit("public release audio must meet the -16 LUFS and -1 dBTP baseline")
    duration = int(float(showcase.get("durationSeconds") or 0))
    if not 720 <= duration <= 900:
        raise SystemExit("public release duration must be within 12-15 minutes")
    if int(showcase.get("audioBytes") or 0) < duration * 16_000:
        raise SystemExit("public release audioBytes is too small for a 128 kbps MP3")
    if int(showcase.get("audioBytes") or 0) != audio.stat().st_size:
        raise SystemExit("episode-json audioBytes does not match the immutable MP3")
    release_url = f"https://github.com/{args.repo}/releases/download/{args.episode_id}/{args.episode_id}.mp3"
    plan = {
        "mode": "publish" if args.publish else "dry-run",
        "repo": args.repo,
        "tag": args.episode_id,
        "sourceAudio": str(audio),
        "assetName": f"{args.episode_id}.mp3",
        "releaseUrl": release_url,
    }
    if not args.publish:
        print(json.dumps(plan, ensure_ascii=False, indent=2))
        return 0

    existing = subprocess.run(
        ["gh", "release", "view", args.episode_id, "--repo", args.repo],
        capture_output=True,
        text=True,
    )
    if existing.returncode == 0:
        raise SystemExit("release already exists; published episodes are immutable")
    with tempfile.TemporaryDirectory(prefix="podflow-release-") as temp_dir:
        upload = Path(temp_dir) / f"{args.episode_id}.mp3"
        shutil.copy2(audio, upload)
        subprocess.run(
            [
                "gh", "release", "create", args.episode_id, str(upload),
                "--repo", args.repo,
                "--title", f"PodFlow 晨报 {args.episode_id}",
                "--notes-file", str(notes),
            ],
            check=True,
        )
    print(json.dumps({**plan, "ok": True}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
