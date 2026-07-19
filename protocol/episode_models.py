"""Typed EpisodeRun schema models for the morning news primary path."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from protocol.presets import get_default_preset


SCHEMA_VERSION = 1


class FactCardModel(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    title: str
    summary: str
    source_title: str = ""
    source_url: str = ""
    published_at: str = ""
    claim: str = ""
    confidence: Literal["high", "medium", "low"] = "medium"
    source_titles: list[str] = Field(default_factory=list)
    source_urls: list[str] = Field(default_factory=list)
    is_deep_dive: bool = False
    used_in_segments: list[str] = Field(default_factory=list)


class ScriptSegmentModel(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    type: Literal["opening", "quick_news", "deep_dive", "closing", "custom"]
    title: str = ""
    text: str
    source_fact_ids: list[str] = Field(default_factory=list)
    estimated_seconds: int = 0
    speaker: str = "Host A"


class ScriptModel(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = ""
    title: str = ""
    description: str = ""
    content_type: str = "news_brief"
    preset_id: str = "morning_news_brief"
    num_hosts: int = 1
    language: str = "zh-CN"
    segments: list[ScriptSegmentModel] = Field(default_factory=list)
    generated_by: str = ""
    edited_from: str = ""
    edit_mode: str = ""
    manual_notes: str = ""
    facts_snapshot: list[FactCardModel] = Field(default_factory=list)
    recommended_news_item_count: int = 0
    recommended_quick_news_count: int = 0
    recommended_deep_dive_count: int = 0
    actual_news_item_count: int = 0
    actual_quick_news_count: int = 0
    actual_deep_dive_count: int = 0
    template_variant: str = ""
    generation_profile: dict[str, Any] = Field(default_factory=dict)
    warnings: list[dict[str, Any]] = Field(default_factory=list)


class GenerationRequestModel(BaseModel):
    model_config = ConfigDict(extra="forbid")

    mode: Literal["initial", "regenerate"] | None = None
    require_llm: bool = False
    requested_at: str = ""
    status: Literal["failed"] | None = None
    failed_at: str = ""
    draft_snapshot: ScriptModel | None = None

    @model_validator(mode="after")
    def require_mode_for_non_empty_request(self) -> "GenerationRequestModel":
        if self.model_fields_set and self.mode is None:
            raise ValueError("generation_request.mode is required for a non-empty request")
        return self


class AudioOutputsModel(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: str = ""
    final_audio_path: str = ""
    format: str = ""
    requested_format: str = ""
    degraded: bool = False
    duration_seconds: float = 0.0
    segments_count: int = 0
    source_segments: list[str] = Field(default_factory=list)
    source_engines: list[str] = Field(default_factory=list)
    contains_mock_audio: bool = False
    missing_segments: list[str] = Field(default_factory=list)
    operations: list[str] = Field(default_factory=list)
    file_size: int = 0
    audio_report_path: str = ""
    audio_artifact: dict[str, Any] = Field(default_factory=dict)
    message: str = ""


class ProductionClipModel(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    parent_segment_id: str
    segment_type: str = "custom"
    segment_title: str = ""
    text: str
    speaker: str = "Host A"
    source_fact_ids: list[str] = Field(default_factory=list)
    source: Literal["tts", "recording", "local"] = "tts"
    path: str = ""
    duration_seconds: float = 0.0
    trim_start_ms: int = Field(default=0, ge=0)
    trim_end_ms: int = Field(default=0, ge=0)
    generation_key: str = ""


class ProductionJoinModel(BaseModel):
    model_config = ConfigDict(extra="forbid")

    after_clip_id: str
    type: Literal["pause", "transition"] = "pause"
    duration_ms: int = Field(default=600, ge=0, le=15000)


class ProductionMusicSlotModel(BaseModel):
    model_config = ConfigDict(extra="forbid")

    enabled: bool = False
    path: str = ""
    volume: float = Field(default=0.15, ge=0.0, le=1.0)
    duration_ms: int = Field(default=5000, ge=0, le=120000)
    fade_in_ms: int = Field(default=500, ge=0, le=15000)
    fade_out_ms: int = Field(default=1000, ge=0, le=15000)


class ProductionMusicModel(BaseModel):
    model_config = ConfigDict(extra="forbid")

    intro: ProductionMusicSlotModel = Field(default_factory=ProductionMusicSlotModel)
    transition: ProductionMusicSlotModel = Field(
        default_factory=lambda: ProductionMusicSlotModel(duration_ms=1500, fade_in_ms=150, fade_out_ms=300)
    )
    bed: ProductionMusicSlotModel = Field(default_factory=ProductionMusicSlotModel)
    outro: ProductionMusicSlotModel = Field(default_factory=ProductionMusicSlotModel)


class ProductionRenderModel(BaseModel):
    model_config = ConfigDict(extra="forbid")

    output_format: Literal["mp3", "wav", "opus"] = "mp3"
    normalize_loudness: bool = True
    target_lufs: float = -16.0
    true_peak_db: float = -1.0


class ProductionPlanModel(BaseModel):
    model_config = ConfigDict(extra="forbid")

    version: Literal[1] = 1
    script_hash: str = ""
    clips: list[ProductionClipModel] = Field(default_factory=list)
    joins: list[ProductionJoinModel] = Field(default_factory=list)
    music: ProductionMusicModel = Field(default_factory=ProductionMusicModel)
    render: ProductionRenderModel = Field(default_factory=ProductionRenderModel)
    updated_at: str = ""


class RssValidationModel(BaseModel):
    model_config = ConfigDict(extra="forbid")

    ok: bool = False
    errors: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    enclosure_url: str = ""
    local_preview_only: bool = True


class PublishOutputsModel(BaseModel):
    model_config = ConfigDict(extra="forbid")

    episode_dir: str = ""
    audio_path: str = ""
    episode_json: str = ""
    feed_xml: str = ""
    run_report_json: str = ""
    enclosure_url: str = ""
    local_preview_only: bool = True
    contains_mock_audio: bool = False
    package_feed_xml: str = ""
    published_at: str = ""
    status: Literal["success", "partial_success", "failed"] | str = ""
    enabled_platforms: list[str] = Field(default_factory=list)
    platforms: dict[str, str] = Field(default_factory=dict)
    rss_validation_ok: bool = False
    warning: str = ""
    rss_validation: RssValidationModel = Field(default_factory=RssValidationModel)


class RunReportModel(BaseModel):
    model_config = ConfigDict(extra="forbid")

    episode_id: str = ""
    preset_id: str = "morning_news_brief"
    facts: dict[str, Any] = Field(default_factory=dict)
    script: dict[str, Any] = Field(default_factory=dict)
    audio: dict[str, Any] = Field(default_factory=dict)
    publish: dict[str, Any] = Field(default_factory=dict)
    schema_validation: dict[str, Any] = Field(default_factory=dict)
    rss_validation: dict[str, Any] = Field(default_factory=dict)
    tts_live_validation: dict[str, Any] = Field(default_factory=dict)
    warnings: list[dict[str, Any]] = Field(default_factory=list)


class EpisodeRunModel(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    schema_version: Literal[1] = SCHEMA_VERSION
    episode_id: str
    created_at: str = ""
    preset: dict[str, Any] = Field(default_factory=get_default_preset)
    source_inputs: list[dict[str, Any]] = Field(default_factory=list)
    runtime_config: dict[str, Any] = Field(default_factory=dict)
    logs: list[str] = Field(default_factory=list)
    errors: list[dict[str, Any]] = Field(default_factory=list)
    fetch_contents: list[dict[str, Any]] = Field(default_factory=list)
    cleaned_contents: list[dict[str, Any]] = Field(default_factory=list)
    researched_contents: list[dict[str, Any]] = Field(default_factory=list)
    facts: list[FactCardModel] = Field(default_factory=list)
    selected_topic: dict[str, Any] = Field(default_factory=dict)
    selected_topics: list[dict[str, Any]] = Field(default_factory=list)
    selected_materials: list[dict[str, Any]] = Field(default_factory=list)
    auto_selected_items: list[dict[str, Any]] = Field(default_factory=list)
    auto_rejected_items: list[dict[str, Any]] = Field(default_factory=list)
    script: ScriptModel = Field(default_factory=ScriptModel)
    edited_script: ScriptModel = Field(default_factory=ScriptModel)
    generation_request: GenerationRequestModel = Field(default_factory=GenerationRequestModel)
    generation_meta: dict[str, Any] = Field(default_factory=dict)
    script_snapshots: list[dict[str, Any]] = Field(default_factory=list)
    downstream_stale: dict[str, Any] = Field(default_factory=dict)
    voice_segments: list[dict[str, Any]] = Field(default_factory=list)
    production_plan: ProductionPlanModel = Field(default_factory=ProductionPlanModel)
    audio_outputs: AudioOutputsModel = Field(default_factory=AudioOutputsModel)
    cover_path: str = ""
    intro_outro_paths: dict[str, str] = Field(default_factory=dict)
    review_summary: dict[str, Any] = Field(default_factory=dict)
    publish_outputs: PublishOutputsModel = Field(default_factory=PublishOutputsModel)
    subtitle_path: str = ""
    run_report: RunReportModel = Field(default_factory=RunReportModel)
    discover_meta: dict[str, Any] = Field(default_factory=dict)
    discover_ui: dict[str, Any] = Field(default_factory=dict)
    organize_ui: dict[str, Any] = Field(default_factory=dict)
    episode_brief: dict[str, Any] = Field(default_factory=dict)
    writing_meta: dict[str, Any] = Field(default_factory=dict)
    manifest: dict[str, Any] = Field(default_factory=dict, alias="_manifest")


def validate_episode_run_payload(payload: dict[str, Any]) -> tuple[bool, list[str]]:
    """Validate an EpisodeRun-like dict without requiring unrelated workflow keys."""

    try:
        EpisodeRunModel.model_validate(payload)
        return True, []
    except Exception as exc:
        return False, [str(exc)]
