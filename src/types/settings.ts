// ============================================================
// Settings Page Types
// ============================================================

export type TextMode = 'standard' | 'deep' | 'quality'
export type CostQualityBalance = 'cost' | 'balanced' | 'quality'
// --- API Configuration Center ---

export type NodeCapabilityType = 'search' | 'text' | 'reasoning' | 'compliance' | 'audio'
export type NodeOverrideMode = 'global' | 'custom'
export type APIConnectionStatus = 'untested' | 'testing' | 'connected' | 'failed'
export type AudioProvider = 'edge-tts' | 'openai-compatible'

export interface NodeAPIConfig {
  overrideMode: NodeOverrideMode
  capabilityType: NodeCapabilityType
  apiKey: string
  apiKeySet: boolean
  apiKeyMasked: string
  apiBase: string
  apiModel: string
  connectionStatus: APIConnectionStatus
  mode: TextMode
  balance: CostQualityBalance
}

export interface GlobalAPIConfig {
  textApiKey: string
  textApiKeySet: boolean
  textApiKeyMasked: string
  textApiBase: string
  textApiModel: string
  textConnectionStatus: APIConnectionStatus
  searchApiKey: string
  searchApiKeySet: boolean
  searchApiKeyMasked: string
  searchApiBase: string
  searchApiModel: string
  searchConnectionStatus: APIConnectionStatus
  audioApiKey: string
  audioApiKeySet: boolean
  audioApiKeyMasked: string
  audioApiBase: string
  audioApiModel: string
  audioProvider: AudioProvider
  audioConnectionStatus: APIConnectionStatus
  audioProvider: 'openai_compatible' | 'doubao_tts' | 'voice_clone'
  audioDoubaoAppId: string
  audioDoubaoAccessToken: string
  audioDoubaoCluster: string
  audioDoubaoVoiceType: string
  audioDoubaoEndpoint: string
}

export type StageId = 'discover' | 'organize' | 'ideate' | 'write' | 'produce' | 'publish'

export interface APIConfig {
  global: GlobalAPIConfig
  nodeOverrides: Record<StageId, NodeAPIConfig>
}

// --- Settings Root ---

export interface AppSettings {
  apiConfig: APIConfig
}

export type SettingsSection =
  | 'capability'
  | 'node-behavior'
  | 'creator-preferences'
  | 'system'
  | 'api-config'
  | 'analytics'
  | 'growth'
  | 'logs'

export const DEFAULT_NODE_API_CONFIG: NodeAPIConfig = {
  overrideMode: 'global',
  capabilityType: 'text',
  apiKey: '',
  apiKeySet: false,
  apiKeyMasked: '',
  apiBase: '',
  apiModel: '',
  connectionStatus: 'untested',
  mode: 'standard',
  balance: 'balanced',
}

export const DEFAULT_SETTINGS: AppSettings = {
  apiConfig: {
    global: {
      textApiKey: '',
      textApiKeySet: false,
      textApiKeyMasked: '',
      textApiBase: 'https://api.openai.com/v1',
      textApiModel: '',
      textConnectionStatus: 'untested',
      searchApiKey: '',
      searchApiKeySet: false,
      searchApiKeyMasked: '',
      searchApiBase: '',
      searchApiModel: '',
      searchConnectionStatus: 'untested',
      audioApiKey: '',
      audioApiKeySet: false,
      audioApiKeyMasked: '',
      audioApiBase: '',
      audioApiModel: 'tts-1',
      audioProvider: 'edge-tts',
      audioConnectionStatus: 'untested',
      audioProvider: 'doubao_tts',
      audioDoubaoAppId: '',
      audioDoubaoAccessToken: '',
      audioDoubaoCluster: 'volcano_tts',
      audioDoubaoVoiceType: 'zh_female_shuangkuaisisi_moon_bigtts',
      audioDoubaoEndpoint: 'https://openspeech.bytedance.com/api/v1/tts',
    },
    nodeOverrides: {
      discover: { ...DEFAULT_NODE_API_CONFIG, capabilityType: 'search' },
      organize: { ...DEFAULT_NODE_API_CONFIG, capabilityType: 'text' },
      ideate: { ...DEFAULT_NODE_API_CONFIG, capabilityType: 'reasoning' },
      write: { ...DEFAULT_NODE_API_CONFIG, capabilityType: 'text' },
      produce: { ...DEFAULT_NODE_API_CONFIG, capabilityType: 'audio' },
      publish: { ...DEFAULT_NODE_API_CONFIG, capabilityType: 'compliance' },
    },
  },
}
