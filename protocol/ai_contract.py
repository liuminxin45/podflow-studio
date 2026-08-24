"""Stable cross-process contract for PodFlow AI tasks."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


AI_CONTRACT_VERSION = 1

AIErrorCode = Literal[
    "AUTH",
    "RATE_LIMIT",
    "TIMEOUT",
    "NETWORK",
    "PARSE",
    "CONFIG",
    "PROVIDER",
    "CANCELLED",
    "QUALITY_GATE",
    "UNKNOWN",
]

AITaskEventType = Literal[
    "started",
    "progress",
    "text_delta",
    "tool_started",
    "tool_finished",
    "completed",
    "failed",
    "cancelled",
]


class AITaskRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    version: Literal[1] = AI_CONTRACT_VERSION
    request_id: str = Field(min_length=1)
    task_id: str = Field(min_length=1)
    target_id: str = Field(min_length=1)
    input: dict[str, Any]
    stream: bool = False


class AIUsage(BaseModel):
    model_config = ConfigDict(extra="forbid")

    input_tokens: int = Field(default=0, ge=0)
    output_tokens: int = Field(default=0, ge=0)
    total_tokens: int = Field(default=0, ge=0)
    requests: int = Field(default=0, ge=0)


class AIErrorPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: AIErrorCode
    message: str = Field(min_length=1)
    retryable: bool = False
    details: dict[str, Any] = Field(default_factory=dict)


class AITaskResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    version: Literal[1] = AI_CONTRACT_VERSION
    request_id: str = Field(min_length=1)
    task_id: str = Field(min_length=1)
    output: dict[str, Any]
    usage: AIUsage = Field(default_factory=AIUsage)


class AITaskEvent(BaseModel):
    model_config = ConfigDict(extra="forbid")

    version: Literal[1] = AI_CONTRACT_VERSION
    request_id: str = Field(min_length=1)
    task_id: str = Field(min_length=1)
    sequence: int = Field(ge=0)
    type: AITaskEventType
    payload: dict[str, Any] = Field(default_factory=dict)

