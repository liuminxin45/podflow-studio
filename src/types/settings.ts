// ============================================================
// Settings Page Types
// ============================================================

export type TextMode = 'standard' | 'deep' | 'quality'
export type CostQualityBalance = 'cost' | 'balanced' | 'quality'
export type SearchIntensity = 'light' | 'standard' | 'deep'
export type SearchLanguage = 'zh' | 'en' | 'auto'
export type AudioQuality = 'standard' | 'high' | 'ultra'
export type ComplianceStrictness = 'relaxed' | 'standard' | 'strict'
export type ReminderIntensity = 'gentle' | 'standard' | 'strong'
export type AIAssistLevel = 'light' | 'standard' | 'deep'
export type PublishFlowMode = 'smart' | 'quick' | 'remember'
export type IdeationChallenge = 'normal' | 'critical' | 'reverse'
export type ToneStyle = 'rational' | 'calm' | 'passionate' | 'latenight'
export type ContentTendency = 'news' | 'commentary' | 'analysis' | 'narrative'
export type DurationPreference = 'short' | 'medium' | 'long'
export type RetentionPolicy = 'local' | 'archive' | 'delete'
// --- API Configuration Center ---

export type NodeCapabilityType = 'search' | 'text' | 'reasoning' | 'compliance' | 'audio'
export type NodeOverrideMode = 'global' | 'custom'
export type APIConnectionStatus = 'untested' | 'testing' | 'connected' | 'failed'
export type AudioProvider = 'edge-tts' | 'openai-compatible'

export interface SearchCapabilitySettings {
  intensity: SearchIntensity
  language: SearchLanguage
  resultRange: [number, number]
}

export interface TextCapabilitySettings {
  mode: TextMode
  balance: CostQualityBalance
}

export interface AudioCapabilitySettings {
  defaultVoice: string
  quality: AudioQuality
}

export interface ComplianceCapabilitySettings {
  strictness: ComplianceStrictness
  reminderIntensity: ReminderIntensity
}

export interface CapabilitySettings {
  search: SearchCapabilitySettings
  text: TextCapabilitySettings
  audio: AudioCapabilitySettings
  compliance: ComplianceCapabilitySettings
}

export interface NodeBehaviorSettings {
  assistLevel: AIAssistLevel
  publishFlowMode: PublishFlowMode
  ideationChallenge: IdeationChallenge
}

export interface CreatorPreferencesSettings {
  toneStyle: ToneStyle
  contentTendency: ContentTendency
  durationPreference: DurationPreference
}

export interface SystemSettings {
  defaultPlatforms: string[]
  retentionPolicy: RetentionPolicy
}

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
  capability: CapabilitySettings
  nodeBehavior: NodeBehaviorSettings
  creatorPreferences: CreatorPreferencesSettings
  system: SystemSettings
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
  capability: {
    search: {
      intensity: 'standard',
      language: 'zh',
      resultRange: [5, 15],
    },
    text: {
      mode: 'standard',
      balance: 'balanced',
    },
    audio: {
      defaultVoice: 'warm-male',
      quality: 'high',
    },
    compliance: {
      strictness: 'standard',
      reminderIntensity: 'standard',
    },
  },
  nodeBehavior: {
    assistLevel: 'standard',
    publishFlowMode: 'smart',
    ideationChallenge: 'normal',
  },
  creatorPreferences: {
    toneStyle: 'rational',
    contentTendency: 'news',
    durationPreference: 'medium',
  },
  system: {
    defaultPlatforms: ['rss'],
    retentionPolicy: 'local',
  },
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
