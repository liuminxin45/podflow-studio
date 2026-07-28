import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from '../../types/settings'
import { settingsRepository } from '../settings/repository'
import { getOrganizeSearchStatus, searchForOrganize } from '../organizeResearch'

describe('organizeResearch Doubao Search provider', () => {
  beforeEach(() => {
    localStorage.clear()
    const settings = structuredClone(DEFAULT_SETTINGS)
    settings.apiConfig.global.searchProvider = 'doubao_search'
    settings.apiConfig.global.webSearchProviders.doubao_search.apiKey = 'doubao-search-test'
    settings.apiConfig.global.webSearchProviders.doubao_search.apiKeySet = true
    settingsRepository.save(settings)
  })

  it('uses Doubao Search and keeps its provider on normalized evidence', async () => {
    const doubaoSearch = vi.fn().mockResolvedValue({
      provider: 'doubao_search',
      query: '核验问题',
      results: [{ id: 'd1', title: '官方公告', url: 'https://example.com/doubao', excerpt: '公告正文' }],
    })
    window.electronAPI = { ...window.electronAPI, doubaoSearch }

    const response = await searchForOrganize('核验问题')

    expect(getOrganizeSearchStatus()).toMatchObject({ provider: 'doubao_search', ready: true, label: '豆包搜索' })
    expect(response.results).toEqual([
      expect.objectContaining({ title: '官方公告', provider: 'doubao_search', url: 'https://example.com/doubao' }),
    ])
    expect(doubaoSearch).toHaveBeenCalledWith(expect.objectContaining({
      apiBase: 'https://open.feedcoopapi.com',
      maxResults: 5,
      timeRange: '',
    }))
  })
})
