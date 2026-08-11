"""Export one reviewed PodFlow episode into the public showcase manifest contract."""

from __future__ import annotations

import argparse
import json
import re
import shutil
from pathlib import Path
from urllib.parse import urlparse


DATE_EPISODE_ID = re.compile(r"^\d{4}-\d{2}-\d{2}(?:-[a-z0-9]+(?:-[a-z0-9]+)*)?$")


def _public_url(value: str, field: str) -> str:
    parsed = urlparse(value)
    if parsed.scheme != "https" or not parsed.netloc:
        raise ValueError(f"{field} must be a public HTTPS URL")
    return value


def _load_json(path: Path) -> dict:
    if not path.is_file():
        raise ValueError(f"Missing required file: {path}")
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"Expected a JSON object: {path}")
    return value


def export_showcase(
    episode_dir: Path,
    output_dir: Path,
    *,
    audio_url: str,
    site_base_url: str,
    approved: bool,
) -> Path:
    if not approved:
        raise ValueError("Showcase export requires explicit --approved after fact, script, pronunciation and listening review")
    payload = _load_json(episode_dir / "episode.json")
    showcase = payload.get("showcase")
    if not isinstance(showcase, dict):
        raise ValueError("episode.json does not contain showcase metadata")
    episode_id = str(showcase.get("id") or "")
    if not DATE_EPISODE_ID.fullmatch(episode_id):
        raise ValueError("Showcase episode ID must be date-based and immutable")
    audio_outputs = payload.get("audio", {}).get("outputs", {})
    if not isinstance(audio_outputs, dict) or audio_outputs.get("status") != "ok":
        raise ValueError("Showcase export requires successful audio assembly provenance")
    if audio_outputs.get("contains_mock_audio") is not False:
        raise ValueError("Mock or unknown audio cannot be exported to the public showcase")
    if int(audio_outputs.get("sample_rate_hz") or 0) != 48_000:
        raise ValueError("Showcase audio must be 48 kHz")
    if int(audio_outputs.get("bitrate_kbps") or 0) < 128:
        raise ValueError("Showcase audio must be at least 128 kbps")
    if not -17 <= float(audio_outputs.get("target_lufs") or 0) <= -15:
        raise ValueError("Showcase audio must target -16 LUFS ±1")
    if float(audio_outputs.get("true_peak_db") or 0) > -1:
        raise ValueError("Showcase audio true peak must not exceed -1 dBTP")

    sources = showcase.get("sources")
    if not isinstance(sources, list) or not sources:
        raise ValueError("Showcase episode must include traceable sources")
    normalized_sources = []
    for source in sources:
        if not isinstance(source, dict) or not str(source.get("title") or "").strip():
            raise ValueError("Every showcase source requires a title and URL")
        normalized_sources.append({
            "title": str(source["title"]).strip(),
            "url": _public_url(str(source.get("url") or ""), "source.url"),
        })

    required_assets = {
        "cover": next((path for path in episode_dir.glob("cover.*") if path.is_file()), None),
        "transcript": episode_dir / "transcript.vtt",
        "chapters": episode_dir / "chapters.json",
        "showNotes": episode_dir / "show-notes.md",
        "sources": episode_dir / "sources.json",
    }
    if any(path is None or not path.is_file() for path in required_assets.values()):
        raise ValueError("Showcase package is missing cover, transcript, chapters, show notes or sources")

    target = output_dir / episode_id
    if target.exists() and any(target.iterdir()):
        raise ValueError(f"Refusing to overwrite an existing showcase episode: {target}")
    target.mkdir(parents=True, exist_ok=True)
    for path in required_assets.values():
        shutil.copy2(path, target / path.name)

    base = _public_url(site_base_url.rstrip("/"), "site_base_url")
    cover_name = required_assets["cover"].name
    manifest = {
        "id": episode_id,
        "title": str(showcase.get("title") or "").strip(),
        "summary": str(showcase.get("summary") or "").strip(),
        "publishedAt": str(showcase.get("publishedAt") or "").strip(),
        "durationSeconds": int(float(showcase.get("durationSeconds") or 0)),
        "audioUrl": _public_url(audio_url, "audio_url"),
        "audioBytes": int(showcase.get("audioBytes") or 0),
        "coverUrl": f"{base}/{episode_id}/{cover_name}",
        "transcriptUrl": f"{base}/{episode_id}/transcript.vtt",
        "chaptersUrl": f"{base}/{episode_id}/chapters.json",
        "sources": normalized_sources,
        "credits": showcase.get("credits") or [{"role": "制作", "name": "PodFlow Studio"}],
        "ttsProvider": str(showcase.get("ttsProvider") or "").strip(),
        "aiAssisted": bool(showcase.get("aiAssisted")),
        "explicit": bool(showcase.get("explicit")),
    }
    if not manifest["title"] or not manifest["summary"] or not manifest["publishedAt"]:
        raise ValueError("Showcase title, summary and publishedAt are required")
    if not 720 <= manifest["durationSeconds"] <= 900:
        raise ValueError("Showcase duration must be within the 12-15 minute golden range")
    if manifest["audioBytes"] < manifest["durationSeconds"] * 16_000:
        raise ValueError("Showcase audioBytes is too small for a 128 kbps public MP3")
    if manifest["ttsProvider"] != "豆包 BigTTS":
        raise ValueError("Showcase TTS provider must use the fixed 豆包 BigTTS baseline")
    manifest_path = target / "episode.json"
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return manifest_path


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--episode-dir", required=True, type=Path)
    parser.add_argument("--output-dir", required=True, type=Path)
    parser.add_argument("--audio-url", required=True)
    parser.add_argument("--site-base-url", required=True)
    parser.add_argument("--approved", action="store_true")
    args = parser.parse_args()
    manifest = export_showcase(
        args.episode_dir.resolve(),
        args.output_dir.resolve(),
        audio_url=args.audio_url,
        site_base_url=args.site_base_url,
        approved=args.approved,
    )
    print(json.dumps({"ok": True, "manifest": str(manifest)}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
