import type { AppSettings } from '../../types/settings'
import { DEFAULT_SETTINGS } from '../../types/settings'

const SETTINGS_STORAGE_KEY = 'auto-podcast.settings.v1'

export class SettingsRepository {
  load(): AppSettings {
    try {
      if (typeof window === 'undefined') return structuredClone(DEFAULT_SETTINGS)
      const stored = window.localStorage.getItem(SETTINGS_STORAGE_KEY)
      if (!stored) return structuredClone(DEFAULT_SETTINGS)
      const parsed = JSON.parse(stored)
      const defaults = structuredClone(DEFAULT_SETTINGS)
      return {
        ...defaults,
        ...(parsed || {}),
        capability: {
          ...defaults.capability,
          ...(parsed?.capability || {}),
          search: {
            ...defaults.capability.search,
            ...(parsed?.capability?.search || {}),
          },
          text: {
            ...defaults.capability.text,
            ...(parsed?.capability?.text || {}),
          },
          audio: {
            ...defaults.capability.audio,
            ...(parsed?.capability?.audio || {}),
          },
          compliance: {
            ...defaults.capability.compliance,
            ...(parsed?.capability?.compliance || {}),
          },
        },
        nodeBehavior: {
          ...defaults.nodeBehavior,
          ...(parsed?.nodeBehavior || {}),
        },
        creatorPreferences: {
          ...defaults.creatorPreferences,
          ...(parsed?.creatorPreferences || {}),
        },
        system: {
          ...defaults.system,
          ...(parsed?.system || {}),
        },
        apiConfig: {
          ...defaults.apiConfig,
          ...(parsed?.apiConfig || {}),
          global: {
            ...defaults.apiConfig.global,
            ...(parsed?.apiConfig?.global || {}),
          },
          nodeOverrides: {
            ...defaults.apiConfig.nodeOverrides,
            ...(parsed?.apiConfig?.nodeOverrides || {}),
          },
        },
      }
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
