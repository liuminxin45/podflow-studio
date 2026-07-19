import type { OrganizeResearchResult, OrganizeSearchProvider } from '../types/organize'
import { llmService } from './llmService'
import {
  createLLMCallOptions,
  hasUsableLLMConfig,
  llmConfigResolver,
} from './settings/llmConfigResolver'
import { settingsRepository } from './settings/repository'
import type { AppSettings } from '../types/settings'

export interface OrganizeSearchResponse {
  provider: OrganizeSearchProvider
  query: string
  results: OrganizeResearchResult[]
}

export interface OrganizeSearchProgress {
  phase: 'connecting' | 'browsing' | 'receiving'
  detail: string
}

export interface OrganizeSearchOptions {
  timeRange?: 'day' | 'week' | 'month' | 'year' | 'noLimit'
  maxResults?: number
}

const DEFAULT_AI_SEARCH_TIMEOUT_MS = 60_000

let defaultAISearchTail: Promise<void> = Promise.resolve()

function abortReason(signal: AbortSignal): Error {
  if (signal.reason instanceof Error) return signal.reason
  if (signal.reason && typeof signal.reason === 'object' && 'message' in signal.reason) {
    const reason = signal.reason as { message?: unknown; name?: unknown }
    return new DOMException(String(reason.message || '请求已取消'), String(reason.name || 'AbortError'))
  }
  return new DOMException('请求已取消', 'AbortError')
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return
  throw abortReason(signal)
}

async function waitForPreviousSearch(previous: Promise<void>, signal?: AbortSignal): Promise<void> {
  if (!signal) return previous
  throwIfAborted(signal)
  let handleAbort: (() => void) | undefined
  try {
    await Promise.race([
      previous,
      new Promise<never>((_, reject) => {
        handleAbort = () => reject(abortReason(signal))
        signal.addEventListener('abort', handleAbort, { once: true })
      }),
    ])
  } finally {
    if (handleAbort) signal.removeEventListener('abort', handleAbort)
  }
}

async function serializeDefaultAISearch<T>(task: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  const previous = defaultAISearchTail
  let release!: () => void
  const current = new Promise<void>(resolve => { release = resolve })
  defaultAISearchTail = previous.catch(() => undefined).then(() => current)
  try {
    await waitForPreviousSearch(previous, signal)
    throwIfAborted(signal)
    return await task()
  } finally {
    release()
  }
}

