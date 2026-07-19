import { describe, expect, it } from 'vitest'

import { DEFAULT_SETTINGS, type AppSettings } from '../../types/settings'
import { buildNodeConfigs } from '../SettingsPage'

function settingsCopy(): AppSettings {
  return JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as AppSettings
}

describe('SettingsPage audio node config', () => {
  it('maps the two visible output choices directly to the postprocess format', () => {
    const settings = settingsCopy()
    settings.capability.audio.quality = 'wav'
    expect(buildNodeConfigs(settings).audio_postprocess.output_format).toBe('wav')
    settings.capability.audio.quality = 'mp3'
    expect(buildNodeConfigs(settings).audio_postprocess.output_format).toBe('mp3')
  })

  it('inherits blank writing-node override fields from the default AI target', () => {
    const settings = settingsCopy()
    const openai = settings.apiConfig.global.aiModelProviders.find(provider => provider.id === 'api-openai')!
    openai.apiKey = 'global-secret'
    openai.apiKeySet = true
    settings.apiConfig.global.defaultAITarget = 'model:api-openai'
    settings.apiConfig.nodeOverrides.draft.overrideMode = 'custom'

    expect(buildNodeConfigs(settings).script).toMatchObject({
      api_key: 'global-secret',
      api_base: 'https://api.openai.com/v1',
      llm_model: 'gpt-4o-mini',
    })
  })

  it('keeps local-agent fields out of an HTTP writing-node override', () => {
    const settings = settingsCopy()
    settings.apiConfig.global.defaultAITarget = 'agent:codex'
    settings.apiConfig.nodeOverrides.draft.overrideMode = 'custom'
    settings.apiConfig.nodeOverrides.draft.apiKey = 'override-secret'
    settings.apiConfig.nodeOverrides.draft.apiKeySet = true

    const scriptConfig = buildNodeConfigs(settings).script

    expect(scriptConfig).toMatchObject({
      api_key: 'override-secret',
      api_base: 'https://api.openai.com/v1',
      llm_model: 'gpt-4o-mini',
      provider_kind: 'openai_compatible',
      ai_target: 'node:draft',
    })
    expect(scriptConfig).not.toHaveProperty('local_agent_id')
    expect(scriptConfig).not.toHaveProperty('local_agent_command')
  })

  it('uses the dedicated OpenAI-compatible voice credentials', () => {
    const settings = settingsCopy()
    settings.apiConfig.global.audioProvider = 'openai-compatible'
    settings.apiConfig.global.audioApiBase = 'https://voice.example.com/v1'
    settings.apiConfig.global.audioApiKey = 'voice-secret'
    settings.apiConfig.global.audioApiModel = 'custom-tts'

    expect(buildNodeConfigs(settings).tts).toMatchObject({
      engine: 'openai-compatible',
      api_base: 'https://voice.example.com/v1',
      api_key: 'voice-secret',
      model: 'custom-tts',
      default_voice: 'alloy',
    })
  })

  it('maps the selected Doubao clone profile to the Python TTS contract', () => {
    const settings = settingsCopy()
    settings.apiConfig.global.audioProvider = 'voice_clone'
    settings.apiConfig.global.audioDoubaoCloneAppId = 'clone-app'
    settings.apiConfig.global.audioDoubaoCloneAccessToken = 'clone-token'
    settings.apiConfig.global.audioDoubaoCloneCluster = 'volcano_tts'
    settings.apiConfig.global.audioDoubaoCloneSpeakerId = 'S_clone_123'
    settings.apiConfig.global.audioDoubaoCloneEndpoint = 'https://openspeech.bytedance.com/api/v1/tts'
    settings.apiConfig.global.audioDoubaoCloneResourceId = 'volc.megatts.default'

    expect(buildNodeConfigs(settings).tts).toMatchObject({
      engine: 'voice_clone',
      default_voice: 'S_clone_123',
      voice_mapping: { 'Host A': 'S_clone_123' },
      doubao_app_id: 'clone-app',
      doubao_access_token: 'clone-token',
      doubao_cluster: 'volcano_tts',
      doubao_voice_type: 'S_clone_123',
      doubao_endpoint: 'https://openspeech.bytedance.com/api/v1/tts',
      doubao_resource_id: 'volc.megatts.default',
    })
  })
})
