"""
Shared State Schema

All nodes communicate through this state structure via JSON serialization.
"""

from dataclasses import dataclass, field, asdict
from typing import Any, Self
from datetime import datetime
import json


@dataclass
class PodcastState:
    """Podcast generation shared state"""

    episode_id: str = field(default_factory=lambda: f"ep_{datetime.now().strftime('%Y%m%d_%H%M')}")
    created_at: str = field(default_factory=lambda: datetime.now().isoformat())

    fetch_contents: list[dict[str, Any]] = field(default_factory=list)
    manual_contents: list[dict[str, Any]] = field(default_factory=list)
    raw_contents: list[dict[str, Any]] = field(default_factory=list)
    cleaned_contents: list[dict[str, Any]] = field(default_factory=list)
    researched_contents: list[dict[str, Any]] = field(default_factory=list)

    selected_topic: dict[str, Any] = field(default_factory=dict)
    selected_materials: list[dict[str, Any]] = field(default_factory=list)

    script: dict[str, Any] = field(default_factory=dict)
    stages: list[dict[str, Any]] = field(default_factory=list)

    audio_segments: list[str] = field(default_factory=list)
    recording_segments: list[dict[str, Any]] = field(default_factory=list)
    final_audio_path: str = ""
    audio_metadata: dict[str, Any] = field(default_factory=dict)

    cover_path: str = ""
    intro_outro_paths: dict[str, str] = field(default_factory=dict)

    review_summary: dict[str, Any] = field(default_factory=dict)
    storage_info: dict[str, Any] = field(default_factory=dict)

    rss_path: str = ""
    publish_status: dict[str, Any] = field(default_factory=dict)
    subtitle_path: str = ""

    runtime_config: dict[str, Any] = field(default_factory=dict)
    errors: list[dict[str, Any]] = field(default_factory=list)
    logs: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    def to_json(self) -> str:
        return json.dumps(self.to_dict(), ensure_ascii=False)

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> Self:
        known = {f.name for f in cls.__dataclass_fields__.values()}
        filtered = {k: v for k, v in data.items() if k in known}
        return cls(**filtered)

    @classmethod
    def from_json(cls, raw: str) -> Self:
        return cls.from_dict(json.loads(raw))
