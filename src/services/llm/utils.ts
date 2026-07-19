import type { LLMCallOptions, ModelsResponse } from '../../types/llm'
import { LLMError } from '../../types/llm'

export function normalizeUrl(url: string): string {
  return url.trim().replace(/\/$/, '')
}

export function validateCredentials(apiBase: string, apiKey: string): void {
  if (!apiBase || !apiKey) {
    throw new LLMError('Missing API credentials', 'AUTH')
  }
}

export function buildHeaders(apiBase: string, apiKey: string): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }

  if (apiBase.includes('openai.azure.com')) {
    headers['api-key'] = apiKey
  } else {
    headers['Authorization'] = `Bearer ${apiKey}`
  }

  return headers
}

export function extractModelIds(data: ModelsResponse): string[] {
  if (!data.data || !Array.isArray(data.data)) {
    throw new LLMError('Invalid models response', 'PARSE', { data })
  }

  return data.data
    .map(model => model.id)
    .filter(id => id && id.trim())
    .sort()
}

export function normalizeError(error: any): LLMError {
  if (error instanceof LLMError) return error

  if (error.name === 'AbortError') {
    return new LLMError('Request timeout', 'TIMEOUT')
  }

  if (error.message?.includes('fetch')) {
    return new LLMError('Network error', 'NETWORK', { original: error.message })
  }

  return new LLMError(error.message || 'Unknown error', 'UNKNOWN', { original: error })
}

export function getCacheKey(options: LLMCallOptions): string {
  const { apiBase, model, providerKind, messages, temperature } = options
  const messagesStr = JSON.stringify(messages)
  return `${providerKind || 'openai_compatible'}:${apiBase}:${model}:${temperature}:${messagesStr}`
}

export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
