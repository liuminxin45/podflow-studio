"""Provider-agnostic LLM runtime used by workflow nodes."""

from __future__ import annotations

import os
import json
import shutil
import subprocess
import tempfile
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from protocol.llm_client import BATCH_DELAY, BATCH_SIZE, LLMClient, LLMError

OPENAI_COMPATIBLE_KINDS = {
    "openai",
    "openai_compatible",
    "ollama",
    "lm_studio",
    "gemini",
    "openrouter",
}
OPENAI_ENV_FALLBACK_KINDS = {"openai", "openai_compatible"}
LOCAL_AGENT_OUTPUT_MODES = {"stdout", "codex-json"}
SUPPORTED_PROVIDER_KINDS = OPENAI_COMPATIBLE_KINDS | {"anthropic", "local_agent"}
DIRECT_CODEX_PROMPT_LIMIT = 24000


@dataclass(frozen=True)
class LLMRuntimeTarget:
    api_base: str
    api_key: str
    model: str
    provider_kind: str
    ai_target: str = ""
    local_agent_id: str = ""
    local_agent_command: str = ""
    local_agent_args: tuple[str, ...] = ()
    local_agent_output_mode: str = "stdout"
    api_key_env_var: str = ""
    temperature: float = 0.3
    timeout: int = 60

    @property
    def client_provider_kind(self) -> str:
        if self.provider_kind == "anthropic":
            return "anthropic"
        return "openai_compatible"

    @property
    def configured(self) -> bool:
        if self.provider_kind == "local_agent":
            return bool(
                self.local_agent_id
                and self.model
                and self.local_agent_command
                and self.local_agent_output_mode in LOCAL_AGENT_OUTPUT_MODES
                and self.supported
            )
        return bool(self.api_base and self.api_key and self.model and self.supported)

    @property
    def supported(self) -> bool:
        return self.provider_kind in SUPPORTED_PROVIDER_KINDS

    def masked_summary(self) -> str:
        target = self.ai_target or f"provider:{self.provider_kind}"
        key_state = "LOCAL AGENT" if self.provider_kind == "local_agent" else "SET" if self.api_key else "NOT SET"
        return (
            f"target={target}, provider={self.provider_kind}, model={self.model}, "
            f"api_key={key_state}, api_base={self.api_base}"
        )


def _messages_to_prompt(messages: list[dict[str, str]]) -> str:
    return "\n\n".join(
        f"[{str(message.get('role') or 'user')}]\n{str(message.get('content') or '')}"
        for message in messages
    ).strip()


def _quote_for_cmd(value: str) -> str:
    return '"' + value.replace('"', '\\"') + '"'


def _codex_binary_candidates() -> list[str]:
    home = Path.home()
    candidates = [
        home / ".local" / "bin" / "codex",
        home / ".local" / "bin" / "codex.exe",
        home / ".local" / "bin" / "codex.cmd",
        home / ".codex" / "bin" / "codex",
        home / ".codex" / "bin" / "codex.exe",
        home / ".codex" / "bin" / "codex.cmd",
        home / ".npm-global" / "bin" / "codex",
        home / ".npm-global" / "bin" / "codex.cmd",
        home / ".npm" / "bin" / "codex",
        home / ".npm" / "bin" / "codex.cmd",
        home / ".bun" / "bin" / "codex",
        home / ".bun" / "bin" / "codex.cmd",
        home / "AppData" / "Roaming" / "npm" / "codex.cmd",
        home / "AppData" / "Roaming" / "npm" / "codex.exe",
        home / "AppData" / "Local" / "pnpm" / "codex.cmd",
        home / "AppData" / "Local" / "pnpm" / "codex.exe",
        home / "scoop" / "shims" / "codex.cmd",
        home / "scoop" / "shims" / "codex.exe",
        Path("/opt/homebrew/bin/codex"),
        Path("/usr/local/bin/codex"),
    ]
    appdata = os.environ.get("APPDATA")
    if appdata:
        candidates.extend([Path(appdata) / "npm" / "codex.cmd", Path(appdata) / "npm" / "codex.exe"])
    localappdata = os.environ.get("LOCALAPPDATA")
    if localappdata:
        candidates.extend([
            Path(localappdata) / "pnpm" / "codex.cmd",
            Path(localappdata) / "pnpm" / "codex.exe",
        ])
    return [str(path) for path in candidates]


def _resolve_codex_binary() -> str:
    from_path = shutil.which("codex")
    if from_path:
        return from_path
    for candidate in _codex_binary_candidates():
        if Path(candidate).is_file():
            return candidate
    return ""


