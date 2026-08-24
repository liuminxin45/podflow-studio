import { describe, expect, it } from 'vitest'

const { mergeAISecrets, redactAISecrets } = require('../aiSettingsSecrets')

function settings(apiKey: string, apiKeySet = Boolean(apiKey)) {
  return {
    apiConfig: {
      global: { aiModelProviders: [{ id: 'openai', apiKey, apiKeySet }] },
      nodeOverrides: { draft: { apiKey, apiKeySet } },
    },
  }
}

describe('Electron AI credential boundary', () => {
  it('redacts persisted AI keys before returning settings to renderer', () => {
    const redacted = redactAISecrets(settings('secret'))

    expect(redacted.apiConfig.global.aiModelProviders[0].apiKey).toBe('')
    expect(redacted.apiConfig.nodeOverrides.draft.apiKey).toBe('')
  })

  it('preserves a stored key on masked saves and clears it explicitly', () => {
    const masked = settings('', true)
    expect(mergeAISecrets(settings('secret'), masked).apiConfig.global.aiModelProviders[0].apiKey).toBe('secret')
    expect(mergeAISecrets(settings('secret'), settings('', false)).apiConfig.global.aiModelProviders[0].apiKey).toBe('')
  })
})
