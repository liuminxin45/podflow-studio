import type { AppSettings } from '../../types/settings'
import { DEFAULT_SETTINGS } from '../../types/settings'

const SETTINGS_STORAGE_KEY = 'podflow.settings.v1'

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
      return structuredClone(DEFAULT_SETTINGS)
    }
  }

  save(settings: AppSettings): void {
    try {
      if (typeof window === 'undefined') return
      window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings))
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