async function invokeSearchWithAbort<T>(
  call: (params: any) => Promise<T>,
  params: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<T> {
  throwIfAborted(signal)
  const requestId = `search-${Date.now()}-${Math.random().toString(36).slice(2)}`
  const request = call({ ...params, requestId })
  if (!signal) return request

  return new Promise<T>((resolve, reject) => {
    let settled = false
    const cleanup = () => signal.removeEventListener('abort', handleAbort)
    const finish = (callback: () => void) => {
      if (settled) return
      settled = true
      cleanup()
      callback()
    }
    const handleAbort = () => {
      void window.electronAPI?.searchCancel?.(requestId).catch(() => undefined)
      finish(() => reject(abortReason(signal)))
    }
    signal.addEventListener('abort', handleAbort, { once: true })
    request.then(
      value => finish(() => resolve(value)),
      error => finish(() => reject(error)),
    )
    if (signal.aborted) handleAbort()
  })
}

function parseJsonObject(raw: string): Record<string, any> {
  const match = raw.match(/\{[\s\S]*\}/)
  return JSON.parse(match ? match[0] : raw)
}

function normalizeAIResults(value: unknown, query: string): OrganizeResearchResult[] {
  if (!Array.isArray(value)) return []
  return value.map((item: any, index) => ({
    id: `default-ai-${Date.now()}-${index}`,
    title: String(item?.title || item?.url || '未命名来源'),
    url: String(item?.url || ''),
    excerpt: String(item?.excerpt || item?.summary || ''),
    publishedAt: item?.publishedAt ? String(item.publishedAt) : undefined,
    provider: 'default_ai' as const,
  })).filter(item => /^https?:\/\//i.test(item.url) && item.excerpt.trim() && query.trim())
}

export function getOrganizeSearchStatus() {
  const global = settingsRepository.load().apiConfig.global
  const provider = global.searchProvider || 'tavily'
  if (provider === 'tavily') {
    const searchConfig = global.webSearchProviders.tavily
    return {
      provider,
      ready: Boolean(searchConfig.apiKeySet && searchConfig.apiKey),
      label: 'Tavily',
      reason: '请先在设置中配置 Tavily API Key',
    }
  }
  if (provider === 'bocha') {
    const searchConfig = global.webSearchProviders.bocha
    return {
      provider,
      ready: Boolean(searchConfig.apiKeySet && searchConfig.apiKey),
      label: '博查',
      reason: '请先在设置中配置博查 API Key',
    }
  }
  return {
    provider,
    ready: global.defaultAISearchVerifiedTarget === global.defaultAITarget,
    label: '复用当前 AI 联网',
    reason: '当前 AI 尚未通过自身联网搜索能力验证',
  }
}

export async function searchForOrganize(
  query: string,
  onProgress?: (progress: OrganizeSearchProgress) => void,
  signal?: AbortSignal,
  options: OrganizeSearchOptions = {},
): Promise<OrganizeSearchResponse> {
  throwIfAborted(signal)
  const settings = settingsRepository.load()
  const global = settings.apiConfig.global
  const provider = global.searchProvider || 'tavily'
  const timeRange = options.timeRange && options.timeRange !== 'noLimit' ? options.timeRange : ''
  const maxResults = Math.min(10, Math.max(1, options.maxResults || 5))
  const currentDate = new Date().toISOString().slice(0, 10)
  const searchWindowInstruction = timeRange === 'day'
    ? `只检索 ${currentDate} 前后 1 天内的最新资料`
    : timeRange === 'week'
      ? `优先检索截至 ${currentDate} 最近 7 天的资料`
      : timeRange === 'month'
        ? `优先检索截至 ${currentDate} 最近 30 天的资料`
        : timeRange === 'year'
          ? `检索截至 ${currentDate} 最近一年内的资料`
          : '不限制发布日期，允许使用与研究问题相关的历史资料'
  if (provider === 'tavily') {
    const searchConfig = global.webSearchProviders.tavily
    const tavilySearch = window.electronAPI?.tavilySearch
    if (typeof tavilySearch !== 'function') {
      throw new Error('桌面搜索能力尚未加载，请完整退出并重新启动 Electron 应用')
    }
    const response = await invokeSearchWithAbort(tavilySearch, {
      apiBase: searchConfig.apiBase || 'https://api.tavily.com',
      apiKey: searchConfig.apiKey,
      query,
      topic: 'news',
      timeRange,
      maxResults,
    }, signal)
    throwIfAborted(signal)
    return {
      provider,
      query: response.query,
      results: response.results.map(item => ({ ...item, provider })),
    }
  }
  if (provider === 'bocha') {
    const searchConfig = global.webSearchProviders.bocha
    const bochaSearch = window.electronAPI?.bochaSearch
    if (typeof bochaSearch !== 'function') {
      throw new Error('桌面搜索能力尚未加载，请完整退出并重新启动 Electron 应用')
    }
    const response = await invokeSearchWithAbort(bochaSearch, {
      apiBase: searchConfig.apiBase || 'https://api.bochaai.com',
      apiKey: searchConfig.apiKey,
      query,
      timeRange,
      maxResults,
    }, signal)
    throwIfAborted(signal)
    return {
      provider,
      query: response.query,
      results: response.results.map(item => ({ ...item, provider })),
    }
  }

  if (global.defaultAISearchVerifiedTarget !== global.defaultAITarget) {
    throw new Error('当前 AI 尚未通过自身联网搜索能力验证')
  }
  const config = llmConfigResolver.getLLMConfig('organize', true)
  if (!hasUsableLLMConfig(config)) throw new Error('当前 AI 不可用，无法复用其联网搜索能力')
  return serializeDefaultAISearch(async () => {
    const callOptions = createLLMCallOptions(config, {
      temperature: 0.1,
      maxTokens: 1800,
      timeout: DEFAULT_AI_SEARCH_TIMEOUT_MS,
      signal,
      messages: [
        {
          role: 'system',
          content: '你必须使用自身可用的联网搜索工具完成任务。只返回 JSON：{"results":[{"title":"","url":"https://...","excerpt":"","publishedAt":""}]}。不得编造 URL；每条结果必须包含网页摘录。',
        },
        { role: 'user', content: `搜索并核验这个播客研究问题：${query}\n时间要求：${searchWindowInstruction}\n最多返回 ${maxResults} 条高相关、可核验的独立网页来源。` },
      ],
    })
    let raw = ''
    if (onProgress) {
      onProgress({ phase: 'connecting', detail: '正在连接当前 AI' })
      await llmService.callStreaming(
        callOptions,
        chunk => {
          raw += chunk
          onProgress({ phase: 'receiving', detail: `正在接收搜索结果（${raw.length} 字）` })
        },
        event => {
          if (event.type === 'tool_start') {
            onProgress({ phase: 'browsing', detail: '当前 AI 正在调用自身联网工具' })
          } else if (event.type === 'tool_done') {
            onProgress({ phase: 'receiving', detail: '联网工具已返回，正在整理来源' })
          }
        },
      )
    } else {
      const response = await llmService.call(callOptions)
      raw = response.choices?.[0]?.message?.content || ''
    }
    const parsed = parseJsonObject(raw)
    const results = normalizeAIResults(parsed.results, query).slice(0, maxResults)
    if (results.length === 0) throw new Error('当前 AI 自身联网搜索未返回可核验的网页来源')
    return { provider, query, results }
  }, signal)
}

export async function verifyDefaultAISearchCapability(settings?: AppSettings): Promise<number> {
  const config = settings
    ? llmConfigResolver.getLLMConfigFromSettings(settings, 'organize', true)
    : llmConfigResolver.getLLMConfig('organize', true)
  if (!hasUsableLLMConfig(config)) throw new Error('当前 AI 不可用，无法验证其联网搜索能力')
  const response = await llmService.call(createLLMCallOptions(config, {
    temperature: 0,
    maxTokens: 1000,
    messages: [
      { role: 'system', content: '使用联网搜索工具。只返回 JSON：{"results":[{"title":"","url":"https://...","excerpt":""}]}。' },
      { role: 'user', content: `搜索今天（${new Date().toISOString().slice(0, 10)}）的两条主要科技新闻，并给出原文 URL 与摘录。` },
    ],
  }))
  const parsed = parseJsonObject(response.choices?.[0]?.message?.content || '')
  const results = normalizeAIResults(parsed.results, '联网能力验证')
  if (results.length < 2) throw new Error('未返回至少两个可核验网页来源')
  return results.length
}
