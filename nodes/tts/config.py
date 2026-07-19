from dataclasses import dataclass, field
from typing import Any


@dataclass
class TTSConfig:
    engine: str = "mock"
    api_key: str = ""
    api_base: str = ""
    model: str = ""
    output_format: str = "mp3"
    timeout_seconds: int = 120
    voice_mapping: dict[str, str] = field(
        default_factory=lambda: {
            "Host A": "zh-CN-XiaoxiaoNeural",
        }
    )
    default_voice: str = "zh-CN-XiaoxiaoNeural"
    output_dir: str = "out/voice_segments"
    rate: str = "+0%"
    volume: str = "+0%"
    doubao_app_id: str = ""
    doubao_access_token: str = ""
    doubao_cluster: str = "volcano_tts"
    doubao_voice_type: str = "zh_female_shuangkuaisisi_moon_bigtts"
    doubao_endpoint: str = "https://openspeech.bytedance.com/api/v1/tts"
    doubao_resource_id: str = "volc.service_type.10029"

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "TTSConfig":
        unknown = set(data) - set(cls.__dataclass_fields__)
        if unknown:
            raise ValueError(f"Unsupported TTS config fields: {', '.join(sorted(unknown))}")
        defaults = {
            "engine": "mock",
            "api_key": "",
            "api_base": "",
            "model": "",
            "output_format": "mp3",
            "timeout_seconds": 120,
            "default_voice": "zh-CN-XiaoxiaoNeural",
            "output_dir": "out/voice_segments",
            "rate": "+0%",
            "volume": "+0%",
            "voice_mapping": {
                "Host A": "zh-CN-XiaoxiaoNeural",
            },
            "doubao_app_id": "",
            "doubao_access_token": "",
            "doubao_cluster": "volcano_tts",
            "doubao_voice_type": "zh_female_shuangkuaisisi_moon_bigtts",
            "doubao_endpoint": "https://openspeech.bytedance.com/api/v1/tts",
            "doubao_resource_id": "volc.service_type.10029",
        }
        merged = {**defaults, **data}
        return cls(**merged)
