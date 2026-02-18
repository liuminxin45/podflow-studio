import { settingsRepository } from './repository'
import type { StageId } from '../../types/settings'

export interface LLMConfig {
  apiBase: string
  apiKey: string
  model: string
  temperature?: number
  timeout?: number
}

export interface AudioProviderConfig {
  provider: 'openai_compatible' | 'doubao_tts' | 'voice_clone'
  apiBase: string
  apiKey: string
  model: string
  requestTimeoutSec: number
  doubaoAppId: string
  doubaoAccessToken: string
  doubaoCluster: string
  doubaoVoiceType: string
  doubaoEndpoint: string
}

export class LLMConfigResolver {
  getLLMConfig(nodeId: StageId): LLMConfig | null {
    const settings = settingsRepository.load()
    const nodeConfig = settings.apiConfig.nodeOverrides[nodeId]

    if (nodeConfig?.overrideMode === 'custom' && nodeConfig.apiKeySet && nodeConfig.apiKey) {
      return {
        apiBase: nodeConfig.apiBase || 'https://api.openai.com/v1',
        apiKey: nodeConfig.apiKey,
        model: nodeConfig.apiModel || 'gpt-4o-mini',
      }
    }

    const capabilityType = nodeConfig?.capabilityType || 'text'
    const global = settings.apiConfig.global

    if (capabilityType === 'audio') {
      if (global.audioApiKeySet && global.audioApiKey) {
        return {
          apiBase: global.audioApiBase || 'https://api.openai.com/v1',
          apiKey: global.audioApiKey,
          model: global.audioApiModel || 'gpt-4o-mini',
        }
      }
    }

    if (capabilityType === 'search') {
      if (global.searchApiKeySet && global.searchApiKey) {
        return {
          apiBase: global.searchApiBase || 'https://api.openai.com/v1',
          apiKey: global.searchApiKey,
          model: global.searchApiModel || 'gpt-4o-mini',
        }
      }
    }

    if (global.textApiKeySet && global.textApiKey) {
      return {
        apiBase: global.textApiBase || 'https://api.openai.com/v1',
        apiKey: global.textApiKey,
        model: global.textApiModel || 'gpt-4o-mini',
      }
    }

    return null
  }

  getAudioProviderConfig(): AudioProviderConfig {
    const settings = settingsRepository.load()
    const produceNode = settings.apiConfig.nodeOverrides.produce
    const global = settings.apiConfig.global

    const fallback: AudioProviderConfig = {
      provider: 'openai_compatible',
      apiBase: 'https://api.openai.com/v1',
      apiKey: '',
      model: '',
      requestTimeoutSec: 60,
      doubaoAppId: '',
      doubaoAccessToken: '',
      doubaoCluster: 'volcano_tts',
      doubaoVoiceType: 'zh_female_shuangkuaisisi_moon_bigtts',
      doubaoEndpoint: 'https://openspeech.bytedance.com/api/v1/tts',
    }

    if (produceNode?.overrideMode === 'custom' && produceNode.apiKeySet && produceNode.apiKey) {
      const provider = String(global.audioProvider || 'openai_compatible')
      return {
        provider: (provider === 'doubao_tts' || provider === 'voice_clone') ? provider as any : 'openai_compatible',
        apiBase: String(produceNode.apiBase || fallback.apiBase).trim(),
        apiKey: String(produceNode.apiKey || '').trim(),
        model: String(produceNode.apiModel || '').trim(),
        requestTimeoutSec: 60,
        doubaoAppId: String(global.audioDoubaoAppId || '').trim(),
        doubaoAccessToken: String(global.audioDoubaoAccessToken || '').trim(),
        doubaoCluster: String(global.audioDoubaoCluster || fallback.doubaoCluster).trim(),
        doubaoVoiceType: String(global.audioDoubaoVoiceType || fallback.doubaoVoiceType).trim(),
        doubaoEndpoint: String(global.audioDoubaoEndpoint || fallback.doubaoEndpoint).trim(),
      }
    }

    if (global.audioApiKeySet && global.audioApiKey) {
      return {
        provider: global.audioProvider || 'openai_compatible',
        apiBase: String(global.audioApiBase || fallback.apiBase).trim(),
        apiKey: String(global.audioApiKey || '').trim(),
        model: String(global.audioApiModel || '').trim(),
        requestTimeoutSec: 60,
        doubaoAppId: String(global.audioDoubaoAppId || '').trim(),
        doubaoAccessToken: String(global.audioDoubaoAccessToken || '').trim(),
        doubaoCluster: String(global.audioDoubaoCluster || fallback.doubaoCluster).trim(),
        doubaoVoiceType: String(global.audioDoubaoVoiceType || fallback.doubaoVoiceType).trim(),
        doubaoEndpoint: String(global.audioDoubaoEndpoint || fallback.doubaoEndpoint).trim(),
      }
    }

    if (global.textApiKeySet && global.textApiKey) {
      return {
        provider: global.audioProvider || 'openai_compatible',
        apiBase: String(global.textApiBase || fallback.apiBase).trim(),
        apiKey: String(global.textApiKey || '').trim(),
        model: String(global.textApiModel || '').trim(),
        requestTimeoutSec: 60,
        doubaoAppId: String(global.audioDoubaoAppId || '').trim(),
        doubaoAccessToken: String(global.audioDoubaoAccessToken || '').trim(),
        doubaoCluster: String(global.audioDoubaoCluster || fallback.doubaoCluster).trim(),
        doubaoVoiceType: String(global.audioDoubaoVoiceType || fallback.doubaoVoiceType).trim(),
        doubaoEndpoint: String(global.audioDoubaoEndpoint || fallback.doubaoEndpoint).trim(),
      }
    }

    return fallback
  }

  isLLMAvailable(nodeId: StageId): boolean {
    return this.getLLMConfig(nodeId) !== null
  }
}

export const llmConfigResolver = new LLMConfigResolver()
