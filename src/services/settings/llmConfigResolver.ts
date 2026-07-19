import { settingsRepository } from './repository'
import type { AIModelProviderConfig, AppSettings, GlobalAPIConfig, LocalAgentConfig, StageId } from '../../types/settings'
import type { LLMCallOptions } from '../../types/llm'

export interface LLMConfig {
  apiBase: string
  apiKey: string
  apiKeyEnvVar?: string
  model: string
  providerKind?: string
  localAgentId?: string
  localAgentCommand?: string
  localAgentArgs?: string[]
  localAgentOutputMode?: string
  aiTarget?: string
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
  doubaoResourceId: string
}

function toRuntimeAudioProvider(provider: unknown): AudioProviderConfig['provider'] {
  if (provider === 'doubao_tts' || provider === 'voice_clone') return provider
  return 'openai_compatible'
}

function resolveDefaultModelProvider(global: GlobalAPIConfig): AIModelProviderConfig | null {
  const target = String(global.defaultAITarget || '')
  if (!target.startsWith('model:')) return null
  const providerId = target.replace(/^model:/, '')
  return global.aiModelProviders.find(provider => provider.id === providerId) || null
}

function resolveDefaultLocalAgent(global: GlobalAPIConfig): LocalAgentConfig | null {
  const target = String(global.defaultAITarget || '')
  if (!target.startsWith('agent:')) return null
  const agentId = target.replace(/^agent:/, '')
  return global.localAgents.find(agent => agent.id === agentId) || null
}

function providerCredential(provider: AIModelProviderConfig): Pick<LLMConfig, 'apiKey' | 'apiKeyEnvVar'> {
  if (provider.targetKind === 'local_model') return { apiKey: 'local-model' }
  if (provider.apiKeyStorage === 'none') return { apiKey: 'no-key' }
  if (provider.apiKeyStorage === 'env') {
    return {
      apiKey: provider.apiKey || '',
      apiKeyEnvVar: provider.apiKeyEnvVar || '',
    }
  }
  return { apiKey: provider.apiKey }
}

export function isLocalAgentLLMConfig(config: LLMConfig | null | undefined): boolean {
  return config?.providerKind === 'local_agent' || Boolean(config?.apiBase?.startsWith('local-agent://'))
}

export function hasUsableLLMConfig(config: LLMConfig | null | undefined): config is LLMConfig {
  if (!config?.model) return false
  if (isLocalAgentLLMConfig(config)) return Boolean(config.localAgentId && config.localAgentCommand)
  return Boolean(config.apiBase && (config.apiKey || config.apiKeyEnvVar))
}

export function llmTargetLabel(config: LLMConfig | null | undefined): string {
  if (!config) return '未配置'
  if (isLocalAgentLLMConfig(config)) return `本地代理：${config.localAgentId || config.model}`
  if (config.providerKind === 'ollama' || config.providerKind === 'lm_studio') return `本地模型：${config.model}`
  return `API 模型：${config.model}`
}

export function createLLMCallOptions(
  config: LLMConfig,
  options: Omit<LLMCallOptions, 'apiBase' | 'apiKey' | 'apiKeyEnvVar' | 'model' | 'providerKind' | 'localAgentId' | 'localAgentCommand' | 'localAgentArgs' | 'localAgentOutputMode' | 'aiTarget'>,
): LLMCallOptions {
  return {
    ...options,
    apiBase: config.apiBase,
    apiKey: config.apiKey,
    apiKeyEnvVar: config.apiKeyEnvVar,
    model: config.model,
    providerKind: config.providerKind,
    localAgentId: config.localAgentId,
    localAgentCommand: config.localAgentCommand,
    localAgentArgs: config.localAgentArgs,
    localAgentOutputMode: config.localAgentOutputMode,
    aiTarget: config.aiTarget,
    timeout: options.timeout ?? config.timeout,
  }
}

export class LLMConfigResolver {
  getLLMConfig(nodeId: StageId, useDefaultTarget = false): LLMConfig | null {
    return this.getLLMConfigFromSettings(settingsRepository.load(), nodeId, useDefaultTarget)
  }

