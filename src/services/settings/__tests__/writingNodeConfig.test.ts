import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from '../../../types/settings'
import { llmConfigResolver } from '../llmConfigResolver'
import { settingsRepository } from '../repository'
import { buildWritingNodeConfigs, persistCurrentWritingNodeConfigs } from '../writingNodeConfig'

describe('writing node config bridge', () => {
  const originalElectronAPI = window.electronAPI

  afterEach(() => {
    vi.restoreAllMocks()
    ;(window as any).electronAPI = originalElectronAPI
  })

  it('combines current writing preferences with the selected AI target', () => {
    const settings = structuredClone(DEFAULT_SETTINGS)
    settings.creatorPreferences.durationPreference = 'medium'
    const configs = buildWritingNodeConfigs(settings, {
      apiBase: 'https://example.com/v1',
      apiKey: 'test-key',
      model: 'test-model',
      providerKind: 'openai_compatible',
      aiTarget: 'model:test',
    })

    expect(configs.facts.selected_topic_count).toBe(10)
    expect(configs.script).toMatchObject({
      api_base: 'https://example.com/v1',
      api_key: 'test-key',
      llm_model: 'test-model',
      ai_target: 'model:test',
      target_duration_minutes: 22,
      quick_news_chars_min: 240,
      deep_dive_chars_max: 2600,
    })
    expect(configs.script).not.toHaveProperty('compliance_strictness')
    expect(configs.script).not.toHaveProperty('assist_level')
    expect(configs.script).not.toHaveProperty('text_mode')
  })

  it('keeps the node config valid when no AI target is configured', () => {
    const configs = buildWritingNodeConfigs(structuredClone(DEFAULT_SETTINGS), null)

    expect(configs.script).toMatchObject({
      llm_model: 'gpt-4o-mini',
      api_key: '',
      api_base: '',
    })
  })

  it('maps renderer local-agent routing to the explicit Python runtime contract', () => {
    const configs = buildWritingNodeConfigs(structuredClone(DEFAULT_SETTINGS), {
      apiBase: 'local-agent://codex',
      apiKey: 'local-agent',
      model: 'codex',
      providerKind: 'local_agent',
      aiTarget: 'agent:codex',
      localAgentId: 'codex',
      localAgentCommand: 'codex',
      localAgentArgs: [],
      localAgentOutputMode: 'codex-json',
      timeout: 180_000,
    })

    expect(configs.script).toMatchObject({
      api_base: '',
      api_key: '',
      api_key_env_var: '',
      llm_model: 'codex',
      provider_kind: 'local_agent',
      ai_target: 'agent:codex',
      local_agent_id: 'codex',
      local_agent_command: 'codex',
      local_agent_args: [],
      local_agent_output_mode: 'codex-json',
      timeout: 180,
    })
  })

  it('converts renderer timeout milliseconds to bounded Python seconds', () => {
    const configs = buildWritingNodeConfigs(structuredClone(DEFAULT_SETTINGS), {
      apiBase: 'https://example.com/v1',
      apiKey: 'test-key',
      model: 'test-model',
      timeout: 900_500,
    })

    expect(configs.script.timeout).toBe(600)
  })

  it('honors the draft-stage AI override when syncing the node config', async () => {
    vi.spyOn(settingsRepository, 'load').mockReturnValue(structuredClone(DEFAULT_SETTINGS))
    const resolveConfig = vi.spyOn(llmConfigResolver, 'getLLMConfig').mockReturnValue({
      apiBase: 'https://draft.example/v1',
      apiKey: 'draft-key',
      model: 'draft-model',
      providerKind: 'openai_compatible',
    })
    const saveNodeConfig = vi.fn(async () => ({ success: true }))
    ;(window as any).electronAPI = { saveNodeConfig }

    await persistCurrentWritingNodeConfigs()

    expect(resolveConfig).toHaveBeenCalledWith('draft')
    expect(saveNodeConfig).toHaveBeenCalledWith('script', expect.objectContaining({
      api_base: 'https://draft.example/v1',
      api_key: 'draft-key',
      llm_model: 'draft-model',
    }))
  })
})
