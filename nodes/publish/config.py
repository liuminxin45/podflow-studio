from dataclasses import dataclass
from typing import Dict, Any


@dataclass
class PublishConfig:
    # Storage settings (merged from store node)
    storage_type: str = "local"
    local_base_dir: str = "out/published"
    generate_metadata: bool = True
    # RSS / Publish settings
    rss_output_dir: str = "out/rss"
    podcast_title: str = "AI Tech Podcast"
    podcast_description: str = "AI-generated tech podcast"
    podcast_author: str = "Auto-Podcast"
    podcast_language: str = "zh-CN"
    podcast_category: str = "Technology"

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "PublishConfig":
        defaults = {
            "storage_type": "local", "local_base_dir": "out/published",
            "generate_metadata": True, "rss_output_dir": "out/rss",
            "podcast_title": "AI Tech Podcast",
            "podcast_description": "AI-generated tech podcast",
            "podcast_author": "Auto-Podcast", "podcast_language": "zh-CN",
            "podcast_category": "Technology"
        }
        merged = {**defaults, **data}
        return cls(**{k: v for k, v in merged.items() if k in cls.__dataclass_fields__})
