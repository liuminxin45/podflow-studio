import type { AppSettings, LocalAgentConfig } from '../../types/settings'
import { mergeAppSettings, settingsRepository } from './repository'

export interface LocalAgentDetectionResult {
  id: string
  name: string
  command: string
  version: string
  available: boolean
  statusText: string
}

export function mergeDetectedLocalAgents(
  localAgents: LocalAgentConfig[],
  detected: LocalAgentDetectionResult[],
): LocalAgentConfig[] {
  const detectedById = new Map(detected.map(agent => [agent.id, agent]))

  return localAgents.map(agent => {
    const next = detectedById.get(agent.id)
    if (!next) return agent

    return {
      ...agent,
      command: next.command || agent.command,
      version: next.version || '',
      available: Boolean(next.available),
      statusText: next.statusText || (next.available ? next.version || '已安装' : '缺失'),
    }
  })
}

export function applyDetectedLocalAgentsToSettings(
  settings: AppSettings,
  detected: LocalAgentDetectionResult[],
): AppSettings {
  return {
    ...settings,
    apiConfig: {
      ...settings.apiConfig,
      global: {
        ...settings.apiConfig.global,
        localAgents: mergeDetectedLocalAgents(settings.apiConfig.global.localAgents, detected),
      },
    },
  }
}

export async function detectLocalAgentStatuses(): Promise<LocalAgentDetectionResult[]> {
  if (!window.electronAPI?.detectLocalAgents) return []
  return window.electronAPI.detectLocalAgents()
}

export async function detectAndPersistLocalAgentsOnStartup(): Promise<AppSettings | null> {
  if (!window.electronAPI?.detectLocalAgents) return null

  const detected = await detectLocalAgentStatuses()
  const saved = window.electronAPI?.loadNodeConfig
    ? await window.electronAPI.loadNodeConfig('app_settings').catch(() => null)
    : null
  const baseSettings = mergeAppSettings((saved as Partial<AppSettings> | null) || settingsRepository.load())
  const nextSettings = applyDetectedLocalAgentsToSettings(baseSettings, detected)

  settingsRepository.save(nextSettings)

  if (window.electronAPI?.saveNodeConfig) {
    const result = await window.electronAPI.saveNodeConfig(
      'app_settings',
      nextSettings as unknown as Record<string, any>,
    )
    if (!result?.success) {
      console.warn('[localAgentDetection] Failed to persist detected local agents:', result?.error)
    }
  }

  return nextSettings
}
