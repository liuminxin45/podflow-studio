from types import SimpleNamespace

import pytest

from protocol.llm_client import LLMError
from protocol.llm_runtime import (
    LLMRuntime,
    LLMRuntimeTarget,
    has_llm_runtime_config,
    normalize_provider_kind,
    resolve_llm_target,
)


def test_provider_kind_normalization_and_client_mapping():
    assert normalize_provider_kind("openai_compatible") == "openai_compatible"
    assert normalize_provider_kind("lm_studio") == "lm_studio"
    assert normalize_provider_kind("openai-compatible") not in {"openai_compatible", "openai"}
    assert normalize_provider_kind("lmstudio") != "lm_studio"

    target = LLMRuntimeTarget(
        api_base="http://localhost:11434/v1",
        api_key="local-model",
        model="llama3.2",
        provider_kind="ollama",
    )

    assert target.configured
    assert target.client_provider_kind == "openai_compatible"


def test_runtime_target_resolves_env_key(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "env-key")

    config = SimpleNamespace(
        provider_kind="anthropic",
        api_key="",
        api_key_env_var="ANTHROPIC_API_KEY",
        api_base="https://api.anthropic.com/v1",
        llm_model="claude-3-5-sonnet-latest",
        temperature=0.2,
        timeout=30,
    )

    target = resolve_llm_target(config)

    assert target.configured
    assert target.provider_kind == "anthropic"
    assert target.api_key == "env-key"


def test_anthropic_runtime_exposes_static_models_without_network():
    runtime = LLMRuntime(
        LLMRuntimeTarget(
            api_base="https://api.anthropic.com/v1",
            api_key="test-key",
            model="claude-3-5-sonnet-latest",
            provider_kind="anthropic",
        )
    )

    models = [item["id"] for item in runtime.fetch_models()["data"]]

    assert "claude-3-5-sonnet-latest" in models


def test_codex_local_agent_target_requires_the_current_explicit_fields():
    config = SimpleNamespace(
        provider_kind="local_agent",
        api_key="",
        api_key_env_var="",
        api_base="",
        llm_model="",
        ai_target="agent:codex",
        local_agent_id="",
        local_agent_command="",
        local_agent_args=[],
        local_agent_output_mode="stdout",
    )
    target = resolve_llm_target(config)

    assert not target.configured
    assert target.local_agent_id == ""
    assert target.local_agent_command == ""
    assert target.model == ""
    assert not has_llm_runtime_config(config)


def test_runtime_exposes_debug_mode_for_node_callers():
    runtime = LLMRuntime(
        LLMRuntimeTarget(
            api_base="",
            api_key="",
            model="codex",
            provider_kind="local_agent",
            ai_target="agent:codex",
            local_agent_id="codex",
            local_agent_command="codex",
            local_agent_output_mode="codex-json",
        ),
        debug_mode=True,
    )

    assert runtime.debug_mode is True


def test_non_openai_provider_does_not_use_openai_env_fallback(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "openai-key")
    monkeypatch.setenv("OPENAI_API_BASE", "https://api.openai.com/v1")

    config = SimpleNamespace(
        provider_kind="gemini",
        api_key="",
        api_key_env_var="",
        api_base="https://generativelanguage.googleapis.com/v1beta/openai",
        llm_model="gemini-2.0-flash",
        temperature=0.2,
        timeout=30,
    )

    target = resolve_llm_target(config)

    assert target.api_key == ""
    assert target.api_base == "https://generativelanguage.googleapis.com/v1beta/openai"
    assert not target.configured


def test_openai_provider_still_uses_openai_env_fallback(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "openai-key")
    monkeypatch.setenv("OPENAI_API_BASE", "https://api.openai.com/v1")

    config = SimpleNamespace(
        provider_kind="openai",
        api_key="",
        api_key_env_var="",
        api_base="",
        llm_model="gpt-4o-mini",
        temperature=0.2,
        timeout=30,
    )

    target = resolve_llm_target(config)

    assert target.api_key == "openai-key"
    assert target.api_base == "https://api.openai.com/v1"
    assert target.configured


def test_local_agent_batch_analyze_preserves_per_batch_errors():
    runtime = LLMRuntime(
        LLMRuntimeTarget(
            api_base="",
            api_key="",
            model="codex",
            provider_kind="local_agent",
            ai_target="agent:codex",
            local_agent_id="codex",
            local_agent_command="codex",
            local_agent_output_mode="codex-json",
        )
    )
    runtime._client.call = lambda *args, **kwargs: {
        "choices": [{"message": {"content": "not json"}}]
    }

    results = runtime.batch_analyze(
        [{"title": "a"}],
        lambda batch: "prompt",
        lambda batch, parsed: [{**batch[0], "parsed": parsed}],
        logs=[],
    )

    assert len(results) == 1
    assert "JSON parse error" in results[0]["_error"]


def test_non_codex_local_agent_target_is_configured_without_api_credentials():
    target = LLMRuntimeTarget(
        api_base="",
        api_key="",
        model="custom_agent",
        provider_kind="local_agent",
        ai_target="agent:custom_agent",
        local_agent_id="custom_agent",
        local_agent_command="custom-agent",
        local_agent_args=("--prompt", "{prompt}"),
        local_agent_output_mode="stdout",
    )

    assert target.configured
    runtime = LLMRuntime(target)
    models = [item["id"] for item in runtime.fetch_models()["data"]]

    assert models == ["custom_agent"]


def test_local_agent_target_without_command_is_not_silent_openai_fallback():
    target = LLMRuntimeTarget(
        api_base="",
        api_key="",
        model="missing_command_agent",
        provider_kind="local_agent",
        ai_target="agent:missing_command_agent",
        local_agent_id="missing_command_agent",
    )

    assert not target.configured
    with pytest.raises(LLMError) as exc:
        LLMRuntime(target)

    assert exc.value.code == "CONFIG"
    assert exc.value.details["local_agent_id"] == "missing_command_agent"