def _resolve_local_agent_binary(commands: list[str]) -> str:
    for command in commands:
        from_path = shutil.which(command)
        if from_path:
            return from_path
    return ""


def _render_local_agent_args(args_template: tuple[str, ...], prompt: str) -> list[str]:
    template = args_template or ("{prompt}",)
    return [arg.replace("{prompt}", prompt) for arg in template]


def _run_agent_binary(binary: str, args: list[str], timeout: int) -> subprocess.CompletedProcess[str]:
    env = {
        **os.environ,
        "LANG": os.environ.get("LANG") or "C.UTF-8",
        "LC_ALL": os.environ.get("LC_ALL") or "C.UTF-8",
        "PYTHONIOENCODING": "utf-8",
        "PYTHONUTF8": "1",
    }
    if os.name == "nt" and binary.lower().endswith((".cmd", ".bat")):
        command_line = " ".join([_quote_for_cmd(binary), *(_quote_for_cmd(arg) for arg in args)])
        return subprocess.run(
            ["cmd.exe", "/d", "/s", "/c", command_line],
            cwd=os.getcwd(),
            env=env,
            stdin=subprocess.DEVNULL,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=timeout,
            check=False,
        )
    return subprocess.run(
        [binary, *args],
        cwd=os.getcwd(),
        env=env,
        stdin=subprocess.DEVNULL,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=timeout,
        check=False,
    )


def _extract_codex_text(stdout: str) -> str:
    text_parts: list[str] = []
    for line in str(stdout or "").splitlines():
        trimmed = line.strip()
        if not trimmed.startswith("{"):
            continue
        try:
            data = json.loads(trimmed)
        except json.JSONDecodeError:
            continue
        item = data.get("item") if isinstance(data.get("item"), dict) else data
        if item.get("type") == "agent_message" and isinstance(item.get("text"), str):
            text_parts.append(item["text"])
        if data.get("type") == "message" and isinstance(data.get("content"), str):
            text_parts.append(data["content"])
    return "\n".join(text_parts).strip()


