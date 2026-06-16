// ============================================================
// Settings Page Types
// ============================================================

// --- Module 1: Capability Configuration ---

export type SearchIntensity = 'light' | 'standard' | 'deep'
export type SearchLanguage = 'zh' | 'en' | 'auto'
export type TextMode = 'standard' | 'deep' | 'quality'
export type CostQualityBalance = 'cost' | 'balanced' | 'quality'
export type AudioQuality = 'standard' | 'high' | 'ultra'
export type ComplianceStrictness = 'relaxed' | 'standard' | 'strict'
export type ReminderIntensity = 'gentle' | 'standard' | 'strong'

export interface SearchCapabilityConfig {
  intensity: SearchIntensity
  language: SearchLanguage
  resultRange: [number, number]
}

export interface TextCapabilityConfig {
  mode: TextMode
  balance: CostQualityBalance
}

export interface AudioCapabilityConfig {
  defaultVoice: string
  quality: AudioQuality
}

export interface ComplianceCapabilityConfig {
  strictness: ComplianceStrictness
  reminderIntensity: ReminderIntensity
}

export interface CapabilityConfig {
  search: SearchCapabilityConfig
  text: TextCapabilityConfig
  audio: AudioCapabilityConfig
  compliance: ComplianceCapabilityConfig
}

// --- Module 2: Node Intelligence Behavior ---

export type AIAssistLevel = 'light' | 'standard' | 'deep'
export type PublishFlowMode = 'smart' | 'quick' | 'remember'
export type IdeationChallenge = 'normal' | 'critical' | 'reverse'

export interface NodeBehaviorConfig {
  assistLevel: AIAssistLevel
  publishFlowMode: PublishFlowMode
  ideationChallenge: IdeationChallenge
}

// --- Module 3: Creator Preferences ---

export type ToneStyle = 'rational' | 'calm' | 'passionate' | 'latenight'
export type ContentTendency = 'news' | 'commentary' | 'analysis' | 'narrative'
export type DurationPreference = 'short' | 'medium' | 'long'

export interface CreatorPreferences {
  toneStyle: ToneStyle
  contentTendency: ContentTendency
  durationPreference: DurationPreference
}

// --- Module 4: System & Publishing ---

export type RetentionPolicy = 'forever' | 'recent50' | 'recent20'

export interface SystemConfig {
  defaultPlatforms: string[]
  retentionPolicy: RetentionPolicy
}

// --- Module 5: API Configuration Center ---

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
}

export type StageId = 'discover' | 'organize' | 'ideate' | 'write' | 'produce' | 'publish'

export interface APIConfig {
  global: GlobalAPIConfig
  nodeOverrides: Record<StageId, NodeAPIConfig>
}

// --- Combined ---

export interface AppSettings {
  capability: CapabilityConfig
  nodeBehavior: NodeBehaviorConfig
  creatorPreferences: CreatorPreferences
  system: SystemConfig
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
  apiBase: 'https://api.openai.com/v1',
  apiModel: '',
  connectionStatus: 'untested',
  mode: 'standard',
  balance: 'balanced',
}

export const DEFAULT_SETTINGS: AppSettings = {
  capability: {
    search: {
      intensity: 'standard',
      language: 'auto',
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
    defaultPlatforms: ['xiaoyuzhou'],
    retentionPolicy: 'forever',
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
      searchApiBase: 'https://api.openai.com/v1',
      searchApiModel: '',
      searchConnectionStatus: 'untested',
      audioApiKey: '',
      audioApiKeySet: false,
      audioApiKeyMasked: '',
      audioApiBase: 'https://api.openai.com/v1',
      audioApiModel: 'tts-1',
      audioProvider: 'edge-tts',
      audioConnectionStatus: 'untested',
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
