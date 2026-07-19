import json
import math
import struct
import wave
from pathlib import Path

from nodes.assets.config import AssetsConfig
from nodes.assets.node import _load_cover_font
from nodes.assets.node import _safe_path_part as assets_safe_path_part
from nodes.assets.node import run as assets_run
from nodes.audio_postprocess.config import AudioPostprocessConfig
from nodes.audio_postprocess.node import (
    _assemble_wav_fallback,
    _safe_path_part as audio_safe_path_part,
    run as audio_postprocess_run,
)
from nodes.publish.config import PublishConfig
from nodes.publish.node import run as publish_run
from nodes.tts.config import TTSConfig
from nodes.tts.node import _safe_path_part as tts_safe_path_part
from nodes.tts.node import _synthesize_openai_compatible
from nodes.tts.node import run as tts_run
from protocol.artifact_utils import file_fingerprint
from tests.mock_data import create_base_state


def _write_wav(path: Path, *, frequency: float, seconds: float = 0.25) -> None:
    sample_rate = 16_000
    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), "wb") as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(sample_rate)
        frames = []
        for index in range(int(sample_rate * seconds)):
            value = int(1800 * math.sin(2 * math.pi * frequency * index / sample_rate))
            frames.append(struct.pack("<h", value))
        output.writeframes(b"".join(frames))


def test_audio_postprocess_mixes_bgm_and_isolates_episode_output(tmp_path: Path):
    voice_path = tmp_path / "voice.wav"
    bgm_path = tmp_path / "bed.wav"
    _write_wav(voice_path, frequency=440)
    _write_wav(bgm_path, frequency=220, seconds=0.1)

    state = create_base_state()
    state["episode_id"] = "../episode A"
    state["voice_segments"] = [{"segment_id": "seg_1", "path": str(voice_path)}]

    result = audio_postprocess_run(
        state,
        AudioPostprocessConfig(
            output_dir=str(tmp_path / "episodes"),
            output_format="wav",
            segment_pause_ms=0,
            normalize_loudness=False,
            add_bgm=True,
            bgm_path=str(bgm_path),
            bgm_volume=0.2,
        ),
    )

    final_path = Path(result["audio_outputs"]["final_audio_path"])
    assert final_path.exists()
    assert final_path.parent == tmp_path / "episodes" / audio_safe_path_part("../episode A")
    assert Path(result["audio_outputs"]["audio_report_path"]).parent == final_path.parent
    assert result["audio_outputs"]["status"] == "ok"
    assert result["audio_outputs"]["audio_artifact"] == file_fingerprint(final_path)
    assert "mix_bgm" in result["audio_outputs"]["operations"]
    assert "bgm_volume_20pct" in result["audio_outputs"]["operations"]

    with wave.open(str(voice_path), "rb") as voice, wave.open(str(final_path), "rb") as final:
        assert final.readframes(final.getnframes()) != voice.readframes(voice.getnframes())


def test_audio_postprocess_refuses_incomplete_source_set_by_default(tmp_path: Path):
    readable = tmp_path / "voice.wav"
    missing = tmp_path / "missing.wav"
    _write_wav(readable, frequency=440)
    state = create_base_state()
    state["voice_segments"] = [
        {"segment_id": "seg_1", "path": str(readable)},
        {"segment_id": "seg_2", "path": str(missing)},
    ]

    result = audio_postprocess_run(
        state,
        AudioPostprocessConfig(output_dir=str(tmp_path / "episodes"), output_format="wav"),
    )

    assert result["audio_outputs"].get("final_audio_path", "") == ""
    assert result["audio_outputs"]["status"] == "error"
    assert "source segment(s) are missing" in result["audio_outputs"]["message"]
    assert any(error["node"] == "audio_postprocess" for error in result["errors"])


def test_audio_postprocess_reports_missing_bgm_instead_of_silent_success(tmp_path: Path):
    voice_path = tmp_path / "voice.wav"
    _write_wav(voice_path, frequency=440)
    state = create_base_state()
    state["voice_segments"] = [{"segment_id": "seg_1", "path": str(voice_path)}]

    result = audio_postprocess_run(
        state,
        AudioPostprocessConfig(
            output_dir=str(tmp_path / "episodes"),
            output_format="wav",
            add_bgm=True,
            bgm_path=str(tmp_path / "does-not-exist.mp3"),
        ),
    )

    assert result["audio_outputs"].get("final_audio_path", "") == ""
    assert result["audio_outputs"]["status"] == "error"
    assert "BGM file does not exist" in result["audio_outputs"]["message"]


