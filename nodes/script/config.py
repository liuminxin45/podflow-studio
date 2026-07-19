from typing import Literal

from pydantic import Field, model_validator
from protocol.config_base import NodeConfigBase, LLMConfigMixin
from protocol.presets import DEFAULT_PRESET_ID


DEFAULT_TARGET_DURATION_MINUTES = 22
DEFAULT_WORDS_PER_MINUTE = 250
DEFAULT_EPISODE_CHARS_MIN = 5200
DEFAULT_EPISODE_CHARS_MAX = 6200
DEFAULT_QUICK_NEWS_COUNT = 9
DEFAULT_DEEP_DIVE_COUNT = 1
RETIRED_SCRIPT_SETTINGS = {
    "tone_style",
    "assist_level",
    "compliance_strictness",
    "reminder_intensity",
    "text_mode",
    "cost_quality_balance",
}


class ScriptConfig(NodeConfigBase, LLMConfigMixin):
    """Script generation node configuration."""

    preset_id: Literal["morning_news_brief"] = Field(
        default=DEFAULT_PRESET_ID, description="默认产品预设"
    )
    content_type: Literal["news_brief"] = Field(
        default="news_brief", description="文案类型"
    )
    editorial_voice: Literal["professional", "human"] = Field(
        default="human", description="成稿体系：professional 专业播报；human 自然人味"
    )

    target_duration_minutes: int = Field(
        default=DEFAULT_TARGET_DURATION_MINUTES,
        ge=1,
        le=120,
        description="目标播客时长（分钟）",
    )
    num_hosts: Literal[1] = Field(default=1, description="主持人数量")
    recommended_news_item_count: int = Field(default=10, ge=1, le=20, description="新闻早报模式下的推荐新闻条目数量")
    quick_news_recommended_count: int = Field(
        default=DEFAULT_QUICK_NEWS_COUNT,
        ge=0,
        le=20,
        description="推荐快讯数量；实际数量会受可用事实卡片限制",
    )
    deep_dive_recommended_count: int = Field(
        default=DEFAULT_DEEP_DIVE_COUNT,
        ge=0,
        le=10,
        description="推荐深度解读数量；素材不足时会自动省略",
    )
    allow_custom_news_item_count: bool = Field(
        default=True, description="是否允许实际新闻数量超过推荐结构"
    )
    quick_news_chars_min: int = Field(default=240, ge=80, le=1000, description="单条快讯建议最少字数")
    quick_news_chars_max: int = Field(default=360, ge=120, le=1500, description="单条快讯建议最多字数")
    deep_dive_chars_min: int = Field(default=2000, ge=0, le=10000, description="深度稿建议最少字数")
    deep_dive_chars_max: int = Field(default=2600, ge=0, le=12000, description="深度稿建议最多字数")
    episode_chars_min: int = Field(
        default=DEFAULT_EPISODE_CHARS_MIN,
        ge=1,
        le=30000,
        description="单期建议最少字数",
    )
    episode_chars_max: int = Field(
        default=DEFAULT_EPISODE_CHARS_MAX,
        ge=1,
        le=40000,
        description="单期建议最多字数",
    )
    tone: str = Field(default="clear, concise, commute-friendly", description="默认语气")
    content_tendency: Literal["news", "analysis"] = Field(
        default="news", description="来自设置页的内容倾向"
    )
    content_guidance: str = Field(
        default="以事实和最新进展为主，每条交代事件、关键事实与听众相关性。",
        description="由设置页映射出的内容倾向写作准则",
    )
    language: str = Field(default="zh-CN", description="稿件语言")
    require_approval: bool = Field(
        default=True,
        description="是否需要人工审批。开启后，脚本生成完成会暂停等待人工审批；关闭则由AI自动处理",
    )
    words_per_minute: int = Field(
        default=DEFAULT_WORDS_PER_MINUTE,
        ge=50,
        le=600,
        description="口播语速（字/分钟），用于让目标时长与正文长度保持一致",
    )

    @model_validator(mode="before")
    @classmethod
    def discard_retired_settings(cls, value: object) -> object:
        if not isinstance(value, dict):
            return value
        return {key: item for key, item in value.items() if key not in RETIRED_SCRIPT_SETTINGS}

    @model_validator(mode="after")
    def validate_editorial_ranges(self) -> "ScriptConfig":
        pairs = (
            ("quick_news_chars", self.quick_news_chars_min, self.quick_news_chars_max),
            ("deep_dive_chars", self.deep_dive_chars_min, self.deep_dive_chars_max),
            ("episode_chars", self.episode_chars_min, self.episode_chars_max),
        )
        for label, minimum, maximum in pairs:
            if minimum > maximum:
                raise ValueError(f"{label}_min cannot exceed {label}_max")

        recommended_total = self.quick_news_recommended_count + self.deep_dive_recommended_count
        if recommended_total != self.recommended_news_item_count:
            raise ValueError(
                "recommended_news_item_count must equal quick_news_recommended_count "
                "+ deep_dive_recommended_count"
            )

        duration_fields = {
            "target_duration_minutes",
            "words_per_minute",
            "episode_chars_min",
            "episode_chars_max",
        }
        target_chars = self.target_duration_minutes * self.words_per_minute
        if duration_fields.intersection(self.model_fields_set) and not (
            self.episode_chars_min <= target_chars <= self.episode_chars_max
        ):
            raise ValueError(
                "target_duration_minutes * words_per_minute must fall within "
                "episode_chars_min and episode_chars_max"
            )
        return self
