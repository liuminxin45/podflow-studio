import type { AppSettings } from '../../types/settings'
import { DEFAULT_SETTINGS } from '../../types/settings'

const SETTINGS_STORAGE_KEY = 'podflow.settings.v1'
const SUPPORTED_AI_PROVIDER_KINDS = new Set(['openai', 'anthropic', 'gemini', 'openrouter', 'ollama', 'deepseek'])

function assertNoUnknownAIFields(saved: unknown, defaults: unknown, path: string): void {
  if (!saved || typeof saved !== 'object') return
  if (Array.isArray(saved)) {
    const template = Array.isArray(defaults) ? defaults[0] : undefined
    if (template !== undefined) saved.forEach((item, index) => assertNoUnknownAIFields(item, template, `${path}[${index}]`))
    return
  }
  if (!defaults || typeof defaults !== 'object' || Array.isArray(defaults)) return
  const defaultRecord = defaults as Record<string, unknown>
  if (path === 'apiConfig.nodeOverrides') {
    const template = Object.values(defaultRecord)[0]
    Object.entries(saved as Record<string, unknown>).forEach(([key, value]) => {
      assertNoUnknownAIFields(value, template, `${path}.${key}`)
    })
    return
  }
  for (const [key, value] of Object.entries(saved as Record<string, unknown>)) {
    if (!(key in defaultRecord)) throw new Error(`不支持旧 AI 配置字段：${path}.${key}。请重新配置 AI。`)
    assertNoUnknownAIFields(value, defaultRecord[key], `${path}.${key}`)
  }
}

function assertCurrentAISettings(saved: Partial<AppSettings>): void {
  const providers = saved.apiConfig?.global?.aiModelProviders
  if (!providers) return
  for (const provider of providers) {
    if (!SUPPORTED_AI_PROVIDER_KINDS.has(String(provider.kind))) {
      throw new Error(`不支持旧 AI Provider 配置：${String(provider.kind)}。请重新配置 AI 模型。`)
    }
    if (provider.kind !== 'ollama' && provider.apiBase && provider.apiBase !== DEFAULT_AI_BASES[provider.kind]) {
      throw new Error(`不支持 ${provider.kind} 的自定义 API Base，请重新配置官方 Provider。`)
    }
  }
}

const DEFAULT_AI_BASES: Record<string, string> = Object.fromEntries(
  DEFAULT_SETTINGS.apiConfig.global.aiModelProviders.map(provider => [provider.kind, provider.apiBase]),
)

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function selectCurrentShape(saved: unknown, defaults: unknown): unknown {
  if (saved === undefined || saved === null) return undefined
  if (Array.isArray(defaults)) return Array.isArray(saved) ? structuredClone(saved) : undefined
  if (!isObject(defaults) || !isObject(saved)) return structuredClone(saved)

  const selected: Record<string, unknown> = {}
  for (const [key, defaultValue] of Object.entries(defaults)) {
    if (!(key in saved)) continue
    const value = selectCurrentShape(saved[key], defaultValue)
    if (value !== undefined) selected[key] = value
  }
  return selected
}

function mergeCurrent<T>(defaults: T, saved: unknown): T {
  if (saved === undefined || saved === null) return structuredClone(defaults)
  if (Array.isArray(defaults) && Array.isArray(saved)) return structuredClone(saved) as T
  if (!isObject(defaults) || !isObject(saved)) return structuredClone(saved as T)
  const result = structuredClone(defaults) as Record<string, unknown>
  for (const [key, value] of Object.entries(saved)) {
    result[key] = isObject(value) && isObject(result[key])
      ? mergeCurrent(result[key], value)
      : structuredClone(value)
  }
  return result as T
}

export function mergeAppSettings(saved: Partial<AppSettings> | null | undefined): AppSettings {
  const defaults = structuredClone(DEFAULT_SETTINGS)
  if (!saved) return defaults
  assertNoUnknownAIFields(saved.apiConfig, defaults.apiConfig, 'apiConfig')
  assertCurrentAISettings(saved)
  const current = selectCurrentShape(saved, defaults)
  const merged = mergeCurrent(defaults, current)
  const legacyQuality = (saved as any)?.capability?.audio?.quality
  if (legacyQuality === 'standard' || legacyQuality === 'high') merged.capability.audio.quality = 'mp3'
  if (legacyQuality === 'ultra') merged.capability.audio.quality = 'wav'
  merged.apiConfig.global.audioConnectionStatus = 'untested'
  merged.apiConfig.global.localAgents = merged.apiConfig.global.localAgents.map(agent => ({
    ...agent,
    available: false,
    version: '',
    statusText: '未检测',
  }))
  merged.apiConfig.global.aiModelProviders = merged.apiConfig.global.aiModelProviders.map(provider => ({
    ...provider,
    connectionStatus: 'untested',
  }))
  merged.apiConfig.global.webSearchProviders = Object.fromEntries(
    Object.entries(merged.apiConfig.global.webSearchProviders).map(([provider, config]) => [
      provider,
      { ...config, connectionStatus: 'untested' },
    ]),
  ) as AppSettings['apiConfig']['global']['webSearchProviders']
  merged.apiConfig.nodeOverrides = Object.fromEntries(
    Object.entries(merged.apiConfig.nodeOverrides).map(([stage, config]) => [
      stage,
      { ...config, connectionStatus: 'untested' },
    ]),
  ) as AppSettings['apiConfig']['nodeOverrides']
  return merged
}

export class SettingsRepository {
  load(): AppSettings {
    try {
      if (typeof window === 'undefined') return structuredClone(DEFAULT_SETTINGS)
      const stored = window.localStorage.getItem(SETTINGS_STORAGE_KEY)
      if (!stored) return structuredClone(DEFAULT_SETTINGS)
      return mergeAppSettings(JSON.parse(stored))
    } catch (error) {
      console.error('[SettingsRepository] Load failed:', error)
      throw error
    }
  }

  save(settings: AppSettings): void {
    try {
      if (typeof window === 'undefined') return
      const rendererSafe = structuredClone(settings)
      rendererSafe.apiConfig.global.aiModelProviders.forEach(provider => { provider.apiKey = '' })
      Object.values(rendererSafe.apiConfig.nodeOverrides).forEach(override => { override.apiKey = '' })
      window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(rendererSafe))
    } catch (error) {
      console.error('[SettingsRepository] Save failed:', error)
      throw new Error('Failed to save settings')
    }
  }

  clear(): void {
    try {
      if (typeof window === 'undefined') return
      window.localStorage.removeItem(SETTINGS_STORAGE_KEY)
    } catch (error) {
      console.error('[SettingsRepository] Clear failed:', error)
    }
  }
}

export const settingsRepository = new SettingsRepository()