class LocalAgentRuntimeClient:
    """OpenAI-shaped runtime wrapper for configured local CLI agents."""

    def __init__(
        self,
        local_agent_id: str,
        model: str,
        *,
        local_agent_command: str,
        local_agent_args: tuple[str, ...],
        local_agent_output_mode: str,
        debug_mode: bool = False,
    ):
        self.local_agent_id = local_agent_id
        self.model = model
        self.local_agent_command = local_agent_command
        self.local_agent_args = local_agent_args
        self.local_agent_output_mode = local_agent_output_mode
        self.debug_mode = debug_mode
        if not local_agent_command:
            raise LLMError(
                f"Missing local agent command for workflow LLM calls: {local_agent_id}",
                "CONFIG",
                details={"local_agent_id": local_agent_id},
            )
        if local_agent_output_mode not in LOCAL_AGENT_OUTPUT_MODES:
            raise LLMError(
                f"Unsupported local agent output mode: {local_agent_output_mode}",
                "CONFIG",
                details={"local_agent_id": local_agent_id, "output_mode": local_agent_output_mode},
            )

    def call(
        self,
        messages: list[dict[str, str]],
        timeout: int = 180,
        max_tokens: int | None = None,
        logs: list[str] | None = None,
    ) -> dict[str, Any]:
        if self.local_agent_output_mode == "codex-json":
            content = self._call_codex(messages, timeout=timeout, logs=logs)
        else:
            content = self._call_stdout(messages, timeout=timeout, logs=logs)
        return {
            "id": "local-agent",
            "object": "chat.completion",
            "created": 0,
            "model": f"local-agent:{self.local_agent_id}",
            "choices": [
                {
                    "index": 0,
                    "message": {"role": "assistant", "content": content},
                    "finish_reason": "stop",
                }
            ],
        }

    def stream(
        self,
        messages: list[dict[str, str]],
        timeout: int = 180,
        max_tokens: int | None = None,
        logs: list[str] | None = None,
    ):
        content = self.extract_content(self.call(messages, timeout=timeout, max_tokens=max_tokens, logs=logs))
        yield {"choices": [{"delta": {"content": content}, "finish_reason": "stop"}]}

    def fetch_models(self, timeout: int = 180) -> dict[str, Any]:
        return {"object": "list", "data": [{"id": self.local_agent_id, "object": "model"}]}

    def extract_content(self, response: dict[str, Any]) -> str:
        try:
            return response["choices"][0]["message"]["content"]
        except (KeyError, IndexError, TypeError) as error:
            raise LLMError("Invalid response format", "PARSE", details=str(error)) from error

    def parse_json_response(self, content: str) -> Any:
        text = content.strip()
        if "```json" in text:
            text = text.split("```json", 1)[1].split("```", 1)[0].strip()
        elif "```" in text:
            text = text.split("```", 1)[1].split("```", 1)[0].strip()
        try:
            return json.loads(text)
        except json.JSONDecodeError as error:
            raise LLMError(f"JSON parse error: {error}", "PARSE", details=text[:200]) from error

    def batch_analyze(self, items: list[Any], prompt_fn, parse_fn, logs: list[str] | None = None):
        batch_size = 1 if self.debug_mode else BATCH_SIZE
        total_batches = (len(items) - 1) // batch_size + 1 if items else 0
        results: list[Any] = []

        self._log(logs, f"batch_analyze: {len(items)} items, {total_batches} batches")

        for batch_index, start in enumerate(range(0, len(items), batch_size), start=1):
            batch = items[start : start + batch_size]
            self._log(logs, f"Processing batch {batch_index}/{total_batches} ({len(batch)} items)")

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

    def __exit__(self, exc_type, exc_val, exc_tb) -> None:
        return None

    @staticmethod
    def _error_results(batch: list[Any], error: str) -> list[Any]:
        return [{**item, "_error": error} if isinstance(item, dict) else item for item in batch]

    @staticmethod
    def _log(logs: list[str] | None, message: str) -> None:
        if logs is not None:
            logs.append(f"[LLMRuntime] {message}")

    def _call_codex(
        self,
        messages: list[dict[str, str]],
        timeout: int,
        logs: list[str] | None = None,
    ) -> str:
        binary = _resolve_local_agent_binary([self.local_agent_command])
        if not binary and self.local_agent_command == "codex":
            binary = _resolve_codex_binary()
        if not binary:
            raise LLMError(
                f"{self.local_agent_command} CLI not found on PATH or known install locations",
                "CONFIG",
                details={"local_agent_id": self.local_agent_id},
            )

        prompt = _messages_to_prompt(messages)
        if not prompt:
            raise LLMError("Codex CLI request is empty", "CONFIG")

        workspace_temp_root = Path(os.getcwd()) / "out" / "tmp"
        workspace_temp_root.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(prefix="podflow-codex-", dir=workspace_temp_root) as temp_dir:
            last_message_path = Path(temp_dir) / "last-message.txt"
            if len(prompt) > DIRECT_CODEX_PROMPT_LIMIT:
                prompt_path = Path(temp_dir) / "prompt.txt"
                prompt_path.write_text(prompt, encoding="utf-8")
                prompt_request = "\n".join(
                    [
                        "Read the UTF-8 request file below and complete it exactly.",
                        "Return only the final answer requested by that file.",
                        str(prompt_path),
                    ]
                )
            else:
                prompt_request = prompt
            args = [
                "--sandbox",
                "read-only",
                "--ask-for-approval",
                "never",
                "exec",
                "--json",
                "-C",
                os.getcwd(),
                "--output-last-message",
                str(last_message_path),
                prompt_request,
            ]
            try:
                result = _run_agent_binary(binary, args, timeout)
            except subprocess.TimeoutExpired as error:
                raise LLMError("Codex CLI request timeout", "TIMEOUT", details={"timeout": timeout}) from error

            content = ""
            if last_message_path.is_file():
                content = last_message_path.read_text(encoding="utf-8").strip()
            if not content:
                content = _extract_codex_text(result.stdout)
            if result.returncode != 0:
                if content:
                    if logs is not None:
                        logs.append("[LLMRuntime] Codex returned content after non-zero process result")
                    return content
                diagnostic = (result.stderr or content or "Codex CLI call failed").strip()
                raise LLMError(diagnostic, "PROVIDER")
            if not content:
                diagnostic = (result.stderr or "Codex CLI returned an empty response").strip()
                raise LLMError(diagnostic, "PROVIDER")
            if logs is not None:
                logs.append("[LLMRuntime] Codex local agent call completed")
            return content

    def _call_stdout(
        self,
        messages: list[dict[str, str]],
        timeout: int,
        logs: list[str] | None = None,
    ) -> str:
        binary = _resolve_local_agent_binary([self.local_agent_command])
        if not binary:
            raise LLMError(
                f"{self.local_agent_command} CLI not found on PATH",
                "CONFIG",
                details={"local_agent_id": self.local_agent_id},
            )

        prompt = _messages_to_prompt(messages)
        if not prompt:
            raise LLMError(f"{self.local_agent_id} CLI request is empty", "CONFIG")

        workspace_temp_root = Path(os.getcwd()) / "out" / "tmp"
        workspace_temp_root.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(prefix=f"podflow-{self.local_agent_id}-", dir=workspace_temp_root) as temp_dir:
            if len(prompt) > DIRECT_CODEX_PROMPT_LIMIT:
                prompt_path = Path(temp_dir) / "prompt.txt"
                prompt_path.write_text(prompt, encoding="utf-8")
                prompt_request = "\n".join(
                    [
                        "Read the UTF-8 request file below and complete it exactly.",
                        "Return only the final answer requested by that file.",
                        str(prompt_path),
                    ]
                )
            else:
                prompt_request = prompt

            args = _render_local_agent_args(self.local_agent_args, prompt_request)
            try:
                result = _run_agent_binary(binary, args, timeout)
            except subprocess.TimeoutExpired as error:
                raise LLMError(
                    f"{self.local_agent_id} CLI request timeout",
                    "TIMEOUT",
                    details={"timeout": timeout},
                ) from error

            content = (result.stdout or "").strip()
            if result.returncode != 0:
                if content:
                    if logs is not None:
                        logs.append(
                            f"[LLMRuntime] {self.local_agent_id} returned stdout after non-zero process result"
                        )
                    return content
                diagnostic = (result.stderr or f"{self.local_agent_id} CLI call failed").strip()
                raise LLMError(diagnostic, "PROVIDER")
            if not content:
                diagnostic = (result.stderr or f"{self.local_agent_id} CLI returned an empty response").strip()
                raise LLMError(diagnostic, "PROVIDER")
            if logs is not None:
                logs.append(f"[LLMRuntime] {self.local_agent_id} local agent call completed")
            return content


