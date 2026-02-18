import { llmConfigResolver, type LLMConfig } from '../settings/llmConfigResolver'

export type { LLMConfig }

export interface UserPreferences {
  tone_style?: 'rational' | 'emotional' | 'balanced'
  content_tendency?: 'news' | 'story' | 'mixed'
  duration_preference?: 'short' | 'medium' | 'long'
}

export type IdeationChallenge = 'normal' | 'critical' | 'reverse'

class IdeationConfigManager {
  getLLMConfig(): LLMConfig | null {
    return llmConfigResolver.getLLMConfig('ideate')
  }

  getUserPreferences(): UserPreferences | undefined {
    return {
      tone_style: 'rational',
      content_tendency: 'news',
      duration_preference: 'medium',
    }
  }

  getIdeationChallenge(): IdeationChallenge {
    return 'normal'
  }

  isLLMAvailable(): boolean {
    return llmConfigResolver.isLLMAvailable('ideate')
  }
}

export const ideationConfigManager = new IdeationConfigManager()
