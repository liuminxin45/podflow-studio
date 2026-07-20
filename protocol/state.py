"""
Shared State Schema

All nodes communicate through this state structure via JSON serialization.
"""

from dataclasses import dataclass, field, asdict
from typing import Any, Self
from datetime import datetime
import json

from protocol.episode_models import SCHEMA_VERSION
from protocol.presets import get_default_preset


@dataclass
class PodcastState:
    """Podcast generation shared state"""

    episode_id: str = field(default_factory=lambda: f"ep_{datetime.now().strftime('%Y%m%d_%H%M')}")
    created_at: str = field(default_factory=lambda: datetime.now().isoformat())
    schema_version: int = SCHEMA_VERSION

    preset: dict[str, Any] = field(default_factory=get_default_preset)
    source_inputs: list[dict[str, Any]] = field(default_factory=list)
    fetch_contents: list[dict[str, Any]] = field(default_factory=list)
    cleaned_contents: list[dict[str, Any]] = field(default_factory=list)
    researched_contents: list[dict[str, Any]] = field(default_factory=list)
    facts: list[dict[str, Any]] = field(default_factory=list)

    selected_topic: dict[str, Any] = field(default_factory=dict)
    selected_topics: list[dict[str, Any]] = field(default_factory=list)
    selected_materials: list[dict[str, Any]] = field(default_factory=list)
    auto_selected_items: list[dict[str, Any]] = field(default_factory=list)
    auto_rejected_items: list[dict[str, Any]] = field(default_factory=list)

    script: dict[str, Any] = field(default_factory=dict)
    edited_script: dict[str, Any] = field(default_factory=dict)
    generation_request: dict[str, Any] = field(default_factory=dict)
    generation_meta: dict[str, Any] = field(default_factory=dict)
    script_snapshots: list[dict[str, Any]] = field(default_factory=list)
    downstream_stale: dict[str, Any] = field(default_factory=dict)

    voice_segments: list[dict[str, Any]] = field(default_factory=list)
    production_plan: dict[str, Any] = field(default_factory=dict)
    audio_outputs: dict[str, Any] = field(default_factory=dict)

    cover_path: str = ""
    intro_outro_paths: dict[str, str] = field(default_factory=dict)

    review_summary: dict[str, Any] = field(default_factory=dict)

    publish_outputs: dict[str, Any] = field(default_factory=dict)
    subtitle_path: str = ""
    run_report: dict[str, Any] = field(default_factory=dict)
    runtime_config: dict[str, Any] = field(default_factory=dict)
    errors: list[dict[str, Any]] = field(default_factory=list)
    logs: list[str] = field(default_factory=list)
    discover_meta: dict[str, Any] = field(default_factory=dict)
    discover_ui: dict[str, Any] = field(default_factory=dict)
    organize_ui: dict[str, Any] = field(default_factory=dict)
    episode_brief: dict[str, Any] = field(default_factory=dict)
    writing_meta: dict[str, Any] = field(default_factory=dict)
    series: dict[str, Any] = field(default_factory=dict)
    playback: dict[str, Any] = field(default_factory=dict)
    _manifest: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    def to_json(self) -> str:
        return json.dumps(self.to_dict(), ensure_ascii=False)

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> Self:
        known = {f.name for f in cls.__dataclass_fields__.values()}
        unknown = sorted(set(data) - known)
        if unknown:
            raise ValueError(f"Unsupported PodcastState fields: {', '.join(unknown)}")
        return cls(**data)

    @classmethod
    def from_json(cls, raw: str) -> Self:
        return cls.from_dict(json.loads(raw))