class LLMRuntime:
    """Unified node-facing wrapper around concrete LLM providers."""

    def __init__(self, target: LLMRuntimeTarget, debug_mode: bool = False):
        if not target.supported:
            raise LLMError(
                f"Unsupported LLM provider kind: {target.provider_kind}",
                "CONFIG",
                details={"provider_kind": target.provider_kind},
            )
        if target.provider_kind == "local_agent" and not target.local_agent_command:
            raise LLMError(
                f"Missing local agent command for workflow LLM calls: {target.local_agent_id}",
                "CONFIG",
                details={"local_agent_id": target.local_agent_id},
            )
        if (
            target.provider_kind == "local_agent"
            and target.local_agent_output_mode not in LOCAL_AGENT_OUTPUT_MODES
        ):
            raise LLMError(
                f"Unsupported local agent output mode: {target.local_agent_output_mode}",
                "CONFIG",
                details={
                    "local_agent_id": target.local_agent_id,
                    "output_mode": target.local_agent_output_mode,
                },
            )
        if not target.configured:
            raise LLMError("Missing LLM runtime configuration", "AUTH", details=target.masked_summary())

        self.target = target
        self.debug_mode = debug_mode
        if target.provider_kind == "local_agent":
            self._client = LocalAgentRuntimeClient(
                target.local_agent_id,
                target.model,
                local_agent_command=target.local_agent_command,
                local_agent_args=target.local_agent_args,
                local_agent_output_mode=target.local_agent_output_mode,
                debug_mode=debug_mode,
            )
        else:
            self._client = LLMClient(
                api_base=target.api_base,
                api_key=target.api_key,
                model=target.model,
                temperature=target.temperature,
                debug_mode=debug_mode,
                provider_kind=target.client_provider_kind,
            )

    def call(
        self,
        messages: list[dict[str, str]],
        timeout: int | None = None,
        max_tokens: int | None = None,
        logs: list[str] | None = None,
    ) -> dict[str, Any]:
        return self._client.call(
            messages,
            timeout=timeout or self.target.timeout,
            max_tokens=max_tokens,
            logs=logs,
        )

    def stream(
        self,
        messages: list[dict[str, str]],
        timeout: int | None = None,
        max_tokens: int | None = None,
        logs: list[str] | None = None,
    ):
        yield from self._client.stream(
            messages,
            timeout=timeout or self.target.timeout,
            max_tokens=max_tokens,
            logs=logs,
        )

    def fetch_models(self, timeout: int | None = None) -> dict[str, Any]:
        return self._client.fetch_models(timeout=timeout or self.target.timeout)

    def extract_content(self, response: dict[str, Any]) -> str:
        return self._client.extract_content(response)

    def parse_json_response(self, content: str) -> Any:
        return self._client.parse_json_response(content)

    def batch_analyze(self, items: list[Any], prompt_fn, parse_fn, logs: list[str] | None = None):
        return self._client.batch_analyze(items, prompt_fn, parse_fn, logs=logs)

    def __enter__(self) -> "LLMRuntime":
        return self

    def __exit__(self, exc_type, exc_val, exc_tb) -> None:
        self._client.__exit__(exc_type, exc_val, exc_tb)


