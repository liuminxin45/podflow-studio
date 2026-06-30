from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator


class NodeConfigBase(BaseModel):
    """Base class for all node configurations with validation."""

    model_config = ConfigDict(extra="ignore", validate_assignment=True)

    @classmethod
    def from_dict[T: "NodeConfigBase"](cls: type[T], data: dict[str, Any]) -> T:
        """Create config from dict with validation."""
        return cls(**data)

    def to_dict(self) -> dict[str, Any]:
        return self.model_dump()


class LLMConfigMixin(BaseModel):
    """Mixin for nodes that use LLM."""

    llm_model: str = Field(default="gpt-4o-mini", description="LLM model name")
    api_key: str = Field(default="", description="API key (empty = use env)")
    api_base: str = Field(default="", description="API base URL (empty = use env)")
    temperature: float = Field(default=0.7, ge=0.0, le=2.0, description="LLM temperature")
    max_retries: int = Field(default=3, ge=0, le=10, description="Max retry attempts")
    timeout: int = Field(default=60, ge=1, le=600, description="Request timeout (seconds)")

    @field_validator("llm_model")
    @classmethod
    def validate_model(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("llm_model cannot be empty")
        return v.strip()

    @field_validator("api_base")
    @classmethod
    def validate_api_base(cls, v: str) -> str:
        if v and not (v.startswith("http://") or v.startswith("https://")):
            raise ValueError("api_base must start with http:// or https://")
        return v.strip() if v else ""
