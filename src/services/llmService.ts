import type { LLMCallOptions, LLMResponse, ModelsResponse, PerformanceMetrics } from '../types/llm'
import { LLMError } from '../types/llm'
import { LLM_DEFAULTS } from '../constants/llm'
import { LRUCache } from './llm/cache'
import { TokenBucketRateLimiter } from './llm/rateLimit'
import { MetricsCollector } from './llm/metrics'
import {
  normalizeUrl,
  validateCredentials,
  buildHeaders,
  extractModelIds,
  normalizeError,
  getCacheKey,
  delay,
} from './llm/utils'

class LLMService {
  private cache: LRUCache
  private rateLimiter: TokenBucketRateLimiter
  private metricsCollector: MetricsCollector

  constructor() {
    this.cache = new LRUCache(
      LLM_DEFAULTS.CACHE_MAX_SIZE,
      LLM_DEFAULTS.CACHE_TTL
    )
    
    this.rateLimiter = new TokenBucketRateLimiter({
      maxTokens: LLM_DEFAULTS.RATE_LIMIT_MAX_TOKENS,
      refillRate: LLM_DEFAULTS.RATE_LIMIT_REFILL_RATE,
      refillInterval: LLM_DEFAULTS.RATE_LIMIT_REFILL_INTERVAL,
    })
    
    this.metricsCollector = new MetricsCollector()
  }

  async call(options: LLMCallOptions): Promise<LLMResponse> {
    const {
      apiBase,
      apiKey,
      model,
      messages,
      temperature = LLM_DEFAULTS.TEMPERATURE,
      maxTokens,
      timeout = LLM_DEFAULTS.TIMEOUT,
    } = options

    validateCredentials(apiBase, apiKey)
    await this.rateLimiter.acquire()

    const cacheKey = getCacheKey(options)
    const cached = this.cache.get(cacheKey)
    if (cached) {
      console.log('[LLMService] Cache hit')
      return cached
    }

    const startTime = Date.now()

    try {
      const response = this.shouldUseElectronLLMCall()
        ? await this.callViaElectron({ apiBase, apiKey, model, messages, temperature, maxTokens, timeout })
        : await this.callViaFetch({ apiBase, apiKey, model, messages, temperature, maxTokens, timeout })

      const duration = Date.now() - startTime
      this.metricsCollector.recordCall(duration, true)
      this.cache.set(cacheKey, response)

      return response
    } catch (error: any) {
      const duration = Date.now() - startTime
      this.metricsCollector.recordCall(duration, false)
      throw normalizeError(error)
    }
  }

  async fetchModels(apiBase: string, apiKey: string): Promise<string[]> {
    validateCredentials(apiBase, apiKey)

    try {
      if (this.shouldUseElectronModelFetch()) {
        const data = await (window as any).electronAPI.llmFetchModels({ apiBase, apiKey })
        return extractModelIds(data)
      }

      const baseUrl = normalizeUrl(apiBase)
      const response = await fetch(`${baseUrl}/models`, {
        method: 'GET',
        headers: buildHeaders(apiBase, apiKey),
      })

      if (!response.ok) {
        throw new LLMError(`HTTP ${response.status}`, 'NETWORK', { status: response.status })
      }

      const data: ModelsResponse = await response.json()
      return extractModelIds(data)
    } catch (error: any) {
      throw normalizeError(error)
    }
  }

  async batchAnalyze<T>(
    items: T[],
    batchFn: (batch: T[]) => Promise<T[]>,
    onProgress?: (progress: number) => void
  ): Promise<T[]> {
    const results: T[] = []
    const batchSize = LLM_DEFAULTS.BATCH_SIZE

    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize)
      onProgress?.(i / items.length)

      try {
        const batchResults = await batchFn(batch)
        results.push(...batchResults)
      } catch (error: any) {
        console.error('[LLMService] Batch analysis failed:', error)
        results.push(...batch)
      }

      await delay(LLM_DEFAULTS.BATCH_DELAY)
    }

    onProgress?.(1)
    return results
  }

  async callStreaming(
    options: LLMCallOptions,
    onChunk: (chunk: string) => void
  ): Promise<void> {
    const { apiBase, apiKey, model, messages, temperature = LLM_DEFAULTS.TEMPERATURE } = options

    validateCredentials(apiBase, apiKey)
    await this.rateLimiter.acquire()

    const baseUrl = normalizeUrl(apiBase)
    const headers = buildHeaders(apiBase, apiKey)

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), LLM_DEFAULTS.STREAMING_TIMEOUT)

    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model,
          messages,
          temperature,
          stream: true,
        }),
        signal: controller.signal,
      })

      if (!response.ok) {
        throw new LLMError(`HTTP ${response.status}`, 'NETWORK', { status: response.status })
      }

      const reader = response.body?.getReader()
      if (!reader) {
        throw new LLMError('No response body', 'NETWORK')
      }

      await this.processStreamResponse(reader, onChunk)
    } finally {
      clearTimeout(timeoutId)
    }
  }

  getMetrics(): PerformanceMetrics {
    return this.metricsCollector.getMetrics()
  }

  clearCache(): void {
    this.cache.clear()
  }

  resetMetrics(): void {
    this.metricsCollector.reset()
  }

  private shouldUseElectronLLMCall(): boolean {
    return typeof window !== 'undefined' && !!(window as any).electronAPI?.llmCall
  }

  private shouldUseElectronModelFetch(): boolean {
    return typeof window !== 'undefined' && !!(window as any).electronAPI?.llmFetchModels
  }

  private async callViaElectron(options: LLMCallOptions): Promise<LLMResponse> {
    const data = await (window as any).electronAPI.llmCall({
      apiBase: normalizeUrl(options.apiBase),
      apiKey: options.apiKey.trim(),
      model: options.model,
      messages: options.messages,
      temperature: options.temperature,
      maxTokens: options.maxTokens,
      timeout: options.timeout,
    })

    if (!data.choices?.[0]?.message) {
      throw new LLMError('Invalid response format', 'PARSE', { data })
    }

    return data
  }

  private async callViaFetch(options: LLMCallOptions): Promise<LLMResponse> {
    const baseUrl = normalizeUrl(options.apiBase)
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), options.timeout)

    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: buildHeaders(options.apiBase, options.apiKey),
        body: JSON.stringify({
          model: options.model,
          messages: options.messages,
          temperature: options.temperature,
          max_tokens: options.maxTokens,
        }),
        signal: controller.signal,
      })

      if (!response.ok) {
        throw new LLMError(`HTTP ${response.status}`, 'NETWORK', { status: response.status })
      }

      return await response.json()
    } finally {
      clearTimeout(timeoutId)
    }
  }

  private async processStreamResponse(
    reader: ReadableStreamDefaultReader<Uint8Array>,
    onChunk: (chunk: string) => void
  ): Promise<void> {
    const decoder = new TextDecoder()
    let buffer = ''

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed || trimmed === 'data: [DONE]') continue
          if (!trimmed.startsWith('data: ')) continue

          try {
            const json = JSON.parse(trimmed.slice(6))
            const content = json.choices?.[0]?.delta?.content
            if (content) {
              onChunk(content)
            }
          } catch (e) {
            console.warn('[LLMService] Failed to parse SSE chunk:', e)
          }
        }
      }
    } finally {
      reader.releaseLock()
    }
  }
}

export const llmService = new LLMService()
