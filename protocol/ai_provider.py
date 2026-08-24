"""Pydantic AI provider factory and Agent execution primitives."""

from __future__ import annotations

from typing import Any

from pydantic_ai import Agent, ModelSettings
from pydantic_ai.exceptions import ModelAPIError, ModelHTTPError, UnexpectedModelBehavior, UserError
from pydantic_ai.messages import ModelResponse, TextPart, ToolCallPart
from pydantic_ai.models.anthropic import AnthropicModel
from pydantic_ai.models.function import FunctionModel
from pydantic_ai.models.google import GoogleModel
from pydantic_ai.models.ollama import OllamaModel
from pydantic_ai.models.openai import OpenAIChatModel, OpenAIResponsesModel
from pydantic_ai.models.openrouter import OpenRouterModel
from pydantic_ai.providers.anthropic import AnthropicProvider
from pydantic_ai.providers.deepseek import DeepSeekProvider
from pydantic_ai.providers.google import GoogleProvider
from pydantic_ai.providers.ollama import OllamaProvider
from pydantic_ai.providers.openai import OpenAIProvider
from pydantic_ai.providers.openrouter import OpenRouterProvider

DEFAULT_TIMEOUT = 60
DEFAULT_TEMPERATURE = 0.3
BATCH_SIZE = 10
BATCH_DELAY = 0.5
DEBUG_MAX_CHARS = 150
DEBUG_MAX_TOKENS = 200
SUPPORTED_HOSTED_PROVIDERS = {"openai", "anthropic", "gemini", "openrouter", "ollama", "deepseek"}


class LLMError(Exception):
    """Project-level AI error with a stable, transport-safe code."""

    def __init__(self, message: str, code: str = "UNKNOWN", details: Any = None):
        super().__init__(message)
        self.code = code
        self.details = details


def create_pydantic_model(target: Any):
    """Create only explicitly supported Pydantic AI provider models."""
    kind = target.provider_kind
    if kind == "openai":
        return OpenAIResponsesModel(target.model, provider=OpenAIProvider(api_key=target.api_key))
    if kind == "anthropic":
        return AnthropicModel(target.model, provider=AnthropicProvider(api_key=target.api_key))
    if kind == "gemini":
        return GoogleModel(target.model, provider=GoogleProvider(api_key=target.api_key))
    if kind == "openrouter":
        return OpenRouterModel(target.model, provider=OpenRouterProvider(api_key=target.api_key))
    if kind == "ollama":
        return OllamaModel(
            target.model,
            provider=OllamaProvider(base_url=target.api_base, api_key=target.api_key or None),
        )
    if kind == "deepseek":
        return OpenAIChatModel(target.model, provider=DeepSeekProvider(api_key=target.api_key))
    raise LLMError(
        f"Unsupported AI provider kind: {kind}",
        "CONFIG",
        details={"provider_kind": kind},
    )


def create_local_agent_model(backend: Any, model_name: str) -> FunctionModel:
    """Adapt a local CLI backend to Pydantic AI's Model interface."""

    def invoke(model_messages, info):
        parts: list[str] = []
        for model_message in model_messages:
            for part in getattr(model_message, "parts", ()):
                content = getattr(part, "content", None)
                if isinstance(content, str) and content.strip():
                    parts.append(content)
        prompt = "\n\n".join(parts)
        if info.output_tools:
            output_tool = info.output_tools[0]
            prompt += (
                "\n\nReturn only one JSON object matching this schema exactly; do not use Markdown fences:\n"
                f"{output_tool.parameters_json_schema}"
            )
        content = backend.call(prompt)
        if info.output_tools:
            return ModelResponse(
                parts=[ToolCallPart(info.output_tools[0].name, content)],
                model_name=model_name,
            )
        return ModelResponse(parts=[TextPart(content)], model_name=model_name)

    return FunctionModel(invoke, model_name=f"local-agent:{model_name}")


def to_llm_error(error: Exception) -> LLMError:
    """Map Pydantic AI/provider failures to the stable PodFlow error contract."""
    if isinstance(error, LLMError):
        return error
    if isinstance(error, ModelHTTPError):
        code = "RATE_LIMIT" if error.status_code == 429 else "AUTH" if error.status_code in {401, 403} else "PROVIDER"
        return LLMError("AI provider request failed", code, details={"status_code": error.status_code})
    if isinstance(error, TimeoutError):
        return LLMError("AI request timeout", "TIMEOUT")
    if isinstance(error, UnexpectedModelBehavior):
        return LLMError("AI output did not match the required schema", "PARSE")
    if isinstance(error, UserError):
        return LLMError("AI runtime configuration is invalid", "CONFIG")
    if isinstance(error, ModelAPIError):
        return LLMError("AI provider request failed", "PROVIDER")
    return LLMError("AI task failed", "UNKNOWN", details={"type": type(error).__name__})


class PydanticAgentRuntime:
    """Internal Agent runner with no raw messages or provider response surface."""

    def __init__(self, target: Any, debug_mode: bool = False, model: Any = None):
        self.target = target
        self.model = model or create_pydantic_model(target)
        self.debug_mode = debug_mode

    def run(
        self,
        task_id: str,
        prompt: str,
        *,
        instructions: str,
        output_type: Any = str,
        timeout: int = DEFAULT_TIMEOUT,
        max_tokens: int | None = None,
        temperature: float | None = None,
        retries: int = 2,
        logs: list[str] | None = None,
    ) -> Any:
        if self.debug_mode:
            prompt = prompt[:DEBUG_MAX_CHARS]
            max_tokens = min(max_tokens or DEBUG_MAX_TOKENS, DEBUG_MAX_TOKENS)
        agent = Agent(
            self.model,
            output_type=output_type,
            instructions=instructions,
            retries=retries,
            name=task_id.replace(".", "_"),
        )
        try:
            result = agent.run_sync(
                prompt,
                model_settings=ModelSettings(
                    temperature=self.target.temperature if temperature is None else temperature,
                    timeout=timeout,
                    **({"max_tokens": max_tokens} if max_tokens else {}),
                ),
            )
        except Exception as error:
            raise to_llm_error(error) from error
        if logs is not None:
            logs.append(
                f"[PydanticAI] task={task_id} provider={self.target.provider_kind} model={self.target.model}"
            )
        return result.output

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        return None
