import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from '../../types/settings'
import { settingsRepository } from '../settings/repository'
import { llmService } from '../llmService'
import { getOrganizeSearchStatus, searchForOrganize } from '../organizeResearch'

describe('organizeResearch', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
    const settings = structuredClone(DEFAULT_SETTINGS)
    settings.apiConfig.global.searchProvider = 'tavily'
    settings.apiConfig.global.webSearchProviders.tavily.apiBase = 'https://api.tavily.com'
    settings.apiConfig.global.webSearchProviders.tavily.apiKey = 'tvly-test'
    settings.apiConfig.global.webSearchProviders.tavily.apiKeySet = true
    settingsRepository.save(settings)
  })

  it('uses Tavily and normalizes results into persisted evidence summaries', async () => {
    const tavilySearch = vi.fn().mockResolvedValue({
      provider: 'tavily',
      query: '核验问题',
      results: [{ id: 'r1', title: '官方公告', url: 'https://example.com/news', excerpt: '公告摘要' }],
    })
    window.electronAPI = { ...window.electronAPI, tavilySearch }

    const response = await searchForOrganize('核验问题')

    expect(getOrganizeSearchStatus()).toMatchObject({ provider: 'tavily', ready: true })
    expect(response.results).toEqual([
      expect.objectContaining({ title: '官方公告', provider: 'tavily', url: 'https://example.com/news' }),
    ])
    expect(tavilySearch).toHaveBeenCalledWith(expect.objectContaining({ maxResults: 5, timeRange: '', topic: 'news' }))
  })

  it('applies task-specific freshness and result limits instead of a global recent-news window', async () => {
    const tavilySearch = vi.fn().mockResolvedValue({ provider: 'tavily', query: '历史对照', results: [] })
    window.electronAPI = { ...window.electronAPI, tavilySearch }

    await searchForOrganize('历史对照', undefined, undefined, { timeRange: 'year', maxResults: 8 })

    expect(tavilySearch).toHaveBeenCalledWith(expect.objectContaining({ maxResults: 8, timeRange: 'year' }))
  })

  it('cancels a pending Tavily IPC request immediately', async () => {
    const tavilySearch = vi.fn(() => new Promise<never>(() => undefined))
    const searchCancel = vi.fn().mockResolvedValue({ success: true })
    window.electronAPI = { ...window.electronAPI, tavilySearch, searchCancel }
    const controller = new AbortController()

    const pending = searchForOrganize('核验问题', undefined, controller.signal)
    controller.abort(new DOMException('用户停止', 'AbortError'))

    await expect(pending).rejects.toThrow('用户停止')
    expect(searchCancel).toHaveBeenCalledWith(expect.stringMatching(/^search-/))
  })

  it('blocks default AI search until the current target is verified', async () => {
    const settings = settingsRepository.load()
    settings.apiConfig.global.searchProvider = 'default_ai'
    settings.apiConfig.global.defaultAITarget = 'agent:codex'
    settings.apiConfig.global.defaultAISearchVerifiedTarget = ''
    settingsRepository.save(settings)

    await expect(searchForOrganize('核验问题')).rejects.toThrow('尚未通过自身联网搜索能力验证')
  })

  it('streams sanitized default AI search progress without exposing tool payloads', async () => {
    const settings = settingsRepository.load()
    settings.apiConfig.global.searchProvider = 'default_ai'
    settings.apiConfig.global.defaultAITarget = 'agent:codex'
    settings.apiConfig.global.defaultAISearchVerifiedTarget = 'agent:codex'
    settingsRepository.save(settings)
    vi.spyOn(llmService, 'callStreaming').mockImplementation(async (_options, onChunk, onEvent) => {
      onEvent?.({ type: 'tool_start', toolName: 'web_search', input: 'private query payload' })
      onEvent?.({ type: 'tool_done', output: 'private tool output' })
      onChunk(JSON.stringify({
        results: [{ title: '官方来源', url: 'https://example.com/official', excerpt: '可核验摘要' }],
      }))
    })
    const progress: string[] = []

    const response = await searchForOrganize('核验问题', event => progress.push(event.detail))

    expect(response.results).toHaveLength(1)
    expect(llmService.callStreaming).toHaveBeenCalledWith(
      expect.objectContaining({ timeout: 60_000 }),
      expect.any(Function),
      expect.any(Function),
    )
    expect(progress).toEqual(expect.arrayContaining([
      '正在连接当前 AI',
      '当前 AI 正在调用自身联网工具',
      '联网工具已返回，正在整理来源',
    ]))
    expect(progress.join(' ')).not.toContain('private')
  })

  it('passes task freshness to default AI search and caps its returned sources', async () => {
    const settings = settingsRepository.load()
    settings.apiConfig.global.searchProvider = 'default_ai'
    settings.apiConfig.global.defaultAITarget = 'agent:codex'
    settings.apiConfig.global.defaultAISearchVerifiedTarget = 'agent:codex'
    settingsRepository.save(settings)
    vi.spyOn(llmService, 'call').mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({ results: [
        { title: '来源一', url: 'https://one.test', excerpt: '摘录一' },
        { title: '来源二', url: 'https://two.test', excerpt: '摘录二' },
        { title: '来源三', url: 'https://three.test', excerpt: '摘录三' },
      ] }) } }],
    } as any)

    const response = await searchForOrganize('近期事实', undefined, undefined, { timeRange: 'month', maxResults: 2 })

    const callOptions = vi.mocked(llmService.call).mock.calls[0]?.[0]
    expect(callOptions.messages[1]?.content).toContain('最近 30 天')
    expect(callOptions.messages[1]?.content).toContain('最多返回 2 条')
    expect(response.results).toHaveLength(2)
  })

  it('serializes concurrent default AI searches at the service boundary', async () => {
    const settings = settingsRepository.load()
    settings.apiConfig.global.searchProvider = 'default_ai'
    settings.apiConfig.global.defaultAITarget = 'agent:codex'
    settings.apiConfig.global.defaultAISearchVerifiedTarget = 'agent:codex'
    settingsRepository.save(settings)
    let releaseFirst!: () => void
    const firstGate = new Promise<void>(resolve => { releaseFirst = resolve })
    const started: string[] = []
    vi.spyOn(llmService, 'callStreaming').mockImplementation(async (options, onChunk) => {
      const query = options.messages[1]?.content.includes('问题一') ? '问题一' : '问题二'
      started.push(query)
      if (query === '问题一') await firstGate
      onChunk(JSON.stringify({
        results: [{ title: `${query}来源`, url: `https://example.com/${query}`, excerpt: '可核验摘要' }],
      }))
    })

    const first = searchForOrganize('问题一', () => undefined)
    const second = searchForOrganize('问题二', () => undefined)
    await vi.waitFor(() => expect(started).toEqual(['问题一']))
    releaseFirst()
    await Promise.all([first, second])

    expect(started).toEqual(['问题一', '问题二'])
  })

  it('recovers the default AI queue after a queued search is canceled', async () => {
    const settings = settingsRepository.load()
    settings.apiConfig.global.searchProvider = 'default_ai'
    settings.apiConfig.global.defaultAITarget = 'agent:codex'
    settings.apiConfig.global.defaultAISearchVerifiedTarget = 'agent:codex'
    settingsRepository.save(settings)
    let releaseFirst!: () => void
    const firstGate = new Promise<void>(resolve => { releaseFirst = resolve })
    const started: string[] = []
    vi.spyOn(llmService, 'callStreaming').mockImplementation(async (options, onChunk) => {
      const query = options.messages[1]?.content.match(/问题[一二三]/)?.[0] || ''
      started.push(query)
      if (query === '问题一') await firstGate
      onChunk(JSON.stringify({
        results: [{ title: `${query}来源`, url: `https://example.com/${query}`, excerpt: '可核验摘要' }],
      }))
    })
    const queuedController = new AbortController()

    const first = searchForOrganize('问题一', () => undefined)
    const canceled = searchForOrganize('问题二', () => undefined, queuedController.signal)
    await vi.waitFor(() => expect(started).toEqual(['问题一']))
    queuedController.abort(new DOMException('取消排队搜索', 'AbortError'))
    await expect(canceled).rejects.toThrow('取消排队搜索')
    releaseFirst()
    await first
    await searchForOrganize('问题三', () => undefined)

    expect(started).toEqual(['问题一', '问题三'])
  })
})
