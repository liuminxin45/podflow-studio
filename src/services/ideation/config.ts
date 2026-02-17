/**
 * Ideation Configuration Manager
 * 统一管理构思层的配置读取逻辑
 */

export interface LLMConfig {
  apiBase: string
  apiKey: string
  model: string
  temperature?: number
  timeout?: number
}

export interface UserPreferences {
  tone_style?: 'rational' | 'emotional' | 'balanced'
  content_tendency?: 'news' | 'story' | 'mixed'
  duration_preference?: 'short' | 'medium' | 'long'
}

export type IdeationChallenge = 'normal' | 'critical' | 'reverse'

class IdeationConfigManager {
  /**
   * 从 localStorage 加载设置
   */
  private loadSettings(): any | null {
    try {
      if (typeof window === 'undefined') return null
      
      const settingsStr = localStorage.getItem('auto-podcast.settings.v1')
      if (!settingsStr) return null
      
      return JSON.parse(settingsStr)
    } catch (error) {
      console.error('[IdeationConfig] Failed to load settings:', error)
      return null
    }
  }

  /**
   * 获取 LLM 配置
   */
  getLLMConfig(): LLMConfig | null {
    const settings = this.loadSettings()
    if (!settings) return null
    
    const ideateNode = settings?.apiConfig?.nodeOverrides?.ideate
    
    if (ideateNode?.overrideMode === 'custom' && ideateNode.apiKeySet) {
      return {
        apiBase: ideateNode.apiBase || 'https://api.openai.com/v1',
        apiKey: ideateNode.apiKey,
        model: ideateNode.apiModel || 'gpt-4o-mini',
      }
    }
    
    const globalConfig = settings?.apiConfig?.global
    if (globalConfig?.textApiKeySet && globalConfig?.textApiKey) {
      return {
        apiBase: globalConfig.textApiBase || 'https://api.openai.com/v1',
        apiKey: globalConfig.textApiKey,
        model: globalConfig.textApiModel || 'gpt-4o-mini',
      }
    }
    
    return null
  }

  /**
   * 获取用户偏好
   */
  getUserPreferences(): UserPreferences | undefined {
    const settings = this.loadSettings()
    if (!settings?.creatorPreferences) return undefined
    
    return {
      tone_style: settings.creatorPreferences.toneStyle,
      content_tendency: settings.creatorPreferences.contentTendency,
      duration_preference: settings.creatorPreferences.durationPreference,
    }
  }

  /**
   * 获取构思挑战模式
   */
  getIdeationChallenge(): IdeationChallenge {
    const settings = this.loadSettings()
    return settings?.nodeBehavior?.ideationChallenge || 'normal'
  }

  /**
   * 检查 LLM 是否可用
   */
  isLLMAvailable(): boolean {
    return this.getLLMConfig() !== null
  }
}

export const ideationConfigManager = new IdeationConfigManager()
