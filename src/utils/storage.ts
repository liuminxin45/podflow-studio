import type { ContentItem } from '../types/workflow'

export type CardStatus = 'new' | 'candidate' | 'later' | 'ignored'

export interface EnrichedItem extends ContentItem {
  _source_channel?: 'auto' | 'manual'
  _note?: string
}

export interface DiscoverPreferences {
  sensitivity: number
  freshness: number
  viewMode: 'card' | 'list'
  llmAutoTagEnabled: boolean
  smartRankMode: boolean
}

export interface DiscoverCandidateState {
  candidateItems: EnrichedItem[]
  savedToInbox: EnrichedItem[]
  inboxStatuses: Array<[number, CardStatus]>
}

const STORAGE_KEYS = {
  DISCOVER_PREFS: 'auto-podcast:discover-prefs',
  DISCOVER_CANDIDATES: 'auto-podcast:discover-candidates',
} as const

function safeParseJSON<T>(json: string | null, fallback: T): T {
  if (!json) return fallback
  try {
    return JSON.parse(json) as T
  } catch (error) {
    console.warn('[Storage] Failed to parse JSON:', error)
    return fallback
  }
}

function safeSetItem(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value))
    return true
  } catch (error) {
    console.error('[Storage] Failed to save to localStorage:', error)
    return false
  }
}

export function loadDiscoverPrefs(): DiscoverPreferences {
  const raw = localStorage.getItem(STORAGE_KEYS.DISCOVER_PREFS)
  return safeParseJSON(raw, {
    sensitivity: 3,
    freshness: 3,
    viewMode: 'card' as const,
    llmAutoTagEnabled: false,
    smartRankMode: false,
  })
}

export function saveDiscoverPrefs(prefs: Partial<DiscoverPreferences>): boolean {
  const current = loadDiscoverPrefs()
  return safeSetItem(STORAGE_KEYS.DISCOVER_PREFS, { ...current, ...prefs })
}

export function loadPersistedDiscoverCandidates(): DiscoverCandidateState {
  const raw = localStorage.getItem(STORAGE_KEYS.DISCOVER_CANDIDATES)
  return safeParseJSON(raw, {
    candidateItems: [],
    savedToInbox: [],
    inboxStatuses: [],
  })
}

export function savePersistedDiscoverCandidates(state: Partial<DiscoverCandidateState>): boolean {
  const current = loadPersistedDiscoverCandidates()
  return safeSetItem(STORAGE_KEYS.DISCOVER_CANDIDATES, { ...current, ...state })
}

export function clearDiscoverCandidates(): boolean {
  try {
    localStorage.removeItem(STORAGE_KEYS.DISCOVER_CANDIDATES)
    return true
  } catch (error) {
    console.error('[Storage] Failed to clear candidates:', error)
    return false
  }
}