  getLLMConfigFromSettings(
    settings: AppSettings,
    nodeId: StageId,
    useDefaultTarget = false,
  ): LLMConfig | null {
    const nodeConfig = nodeId === 'organize' || nodeId === 'draft'
      ? settings.apiConfig.nodeOverrides[nodeId]
      : undefined

    if (!useDefaultTarget && nodeConfig?.overrideMode === 'custom') {
      const inherited = this.getLLMConfigFromSettings(settings, nodeId, true)
      const inheritedRemote = inherited?.providerKind === 'local_agent' ? null : inherited
      const hasCustomEndpoint = Boolean(nodeConfig.apiKey || nodeConfig.apiBase)
      const hasModelOverride = Boolean(nodeConfig.apiModel) && inherited?.providerKind !== 'local_agent'
      if (!hasCustomEndpoint && !hasModelOverride) return inherited
      return {
        ...inheritedRemote,
        apiBase: nodeConfig.apiBase || inheritedRemote?.apiBase || 'https://api.openai.com/v1',
        apiKey: nodeConfig.apiKey || inheritedRemote?.apiKey || '',
        apiKeyEnvVar: nodeConfig.apiKey ? undefined : inheritedRemote?.apiKeyEnvVar,
        model: nodeConfig.apiModel || inheritedRemote?.model || 'gpt-4o-mini',
        providerKind: hasCustomEndpoint ? 'openai_compatible' : inheritedRemote?.providerKind || 'openai_compatible',
      }
    }

    const capabilityType = nodeConfig?.capabilityType || 'text'
    const global = settings.apiConfig.global
    const defaultProvider = resolveDefaultModelProvider(global)
    const defaultTarget = String(global.defaultAITarget || '')

    if (defaultTarget.startsWith('agent:')) {
      const localAgentId = defaultTarget.replace(/^agent:/, '')
      const localAgent = resolveDefaultLocalAgent(global)
      return {
        apiBase: `local-agent://${localAgentId}`,
        apiKey: 'local-agent',
        model: localAgentId,
        providerKind: 'local_agent',
        localAgentId,
        localAgentCommand: localAgent?.command || localAgentId,
        localAgentArgs: localAgent?.runArgs || ['{prompt}'],
        localAgentOutputMode: localAgent?.outputMode || 'stdout',
        aiTarget: defaultTarget,
        timeout: 180000,
      }
    }

    if (defaultProvider?.apiBase && defaultProvider.model) {
      const credential = providerCredential(defaultProvider)
      if (credential.apiKey || credential.apiKeyEnvVar) {
        return {
          apiBase: defaultProvider.apiBase,
          apiKey: credential.apiKey,
          apiKeyEnvVar: credential.apiKeyEnvVar,
          model: defaultProvider.model,
          providerKind: defaultProvider.kind,
        }
      }
    }

    if (capabilityType === 'audio') {
      if (global.audioApiKeySet && global.audioApiKey) {
        return {
          apiBase: global.audioApiBase || 'https://api.openai.com/v1',
          apiKey: global.audioApiKey,
          model: global.audioApiModel || 'gpt-4o-mini',
          providerKind: 'openai_compatible',
        }
      }
    }

    return null
  }

  getAudioProviderConfig(): AudioProviderConfig {
    const settings = settingsRepository.load()
    const global = settings.apiConfig.global
    const provider = toRuntimeAudioProvider(global.audioProvider)
    const isClone = provider === 'voice_clone'
    const doubao = {
      doubaoAppId: String(isClone ? global.audioDoubaoCloneAppId : global.audioDoubaoAppId).trim(),
      doubaoAccessToken: String(isClone ? global.audioDoubaoCloneAccessToken : global.audioDoubaoAccessToken).trim(),
      doubaoCluster: String(isClone ? global.audioDoubaoCloneCluster : global.audioDoubaoCluster).trim(),
      doubaoVoiceType: String(isClone ? global.audioDoubaoCloneSpeakerId : global.audioDoubaoVoiceType).trim(),
      doubaoEndpoint: String(isClone ? global.audioDoubaoCloneEndpoint : global.audioDoubaoEndpoint).trim(),
      doubaoResourceId: String(isClone ? global.audioDoubaoCloneResourceId : global.audioDoubaoResourceId).trim(),
    }
    const openAIConfig = {
      apiBase: String(global.audioApiBase || 'https://api.openai.com/v1').trim(),
      apiKey: String(global.audioApiKey || '').trim(),
      model: String(global.audioApiModel || '').trim(),
    }

    return {
      provider,
      ...openAIConfig,
      requestTimeoutSec: 60,
      ...doubao,
    }
  }

  isLLMAvailable(nodeId: StageId): boolean {
    return this.getLLMConfig(nodeId) !== null
  }
}

export const llmConfigResolver = new LLMConfigResolver()