def normalize_provider_kind(provider_kind: Any) -> str:
    return str(provider_kind or "openai_compatible").strip()


def resolve_llm_target(config: Any) -> LLMRuntimeTarget:
    provider_kind = normalize_provider_kind(getattr(config, "provider_kind", "openai_compatible"))
    ai_target = str(getattr(config, "ai_target", "") or "").strip()
    local_agent_id = str(getattr(config, "local_agent_id", "") or "").strip()
    local_agent_command = str(getattr(config, "local_agent_command", "") or "").strip()
    raw_local_agent_args = getattr(config, "local_agent_args", ()) or ()
    local_agent_args = tuple(str(arg) for arg in raw_local_agent_args) if isinstance(raw_local_agent_args, list | tuple) else ()
    local_agent_output_mode = str(getattr(config, "local_agent_output_mode", "") or "").strip() or "stdout"

    api_key_env_var = str(getattr(config, "api_key_env_var", "") or "").strip()
    env_key = os.environ.get(api_key_env_var, "") if api_key_env_var else ""
    api_key = str(getattr(config, "api_key", "") or "").strip() or env_key

    if not api_key and provider_kind in OPENAI_ENV_FALLBACK_KINDS:
        api_key = os.environ.get("OPENAI_API_KEY", "")

    api_base = str(getattr(config, "api_base", "") or "").strip().rstrip("/")
    if not api_base and provider_kind in OPENAI_ENV_FALLBACK_KINDS:
        api_base = os.environ.get("OPENAI_API_BASE", "").strip().rstrip("/")

    model = str(getattr(config, "llm_model", "") or "").strip()
    if provider_kind == "local_agent" and not model:
        model = local_agent_id

    return LLMRuntimeTarget(
        api_base=api_base,
        api_key=api_key,
        model=model,
        provider_kind=provider_kind,
        ai_target=ai_target,
        local_agent_id=local_agent_id,
        local_agent_command=local_agent_command,
        local_agent_args=local_agent_args,
        local_agent_output_mode=local_agent_output_mode,
        api_key_env_var=api_key_env_var,
        temperature=float(getattr(config, "temperature", 0.3)),
        timeout=int(getattr(config, "timeout", 60)),
    )


def has_llm_runtime_config(config: Any) -> bool:
    return resolve_llm_target(config).configured


def create_llm_runtime(config: Any, debug_mode: bool = False) -> LLMRuntime:
    return LLMRuntime(resolve_llm_target(config), debug_mode=debug_mode)


def apply_llm_config_from_mapping(
    config: Any,
    source: dict[str, Any],
    *,
    default_model: str = "gpt-4o-mini",
    default_temperature: float | None = None,
) -> bool:
    if not source or has_llm_runtime_config(config):
        return False

    if not any(
        source.get(key)
        for key in (
            "api_key",
            "api_key_env_var",
            "api_base",
            "provider_kind",
            "ai_target",
            "local_agent_id",
            "local_agent_command",
            "local_agent_args",
            "local_agent_output_mode",
        )
    ):
        return False

    config.api_key = source.get("api_key", "")
    config.api_key_env_var = source.get("api_key_env_var", "")
    config.api_base = source.get("api_base", "")
    config.llm_model = source.get("llm_model", default_model)
    config.provider_kind = source.get("provider_kind", "openai_compatible")
    config.ai_target = source.get("ai_target", "")
    config.local_agent_id = source.get("local_agent_id", "")
    config.local_agent_command = source.get("local_agent_command", "")
    config.local_agent_args = source.get("local_agent_args", [])
    config.local_agent_output_mode = source.get("local_agent_output_mode", "stdout")
    if default_temperature is not None:
        config.temperature = source.get("temperature", default_temperature)
    return True
