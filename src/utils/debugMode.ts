/**
 * Debug mode utilities for reducing LLM token usage
 */

export function isDebugModeEnabled(): boolean {
  return typeof window !== 'undefined' && window.__DEBUG_MODE__ === true
}

export function setDebugMode(enabled: boolean): void {
  if (typeof window !== 'undefined') {
    window.__DEBUG_MODE__ = enabled
    console.info(`[DebugMode] ${enabled ? 'ENABLED' : 'DISABLED'}`)
    
    // Also update llmService
    import('../services/llmService').then(({ llmService }) => {
      llmService.setDebugMode(enabled)
    })
  }
}

export function loadDebugModeFromStorage(): boolean {
  if (typeof window === 'undefined') return false
  
  try {
    const stored = window.localStorage.getItem('app.debug_mode')
    return stored === 'true'
  } catch {
    return false
  }
}

export function saveDebugModeToStorage(enabled: boolean): void {
  if (typeof window === 'undefined') return
  
  try {
    window.localStorage.setItem('app.debug_mode', enabled ? 'true' : 'false')
  } catch (e) {
    console.warn('[DebugMode] Failed to save to localStorage:', e)
  }
}

export function toggleDebugMode(): boolean {
  const current = isDebugModeEnabled()
  const newValue = !current
  setDebugMode(newValue)
  saveDebugModeToStorage(newValue)
  return newValue
}