def test_audio_postprocess_uses_the_same_expanded_bgm_path_for_validation_and_mixing(
    tmp_path: Path,
    monkeypatch,
):
    profile = tmp_path / "profile"
    voice_path = tmp_path / "voice.wav"
    bgm_path = profile / "Music" / "bed.wav"
    _write_wav(voice_path, frequency=440)
    _write_wav(bgm_path, frequency=220, seconds=0.1)
    monkeypatch.setenv("HOME", str(profile))
    monkeypatch.setenv("USERPROFILE", str(profile))

    state = create_base_state()
    state["voice_segments"] = [{"segment_id": "seg_1", "path": str(voice_path)}]
    result = audio_postprocess_run(
        state,
        AudioPostprocessConfig(
            output_dir=str(tmp_path / "episodes"),
            output_format="wav",
            add_bgm=True,
            bgm_path="~/Music/bed.wav",
        ),
    )

    assert result["audio_outputs"]["status"] == "ok"
    assert "mix_bgm" in result["audio_outputs"]["operations"]


def test_tts_failed_regeneration_clears_stale_audio(tmp_path: Path):
    state = create_base_state()
    state["edited_script"] = {"segments": [{"id": "seg_1", "type": "quick_news", "title": "新闻", "speaker": "Host A", "text": "真实稿件", "source_fact_ids": [], "estimated_seconds": 5}]}
    state["voice_segments"] = [{"segment_id": "old", "path": "old.wav"}]

    result = tts_run(state, TTSConfig(engine="unsupported", output_dir=str(tmp_path)))

    assert result["voice_segments"] == []
    assert any(error["node"] == "tts" and "Unsupported TTS engine" in error["message"] for error in result["errors"])


def test_tts_sanitizes_episode_id_and_rejects_timeout_alias(tmp_path: Path):
    state = create_base_state()
    state["episode_id"] = "../unsafe episode"
    state["edited_script"] = {"segments": [{"id": "seg_1", "type": "quick_news", "title": "新闻", "speaker": "Host A", "text": "真实稿件", "source_fact_ids": [], "estimated_seconds": 5}]}

    result = tts_run(state, TTSConfig(engine="mock", output_dir=str(tmp_path)))
    output_path = Path(result["voice_segments"][0]["path"])

    assert output_path.parent == tmp_path
    assert output_path.name.startswith(f"{tts_safe_path_part('../unsafe episode')}_")
    try:
        TTSConfig.from_dict({"request_timeout_sec": 17})
    except ValueError as error:
        assert "Unsupported TTS config fields" in str(error)
    else:
        raise AssertionError("obsolete timeout alias must be rejected")


def test_openai_compatible_tts_sends_audio_speech_request_and_writes_response(
    tmp_path: Path,
    monkeypatch,
):
    captured = {}

    class Response:
        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

        @staticmethod
        def read():
            return b"real-audio-response"

    def fake_urlopen(request, timeout):
        captured["request"] = request
        captured["timeout"] = timeout
        return Response()

    monkeypatch.setattr("nodes.tts.node.urllib.request.urlopen", fake_urlopen)
    output_path = tmp_path / "speech.mp3"
    config = TTSConfig(
        engine="openai-compatible",
        api_key="test-key",
        api_base="https://tts.example.test/v1/",
        model="tts-model",
        output_format="mp3",
        timeout_seconds=17,
    )

    _synthesize_openai_compatible("真实口播", "alloy", str(output_path), config)

    request = captured["request"]
    payload = json.loads(request.data.decode("utf-8"))
    assert request.full_url == "https://tts.example.test/v1/audio/speech"
    assert request.headers["Authorization"] == "Bearer test-key"
    assert captured["timeout"] == 17
    assert payload == {
        "model": "tts-model",
        "voice": "alloy",
        "input": "真实口播",
        "response_format": "mp3",
    }
    assert output_path.read_bytes() == b"real-audio-response"


def test_produce_path_sanitizers_preserve_unicode_and_block_windows_reserved_names():
    for sanitizer in (tts_safe_path_part, audio_safe_path_part, assets_safe_path_part):
        assert sanitizer("plain-safe", "unknown") == "plain-safe"
        assert sanitizer("中文节目 早报", "unknown").startswith("中文节目_早报_")
        assert sanitizer("../安全/节目", "unknown").startswith("安全_节目_")
        assert sanitizer("CON", "unknown").startswith("_CON_")
        long_value = "a" * 119 + "." + "b" * 20
        sanitized = sanitizer(long_value, "unknown")
        assert len(sanitized.encode("utf-8")) <= 120
        assert not sanitized.endswith((".", " ", "_"))
        assert sanitized != sanitizer(long_value + "different", "unknown")


