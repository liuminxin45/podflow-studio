// ============================================================
// Settings Page Types
// ============================================================

export type AudioQuality = 'mp3' | 'wav'
export type ContentTendency = 'news' | 'analysis'
export type DurationPreference = 'short' | 'medium'
export type EditorialVoice = 'professional' | 'human'
// --- API Configuration Center ---

export type NodeCapabilityType = 'search' | 'text' | 'reasoning' | 'audio'
export type NodeOverrideMode = 'global' | 'custom'
export type APIConnectionStatus = 'untested' | 'testing' | 'connected' | 'failed'
export type AudioProvider = 'edge-tts' | 'openai-compatible' | 'doubao_tts' | 'voice_clone'
export type WebSearchProvider = 'tavily' | 'bocha'
export type AITargetKind = 'local_agent' | 'local_model' | 'api_model'
export type LocalAgentId =
  | 'claude_code'
  | 'codex'
  | 'opencode'
  | 'pi'
  | 'gemini_cli'
  | 'kiro'
  | 'hermes'
export type LocalAgentOutputMode = 'stdout' | 'codex-json'
export type AIModelProviderKind =
  | 'ollama'
  | 'lm_studio'
  | 'openai'
  | 'anthropic'
  | 'gemini'
  | 'openrouter'
  | 'openai_compatible'
export type APIKeyStorageMode = 'local' | 'env' | 'none'

export interface AudioCapabilitySettings {
  defaultVoice: string
  quality: AudioQuality
}

export interface CapabilitySettings {
  audio: AudioCapabilitySettings
}

export interface CreatorPreferencesSettings {
  editorialVoice: EditorialVoice
  contentTendency: ContentTendency
  durationPreference: DurationPreference
  organizeCompletionMode: OrganizeCompletionMode
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
}

export interface LocalAgentConfig {
  id: LocalAgentId
  name: string
  command: string
  runArgs: string[]
  outputMode: LocalAgentOutputMode
  version: string
  available: boolean
  statusText: string
}

export interface AIModelProviderConfig {
  id: string
  name: string
  kind: AIModelProviderKind
  targetKind: 'local_model' | 'api_model'
  apiBase: string
  apiKey: string
  apiKeySet: boolean
  apiKeyMasked: string
  apiKeyStorage: APIKeyStorageMode
  apiKeyEnvVar: string
  model: string
  modelOptions: string[]
  connectionStatus: APIConnectionStatus
}

export interface WebSearchProviderConfig {
  apiKey: string
  apiKeySet: boolean
  apiKeyMasked: string
  apiBase: string
  connectionStatus: APIConnectionStatus
}

export interface GlobalAPIConfig {
  searchProvider: WebSearchProvider | 'default_ai'
  webSearchProviders: Record<WebSearchProvider, WebSearchProviderConfig>
  defaultAISearchVerifiedTarget: string
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
  audioDoubaoResourceId: string
  audioDoubaoCloneAppId: string
  audioDoubaoCloneAccessToken: string
  audioDoubaoCloneCluster: string
  audioDoubaoCloneSpeakerId: string
  audioDoubaoCloneEndpoint: string
  audioDoubaoCloneResourceId: string
  audioDoubaoOpenAccessKey: string
  audioDoubaoOpenSecretKey: string
  defaultAITarget: string
  localAgents: LocalAgentConfig[]
  aiModelProviders: AIModelProviderConfig[]
}

export type StageId = 'discover' | 'organize' | 'draft' | 'produce'
export type NodeOverrideStageId = 'organize' | 'draft'

export interface APIConfig {
  global: GlobalAPIConfig
  nodeOverrides: Record<NodeOverrideStageId, NodeAPIConfig>
}

// --- Settings Root ---

export interface AppSettings {
  capability: CapabilitySettings
  creatorPreferences: CreatorPreferencesSettings
  apiConfig: APIConfig
}

export type SettingsSection =
  | 'creation'
  | 'api-config'
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
}

export const DEFAULT_LOCAL_AGENTS: LocalAgentConfig[] = [
  {
    id: 'claude_code',
    name: 'Claude Code',
    command: 'claude',
    runArgs: ['-p', '{prompt}'],
    outputMode: 'stdout',
    version: '',
    available: false,
    statusText: '未检测',
  },
  {
    id: 'codex',
    name: 'Codex',
    command: 'codex',
    runArgs: [],
    outputMode: 'codex-json',
    version: '',
    available: false,
    statusText: '未检测',
  },
  {
    id: 'opencode',
    name: 'OpenCode',
    command: 'opencode',
    runArgs: ['run', '{prompt}'],
    outputMode: 'stdout',
    version: '',
    available: false,
    statusText: '未检测',
  },
  {
    id: 'pi',
    name: 'Pi',
    command: 'pi',
    runArgs: ['{prompt}'],
    outputMode: 'stdout',
    version: '',
    available: false,
    statusText: '未检测',
  },
  {
    id: 'gemini_cli',
    name: 'Gemini CLI',
    command: 'gemini',
    runArgs: ['-p', '{prompt}'],
    outputMode: 'stdout',
    version: '',
    available: false,
    statusText: '未检测',
  },
  {
    id: 'kiro',
    name: 'Kiro',
    command: 'kiro',
    runArgs: ['{prompt}'],
    outputMode: 'stdout',
    version: '',
    available: false,
    statusText: '未检测',
  },
  {
    id: 'hermes',
    name: 'Hermes Agent',
    command: 'hermes',
    runArgs: ['-z', '{prompt}'],
    outputMode: 'stdout',
    version: '',
    available: false,
    statusText: '未检测',
  },
]

