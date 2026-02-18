from dataclasses import dataclass, field
from typing import Dict, Any


@dataclass
class TTSConfig:
    engine: str = "edge-tts"
    api_key: str = ""
    api_base: str = "https://api.openai.com/v1"
    model: str = "tts-1"
    output_format: str = "mp3"
    timeout_seconds: int = 120
    voice_mapping: Dict[str, str] = field(default_factory=lambda: {
        "Host A": "zh-CN-XiaoxiaoNeural",
        "Host B": "zh-CN-YunxiNeural",
    })
    default_voice: str = "zh-CN-XiaoxiaoNeural"
    output_dir: str = "out/audio_segments"
    rate: str = "+0%"
    volume: str = "+0%"
    api_base: str = ""
    api_key: str = ""
    model: str = ""
    request_timeout_sec: int = 60
    doubao_app_id: str = ""
    doubao_access_token: str = ""
    doubao_cluster: str = "volcano_tts"
    doubao_voice_type: str = "zh_female_shuangkuaisisi_moon_bigtts"
    doubao_endpoint: str = "https://openspeech.bytedance.com/api/v1/tts"

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "TTSConfig":
        defaults = {"engine": "edge-tts", "api_key": "", "api_base": "https://api.openai.com/v1",
                    "model": "tts-1", "output_format": "mp3", "timeout_seconds": 120,
                    "default_voice": "zh-CN-XiaoxiaoNeural",
                    "output_dir": "out/audio_segments", "rate": "+0%", "volume": "+0%",
                    "voice_mapping": {"Host A": "zh-CN-XiaoxiaoNeural", "Host B": "zh-CN-YunxiNeural"},
                    "api_base": "", "api_key": "", "model": "", "request_timeout_sec": 60,
                    "doubao_app_id": "", "doubao_access_token": "", "doubao_cluster": "volcano_tts",
                    "doubao_voice_type": "zh_female_shuangkuaisisi_moon_bigtts",
                    "doubao_endpoint": "https://openspeech.bytedance.com/api/v1/tts"}
        merged = {**defaults, **data}
        return cls(**{k: v for k, v in merged.items() if k in cls.__dataclass_fields__})
