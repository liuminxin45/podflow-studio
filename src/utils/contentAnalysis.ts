import { CATEGORY_RULES, type CategoryRule } from '../constants/categories'
import type { ContentItem } from '../types/workflow'

export function detectCategory(item: ContentItem): CategoryRule | null {
  const text = `${item.title || ''} ${item.content || ''}`.toLowerCase()
  for (const rule of CATEGORY_RULES) {
    if (rule.keywords.some(kw => text.includes(kw.toLowerCase()))) {
      return rule
    }
  }
  return null
}

export type RelevanceLevel = 'high' | 'medium' | 'low'

export function computeRelevance(item: ContentItem, topic: string): RelevanceLevel {
  if (!topic) return 'medium'
  const text = `${item.title || ''} ${item.content || ''}`.toLowerCase()
  const words = topic.toLowerCase().split(/[,，、\s]+/).filter(Boolean)
  const hits = words.filter(w => text.includes(w)).length
  const ratio = words.length > 0 ? hits / words.length : 0
  if (ratio > 0.3) return 'high'
  if (ratio > 0.1) return 'medium'
  return 'low'
}

export interface RelevanceTag {
  label: string
  color: string
  bg: string
}

export function getRelevanceTag(level: RelevanceLevel): RelevanceTag {
  switch (level) {
    case 'high': return { label: '高度相关', color: '#16a34a', bg: '#f0fdf4' }
    case 'medium': return { label: '可能感兴趣', color: '#d97706', bg: '#fffbeb' }
    case 'low': return { label: '扩展发现', color: '#9ca3af', bg: '#f9fafb' }
  }
}

export type SignalStrength = 'hot' | 'warm' | 'cool'

export function getSignalStrength(index: number, total: number): SignalStrength {
  const ratio = total > 0 ? index / total : 0
  if (ratio < 0.25) return 'hot'
  if (ratio < 0.6) return 'warm'
  return 'cool'
}

export function getSignalColor(strength: SignalStrength): string {
  switch (strength) {
    case 'hot': return '#ef4444'
    case 'warm': return '#3b82f6'
    case 'cool': return '#d1d5db'
  }
}

const RELIABLE_SOURCES = [
  'reuters', 'bloomberg', 'techcrunch', 'theverge', 'arxiv', 'nature', 
  '新华社', '人民日报', '财新'
]

export interface QualitySignal {
  icon: string
  text: string
}

export function getQualitySignals(
  item: ContentItem,
  topic?: string
): QualitySignal[] {
  const signals: QualitySignal[] = []

  if (topic) {
    const text = `${item.title || ''} ${item.content || ''}`.toLowerCase()
    const words = topic.toLowerCase().split(/[,，、\s]+/).filter(Boolean)
    const hits = words.filter(w => text.includes(w)).length
    const ratio = words.length > 0 ? hits / words.length : 0
    if (ratio > 0.3) {
      signals.push({ icon: '◎', text: '与你的关注高度相关' })
    } else if (ratio > 0.1) {
      signals.push({ icon: '◎', text: '与你的关注相关' })
    }
  }

  if (item.source && RELIABLE_SOURCES.some(s => (item.source || '').toLowerCase().includes(s))) {
    signals.push({ icon: '◎', text: '来自可靠来源' })
  }

  return signals.slice(0, 2)
}
