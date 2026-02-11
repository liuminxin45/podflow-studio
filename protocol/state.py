"""
Shared State Schema

All nodes communicate through this state structure via JSON serialization.
"""

from __future__ import annotations
from dataclasses import dataclass, field, asdict
from typing import List, Dict, Any
from datetime import datetime
import json


@dataclass
class PodcastState:
    """Podcast generation shared state"""

    episode_id: str = field(default_factory=lambda: f"ep_{datetime.now().strftime('%Y%m%d_%H%M')}")
    created_at: str = field(default_factory=lambda: datetime.now().isoformat())

    fetch_contents: List[Dict[str, Any]] = field(default_factory=list)
    manual_contents: List[Dict[str, Any]] = field(default_factory=list)
    raw_contents: List[Dict[str, Any]] = field(default_factory=list)
    cleaned_contents: List[Dict[str, Any]] = field(default_factory=list)
    researched_contents: List[Dict[str, Any]] = field(default_factory=list)
    
    selected_topic: Dict[str, Any] = field(default_factory=dict)
    selected_materials: List[Dict[str, Any]] = field(default_factory=list)
    
    script: Dict[str, Any] = field(default_factory=dict)
    stages: List[Dict[str, Any]] = field(default_factory=list)
    
    audio_segments: List[str] = field(default_factory=list)
    final_audio_path: str = ""
    audio_metadata: Dict[str, Any] = field(default_factory=dict)
    
    cover_path: str = ""
    intro_outro_paths: Dict[str, str] = field(default_factory=dict)
    
    review_summary: Dict[str, Any] = field(default_factory=dict)
    storage_info: Dict[str, Any] = field(default_factory=dict)
    
    rss_path: str = ""
    publish_status: Dict[str, Any] = field(default_factory=dict)
    subtitle_path: str = ""
    
    runtime_config: Dict[str, Any] = field(default_factory=dict)
    errors: List[Dict[str, Any]] = field(default_factory=list)
    logs: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)

    def to_json(self) -> str:
        return json.dumps(self.to_dict(), ensure_ascii=False)

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> PodcastState:
        known = {f.name for f in cls.__dataclass_fields__.values()}
        filtered = {k: v for k, v in data.items() if k in known}
        return cls(**filtered)

    @classmethod
    def from_json(cls, raw: str) -> PodcastState:
        return cls.from_dict(json.loads(raw))
