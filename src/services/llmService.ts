import type { LLMAgentStreamEvent, LLMCallOptions, LLMResponse, PerformanceMetrics } from '../types/llm'
import { LLMError } from '../types/llm'
import { LLM_DEFAULTS } from '../constants/llm'
import { LRUCache } from './llm/cache'
import { TokenBucketRateLimiter } from './llm/rateLimit'
import { MetricsCollector } from './llm/metrics'
import {
  normalizeUrl,
  validateCredentials,
  extractModelIds,
  normalizeError,
  getCacheKey,
  delay,
} from './llm/utils'

class LLMService {
  private cache: LRUCache
  private rateLimiter: TokenBucketRateLimiter
  private metricsCollector: MetricsCollector
  private debugMode = false

  private createRequestId(): string {
    return `llm-${Date.now()}-${Math.random().toString(36).slice(2)}`
  }

  private abortError(signal: AbortSignal): Error {
    if (signal.reason instanceof Error) return signal.reason
    if (signal.reason && typeof signal.reason === 'object' && 'message' in signal.reason) {
      const reason = signal.reason as { message?: unknown; name?: unknown }
      return new DOMException(String(reason.message || '请求已取消'), String(reason.name || 'AbortError'))
    }
    return new DOMException('请求已取消', 'AbortError')
  }

  private resolveRequestTimeout(timeout?: number, extraMs = 0): number {
    const requestedTimeout = typeof timeout === 'number' ? timeout : LLM_DEFAULTS.TIMEOUT
    return Math.max(10000, Math.min(240000, requestedTimeout + extraMs))
  }

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

  setDebugMode(enabled: boolean): void {
    this.debugMode = enabled
    console.info('[LLMService] Debug mode', enabled ? 'ENABLED' : 'DISABLED')
  }

  async call(options: LLMCallOptions): Promise<LLMResponse> {
    if (options.signal?.aborted) throw this.abortError(options.signal)
    let adjustedOptions = { ...options }

    if (this.debugMode) {
      adjustedOptions = this.applyMinimalMode(adjustedOptions)
    }

    const {
      apiBase,
      apiKey,
      model,
      providerKind,
      messages,
      temperature = LLM_DEFAULTS.TEMPERATURE,
      maxTokens,
      timeout = LLM_DEFAULTS.TIMEOUT,
    } = adjustedOptions

    if (!this.hasRuntimeCredentials(adjustedOptions)) {
      validateCredentials(apiBase, apiKey)
    }
    await this.rateLimiter.acquire()

    const useCache = adjustedOptions.cacheMode !== 'bypass'
    const cacheKey = getCacheKey(adjustedOptions)
    if (useCache) {
      const cached = this.cache.get(cacheKey)
      if (cached) {
        console.log('[LLMService] Cache hit')
        return cached
      }
    }

    const startTime = Date.now()
    const useElectronProxy = this.shouldUseElectronLLMCall()
    console.info('[LLMService] call start', {
      model,
      useElectronProxy,
      timeout,
      maxTokens,
      messageCount: messages.length,
    })

    try {
      if (!useElectronProxy) {
        throw new LLMError('LLM Gateway requires Electron IPC', 'CONFIG')
      }

      const response = await this.callViaElectron({
        apiBase,
        apiKey,
        apiKeyEnvVar: adjustedOptions.apiKeyEnvVar,
        model,
        providerKind,
        localAgentId: adjustedOptions.localAgentId,
        localAgentCommand: adjustedOptions.localAgentCommand,
        localAgentArgs: adjustedOptions.localAgentArgs,
        localAgentOutputMode: adjustedOptions.localAgentOutputMode,
        aiTarget: adjustedOptions.aiTarget,
        messages,
        temperature,
        maxTokens,
        timeout,
      })

      const duration = Date.now() - startTime
      this.metricsCollector.recordCall(duration, true)
      if (useCache) this.cache.set(cacheKey, response)
      console.info('[LLMService] call success', { model, duration })

      return response
    } catch (error: any) {
      const duration = Date.now() - startTime
      this.metricsCollector.recordCall(duration, false)
      console.error('[LLMService] call failed', {
        model,
        duration,
        timeout,
        useElectronProxy,
        message: error?.message,
      })
      throw normalizeError(error)
    }
  }

