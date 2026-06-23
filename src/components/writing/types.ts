// ============================================================
// Writing Layer — Multi-Agent Collaborative Editing Space
// Types & Constants
// ============================================================

import type { Script, Workflow } from '../../types/workflow'

// ── Core Types ──────────────────────────────────────────────

export type GlobalTone = 'analytical' | 'deep_dive' | 'casual' | 'direct' | 'narrative'
export type SegmentTone = 'default' | 'conversational' | 'sharp' | 'gentle' | 'concise'
export type SegmentType = 'opening' | 'main_1' | 'main_2' | 'mainline' | 'discussion' | 'news_item' | 'closing' | 'custom'
export type SegmentStatus = 'draft' | 'editing' | 'polished'

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
  tone: SegmentTone
  estimatedSeconds: number
  status: SegmentStatus
  collapsed: boolean
  sourceReferences?: WritingSourceReference[]
}

export interface Version {
  id: string
  timestamp: string
  label: string
  globalTone: GlobalTone
  segments: WritingSegment[]
}

// ── AI Agent Types ──────────────────────────────────────────

export type AgentRole =
  | 'clarity_editor'     // 表达润色官
  | 'tone_stylist'       // 风格塑造师
  | 'argument_enhancer'  // 逻辑强化师
  | 'conciseness_coach'  // 精简裁剪师
  | 'hook_designer'      // 开场与结尾优化官

export type AIIntensity = 'light' | 'standard' | 'deep'

export type CollaborationScope = 'selection' | 'paragraph' | 'full'

export type SuggestionStatus = 'pending' | 'accepted' | 'rejected' | 'editing'

export interface AISuggestion {
  id: string
  agentRole: AgentRole
  segmentId: string
  scope: CollaborationScope
  intensity: AIIntensity
  originalText: string
  suggestedText: string
  reason: string
  status: SuggestionStatus
  timestamp: number
  selectionRange?: { start: number; end: number }
}

export interface AgentConfig {
  role: AgentRole
  label: string
  icon: string
  color: string
  description: string
  capabilities: string[]
  boundaries: string[]
}

// ── Props ───────────────────────────────────────────────────

export interface WritingLayerProps {
  visible: boolean
  onClose: () => void
  workflow?: Workflow | null
  episodeTitle?: string
  episodeDesc?: string
  initialScript?: Script
  onSaveDraft?: (patch: Record<string, any>) => Promise<void> | void
  onProceedToProduction?: (patch: Record<string, any>) => Promise<void> | void
}

// ============================================================
// Constants
// ============================================================

export const GLOBAL_TONES: Array<{ key: GlobalTone; label: string; desc: string; icon: string }> = [
  { key: 'analytical', label: '冷静分析', desc: '客观、理性，像纪录片旁白', icon: '析' },
  { key: 'deep_dive', label: '深度拆解', desc: '层层深入，抽丝剥茧', icon: '深' },
  { key: 'casual', label: '轻松聊天', desc: '朋友间对话，自然随意', icon: '谈' },
  { key: 'direct', label: '直接表达', desc: '开门见山，不绕弯子', icon: '直' },
  { key: 'narrative', label: '故事叙述', desc: '有画面感，娓娓道来', icon: '叙' },
]

export const SEGMENT_TONES: Array<{ key: SegmentTone; label: string }> = [
  { key: 'default', label: '跟随全局' },
  { key: 'conversational', label: '更口语' },
  { key: 'sharp', label: '更犀利' },
  { key: 'gentle', label: '更温和' },
  { key: 'concise', label: '更精简' },
]

export const SEGMENT_TYPE_CONFIG: Record<SegmentType, { label: string; color: string; icon: string; defaultSeconds: number }> = {
  opening: { label: '开场', color: '#956400', icon: '开', defaultSeconds: 90 },
  main_1: { label: '主线一', color: '#1f6c9f', icon: '一', defaultSeconds: 180 },
  main_2: { label: '主线二', color: '#62615d', icon: '二', defaultSeconds: 180 },
  mainline: { label: '主线', color: '#1f6c9f', icon: '主', defaultSeconds: 180 },
  discussion: { label: '延伸讨论', color: '#346538', icon: '议', defaultSeconds: 150 },
  news_item: { label: '新闻', color: '#1f6c9f', icon: '讯', defaultSeconds: 120 },
  closing: { label: '结尾', color: '#9f2f2d', icon: '收', defaultSeconds: 60 },
  custom: { label: '自定义', color: '#62615d', icon: '段', defaultSeconds: 120 },
}

export const STATUS_CONFIG: Record<SegmentStatus, { label: string; color: string; bg: string }> = {
  draft: { label: '初稿', color: '#8d8a84', bg: '#f1f0ec' },
  editing: { label: '修改中', color: '#956400', bg: '#fbf3db' },
  polished: { label: '已打磨', color: '#346538', bg: '#edf3ec' },
}

