"""
LLM prompt templates
"""

from .prompts import (
    ShowConfig,
    NewsItem,
    HostPersona,
    PRESET_PERSONAS,
    SYSTEM_PROMPT,
    build_opening_prompt,
    build_history_prompt,
    build_brief_news_prompt,
    build_deep_dive_prompt,
    build_outro_prompt,
)

__all__ = [
    "ShowConfig",
    "NewsItem",
    "HostPersona",
    "PRESET_PERSONAS",
    "SYSTEM_PROMPT",
    "build_opening_prompt",
    "build_history_prompt",
    "build_brief_news_prompt",
    "build_deep_dive_prompt",
    "build_outro_prompt",
]
