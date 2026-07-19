import { llmService } from '../services/llmService'
import { LLMError } from '../types/llm'

export async function fetchModels(
  apiBase: string,
  apiKey: string,
  providerKind = 'openai_compatible',
  apiKeyEnvVar?: string,
): Promise<string[]> {
  try {
    return await llmService.fetchModels(apiBase, apiKey, providerKind, apiKeyEnvVar)
  } catch (error: any) {
    console.error('[ModelFetcher] Error:', error)
    if (error instanceof LLMError) {
      throw error
    }
    throw new LLMError(error.message || 'Failed to fetch models', 'UNKNOWN', { original: error })
  }
}

export function getDefaultModels(apiBase: string): string[] {
  const base = apiBase.toLowerCase()
  
  if (base.includes('openai.com') || !apiBase) {
    return [
      'gpt-4o',
      'gpt-4o-mini',
      'gpt-4-turbo',
      'gpt-4',
      'gpt-3.5-turbo'
    ]
  }
  
  if (base.includes('anthropic.com')) {
    return [
      'claude-3-5-sonnet-20241022',
      'claude-3-opus-20240229',
      'claude-3-sonnet-20240229',
      'claude-3-haiku-20240307'
    ]
  }
  
  return [
    'gpt-4o-mini',
    'gpt-4o',
    'gpt-3.5-turbo'
  ]
}

class ModelCache {
  private cache: Map<string, { models: string[], timestamp: number }> = new Map()
  private readonly TTL = 5 * 60 * 1000

  getCacheKey(apiBase: string, apiKey: string, providerKind = 'openai_compatible', apiKeyEnvVar = ''): string {
    return `${providerKind}_${apiBase}_${apiKeyEnvVar || apiKey.substring(0, 8)}`
  }

  get(apiBase: string, apiKey: string, providerKind = 'openai_compatible', apiKeyEnvVar = ''): string[] | null {
    const key = this.getCacheKey(apiBase, apiKey, providerKind, apiKeyEnvVar)
    const cached = this.cache.get(key)
    
    if (!cached) return null
    
    if (Date.now() - cached.timestamp > this.TTL) {
      this.cache.delete(key)
      return null
    }
    
    return cached.models
  }

  set(apiBase: string, apiKey: string, models: string[], providerKind = 'openai_compatible', apiKeyEnvVar = ''): void {
    const key = this.getCacheKey(apiBase, apiKey, providerKind, apiKeyEnvVar)
    this.cache.set(key, {
      models,
      timestamp: Date.now()
    })
  }

  clear(): void {
    this.cache.clear()
  }
}

export const modelCache = new ModelCache()

export async function fetchModelsWithCache(
  apiBase: string,
  apiKey: string,
  providerKind = 'openai_compatible',
  apiKeyEnvVar?: string,
): Promise<string[]> {
  if (!apiBase || (!apiKey && !apiKeyEnvVar)) {
    return getDefaultModels(apiBase)
  }

  const cached = modelCache.get(apiBase, apiKey, providerKind, apiKeyEnvVar)
  if (cached) {
    return cached
  }

  try {
    const models = await fetchModels(apiBase, apiKey, providerKind, apiKeyEnvVar)
    modelCache.set(apiBase, apiKey, models, providerKind, apiKeyEnvVar)
    return models
  } catch (error) {
    console.warn('[ModelFetcher] Failed, using defaults:', error)
    return getDefaultModels(apiBase)
  }
}