  async fetchModels(
    apiBase: string,
    apiKey: string,
    providerKind = 'openai_compatible',
    apiKeyEnvVar?: string,
  ): Promise<string[]> {
    if (!apiBase || (!apiKey && !apiKeyEnvVar)) {
      validateCredentials(apiBase, apiKey)
    }

    try {
      if (!this.shouldUseElectronModelFetch()) {
        throw new LLMError('LLM Gateway requires Electron IPC', 'CONFIG')
      }
      const data = await (window as any).electronAPI.llmFetchModels({ apiBase, apiKey, apiKeyEnvVar, providerKind })
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
    onChunk: (chunk: string) => void,
    onEvent?: (event: LLMAgentStreamEvent) => void
  ): Promise<void> {
    const {
      apiBase,
      apiKey,
      model,
      messages,
      temperature = LLM_DEFAULTS.TEMPERATURE,
      maxTokens,
      timeout = LLM_DEFAULTS.STREAMING_TIMEOUT,
    } = options

    if (!this.hasRuntimeCredentials(options)) {
      validateCredentials(apiBase, apiKey)
    }
    const localAgentCall = this.isLocalAgentCall(options)
    await this.rateLimiter.acquire()

    const api = typeof window !== 'undefined' ? (window as any).electronAPI : null
    if (!api?.llmCall || !api?.onLLMStreamChunk || !api?.onLLMStreamDone || !api?.onLLMStreamError) {
      throw new LLMError('LLM Gateway streaming requires Electron IPC', 'CONFIG')
    }

    const requestId = this.createRequestId()
    const requestTimeout = this.resolveRequestTimeout(timeout)
    await new Promise<void>((resolve, reject) => {
      let settled = false
      let timer: ReturnType<typeof setTimeout> | null = null
      const cleanup = () => {
        if (timer) clearTimeout(timer)
        options.signal?.removeEventListener('abort', handleAbort)
        api.removeLLMStreamListeners?.()
      }
      const settle = (error?: unknown) => {
        if (settled) return
        settled = true
        cleanup()
        if (error) reject(error)
        else resolve()
      }
      const cancelMainRequest = () => {
        void api.llmCancel?.(requestId).catch(() => undefined)
      }
      const handleAbort = () => {
        cancelMainRequest()
        settle(this.abortError(options.signal!))
      }

      if (options.signal?.aborted) {
        handleAbort()
        return
      }
      options.signal?.addEventListener('abort', handleAbort, { once: true })
      timer = setTimeout(() => {
        cancelMainRequest()
        settle(new LLMError(`请求超时（${Math.ceil(requestTimeout / 1000)}秒）`, 'TIMEOUT', { timeout: requestTimeout }))
      }, requestTimeout)
      api.onLLMStreamEvent?.((event: LLMAgentStreamEvent) => onEvent?.(event))
      api.onLLMStreamChunk((chunk: string) => onChunk(chunk))
      api.onLLMStreamDone(() => settle())
      api.onLLMStreamError((error: string) => {
        settle(new LLMError(error || 'LLM stream failed', 'PROVIDER'))
      })

      api.llmCall({
        requestId,
        apiBase: localAgentCall ? apiBase : normalizeUrl(apiBase),
        apiKey: localAgentCall ? apiKey : apiKey.trim(),
        apiKeyEnvVar: options.apiKeyEnvVar,
        model,
        providerKind: options.providerKind,
        localAgentId: options.localAgentId,
        localAgentCommand: options.localAgentCommand,
        localAgentArgs: options.localAgentArgs,
        localAgentOutputMode: options.localAgentOutputMode,
        aiTarget: options.aiTarget,
        messages,
        temperature,
        maxTokens,
        timeout,
        stream: true,
      }).catch((error: any) => {
        settle(normalizeError(error))
      })
    })
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

  private applyMinimalMode(options: LLMCallOptions): LLMCallOptions {
    return {
      ...options,
      maxTokens: Math.min(options.maxTokens || 200, 200),
      messages: options.messages.map(msg => ({
        ...msg,
        content: this.truncateToMinimal(msg.content),
      })),
    }
  }

  private truncateToMinimal(content: string): string {
    if (content.length <= 150) return content
    return content.slice(0, 150)
  }

  private shouldUseElectronLLMCall(): boolean {
    return typeof window !== 'undefined' && !!(window as any).electronAPI?.llmCall
  }

  private shouldUseElectronModelFetch(): boolean {
    return typeof window !== 'undefined' && !!(window as any).electronAPI?.llmFetchModels
  }

  private isLocalAgentCall(options: LLMCallOptions): boolean {
    return options.providerKind === 'local_agent' || options.apiBase.startsWith('local-agent://')
  }

  private hasRuntimeCredentials(options: LLMCallOptions): boolean {
    if (this.isLocalAgentCall(options)) return true
    return Boolean(options.apiBase && (options.apiKey || options.apiKeyEnvVar))
  }

  private async callViaElectron(options: LLMCallOptions): Promise<LLMResponse> {
    const requestId = this.createRequestId()
    const ipcTimeout = this.resolveRequestTimeout(options.timeout, 2000)
    const ipcCall = (window as any).electronAPI.llmCall({
      requestId,
      apiBase: this.isLocalAgentCall(options) ? options.apiBase : normalizeUrl(options.apiBase),
      apiKey: this.isLocalAgentCall(options) ? options.apiKey : options.apiKey.trim(),
      apiKeyEnvVar: options.apiKeyEnvVar,
      model: options.model,
      providerKind: options.providerKind,
      localAgentId: options.localAgentId,
      localAgentCommand: options.localAgentCommand,
      localAgentArgs: options.localAgentArgs,
      localAgentOutputMode: options.localAgentOutputMode,
      aiTarget: options.aiTarget,
      messages: options.messages,
      temperature: options.temperature,
      maxTokens: options.maxTokens,
      timeout: options.timeout,
    })

    let timer: ReturnType<typeof setTimeout> | null = null
    let abortHandler: (() => void) | null = null
    const timeoutGuard = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        void (window as any).electronAPI.llmCancel?.(requestId).catch(() => undefined)
        reject(new LLMError(`Electron IPC timeout (${ipcTimeout}ms)`, 'TIMEOUT', { timeout: ipcTimeout }))
      }, ipcTimeout)
    })
    const abortGuard = new Promise<never>((_, reject) => {
      if (!options.signal) return
      abortHandler = () => {
        void (window as any).electronAPI.llmCancel?.(requestId).catch(() => undefined)
        reject(this.abortError(options.signal!))
      }
      if (options.signal.aborted) abortHandler()
      else options.signal.addEventListener('abort', abortHandler, { once: true })
    })

    let data: LLMResponse
    try {
      data = await Promise.race([ipcCall, timeoutGuard, abortGuard])
    } finally {
      if (timer) {
        clearTimeout(timer)
      }
      if (abortHandler) options.signal?.removeEventListener('abort', abortHandler)
    }

    if (!data.choices?.[0]?.message) {
      throw new LLMError('Invalid response format', 'PARSE', { data })
    }

    return data
  }
}

export const llmService = new LLMService()
