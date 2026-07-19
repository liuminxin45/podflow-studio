"""Thin OpenAI SDK adapter used by Python workflow nodes."""

import json
import os
import time
import urllib.error
import urllib.request
from collections.abc import Iterator
from typing import Any

DEFAULT_TIMEOUT = 60
DEFAULT_TEMPERATURE = 0.3
BATCH_SIZE = 10
BATCH_DELAY = 0.5
DEBUG_MAX_CHARS = 150
DEBUG_MAX_TOKENS = 200


class LLMError(Exception):
    """Project-level LLM error with a stable code for callers."""

    def __init__(self, message: str, code: str = "UNKNOWN", details: Any = None):
        super().__init__(message)
        self.code = code
        self.details = details


class LLMClient:
    """Small project adapter around the OpenAI SDK."""

    def __init__(
        self,
        api_base: str,
        api_key: str,
        model: str,
        temperature: float = DEFAULT_TEMPERATURE,
        debug_mode: bool = False,
        provider_kind: str = "openai_compatible",
    ):
        if not api_base or not api_key:
            raise LLMError("Missing API credentials", "AUTH")

        self.api_base = api_base.rstrip("/")
        self.api_key = api_key
        self.model = model
        self.temperature = temperature
        self.debug_mode = debug_mode
        self.provider_kind = (provider_kind or "openai_compatible").strip().lower()
        self._client = None if self.provider_kind == "anthropic" else self._create_client(api_key)

    def call(
        self,
        messages: list[dict[str, str]],
        timeout: int = DEFAULT_TIMEOUT,
        max_tokens: int | None = None,
        logs: list[str] | None = None,
    ) -> dict[str, Any]:
        """Run one chat completion and return a JSON-serializable dict."""
        messages, max_tokens = self._prepare_request(messages, max_tokens, timeout, logs)

        try:
            if self.provider_kind == "anthropic":
                return self._call_anthropic(messages, timeout=timeout, max_tokens=max_tokens)
            response = self._client.with_options(timeout=timeout).chat.completions.create(
                model=self.model,
                messages=messages,
                temperature=self.temperature,
                **({"max_tokens": max_tokens} if max_tokens else {}),
            )
            return response.model_dump(mode="json")
        except Exception as error:
            raise self._to_llm_error(error) from error

    def stream(
        self,
        messages: list[dict[str, str]],
        timeout: int = DEFAULT_TIMEOUT,
        max_tokens: int | None = None,
        logs: list[str] | None = None,
    ) -> Iterator[dict[str, Any]]:
        """Run a streaming chat completion and yield JSON-serializable chunks."""
        messages, max_tokens = self._prepare_request(messages, max_tokens, timeout, logs)

        try:
            if self.provider_kind == "anthropic":
                response = self._call_anthropic(messages, timeout=timeout, max_tokens=max_tokens)
                content = self.extract_content(response)
                yield {
                    "choices": [
                        {
                            "delta": {"content": content},
                            "finish_reason": response["choices"][0].get("finish_reason"),
                        }
                    ]
                }
                return
            stream = self._client.with_options(timeout=timeout).chat.completions.create(
                model=self.model,
                messages=messages,
                temperature=self.temperature,
                stream=True,
                **({"max_tokens": max_tokens} if max_tokens else {}),
            )
            for chunk in stream:
                yield chunk.model_dump(mode="json")
        except Exception as error:
            raise self._to_llm_error(error) from error

    def fetch_models(self, timeout: int = DEFAULT_TIMEOUT) -> dict[str, Any]:
        """Fetch provider model metadata through the configured SDK client."""
        try:
            if self.provider_kind == "anthropic":
                return {
                    "object": "list",
                    "data": [
                        {"id": "claude-3-5-sonnet-latest", "object": "model"},
                        {"id": "claude-3-5-haiku-latest", "object": "model"},
                        {"id": "claude-3-opus-latest", "object": "model"},
                    ],
                }
            response = self._client.with_options(timeout=timeout).models.list()
            return response.model_dump(mode="json")
        except Exception as error:
            raise self._to_llm_error(error) from error

    def extract_content(self, response: dict[str, Any]) -> str:
        """Extract assistant text from an OpenAI chat completion response."""
        try:
            return response["choices"][0]["message"]["content"]
        except (KeyError, IndexError, TypeError) as error:
            raise LLMError("Invalid response format", "PARSE", details=str(error)) from error

    def parse_json_response(self, content: str) -> Any:
        """Parse JSON from a model response, including fenced code blocks."""
        text = content.strip()
        if "```json" in text:
            text = text.split("```json", 1)[1].split("```", 1)[0].strip()
        elif "```" in text:
            text = text.split("```", 1)[1].split("```", 1)[0].strip()

        try:
            return json.loads(text)
        except json.JSONDecodeError as error:
            raise LLMError(f"JSON parse error: {error}", "PARSE", details=text[:200]) from error

    def batch_analyze(
        self,
        items: list[Any],
        prompt_fn,
        parse_fn,
        logs: list[str] | None = None,
    ) -> list[Any]:
        """Analyze items in batches while preserving per-item fallback results."""
        batch_size = 1 if self.debug_mode else BATCH_SIZE
        total_batches = (len(items) - 1) // batch_size + 1 if items else 0
        results: list[Any] = []

        self._log(logs, f"batch_analyze: {len(items)} items, {total_batches} batches")

        for batch_index, start in enumerate(range(0, len(items), batch_size), start=1):
            batch = items[start : start + batch_size]
            self._log(
                logs,
                f"Processing batch {batch_index}/{total_batches} ({len(batch)} items)",
            )

            try:
                started_at = time.time()
                prompt = prompt_fn(batch)
                response = self.call([{"role": "user", "content": prompt}], logs=logs)
                content = self.extract_content(response)
                parsed = self.parse_json_response(content)
                results.extend(parse_fn(batch, parsed))
                self._log(logs, f"Batch {batch_index} completed in {time.time() - started_at:.2f}s")
            except Exception as error:
                self._log(logs, f"Batch {batch_index} failed: {type(error).__name__}: {error}")
                results.extend(self._error_results(batch, str(error)))

            if batch_index < total_batches:
                time.sleep(BATCH_DELAY)

        self._log(logs, f"batch_analyze completed: {len(results)} results")
        return results

    def _create_client(self, api_key: str):
        try:
            from openai import AzureOpenAI, OpenAI
        except ImportError as error:
            raise LLMError("OpenAI SDK is not installed", "CONFIG") from error

        if "openai.azure.com" in self.api_base:
            return AzureOpenAI(
                api_key=api_key,
                azure_endpoint=self.api_base,
                api_version=os.environ.get("OPENAI_API_VERSION", "2024-02-15-preview"),
            )
        return OpenAI(api_key=api_key, base_url=f"{self.api_base}/")

    def _call_anthropic(
        self,
        messages: list[dict[str, str]],
        timeout: int,
        max_tokens: int | None,
    ) -> dict[str, Any]:
        system_parts: list[str] = []
        anthropic_messages: list[dict[str, str]] = []
        for message in messages:
            role = message.get("role", "user")
            content = message.get("content", "")
            if role == "system":
                system_parts.append(content)
                continue
            anthropic_messages.append(
                {
                    "role": "assistant" if role == "assistant" else "user",
                    "content": content,
                }
            )

        payload: dict[str, Any] = {
            "model": self.model,
            "messages": anthropic_messages or [{"role": "user", "content": ""}],
            "max_tokens": max_tokens or 1024,
            "temperature": self.temperature,
        }
        if system_parts:
            payload["system"] = "\n\n".join(part for part in system_parts if part)

        data = self._post_json(
            f"{self.api_base}/messages",
            payload,
            {
                "Content-Type": "application/json",
                "x-api-key": self.api_key,
                "anthropic-version": os.environ.get("ANTHROPIC_VERSION", "2023-06-01"),
            },
            timeout,
        )
        content_blocks = data.get("content", [])
        text = "".join(
            block.get("text", "")
            for block in content_blocks
            if isinstance(block, dict) and block.get("type") == "text"
        )
        return {
            "id": data.get("id", ""),
            "object": "chat.completion",
            "created": int(time.time()),
            "model": data.get("model", self.model),
            "choices": [
                {
                    "index": 0,
                    "message": {"role": "assistant", "content": text},
                    "finish_reason": data.get("stop_reason") or "stop",
                }
            ],
            "usage": data.get("usage"),
        }

    def _post_json(
        self,
        url: str,
        payload: dict[str, Any],
        headers: dict[str, str],
        timeout: int,
    ) -> dict[str, Any]:
        request = urllib.request.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers=headers,
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                body = response.read().decode("utf-8")
        except urllib.error.HTTPError as error:
            body = error.read().decode("utf-8", errors="replace")
            if error.code in {401, 403}:
                code = "AUTH"
            elif error.code == 429:
                code = "RATE_LIMIT"
            else:
                code = "PROVIDER"
            raise LLMError(f"HTTP {error.code}: {body[:300]}", code) from error
        except urllib.error.URLError as error:
            raise LLMError(f"Network error: {error}", "NETWORK") from error

        try:
            return json.loads(body)
        except json.JSONDecodeError as error:
            raise LLMError(f"JSON parse error: {error}", "PARSE", details=body[:300]) from error

    def _prepare_request(
        self,
        messages: list[dict[str, str]],
        max_tokens: int | None,
        timeout: int,
        logs: list[str] | None,
    ) -> tuple[list[dict[str, str]], int | None]:
        if not self.debug_mode:
            return messages, max_tokens

        original_len = sum(len(message.get("content", "")) for message in messages)
        truncated = [
            {**message, "content": message.get("content", "")[:DEBUG_MAX_CHARS]}
            for message in messages
        ]
        truncated_len = sum(len(message.get("content", "")) for message in truncated)
        max_tokens = min(max_tokens or DEBUG_MAX_TOKENS, DEBUG_MAX_TOKENS)
        self._log(
            logs,
            f"DEBUG CALL: prompt {original_len} chars -> {truncated_len} chars, "
            f"max_tokens={max_tokens}, timeout={timeout}s",
        )
        return truncated, max_tokens

    def _to_llm_error(self, error: Exception) -> LLMError:
        if isinstance(error, LLMError):
            return error

        status_code = getattr(error, "status_code", None)
        code = getattr(error, "code", None) or type(error).__name__

        if status_code in {401, 403}:
            category = "AUTH"
        elif status_code == 429:
            category = "RATE_LIMIT"
        elif "timeout" in type(error).__name__.lower():
            category = "TIMEOUT"
        elif "connection" in type(error).__name__.lower():
            category = "NETWORK"
        else:
            category = "UNKNOWN"

        message = f"{type(error).__name__}: {error}"
        return LLMError(message, category, details={"status_code": status_code, "code": code})

    def _error_results(self, batch: list[Any], error: str) -> list[Any]:
        return [{**item, "_error": error} if isinstance(item, dict) else item for item in batch]

    @staticmethod
    def _log(logs: list[str] | None, message: str) -> None:
        if logs is not None:
            logs.append(f"[LLMClient] {message}")

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        if self._client is not None:
            self._client.close()
