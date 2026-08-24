"""Pydantic AI provider adapter used by the PodFlow runtime."""

from __future__ import annotations

import json
import time
from typing import Any

from pydantic_ai import Agent, ModelSettings
from pydantic_ai.exceptions import ModelAPIError, ModelHTTPError, UnexpectedModelBehavior, UserError
from pydantic_ai.models.anthropic import AnthropicModel
from pydantic_ai.models.google import GoogleModel
from pydantic_ai.models.function import FunctionModel
from pydantic_ai.models.ollama import OllamaModel
from pydantic_ai.models.openai import OpenAIChatModel, OpenAIResponsesModel
from pydantic_ai.models.openrouter import OpenRouterModel
from pydantic_ai.providers.anthropic import AnthropicProvider
from pydantic_ai.providers.deepseek import DeepSeekProvider
from pydantic_ai.providers.google import GoogleProvider
from pydantic_ai.providers.ollama import OllamaProvider
from pydantic_ai.providers.openai import OpenAIProvider
from pydantic_ai.providers.openrouter import OpenRouterProvider
from pydantic_ai.messages import ModelResponse, TextPart

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
        return OpenAIResponsesModel(
            target.model,
            provider=OpenAIProvider(api_key=target.api_key),
        )
    if kind == "anthropic":
        return AnthropicModel(
            target.model,
            provider=AnthropicProvider(api_key=target.api_key),
        )
    if kind == "gemini":
        return GoogleModel(
            target.model,
            provider=GoogleProvider(api_key=target.api_key),
        )
    if kind == "openrouter":
        return OpenRouterModel(
            target.model,
            provider=OpenRouterProvider(api_key=target.api_key),
        )
    if kind == "ollama":
        return OllamaModel(
            target.model,
            provider=OllamaProvider(base_url=target.api_base, api_key=target.api_key or None),
        )
    if kind == "deepseek":
        return OpenAIChatModel(
            target.model,
            provider=DeepSeekProvider(api_key=target.api_key),
        )
    raise LLMError(
        f"Unsupported AI provider kind: {kind}",
        "CONFIG",
        details={"provider_kind": kind},
    )


def _messages_to_agent_input(messages: list[dict[str, str]]) -> tuple[str, str]:
    instructions = "\n\n".join(
        str(item.get("content") or "") for item in messages if item.get("role") == "system"
    ).strip()
    conversation = "\n\n".join(
        f"[{str(item.get('role') or 'user')}]\n{str(item.get('content') or '')}"
        for item in messages
        if item.get("role") != "system"
    ).strip()
    if not conversation:
        conversation = "Complete the configured task."
    return instructions, conversation


def create_local_agent_model(backend: Any, model_name: str) -> FunctionModel:
    """Adapt the current local CLI backend to Pydantic AI's Model interface."""

    def invoke(messages, _info):
        parts: list[str] = []
        for message in messages:
            for part in getattr(message, "parts", ()):
                content = getattr(part, "content", None)
                if isinstance(content, str) and content.strip():
                    parts.append(content)
        response = backend.call([{"role": "user", "content": "\n\n".join(parts)}])
        content = backend.extract_content(response)
        return ModelResponse(parts=[TextPart(content)], model_name=model_name)

    return FunctionModel(invoke, model_name=f"local-agent:{model_name}")


