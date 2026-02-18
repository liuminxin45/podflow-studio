import type { ContentCreationType } from '../../types/workflow'

export interface WritingLLMTuning {
  temperature?: number
  timeout?: number
  maxTokens?: number
}

export interface ResolvedWritingLLMTuning {
  temperature: number
  timeout: number
  maxTokens: number
}

const DEFAULT_TUNING_BY_TYPE: Record<ContentCreationType, ResolvedWritingLLMTuning> = {
  story: {
    temperature: 0.6,
    timeout: 120000,
    maxTokens: 1200,
  },
  news_brief: {
    temperature: 0.2,
    timeout: 90000,
    maxTokens: 1200,
  },
}

export function resolveWritingLLMTuning(
  contentType: ContentCreationType,
  tuning?: WritingLLMTuning,
): ResolvedWritingLLMTuning {
  const defaults = DEFAULT_TUNING_BY_TYPE[contentType] || DEFAULT_TUNING_BY_TYPE.story

  return {
    temperature: typeof tuning?.temperature === 'number' ? tuning.temperature : defaults.temperature,
    timeout: typeof tuning?.timeout === 'number' ? Math.max(10000, Math.round(tuning.timeout)) : defaults.timeout,
    maxTokens: typeof tuning?.maxTokens === 'number' ? Math.max(128, Math.round(tuning.maxTokens)) : defaults.maxTokens,
  }
}

export function getDefaultWritingLLMTuning(contentType: ContentCreationType): ResolvedWritingLLMTuning {
  return { ...resolveWritingLLMTuning(contentType) }
}
