import os

from protocol.env_overrides import apply_env_overrides


def _clear_podflow_env(monkeypatch):
    for name in list(os.environ):
        if name.startswith("PODFLOW_"):
            monkeypatch.delenv(name, raising=False)


def test_apply_env_overrides_populates_runtime_config(monkeypatch):
    _clear_podflow_env(monkeypatch)
    monkeypatch.setenv("PODFLOW_AUTO_EXECUTE", "1")
    monkeypatch.setenv("PODFLOW_TARGET_TOPIC", "AI 芯片")
    monkeypatch.setenv("PODFLOW_TIME_RANGE_HOURS", "48")
    monkeypatch.setenv("PODFLOW_MAX_ITEMS", "8")
    monkeypatch.setenv("PODFLOW_ORGANIZE_MODE", "ai")
    monkeypatch.setenv("PODFLOW_LLM_PROVIDER", "deepseek")
    monkeypatch.setenv("PODFLOW_LLM_MODEL", "deepseek-chat")
    monkeypatch.setenv("PODFLOW_LLM_API_KEY_ENV_VAR", "DEEPSEEK_API_KEY")
    monkeypatch.setenv("PODFLOW_TTS_ENGINE", "edge-tts")
    monkeypatch.setenv("PODFLOW_TTS_VOICE", "zh-CN-XiaoxiaoNeural")
    monkeypatch.setenv("PODFLOW_FETCH_SOURCES", "newsnow,ai_news_daily")

    state = {}
    apply_env_overrides(state)
    rc = state["runtime_config"]

    assert rc["auto_execute"] is True
    assert rc["discover"]["target_topic"] == "AI 芯片"
    assert rc["discover"]["time_range_hours"] == 48
    assert rc["discover"]["max_items"] == 8
    assert rc["organize"]["mode"] == "ai"
    assert rc["script"]["provider_kind"] == "deepseek"
    assert rc["script"]["llm_model"] == "deepseek-chat"
    assert rc["script"]["api_key_env_var"] == "DEEPSEEK_API_KEY"
    assert rc["tts"]["engine"] == "edge-tts"
    assert rc["tts"]["default_voice"] == "zh-CN-XiaoxiaoNeural"
    assert rc["fetch"]["enabled_sources"] == ["newsnow", "ai_news_daily"]


def test_apply_env_overrides_no_env_keeps_state_minimal(monkeypatch):
    _clear_podflow_env(monkeypatch)

    state = {"runtime_config": {"existing": True}}
    apply_env_overrides(state)

    assert state["runtime_config"] == {"existing": True}


def test_apply_env_overrides_auto_execute_false_string(monkeypatch):
    _clear_podflow_env(monkeypatch)
    monkeypatch.setenv("PODFLOW_AUTO_EXECUTE", "0")

    state = {}
    apply_env_overrides(state)

    assert "auto_execute" not in state["runtime_config"]
