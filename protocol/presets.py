"""Product presets for PodFlow Studio's primary workflows."""

from dataclasses import asdict, dataclass, field
from typing import Any


DEFAULT_PRESET_ID = "morning_news_brief"
DEFAULT_SEGMENT_PLAN = [
    {"type": "opening", "count": 1, "target_seconds": [75, 110]},
    {"type": "quick_news", "recommended_count": 9, "target_seconds": [55, 90]},
    {"type": "deep_dive", "recommended_count": 1, "target_seconds": [480, 625]},
    {"type": "closing", "count": 1, "target_seconds": [20, 40]},
]


@dataclass(frozen=True)
class MorningNewsBriefPreset:
    """Default preset for a solo commute-friendly morning news brief."""

    id: str = DEFAULT_PRESET_ID
    content_type: str = "news_brief"
    num_hosts: int = 1
    target_duration_minutes: int = 22
    target_duration_minutes_range: str = "20-24"
    template_variant: str = "quick_9_plus_deep_1"
    recommended_news_item_count: int = 10
    quick_news_recommended_count: int = 9
    deep_dive_recommended_count: int = 1
    allow_custom_news_item_count: bool = True
    tone: str = "clear, concise, commute-friendly"
    language: str = "zh-CN"
    segment_plan: list[dict[str, Any]] = field(default_factory=lambda: DEFAULT_SEGMENT_PLAN)


MORNING_NEWS_BRIEF_PRESET = MorningNewsBriefPreset()


def get_default_preset() -> dict[str, Any]:
    """Return the default preset as a plain dict for JSON state/config use."""

    return asdict(MORNING_NEWS_BRIEF_PRESET)
