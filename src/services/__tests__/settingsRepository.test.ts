import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '../../types/settings'
import { mergeAppSettings, settingsRepository } from '../settings/repository'

describe('settings repository current contract', () => {
  it('keeps current credentials while dropping removed settings fields', () => {
    const saved = structuredClone(DEFAULT_SETTINGS) as any
    saved.nodeBehavior = { assistLevel: 'deep' }
    saved.capability.text = { mode: 'quality' }
    saved.apiConfig.nodeOverrides.publish = { apiKey: 'removed-node-key' }
    saved.apiConfig.global.aiModelProviders[2].apiKey = 'saved-model-key'
    saved.apiConfig.global.aiModelProviders[2].apiKeySet = true
    saved.apiConfig.global.webSearchProviders.tavily.apiKey = 'saved-search-key'
    saved.apiConfig.global.audioDoubaoAccessToken = 'saved-audio-token'

    const merged = mergeAppSettings(saved) as any

    expect(merged.nodeBehavior).toBeUndefined()
    expect(merged.capability.text).toBeUndefined()
    expect(merged.apiConfig.nodeOverrides.publish).toBeUndefined()
    expect(merged.apiConfig.global.aiModelProviders[2].apiKey).toBe('saved-model-key')
    expect(merged.apiConfig.global.webSearchProviders.tavily.apiKey).toBe('saved-search-key')
    expect(merged.apiConfig.global.audioDoubaoAccessToken).toBe('saved-audio-token')
  })

  it('loads a partial current JSON and fills omitted current fields', () => {
    const saved = {
      capability: {
        audio: { defaultVoice: 'saved-voice' },
      },
      apiConfig: {
        global: {
          aiModelProviders: [
            {
              ...DEFAULT_SETTINGS.apiConfig.global.aiModelProviders[2],
              apiKey: 'saved-model-key',
              apiKeySet: true,
            },
          ],
        },
        nodeOverrides: {
          draft: { apiKey: 'saved-writing-key' },
        },
      },
    } as any

    const merged = mergeAppSettings(saved)

    expect(merged.capability.audio).toEqual({
      defaultVoice: 'saved-voice',
      quality: DEFAULT_SETTINGS.capability.audio.quality,
    })
    expect(merged.creatorPreferences.organizeCompletionMode).toBe('hybrid')
    expect(merged.apiConfig.global.audioDoubaoEndpoint).toBe(
      DEFAULT_SETTINGS.apiConfig.global.audioDoubaoEndpoint,
    )
    expect(merged.apiConfig.global.aiModelProviders).toHaveLength(1)
    expect(merged.apiConfig.global.aiModelProviders[0]).toMatchObject({
      apiKey: 'saved-model-key',
      apiKeySet: true,
    })
    expect(merged.apiConfig.nodeOverrides.draft.apiKey).toBe('saved-writing-key')
  })

  it('saves only the current settings shape', () => {
    window.localStorage.clear()
    const settings = mergeAppSettings({
      capability: { audio: { quality: 'ultra' } },
    } as any)

    settingsRepository.save(settings)

    const stored = JSON.parse(window.localStorage.getItem('podflow.settings.v1') || '{}')
    expect(stored.capability.audio.quality).toBe('wav')
    expect(stored.capability).not.toHaveProperty('text')
    expect(stored).not.toHaveProperty('nodeBehavior')
    expect(stored.apiConfig.nodeOverrides).toHaveProperty('organize')
    expect(stored.apiConfig.nodeOverrides).not.toHaveProperty('discover')
    expect(stored.apiConfig.nodeOverrides).not.toHaveProperty('produce')
    expect(stored.apiConfig.nodeOverrides).not.toHaveProperty('publish')
  })

  it('loads current credentials from local storage even when removed fields are present', () => {
    const saved = structuredClone(DEFAULT_SETTINGS) as any
    saved.capability.text = { mode: 'deep' }
    saved.apiConfig.global.aiModelProviders[6].apiKey = 'compatible-provider-key'
    window.localStorage.setItem('podflow.settings.v1', JSON.stringify(saved))

    const loaded = settingsRepository.load()

    expect(loaded.apiConfig.global.aiModelProviders[6].apiKey).toBe('compatible-provider-key')
    expect((loaded.capability as any).text).toBeUndefined()
  })

  it('resets transient connection checks while preserving target-scoped search verification', () => {
    const saved = structuredClone(DEFAULT_SETTINGS)
    saved.apiConfig.global.audioConnectionStatus = 'connected'
    saved.apiConfig.global.defaultAISearchVerifiedTarget = 'agent:codex'
    saved.apiConfig.global.aiModelProviders[0].connectionStatus = 'connected'
    saved.apiConfig.global.webSearchProviders.tavily.connectionStatus = 'connected'
    saved.apiConfig.nodeOverrides.draft.connectionStatus = 'connected'
    saved.apiConfig.global.localAgents[1] = {
      ...saved.apiConfig.global.localAgents[1],
      available: true,
      version: 'stale-version',
      statusText: '已安装',
    }

    const merged = mergeAppSettings(saved)

    expect(merged.apiConfig.global.audioConnectionStatus).toBe('untested')
    expect(merged.apiConfig.global.defaultAISearchVerifiedTarget).toBe('agent:codex')
    expect(merged.apiConfig.global.aiModelProviders[0].connectionStatus).toBe('untested')
    expect(merged.apiConfig.global.webSearchProviders.tavily.connectionStatus).toBe('untested')
    expect(merged.apiConfig.nodeOverrides.draft.connectionStatus).toBe('untested')
    expect(merged.apiConfig.global.localAgents[1]).toMatchObject({ available: false, version: '', statusText: '未检测' })
  })
})