def test_produce_path_sanitizers_do_not_collapse_lossy_inputs():
    for sanitizer in (tts_safe_path_part, audio_safe_path_part, assets_safe_path_part):
        assert sanitizer("episode/a") != sanitizer("episode\\a")
        assert sanitizer("CON") != sanitizer("_CON")
        assert sanitizer("../a") != sanitizer("a")
        assert sanitizer("...") != sanitizer("___")
        assert sanitizer("Episode") != sanitizer("episode")
        unicode_value = "节目" * 100
        assert len(sanitizer(unicode_value).encode("utf-8")) <= 120


def test_assets_skip_clears_stale_cover():
    state = create_base_state()
    state["cover_path"] = "out/assets/old-cover.png"

    result = assets_run(state, AssetsConfig(generate_cover=False))

    assert result["cover_path"] == ""


def test_assets_isolates_and_sanitizes_episode_output(tmp_path: Path):
    state = create_base_state()
    state["episode_id"] = "../unsafe episode"

    result = assets_run(state, AssetsConfig(output_dir=str(tmp_path), generate_cover=True))
    cover_path = Path(result["cover_path"])

    assert cover_path.exists()
    assert cover_path == tmp_path / assets_safe_path_part("../unsafe episode") / "cover.png"

    from PIL import Image

    with Image.open(cover_path) as cover:
        assert cover.size == (1400, 1400)
        colors = cover.convert("RGB").getcolors(maxcolors=1400 * 1400)
        assert colors is not None
        color_counts = {color: count for count, color in colors}
        assert color_counts[(244, 241, 234)] > 1_000_000
        assert color_counts[(35, 38, 36)] > 1_000
        assert color_counts[(218, 104, 72)] > 1_000


def test_cover_font_renders_distinct_chinese_glyphs():
    font = _load_cover_font(80, bold=True, sample_text="通勤")

    assert bytes(font.getmask("通")) != bytes(font.getmask("勤"))


def test_wav_fallback_does_not_append_pause_after_last_segment(tmp_path: Path):
    first = tmp_path / "first.wav"
    second = tmp_path / "second.wav"
    _write_wav(first, frequency=440, seconds=0.25)
    _write_wav(second, frequency=330, seconds=0.25)

    output_path, duration = _assemble_wav_fallback(
        [{"path": str(first)}, {"path": str(second)}],
        tmp_path / "final.wav",
        segment_pause_ms=100,
    )

    assert output_path.exists()
    assert duration == 0.6


def test_mock_audio_provenance_reaches_reports_and_local_publish_package(tmp_path: Path):
    voice_path = tmp_path / "mock.wav"
    _write_wav(voice_path, frequency=440)
    state = create_base_state()
    state["episode_id"] = "mock/demo"
    state["voice_segments"] = [
        {"segment_id": "seg_1", "path": str(voice_path), "engine": "mock"}
    ]

    state = audio_postprocess_run(
        state,
        AudioPostprocessConfig(output_dir=str(tmp_path / "audio"), output_format="wav"),
    )
    assert state["audio_outputs"]["source_engines"] == ["mock"]
    assert state["audio_outputs"]["contains_mock_audio"] is True
    assert any(warning["code"] == "mock_audio" for warning in state["run_report"]["warnings"])

    state = publish_run(
        state,
        PublishConfig(
            local_base_dir=str(tmp_path / "publish"),
            rss_output_dir=str(tmp_path / "rss"),
            public_base_url="",
        ),
    )
    episode_payload = json.loads(Path(state["publish_outputs"]["episode_json"]).read_text("utf-8"))
    assert episode_payload["audio"]["outputs"]["contains_mock_audio"] is True
    assert state["publish_outputs"]["contains_mock_audio"] is True
    assert "mock TTS" in state["publish_outputs"]["warning"]
    assert Path(state["publish_outputs"]["episode_dir"]).name == assets_safe_path_part("mock/demo")


def test_recording_provenance_comes_from_voice_segments(tmp_path: Path):
    recording_path = tmp_path / "recording.wav"
    _write_wav(recording_path, frequency=440)
    state = create_base_state()
    state["episode_id"] = "recorded-episode"
    state["voice_segments"] = [
        {"segment_id": "seg_1", "path": str(recording_path), "engine": "recording", "mime_type": "audio/wav"}
    ]

    result = audio_postprocess_run(
        state,
        AudioPostprocessConfig(output_dir=str(tmp_path / "audio"), output_format="wav"),
    )

    assert result["audio_outputs"]["source_engines"] == ["recording"]
    assert result["audio_outputs"]["contains_mock_audio"] is False


def test_public_publish_refuses_mock_audio(tmp_path: Path):
    final_audio = tmp_path / "mock.wav"
    _write_wav(final_audio, frequency=440)
    state = create_base_state()
    state["audio_outputs"] = {"status": "ok", "contains_mock_audio": True, "final_audio_path": str(final_audio)}

    result = publish_run(
        state,
        PublishConfig(
            local_base_dir=str(tmp_path / "publish"),
            rss_output_dir=str(tmp_path / "rss"),
            public_base_url="https://podcast.example.test",
        ),
    )

    assert result["publish_outputs"] == {}
    assert any(
        error["node"] == "publish" and "mock TTS" in error["message"]
        for error in result["errors"]
    )