export const DEFAULT_AI_MODEL_PROVIDERS: AIModelProviderConfig[] = [
  {
    id: 'local-ollama',
    name: 'Ollama',
    kind: 'ollama',
    targetKind: 'local_model',
    apiBase: 'http://localhost:11434/v1',
    apiKey: '',
    apiKeySet: false,
    apiKeyMasked: '',
    apiKeyStorage: 'none',
    apiKeyEnvVar: '',
    model: 'llama3.2',
    modelOptions: ['llama3.2', 'qwen2.5', 'mistral', 'phi3'],
    connectionStatus: 'untested',
  },
  {
    id: 'local-lm-studio',
    name: 'LM Studio',
    kind: 'lm_studio',
    targetKind: 'local_model',
    apiBase: 'http://127.0.0.1:1234/v1',
    apiKey: '',
    apiKeySet: false,
    apiKeyMasked: '',
    apiKeyStorage: 'none',
    apiKeyEnvVar: '',
    model: 'local-model',
    modelOptions: ['local-model'],
    connectionStatus: 'untested',
  },
  {
    id: 'api-openai',
    name: 'OpenAI',
    kind: 'openai',
    targetKind: 'api_model',
    apiBase: 'https://api.openai.com/v1',
    apiKey: '',
    apiKeySet: false,
    apiKeyMasked: '',
    apiKeyStorage: 'local',
    apiKeyEnvVar: 'OPENAI_API_KEY',
    model: 'gpt-4o-mini',
    modelOptions: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini'],
    connectionStatus: 'untested',
  },
  {
    id: 'api-anthropic',
    name: 'Anthropic',
    kind: 'anthropic',
    targetKind: 'api_model',
    apiBase: 'https://api.anthropic.com/v1',
    apiKey: '',
    apiKeySet: false,
    apiKeyMasked: '',
    apiKeyStorage: 'env',
    apiKeyEnvVar: 'ANTHROPIC_API_KEY',
    model: 'claude-3-5-sonnet-latest',
    modelOptions: ['claude-3-5-sonnet-latest', 'claude-3-5-haiku-latest', 'claude-3-opus-latest'],
    connectionStatus: 'untested',
  },
  {
    id: 'api-gemini',
    name: 'Gemini',
    kind: 'gemini',
    targetKind: 'api_model',
    apiBase: 'https://generativelanguage.googleapis.com/v1beta/openai',
    apiKey: '',
    apiKeySet: false,
    apiKeyMasked: '',
    apiKeyStorage: 'env',
    apiKeyEnvVar: 'GEMINI_API_KEY',
    model: 'gemini-2.0-flash',
    modelOptions: ['gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-1.5-pro'],
    connectionStatus: 'untested',
  },
  {
    id: 'api-openrouter',
    name: 'OpenRouter',
    kind: 'openrouter',
    targetKind: 'api_model',
    apiBase: 'https://openrouter.ai/api/v1',
    apiKey: '',
    apiKeySet: false,
    apiKeyMasked: '',
    apiKeyStorage: 'local',
    apiKeyEnvVar: 'OPENROUTER_API_KEY',
    model: 'openai/gpt-4o-mini',
    modelOptions: ['openai/gpt-4o-mini', 'anthropic/claude-3.5-sonnet', 'google/gemini-flash-1.5'],
    connectionStatus: 'untested',
  },
  {
    id: 'api-openai-compatible',
    name: 'OpenAI 兼容',
    kind: 'openai_compatible',
    targetKind: 'api_model',
    apiBase: 'https://api.openai.com/v1',
    apiKey: '',
    apiKeySet: false,
    apiKeyMasked: '',
    apiKeyStorage: 'local',
    apiKeyEnvVar: 'OPENAI_API_KEY',
    model: 'gpt-4o-mini',
    modelOptions: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini'],
    connectionStatus: 'untested',
  },
]

export const DEFAULT_SETTINGS: AppSettings = {
  capability: {
    audio: {
      defaultVoice: 'warm-male',
      quality: 'mp3',
    },
  },
  creatorPreferences: {
    editorialVoice: 'human',
    contentTendency: 'news',
    durationPreference: 'medium',
    organizeCompletionMode: 'hybrid',
  },
  apiConfig: {
    global: {
      searchProvider: 'tavily',
      webSearchProviders: {
        tavily: {
          apiKey: '',
          apiKeySet: false,
          apiKeyMasked: '',
          apiBase: 'https://api.tavily.com',
          connectionStatus: 'untested',
        },
        bocha: {
          apiKey: '',
          apiKeySet: false,
          apiKeyMasked: '',
          apiBase: 'https://api.bochaai.com',
          connectionStatus: 'untested',
        },
      },
      defaultAISearchVerifiedTarget: '',
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
      audioDoubaoResourceId: 'volc.service_type.10029',
      audioDoubaoCloneAppId: '',
      audioDoubaoCloneAccessToken: '',
      audioDoubaoCloneCluster: 'volcano_tts',
      audioDoubaoCloneSpeakerId: '',
      audioDoubaoCloneEndpoint: 'https://openspeech.bytedance.com/api/v1/tts',
      audioDoubaoCloneResourceId: 'volc.megatts.default',
      audioDoubaoOpenAccessKey: '',
      audioDoubaoOpenSecretKey: '',
      defaultAITarget: '',
      localAgents: DEFAULT_LOCAL_AGENTS,
      aiModelProviders: DEFAULT_AI_MODEL_PROVIDERS,
    },
    nodeOverrides: {
      organize: { ...DEFAULT_NODE_API_CONFIG, capabilityType: 'text' },
      draft: { ...DEFAULT_NODE_API_CONFIG, capabilityType: 'text' },
    },
  },
}
import type { OrganizeCompletionMode } from './organize'
