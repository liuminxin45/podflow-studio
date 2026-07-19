import { afterEach, describe, expect, it, vi } from 'vitest'
import { mergeAppSettings, settingsRepository } from '../settings/repository'
import { LLMConfigResolver } from '../settings/llmConfigResolver'
import { DEFAULT_LOCAL_AGENTS } from '../../types/settings'

describe('LLMConfigResolver local agents', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('keeps Hermes in configured one-shot mode by default', () => {
    const hermes = DEFAULT_LOCAL_AGENTS.find(agent => agent.id === 'hermes')

    expect(hermes?.command).toBe('hermes')
    expect(hermes?.runArgs).toEqual(['-z', '{prompt}'])
    expect(hermes?.outputMode).toBe('stdout')
  })

  it('resolves selected local agent command template from settings', () => {
    const settings = mergeAppSettings({
      apiConfig: {
        global: {
          defaultAITarget: 'agent:hermes',
          localAgents: [
            {
              id: 'hermes',
              name: 'Hermes Agent',
              command: 'hermes',
              version: 'Hermes Agent v0.17.0',
              available: true,
              statusText: 'Hermes Agent v0.17.0',
              runArgs: ['-z', '{prompt}'],
              outputMode: 'stdout',
            },
          ],
        },
      },
    } as any)
    vi.spyOn(settingsRepository, 'load').mockReturnValue(settings)

    const config = new LLMConfigResolver().getLLMConfig('draft')

    expect(config).toMatchObject({
      providerKind: 'local_agent',
      localAgentId: 'hermes',
      localAgentCommand: 'hermes',
      localAgentArgs: ['-z', '{prompt}'],
      localAgentOutputMode: 'stdout',
    })
  })

  it('does not leak local-agent routing into an HTTP node override', () => {
    const settings = mergeAppSettings({
      apiConfig: {
        global: {
          defaultAITarget: 'agent:codex',
        },
        nodeOverrides: {
          draft: {
            overrideMode: 'custom',
            apiKey: 'override-key',
            apiKeySet: true,
          },
        },
      },
    } as any)
    vi.spyOn(settingsRepository, 'load').mockReturnValue(settings)

    const config = new LLMConfigResolver().getLLMConfig('draft')

    expect(config).toMatchObject({
      providerKind: 'openai_compatible',
      apiBase: 'https://api.openai.com/v1',
      apiKey: 'override-key',
      model: 'gpt-4o-mini',
    })
    expect(config?.apiBase).not.toContain('local-agent://')
    expect(config?.localAgentId).toBeUndefined()
  })

  it('can resolve the current unsaved settings snapshot', () => {
    const settings = mergeAppSettings({
      apiConfig: {
        global: {
          defaultAITarget: 'model:api-openai-compatible',
          aiModelProviders: [
            {
              id: 'api-openai-compatible',
              apiBase: 'https://draft.example/v1',
              apiKey: 'draft-key',
              apiKeySet: true,
              model: 'draft-model',
            },
          ],
        },
      },
    } as any)

    const config = new LLMConfigResolver().getLLMConfigFromSettings(settings, 'organize', true)

    expect(config).toMatchObject({
      apiBase: 'https://draft.example/v1',
      apiKey: 'draft-key',
      model: 'draft-model',
    })
  })

  it('resolves Doubao clone credentials independently from regular TTS', () => {
    const settings = mergeAppSettings({
      apiConfig: {
        global: {
          audioProvider: 'voice_clone',
          audioDoubaoAppId: 'regular-app',
          audioDoubaoAccessToken: 'regular-token',
          audioDoubaoVoiceType: 'regular-voice',
          audioDoubaoCloneAppId: 'clone-app',
          audioDoubaoCloneAccessToken: 'clone-token',
          audioDoubaoCloneCluster: 'volcano_tts',
          audioDoubaoCloneSpeakerId: 'S_clone_123',
          audioDoubaoCloneEndpoint: 'https://openspeech.bytedance.com/api/v1/tts',
          audioDoubaoCloneResourceId: 'volc.megatts.default',
        },
      },
    } as any)
    vi.spyOn(settingsRepository, 'load').mockReturnValue(settings)

    expect(new LLMConfigResolver().getAudioProviderConfig()).toMatchObject({
      provider: 'voice_clone',
      doubaoAppId: 'clone-app',
      doubaoAccessToken: 'clone-token',
      doubaoCluster: 'volcano_tts',
      doubaoVoiceType: 'S_clone_123',
      doubaoEndpoint: 'https://openspeech.bytedance.com/api/v1/tts',
      doubaoResourceId: 'volc.megatts.default',
    })
  })

  it('does not borrow text-model credentials for OpenAI-compatible speech', () => {
    const settings = mergeAppSettings({
      apiConfig: {
        global: {
          audioProvider: 'openai-compatible',
          audioApiBase: 'https://voice.example/v1',
          audioApiKey: '',
          audioApiModel: 'voice-model',
        },
      },
    } as any)
    vi.spyOn(settingsRepository, 'load').mockReturnValue(settings)

    expect(new LLMConfigResolver().getAudioProviderConfig()).toMatchObject({
      provider: 'openai_compatible',
      apiBase: 'https://voice.example/v1',
      apiKey: '',
      model: 'voice-model',
    })
  })
})
