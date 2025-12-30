"""
LLM prompt templates
"""

from .prompts import (
    build_research_script_prompt,
    build_news_script_prompt,
    build_detailed_news_script_prompt,
)

__all__ = [
    "build_research_script_prompt",
    "build_news_script_prompt",
    "build_detailed_news_script_prompt",
]
