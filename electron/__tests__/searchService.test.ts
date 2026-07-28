import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { bochaEndpoint, bochaFreshness, bochaRetryDelay, createRequestLimiter, doubaoSearchEndpoint, isBochaRateLimitError, normalizeBochaResponse, normalizeDoubaoSearchResponse } = require('../searchService') as {
  bochaEndpoint: (apiBase?: string) => string
  bochaFreshness: (timeRange?: string) => string
  bochaRetryDelay: (attempt: number, random?: () => number) => number
  createRequestLimiter: (maxConcurrency: number) => (signal?: AbortSignal) => Promise<() => void>
  doubaoSearchEndpoint: (apiBase?: string) => string
  isBochaRateLimitError: (error: unknown) => boolean
  normalizeBochaResponse: (body: Record<string, unknown>, query: string) => {
    provider: 'bocha'
    query: string
    results: Array<{ id: string; title: string; url: string; excerpt: string; publishedAt?: string }>
  }
  normalizeDoubaoSearchResponse: (body: Record<string, unknown>, query: string, maxResults?: number) => {
    provider: 'doubao_search'
    query: string
    results: Array<{ id: string; title: string; url: string; excerpt: string; publishedAt?: string }>
  }
}

describe('Doubao search adapter', () => {
  it('builds the global search endpoint without duplicating its path', () => {
    expect(doubaoSearchEndpoint('https://open.feedcoopapi.com')).toBe('https://open.feedcoopapi.com/search_api/global_search')
    expect(doubaoSearchEndpoint('https://proxy.example/search_api')).toBe('https://proxy.example/search_api/global_search')
    expect(doubaoSearchEndpoint('https://proxy.example/search_api/global_search')).toBe('https://proxy.example/search_api/global_search')
  })

  it('normalizes documented Documents and text snippets', () => {
    expect(normalizeDoubaoSearchResponse({
      Result: {
        Documents: [{
          DocId: 'doc-1',
          Title: '官方来源',
          Url: 'https://example.com/news',
          Snippet: [{ Type: 'text', Text: '第一段' }, { Type: 'image', Image: { ImageUrl: 'https://example.com/a.png' } }, { Type: 'text', Text: '第二段' }],
          DocumentInfo: { PublishTime: '2026-07-28 09:30:00' },
        }],
      },
    }, '测试问题')).toEqual({
      provider: 'doubao_search',
      query: '测试问题',
      results: [{
        id: 'doc-1',
        title: '官方来源',
        url: 'https://example.com/news',
        excerpt: '第一段\n第二段',
        publishedAt: '2026-07-28 09:30:00',
      }],
    })
  })

  it('surfaces provider errors instead of returning a false success', () => {
    expect(() => normalizeDoubaoSearchResponse({
      ResponseMetadata: { Error: { Code: 'InvalidParameter', Message: 'invalid query' } },
    }, '测试问题')).toThrow('豆包搜索失败: invalid query')
  })
})

describe('Bocha search adapter', () => {
  it('builds the documented endpoint without duplicating v1', () => {
    expect(bochaEndpoint('https://api.bochaai.com')).toBe('https://api.bochaai.com/v1/web-search')
    expect(bochaEndpoint('https://proxy.example/v1')).toBe('https://proxy.example/v1/web-search')
    expect(bochaEndpoint('https://proxy.example/v1/web-search')).toBe('https://proxy.example/v1/web-search')
  })

  it('maps time ranges to Bocha freshness values', () => {
    expect(bochaFreshness('week')).toBe('oneWeek')
    expect(bochaFreshness('')).toBe('noLimit')
  })

  it('recognizes HTTP 429 responses and calculates bounded exponential backoff', () => {
    expect(isBochaRateLimitError({ statusCode: 429 })).toBe(true)
    expect(isBochaRateLimitError({ statusCode: 403 })).toBe(false)
    expect(bochaRetryDelay(0, () => 0)).toBe(750)
    expect(bochaRetryDelay(1, () => 1)).toBe(1751)
  })

  it('limits concurrent requests and releases queued work in order', async () => {
    const acquire = createRequestLimiter(2)
    const releaseFirst = await acquire()
    const releaseSecond = await acquire()
    let thirdStarted = false
    const third = acquire().then(release => {
      thirdStarted = true
      return release
    })

    await Promise.resolve()
    expect(thirdStarted).toBe(false)
    releaseFirst()
    const releaseThird = await third
    expect(thirdStarted).toBe(true)
    releaseSecond()
    releaseThird()
  })

  it('normalizes wrapped Bocha web page results', () => {
    const response = normalizeBochaResponse({
      code: 200,
      data: {
        queryContext: { originalQuery: '测试问题' },
        webPages: { value: [
          { id: 'source-1', name: '官方来源', url: 'https://example.com/news', summary: '完整摘要', snippet: '短摘录', datePublished: '2026-07-14' },
          { name: '无摘要', url: 'https://example.com/empty' },
        ] },
      },
    }, 'fallback')

    expect(response).toEqual({
      provider: 'bocha',
      query: '测试问题',
      results: [{
        id: 'source-1',
        title: '官方来源',
        url: 'https://example.com/news',
        excerpt: '完整摘要',
        publishedAt: '2026-07-14',
      }],
    })
  })
})