export const AI_AGENTS: AgentConfig[] = [
  {
    role: 'clarity_editor',
    label: '表达润色官',
    icon: '润',
    color: '#1f6c9f',
    description: '提升表达清晰度，优化句式结构，消除冗余',
    capabilities: ['优化句式结构', '消除冗余表达', '提升清晰度', '避免口水话'],
    boundaries: ['不改变观点', '不添加新内容', '不自动覆盖'],
  },
  {
    role: 'tone_stylist',
    label: '风格塑造师',
    icon: '风',
    color: '#62615d',
    description: '调整语气风格，统一全文语调',
    capabilities: ['调整语气风格', '统一全文语调', '提供风格对比'],
    boundaries: ['不改变逻辑结构', '不扩展内容'],
  },
  {
    role: 'argument_enhancer',
    label: '逻辑强化师',
    icon: '理',
    color: '#346538',
    description: '强化论证表达，优化过渡，增强说服力',
    capabilities: ['强化论证表达', '优化过渡语句', '增强说服力'],
    boundaries: ['不添加新事实', '不生成新观点', '不改写结构'],
  },
  {
    role: 'conciseness_coach',
    label: '精简裁剪师',
    icon: '剪',
    color: '#956400',
    description: '压缩冗长段落，删除重复表达',
    capabilities: ['压缩冗长段落', '删除重复表达', '精简版本对比'],
    boundaries: ['不删除核心观点', '不自动覆盖'],
  },
  {
    role: 'hook_designer',
    label: '开场结尾优化官',
    icon: '启',
    color: '#9f2f2d',
    description: '优化开头吸引力与结尾收束感',
    capabilities: ['优化开头吸引力', '优化结尾收束感', '提供多个替代版本'],
    boundaries: ['不改变核心内容', '不强行替换'],
  },
]

export const AI_INTENSITY_CONFIG: Array<{ key: AIIntensity; label: string; desc: string; icon: string }> = [
  { key: 'light', label: '轻润色', desc: '仅优化表达清晰度，最小改动', icon: '轻' },
  { key: 'standard', label: '标准优化', desc: '平衡优化表达与风格', icon: '标' },
  { key: 'deep', label: '深度打磨', desc: '允许句式重构，但不改变核心观点', icon: '深' },
]

export const COLLABORATION_SCOPE_CONFIG: Array<{ key: CollaborationScope; label: string; desc: string; icon: string }> = [
  { key: 'selection', label: '局部协作', desc: '仅作用于选中文本', icon: '选' },
  { key: 'paragraph', label: '段落级', desc: '对当前段落整体优化', icon: '段' },
  { key: 'full', label: '全文级', desc: '统一风格、语气、节奏', icon: '全' },
]

// ── Tone Style Presets (for Tone Stylist) ──────────────────

export const TONE_STYLE_PRESETS: Array<{ key: string; label: string; desc: string }> = [
  { key: 'rational', label: '理性分析', desc: '冷静客观，有条理' },
  { key: 'passionate', label: '热情表达', desc: '充满激情，感染力强' },
  { key: 'calm_review', label: '冷静评论', desc: '沉稳内敛，点到为止' },
  { key: 'late_night', label: '深夜电台感', desc: '温柔低沉，有氛围感' },
]

// ── Utility Functions ───────────────────────────────────────

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  if (m === 0) return `${s}秒`
  if (s === 0) return `${m}分钟`
  return `${m}分${s}秒`
}

export function estimateReadingSeconds(text: string): number {
  const charCount = text.replace(/\s/g, '').length
  return Math.max(10, Math.round(charCount / 4))
}

export function getSegmentHints(segment: WritingSegment, totalSeconds: number, allSegments: WritingSegment[]): string[] {
  const hints: string[] = []
  const cfg = SEGMENT_TYPE_CONFIG[segment.type]

  if (segment.estimatedSeconds > cfg.defaultSeconds * 1.5) {
    hints.push('这段可能偏长，听众注意力容易分散')
  }
  if (segment.estimatedSeconds < cfg.defaultSeconds * 0.3 && segment.content.length > 0) {
    hints.push('这段比较短，可以考虑展开一些')
  }
  if (segment.type === 'opening' && segment.estimatedSeconds > 120) {
    hints.push('开场略长，建议控制在两分钟内')
  }
  if (segment.type === 'closing' && segment.estimatedSeconds > 90) {
    hints.push('结尾偏长，简洁收尾效果更好')
  }
  if (totalSeconds > 15 * 60) {
    hints.push('本期总时长偏长，可以适当精简')
  }

  const idx = allSegments.findIndex(s => s.id === segment.id)
  if (idx > 0 && allSegments[idx - 1].estimatedSeconds > 200 && segment.estimatedSeconds > 200) {
    hints.push('连续两段都较长，考虑在中间加些节奏变化')
  }

  return hints
}

