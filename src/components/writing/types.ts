import type { ReactNode } from 'react'
import type { Script, Workflow } from '../../types/workflow'

export type SegmentTone = 'default' | 'conversational' | 'sharp' | 'gentle' | 'concise'
export type SegmentType = 'opening' | 'quick_news' | 'deep_dive' | 'closing' | 'custom'
export type SegmentCharacterTarget = { min: number; max: number }
export type WritingCharacterTargets = Partial<Record<SegmentType, SegmentCharacterTarget>> & {
  episode?: SegmentCharacterTarget
}

export interface WritingSourceReference {
  title: string
  url?: string
  source?: string
  published?: string
}

export interface WritingSegment {
  id: string
  type: SegmentType
  label: string
  content: string
  sourceFactIds?: string[]
  tone: SegmentTone
  estimatedSeconds: number
  isCompleted: boolean
  collapsed: boolean
  sourceReferences?: WritingSourceReference[]
}

export interface WritingLayerProps {
  visible: boolean
  onClose: () => void
  onBackToDraft?: () => void
  workflow?: Workflow | null
  episodeTitle?: string
  episodeDesc?: string
  initialScript?: Script
  embedded?: boolean
  headerTitle?: string
  headerLeadingActions?: ReactNode
  leadingPanel?: ReactNode
  characterTargets?: WritingCharacterTargets
  onDraftContentChange?: (hasContent: boolean) => void
  onDraftPatchChange?: (patch: Record<string, any>) => void
  onProceedToProduction?: (patch: Record<string, any>) => Promise<void> | void
}

export const SEGMENT_TONES: Array<{ key: SegmentTone; label: string }> = [
  { key: 'default', label: '使用节目默认' },
  { key: 'conversational', label: '更口语' },
  { key: 'sharp', label: '更犀利' },
  { key: 'gentle', label: '更温和' },
  { key: 'concise', label: '更精简' },
]

export const SEGMENT_TYPE_CONFIG: Record<SegmentType, { label: string; color: string; defaultSeconds: number }> = {
  opening: { label: '开场', color: '#956400', defaultSeconds: 30 },
  quick_news: { label: '快讯', color: '#1f6c9f', defaultSeconds: 45 },
  deep_dive: { label: '深度解读', color: '#346538', defaultSeconds: 240 },
  closing: { label: '结尾', color: '#9f2f2d', defaultSeconds: 60 },
  custom: { label: '自定义', color: '#62615d', defaultSeconds: 120 },
}

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  if (m === 0) return `${s}秒`
  if (s === 0) return `${m}分钟`
  return `${m}分${s}秒`
}

export function estimateReadingSeconds(text: string): number {
  const charCount = text.replace(/\s/g, '').length
  if (charCount === 0) return 0
  return Math.max(1, Math.ceil(charCount / 4))
}

export function getSegmentHints(
  segment: WritingSegment,
  allSegments: WritingSegment[],
  characterTarget?: SegmentCharacterTarget,
): string[] {
  const hints: string[] = []
  const cfg = SEGMENT_TYPE_CONFIG[segment.type]
  const characterCount = segment.content.replace(/\s/g, '').length

  if (characterTarget && characterCount > 0 && characterCount < characterTarget.min) {
    hints.push(`当前 ${characterCount} 字，建议补足到 ${characterTarget.min}–${characterTarget.max} 字`)
  } else if (characterTarget && characterCount > characterTarget.max) {
    hints.push(`当前 ${characterCount} 字，建议压缩到 ${characterTarget.min}–${characterTarget.max} 字`)
  } else if (!characterTarget && segment.estimatedSeconds > cfg.defaultSeconds * 1.5) {
    hints.push('这段可能偏长，听众注意力容易分散')
  }
  if (!characterTarget && segment.estimatedSeconds < cfg.defaultSeconds * 0.3 && segment.content.length > 0) {
    hints.push('这段比较短，可以考虑展开一些')
  }
  if (segment.type === 'opening' && segment.estimatedSeconds > 120) {
    hints.push('开场略长，建议控制在两分钟内')
  }
  if (segment.type === 'closing' && segment.estimatedSeconds > 90) {
    hints.push('结尾偏长，简洁收尾效果更好')
  }
  const index = allSegments.findIndex(item => item.id === segment.id)
  if (index > 0 && allSegments[index - 1].estimatedSeconds > 200 && segment.estimatedSeconds > 200) {
    hints.push('连续两段都较长，考虑在中间加些节奏变化')
  }
  return hints
}