class PydanticAIClient:
    """Compatibility facade while callers migrate to typed task Agents."""

    def __init__(self, target: Any, debug_mode: bool = False, model: Any = None):
        self.target = target
        self.model = model or create_pydantic_model(target)
        self.debug_mode = debug_mode

    def call(
        self,
        messages: list[dict[str, str]],
        timeout: int = DEFAULT_TIMEOUT,
        max_tokens: int | None = None,
        logs: list[str] | None = None,
    ) -> dict[str, Any]:
        instructions, prompt = _messages_to_agent_input(messages)
        if self.debug_mode:
            prompt = prompt[:DEBUG_MAX_CHARS]
            max_tokens = min(max_tokens or DEBUG_MAX_TOKENS, DEBUG_MAX_TOKENS)
        agent = Agent(self.model, output_type=str, instructions=instructions or None)
        try:
            result = agent.run_sync(
                prompt,
                model_settings=ModelSettings(
                    temperature=self.target.temperature,
                    timeout=timeout,
                    **({"max_tokens": max_tokens} if max_tokens else {}),
                ),
            )
            usage = result.usage()
            content = result.output
            if logs is not None:
                logs.append(f"[PydanticAI] provider={self.target.provider_kind} model={self.target.model}")
            return {
                "id": result.run_id,
                "object": "agent.result",
                "created": int(time.time()),
                "model": self.target.model,
                "choices": [{
                    "index": 0,
                    "message": {"role": "assistant", "content": content},
                    "finish_reason": "stop",
                }],
                "usage": {
                    "prompt_tokens": usage.input_tokens or 0,
                    "completion_tokens": usage.output_tokens or 0,
                    "total_tokens": usage.total_tokens or 0,
                },
            }
        except Exception as error:
            raise self._to_llm_error(error) from error

    def stream(self, messages, timeout=DEFAULT_TIMEOUT, max_tokens=None, logs=None):
        # The temporary compatibility Agent emits one validated text result.
        response = self.call(messages, timeout=timeout, max_tokens=max_tokens, logs=logs)
        yield {"choices": [{"delta": {"content": self.extract_content(response)}, "finish_reason": "stop"}]}

    def fetch_models(self, timeout: int = DEFAULT_TIMEOUT) -> dict[str, Any]:
        del timeout
        return {"object": "list", "data": [{"id": self.target.model, "object": "model"}]}

    @staticmethod
    def extract_content(response: dict[str, Any]) -> str:
        try:
            return response["choices"][0]["message"]["content"]
        except (KeyError, IndexError, TypeError) as error:
            raise LLMError("Invalid response format", "PARSE", details=str(error)) from error

    @staticmethod
    def parse_json_response(content: str) -> Any:
        text = content.strip()
        if "```json" in text:
            text = text.split("```json", 1)[1].split("```", 1)[0].strip()
        elif "```" in text:
            text = text.split("```", 1)[1].split("```", 1)[0].strip()
        try:
            return json.loads(text)
        except json.JSONDecodeError as error:
            raise LLMError(f"JSON parse error: {error}", "PARSE", details=text[:200]) from error

    def batch_analyze(self, items, prompt_fn, parse_fn, logs=None):
        batch_size = 1 if self.debug_mode else BATCH_SIZE
        results = []
        batches = list(range(0, len(items), batch_size))
        for batch_number, start in enumerate(batches, start=1):
            batch = items[start : start + batch_size]
            try:
                response = self.call([{"role": "user", "content": prompt_fn(batch)}], logs=logs)
                parsed = self.parse_json_response(self.extract_content(response))
                results.extend(parse_fn(batch, parsed))
            except Exception as error:
                if logs is not None:
                    logs.append(f"Batch {batch_number} failed: {type(error).__name__}: {error}")
                results.extend({**item, "_error": str(error)} for item in batch)
            if batch_number < len(batches):
                time.sleep(BATCH_DELAY)
        return results

    @staticmethod
    def _to_llm_error(error: Exception) -> LLMError:
        if isinstance(error, LLMError):
            return error
        if isinstance(error, ModelHTTPError):
            code = "RATE_LIMIT" if error.status_code == 429 else "AUTH" if error.status_code in {401, 403} else "PROVIDER"
            return LLMError(str(error), code, details={"status_code": error.status_code})
        if isinstance(error, TimeoutError):
            return LLMError(str(error) or "AI request timeout", "TIMEOUT")
        if isinstance(error, (UnexpectedModelBehavior, UserError)):
            return LLMError(str(error), "PARSE" if isinstance(error, UnexpectedModelBehavior) else "CONFIG")
        if isinstance(error, ModelAPIError):
            return LLMError(str(error), "PROVIDER")
        return LLMError(str(error), "UNKNOWN")

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        return None
