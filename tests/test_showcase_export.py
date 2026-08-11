from __future__ import annotations

import json
from pathlib import Path

import pytest

from scripts.export_showcase import export_showcase


def _write_package(root: Path, *, mock_audio: bool = False) -> Path:
    episode_dir = root / "published"
    episode_dir.mkdir()
    payload = {
        "audio": {
            "outputs": {
                "status": "ok",
                "contains_mock_audio": mock_audio,
                "sample_rate_hz": 48_000,
                "bitrate_kbps": 128,
                "target_lufs": -16,
                "true_peak_db": -1,
            }
        },
        "showcase": {
            "id": "2026-08-11",
            "title": "PodFlow 晨报｜测试期",
            "summary": "经过事实、成稿、发音和听感复核的测试摘要。",
            "publishedAt": "2026-08-11T07:30:00+08:00",
            "durationSeconds": 840,
            "audioBytes": 13_440_000,
            "sources": [{"title": "公开来源", "url": "https://example.com/news"}],
            "credits": [{"role": "制作", "name": "PodFlow Studio"}],
            "ttsProvider": "豆包 BigTTS",
            "aiAssisted": True,
            "explicit": False,
        },
    }
    (episode_dir / "episode.json").write_text(
        json.dumps(payload, ensure_ascii=False), encoding="utf-8"
    )
    (episode_dir / "cover.png").write_bytes(b"cover")
    (episode_dir / "transcript.vtt").write_text("WEBVTT\n", encoding="utf-8")
    (episode_dir / "chapters.json").write_text(
        '{"version":"1.2.0","chapters":[]}', encoding="utf-8"
    )
    (episode_dir / "show-notes.md").write_text("# Show notes\n", encoding="utf-8")
    (episode_dir / "sources.json").write_text("[]", encoding="utf-8")
    return episode_dir


def test_export_showcase_writes_public_manifest_and_assets(tmp_path: Path) -> None:
    episode_dir = _write_package(tmp_path)

    manifest_path = export_showcase(
        episode_dir,
        tmp_path / "site",
        audio_url="https://github.com/example/releases/download/2026-08-11/2026-08-11.mp3",
        site_base_url="https://example.com/podflow-studio",
        approved=True,
    )

    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    assert manifest["id"] == "2026-08-11"
    assert manifest["coverUrl"].endswith("/2026-08-11/cover.png")
    assert manifest["ttsProvider"] == "豆包 BigTTS"
    assert (manifest_path.parent / "transcript.vtt").is_file()


def test_export_showcase_requires_explicit_human_approval(tmp_path: Path) -> None:
    episode_dir = _write_package(tmp_path)

    with pytest.raises(ValueError, match="explicit --approved"):
        export_showcase(
            episode_dir,
            tmp_path / "site",
            audio_url="https://example.com/2026-08-11.mp3",
            site_base_url="https://example.com/podflow-studio",
            approved=False,
        )


def test_export_showcase_rejects_mock_audio(tmp_path: Path) -> None:
    episode_dir = _write_package(tmp_path, mock_audio=True)

    with pytest.raises(ValueError, match="Mock or unknown audio"):
        export_showcase(
            episode_dir,
            tmp_path / "site",
            audio_url="https://example.com/2026-08-11.mp3",
            site_base_url="https://example.com/podflow-studio",
            approved=True,
        )


def test_export_showcase_rejects_non_public_source_url(tmp_path: Path) -> None:
    episode_dir = _write_package(tmp_path)
    payload_path = episode_dir / "episode.json"
    payload = json.loads(payload_path.read_text(encoding="utf-8"))
    payload["showcase"]["sources"][0]["url"] = "file:///private/source.html"
    payload_path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")

    with pytest.raises(ValueError, match="source.url must be a public HTTPS URL"):
        export_showcase(
            episode_dir,
            tmp_path / "site",
            audio_url="https://example.com/2026-08-11.mp3",
            site_base_url="https://example.com/podflow-studio",
            approved=True,
        )
