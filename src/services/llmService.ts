import type { LLMCallOptions, LLMResponse, ModelsResponse } from '../types/llm'
import { LLMError } from '../types/llm'
import { LLM_DEFAULTS } from '../constants/llm'

interface PerformanceMetrics {
  totalCalls: number
  successfulCalls: number
  failedCalls: number
  totalDuration: number
  averageResponseTime: number
  failureRate: number
}

interface CacheEntry {
  response: LLMResponse
  timestamp: number
}

interface RateLimitState {
  tokens: number
  lastRefill: number
}

class LLMService {
  private useElectronProxy = false
  private metrics: PerformanceMetrics = {
    totalCalls: 0,
    successfulCalls: 0,
    failedCalls: 0,
    totalDuration: 0,
    averageResponseTime: 0,
    failureRate: 0,
  }
  private cache = new Map<string, CacheEntry>()
  private readonly CACHE_TTL = 300000
  private rateLimitState: RateLimitState = {
    tokens: 100,
    lastRefill: Date.now(),
  }
  private readonly RATE_LIMIT_MAX_TOKENS = 100
  private readonly RATE_LIMIT_REFILL_RATE = 10
  private readonly RATE_LIMIT_REFILL_INTERVAL = 1000

  constructor() {
    this.useElectronProxy = typeof window !== 'undefined' && !!(window as any).electronAPI?.llmCall
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

    if (!apiBase || !apiKey) {
      throw new LLMError('Missing API credentials', 'AUTH')
    }

    await this.checkRateLimit()

    const cacheKey = this.getCacheKey(options)
    const cached = this.getFromCache(cacheKey)
    if (cached) {
      console.log('[LLMService] Cache hit:', cacheKey)
      return cached
    }

    const startTime = Date.now()
    this.metrics.totalCalls++

    try {
      let response: LLMResponse
      if (this.useElectronProxy) {
        response = await this.callViaElectron({ apiBase, apiKey, model, messages, temperature, timeout })
      } else {
        response = await this.callViaFetch({ apiBase, apiKey, model, messages, temperature, maxTokens, timeout })
      }

      const duration = Date.now() - startTime
      this.updateMetrics(duration, true)
      this.saveToCache(cacheKey, response)

      return response
    } catch (error: any) {
      const duration = Date.now() - startTime
      this.updateMetrics(duration, false)
      throw this.normalizeError(error)
    }
  }

  async fetchModels(apiBase: string, apiKey: string): Promise<string[]> {
    if (!apiBase || !apiKey) {
      throw new LLMError('Missing API credentials', 'AUTH')
    }

    try {
      if (this.useElectronProxy) {
        const data = await (window as any).electronAPI.llmFetchModels({ apiBase, apiKey })
        return this.extractModelIds(data)
      }

      const baseUrl = apiBase.trim().replace(/\/$/, '')
      const response = await fetch(`${baseUrl}/models`, {
        method: 'GET',
        headers: this.buildHeaders(apiBase, apiKey),
      })

      if (!response.ok) {
        throw new LLMError(`HTTP ${response.status}`, 'NETWORK', { status: response.status })
      }

      const data: ModelsResponse = await response.json()
      return this.extractModelIds(data)
    } catch (error: any) {
      throw this.normalizeError(error)
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
      onProgress?.((i / items.length))

      try {
        const batchResults = await batchFn(batch)
        results.push(...batchResults)
      } catch (error: any) {
        console.error('[LLMService] Batch analysis failed:', error)
        results.push(...batch)
      }

      await this.delay(LLM_DEFAULTS.BATCH_DELAY)
    }

    onProgress?.(1)
    return results
  }

  private async callViaElectron(options: LLMCallOptions): Promise<LLMResponse> {
    const data = await (window as any).electronAPI.llmCall({
      apiBase: options.apiBase.trim(),
      apiKey: options.apiKey.trim(),
      model: options.model,
      messages: options.messages,
      temperature: options.temperature,
    })

    if (!data.choices?.[0]?.message) {
      throw new LLMError('Invalid response format', 'PARSE', { data })
    }

    return data
  }