def test_local_publish_fails_when_final_audio_is_missing(tmp_path: Path):
    state = create_base_state()
    state["audio_outputs"] = {"final_audio_path": str(tmp_path / "missing.wav")}

    result = publish_run(
        state,
        PublishConfig(
            local_base_dir=str(tmp_path / "publish"),
            rss_output_dir=str(tmp_path / "rss"),
        ),
    )

    assert result["publish_outputs"] == {}
    assert any(
        error["node"] == "publish" and "final audio" in error["message"]
        for error in result["errors"]
    )


def test_public_publish_does_not_depend_on_review_results(tmp_path: Path):
    final_audio = tmp_path / "review-failed.wav"
    _write_wav(final_audio, frequency=440)
    state = create_base_state()
    state["audio_outputs"] = {
        "status": "ok",
        "contains_mock_audio": False,
        "final_audio_path": str(final_audio),
        "source_engines": ["openai"],
        "audio_artifact": file_fingerprint(final_audio),
    }
    state["review_summary"] = {
        "checks": [{"level": "error", "message": "Audio too short"}],
        "audio_artifact": file_fingerprint(final_audio),
    }

    result = publish_run(
        state,
        PublishConfig(
            local_base_dir=str(tmp_path / "publish"),
            rss_output_dir=str(tmp_path / "rss"),
            public_base_url="https://podcast.example.test",
        ),
    )

    assert result["publish_outputs"]["status"] == "success"
    assert result["publish_outputs"]["platforms"] == {"local": "success", "rss": "success"}
    assert not any(error["node"] == "publish" for error in result["errors"])


def test_public_publish_fails_closed_without_audio_provenance_or_review(tmp_path: Path):
    final_audio = tmp_path / "unverified.wav"
    _write_wav(final_audio, frequency=440)
    state = create_base_state()
    state["voice_segments"] = [
        {"segment_id": "seg_1", "path": str(final_audio), "engine": "mock"}
    ]
    state["audio_outputs"] = {}
    state["review_summary"] = {}

    result = publish_run(
        state,
        PublishConfig(
            local_base_dir=str(tmp_path / "publish"),
            rss_output_dir=str(tmp_path / "rss"),
            public_base_url="https://podcast.example.test",
        ),
    )

    assert result["publish_outputs"] == {}
    assert any(
        error["node"] == "publish" and "provenance is incomplete" in error["message"]
        for error in result["errors"]
    )


def test_public_publish_ignores_stale_review_artifacts(tmp_path: Path):
    reviewed_audio = tmp_path / "reviewed.wav"
    final_audio = tmp_path / "replaced.wav"
    _write_wav(reviewed_audio, frequency=220)
    _write_wav(final_audio, frequency=440)
    state = create_base_state()
    state["audio_outputs"] = {
        "status": "ok",
        "contains_mock_audio": False,
        "final_audio_path": str(final_audio),
        "source_engines": ["openai"],
        "audio_artifact": file_fingerprint(final_audio),
    }
    state["review_summary"] = {
        "checks": [{"level": "pass", "message": "Audio file ready"}],
        "audio_artifact": file_fingerprint(reviewed_audio),
    }

    result = publish_run(
        state,
        PublishConfig(
            local_base_dir=str(tmp_path / "publish"),
            rss_output_dir=str(tmp_path / "rss"),
            public_base_url="https://podcast.example.test",
        ),
    )

    assert result["publish_outputs"]["status"] == "success"
    assert not any(error["node"] == "publish" for error in result["errors"])


def test_publish_reports_only_local_archive_and_rss(tmp_path: Path):
    final_audio = tmp_path / "selected-platforms.wav"
    _write_wav(final_audio, frequency=440)
    state = create_base_state()
    state["audio_outputs"] = {
        "status": "ok",
        "contains_mock_audio": False,
        "final_audio_path": str(final_audio),
        "source_engines": ["recording"],
        "audio_artifact": file_fingerprint(final_audio),
    }

    result = publish_run(
        state,
        PublishConfig(
            local_base_dir=str(tmp_path / "publish"),
            rss_output_dir=str(tmp_path / "rss"),
            public_base_url="https://podcast.example.test",
            enabled_platforms=["rss", "apple", "spotify", "ximalaya"],
        ),
    )

    assert result["publish_outputs"]["status"] == "success"
    assert result["publish_outputs"]["platforms"] == {
        "local": "success",
        "rss": "success",
    }
