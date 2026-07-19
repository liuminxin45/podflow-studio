import base64
import json
from pathlib import Path

import pytest

from nodes.tts.config import TTSConfig
from nodes.tts.node import _doubao_speed_ratio, _synthesize_doubao


class _Response:
    def __init__(self, payload: dict):
        self.payload = payload

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def read(self) -> bytes:
        return json.dumps(self.payload).encode("utf-8")


def test_voice_clone_config_uses_explicit_clone_resource():
    config = TTSConfig.from_dict({
        "engine": "voice_clone",
        "doubao_resource_id": "volc.megatts.default",
    })

    assert config.doubao_resource_id == "volc.megatts.default"


def test_doubao_tts_sends_official_v1_payload_and_writes_audio(tmp_path: Path, monkeypatch):
    captured = {}

    def fake_urlopen(request, timeout):
        captured["request"] = request
        captured["timeout"] = timeout
        return _Response({
            "code": 3000,
            "message": "Success",
            "data": base64.b64encode(b"doubao-audio").decode("ascii"),
        })

    monkeypatch.setattr("nodes.tts.node.urllib.request.urlopen", fake_urlopen)
    output_path = tmp_path / "speech.mp3"
    config = TTSConfig(
        engine="doubao_tts",
        output_format="mp3",
        timeout_seconds=19,
        rate="+10%",
        doubao_app_id="doubao-app",
        doubao_access_token="doubao-token",
        doubao_cluster="volcano_tts",
        doubao_voice_type="zh_female_test_bigtts",
        doubao_endpoint="https://openspeech.bytedance.com/api/v1/tts",
        doubao_resource_id="volc.service_type.10029",
    )

    _synthesize_doubao("真实口播", config.doubao_voice_type, str(output_path), config)

    request = captured["request"]
    payload = json.loads(request.data.decode("utf-8"))
    assert request.full_url == config.doubao_endpoint
    assert request.get_header("Authorization") == "Bearer;doubao-token"
    assert request.get_header("Resource-id") == "volc.service_type.10029"
    assert captured["timeout"] == 19
    assert payload["app"] == {
        "appid": "doubao-app",
        "token": "doubao-token",
        "cluster": "volcano_tts",
    }
    assert payload["audio"] == {
        "voice_type": "zh_female_test_bigtts",
        "encoding": "mp3",
        "speed_ratio": 1.1,
    }
    assert payload["request"]["text"] == "真实口播"
    assert payload["request"]["operation"] == "query"
    assert payload["request"]["reqid"]
    assert output_path.read_bytes() == b"doubao-audio"


def test_doubao_voice_clone_uses_speaker_id_and_clone_resource(tmp_path: Path, monkeypatch):
    captured = {}

    def fake_urlopen(request, timeout):
        captured["request"] = request
        captured["timeout"] = timeout
        return _Response({
            "code": 3000,
            "message": "Success",
            "data": base64.b64encode(b"clone-audio").decode("ascii"),
        })

    monkeypatch.setattr("nodes.tts.node.urllib.request.urlopen", fake_urlopen)
    output_path = tmp_path / "clone.wav"
    config = TTSConfig(
        engine="voice_clone",
        output_format="wav",
        doubao_app_id="clone-app",
        doubao_access_token="clone-token",
        doubao_cluster="volcano_tts",
        doubao_voice_type="S_cloneSpeaker01",
        doubao_resource_id="volc.megatts.default",
    )

    _synthesize_doubao("复刻音色测试", config.doubao_voice_type, str(output_path), config)

    request = captured["request"]
    payload = json.loads(request.data.decode("utf-8"))
    assert request.get_header("Resource-id") == "volc.megatts.default"
    assert payload["audio"]["voice_type"] == "S_cloneSpeaker01"
    assert payload["audio"]["encoding"] == "wav"
    assert output_path.read_bytes() == b"clone-audio"


def test_doubao_tts_rejects_service_errors(tmp_path: Path, monkeypatch):
    monkeypatch.setattr(
        "nodes.tts.node.urllib.request.urlopen",
        lambda *_args, **_kwargs: _Response({"code": 3050, "message": "voice type not found"}),
    )
    config = TTSConfig(
        engine="doubao_tts",
        doubao_app_id="app",
        doubao_access_token="token",
        doubao_voice_type="missing-voice",
    )

    with pytest.raises(ValueError, match="voice type not found"):
        _synthesize_doubao("测试", config.doubao_voice_type, str(tmp_path / "failed.mp3"), config)


@pytest.mark.parametrize(
    ("rate", "expected"),
    [("-20%", 0.8), ("+0%", 1.0), ("+150%", 2.0), ("invalid", 1.0)],
)
def test_doubao_speed_ratio(rate: str, expected: float):
    assert _doubao_speed_ratio(rate) == expected