  private async callViaFetch(options: LLMCallOptions): Promise<LLMResponse> {
    const baseUrl = options.apiBase.trim().replace(/\/$/, '')
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), options.timeout)

    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: this.buildHeaders(options.apiBase, options.apiKey),
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

  private buildHeaders(apiBase: string, apiKey: string): Record<string, string> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }

    if (apiBase.includes('openai.azure.com')) {
      headers['api-key'] = apiKey
    } else {
      headers['Authorization'] = `Bearer ${apiKey}`
    }

    return headers
  }

  private extractModelIds(data: ModelsResponse): string[] {
    if (!data.data || !Array.isArray(data.data)) {
      throw new LLMError('Invalid models response', 'PARSE', { data })
    }

    return data.data
      .map(model => model.id)
      .filter(id => id && id.trim())
      .sort()
  }

  private normalizeError(error: any): LLMError {
    if (error instanceof LLMError) return error

    if (error.name === 'AbortError') {
      return new LLMError('Request timeout', 'TIMEOUT')
    }

    if (error.message?.includes('fetch')) {
      return new LLMError('Network error', 'NETWORK', { original: error.message })
    }

    return new LLMError(error.message || 'Unknown error', 'UNKNOWN', { original: error })
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  private getCacheKey(options: LLMCallOptions): string {
    const { apiBase, model, messages, temperature } = options
    const messagesStr = JSON.stringify(messages)
    return `${apiBase}:${model}:${temperature}:${messagesStr}`
  }

  private getFromCache(key: string): LLMResponse | null {
    const entry = this.cache.get(key)
    if (!entry) return null

    if (Date.now() - entry.timestamp > this.CACHE_TTL) {
      this.cache.delete(key)
      return null
    }

    return entry.response
  }

  private saveToCache(key: string, response: LLMResponse): void {
    this.cache.set(key, { response, timestamp: Date.now() })
    
    if (this.cache.size > 100) {
      const firstKey = this.cache.keys().next().value
      if (firstKey) this.cache.delete(firstKey)
    }
  }

  private updateMetrics(duration: number, success: boolean): void {
    if (success) {
      this.metrics.successfulCalls++
    } else {
      this.metrics.failedCalls++
    }

    this.metrics.totalDuration += duration
    this.metrics.averageResponseTime = this.metrics.totalDuration / this.metrics.totalCalls
    this.metrics.failureRate = this.metrics.failedCalls / this.metrics.totalCalls
  }

  private async checkRateLimit(): Promise<void> {
    const now = Date.now()
    const timeSinceLastRefill = now - this.rateLimitState.lastRefill
    const refillIntervals = Math.floor(timeSinceLastRefill / this.RATE_LIMIT_REFILL_INTERVAL)

    if (refillIntervals > 0) {
      this.rateLimitState.tokens = Math.min(
        this.RATE_LIMIT_MAX_TOKENS,
        this.rateLimitState.tokens + refillIntervals * this.RATE_LIMIT_REFILL_RATE
      )
      this.rateLimitState.lastRefill = now
    }

    if (this.rateLimitState.tokens < 1) {
      const waitTime = this.RATE_LIMIT_REFILL_INTERVAL - (now - this.rateLimitState.lastRefill)
      console.warn(`[LLMService] Rate limit exceeded, waiting ${waitTime}ms`)
      await this.delay(waitTime)
      return this.checkRateLimit()
    }

    this.rateLimitState.tokens -= 1
  }

  async callStreaming(
    options: LLMCallOptions,
    onChunk: (chunk: string) => void
  ): Promise<void> {
    const { apiBase, apiKey, model, messages, temperature = LLM_DEFAULTS.TEMPERATURE } = options

    if (!apiBase || !apiKey) {
      throw new LLMError('Missing API credentials', 'AUTH')
    }

    await this.checkRateLimit()

    const baseUrl = apiBase.trim().replace(/\/$/, '')
    const headers = this.buildHeaders(apiBase, apiKey)

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        messages,
        temperature,
        stream: true,
      }),
    })

    if (!response.ok) {
      throw new LLMError(`HTTP ${response.status}`, 'NETWORK', { status: response.status })
    }

    const reader = response.body?.getReader()
    if (!reader) {
      throw new LLMError('No response body', 'NETWORK')
    }

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

  getMetrics(): PerformanceMetrics {
    return { ...this.metrics }
  }

  clearCache(): void {
    this.cache.clear()
  }

  resetMetrics(): void {
    this.metrics = {
      totalCalls: 0,
      successfulCalls: 0,
      failedCalls: 0,
      totalDuration: 0,
      averageResponseTime: 0,
      failureRate: 0,
    }
  }
}

export const llmService = new LLMService()
