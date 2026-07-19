import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from '../../types/settings'
import { settingsRepository } from '../settings/repository'
import { getOrganizeSearchStatus, searchForOrganize } from '../organizeResearch'

describe('organizeResearch Bocha provider', () => {
  beforeEach(() => {
    localStorage.clear()
    const settings = structuredClone(DEFAULT_SETTINGS)
    settings.apiConfig.global.searchProvider = 'bocha'
    settings.apiConfig.global.webSearchProviders.bocha.apiBase = 'https://api.bochaai.com'
    settings.apiConfig.global.webSearchProviders.bocha.apiKey = 'bocha-test'
    settings.apiConfig.global.webSearchProviders.bocha.apiKeySet = true
    settingsRepository.save(settings)
  })

  it('uses Bocha and keeps its provider on normalized evidence', async () => {
    const bochaSearch = vi.fn().mockResolvedValue({
      provider: 'bocha',
      query: '核验问题',
      results: [{ id: 'b1', title: '官方公告', url: 'https://example.com/bocha', excerpt: '公告摘要' }],
    })
    window.electronAPI = { ...window.electronAPI, bochaSearch }

    const response = await searchForOrganize('核验问题')

    expect(getOrganizeSearchStatus()).toMatchObject({ provider: 'bocha', ready: true, label: '博查' })
    expect(response.results).toEqual([
      expect.objectContaining({ title: '官方公告', provider: 'bocha', url: 'https://example.com/bocha' }),
    ])
    expect(bochaSearch).toHaveBeenCalledWith(expect.objectContaining({
      apiBase: 'https://api.bochaai.com',
      maxResults: 5,
      timeRange: '',
    }))
  })
})
