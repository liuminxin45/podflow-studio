// ============================================================
// Writing Layer — Multi-Agent Collaborative Editing Space
// Types & Constants
// ============================================================

// ── Core Types ──────────────────────────────────────────────

export type GlobalTone = 'analytical' | 'deep_dive' | 'casual' | 'direct' | 'narrative'
export type SegmentTone = 'default' | 'conversational' | 'sharp' | 'gentle' | 'concise'
export type SegmentType = 'opening' | 'main_1' | 'main_2' | 'discussion' | 'closing'
export type SegmentStatus = 'draft' | 'editing' | 'polished'

export interface WritingSegment {
  id: string
  type: SegmentType
  label: string
  content: string
  tone: SegmentTone
  estimatedSeconds: number
  status: SegmentStatus
  collapsed: boolean
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
  episodeTitle?: string
  episodeDesc?: string
  initialScript?: { title?: string; dialogue?: Array<{ speaker: string; text: string }> }
  onProceedToProduction?: (segments: WritingSegment[], globalTone: GlobalTone) => void
}

// ============================================================
// Constants
// ============================================================

export const GLOBAL_TONES: Array<{ key: GlobalTone; label: string; desc: string; icon: string }> = [
  { key: 'analytical', label: '冷静分析', desc: '客观、理性，像纪录片旁白', icon: '🧊' },
  { key: 'deep_dive', label: '深度拆解', desc: '层层深入，抽丝剥茧', icon: '🔬' },
  { key: 'casual', label: '轻松聊天', desc: '朋友间对话，自然随意', icon: '☕' },
  { key: 'direct', label: '直接表达', desc: '开门见山，不绕弯子', icon: '🎯' },
  { key: 'narrative', label: '故事叙述', desc: '有画面感，娓娓道来', icon: '📖' },
]

export const SEGMENT_TONES: Array<{ key: SegmentTone; label: string }> = [
  { key: 'default', label: '跟随全局' },
  { key: 'conversational', label: '更口语' },
  { key: 'sharp', label: '更犀利' },
  { key: 'gentle', label: '更温和' },
  { key: 'concise', label: '更精简' },
]

export const SEGMENT_TYPE_CONFIG: Record<SegmentType, { label: string; color: string; icon: string; defaultSeconds: number }> = {
  opening: { label: '开场', color: '#f59e0b', icon: '🎬', defaultSeconds: 90 },
  main_1: { label: '主线一', color: '#2563eb', icon: '📌', defaultSeconds: 180 },
  main_2: { label: '主线二', color: '#8b5cf6', icon: '📌', defaultSeconds: 180 },
  discussion: { label: '延伸讨论', color: '#06b6d4', icon: '💬', defaultSeconds: 150 },
  closing: { label: '结尾', color: '#10b981', icon: '🎤', defaultSeconds: 60 },
}

export const STATUS_CONFIG: Record<SegmentStatus, { label: string; color: string; bg: string }> = {
  draft: { label: '初稿', color: '#9ca3af', bg: '#f3f4f6' },
  editing: { label: '修改中', color: '#f59e0b', bg: '#fffbeb' },
  polished: { label: '已打磨', color: '#10b981', bg: '#ecfdf5' },
}

export const AI_AGENTS: AgentConfig[] = [
  {
    role: 'clarity_editor',
    label: '表达润色官',
    icon: '✨',
    color: '#2563eb',
    description: '提升表达清晰度，优化句式结构，消除冗余',
    capabilities: ['优化句式结构', '消除冗余表达', '提升清晰度', '避免口水话'],
    boundaries: ['不改变观点', '不添加新内容', '不自动覆盖'],
  },
  {
    role: 'tone_stylist',
    label: '风格塑造师',
    icon: '🎭',
    color: '#8b5cf6',
    description: '调整语气风格，统一全文语调',
    capabilities: ['调整语气风格', '统一全文语调', '提供风格对比'],
    boundaries: ['不改变逻辑结构', '不扩展内容'],
  },
  {
    role: 'argument_enhancer',
    label: '逻辑强化师',
    icon: '🧠',
    color: '#059669',
    description: '强化论证表达，优化过渡，增强说服力',
    capabilities: ['强化论证表达', '优化过渡语句', '增强说服力'],
    boundaries: ['不添加新事实', '不生成新观点', '不改写结构'],
  },
  {
    role: 'conciseness_coach',
    label: '精简裁剪师',
    icon: '✂️',
    color: '#ea580c',
    description: '压缩冗长段落，删除重复表达',
    capabilities: ['压缩冗长段落', '删除重复表达', '精简版本对比'],
    boundaries: ['不删除核心观点', '不自动覆盖'],
  },
  {
    role: 'hook_designer',
    label: '开场结尾优化官',
    icon: '🎯',
    color: '#dc2626',
    description: '优化开头吸引力与结尾收束感',
    capabilities: ['优化开头吸引力', '优化结尾收束感', '提供多个替代版本'],
    boundaries: ['不改变核心内容', '不强行替换'],
  },
]

export const AI_INTENSITY_CONFIG: Array<{ key: AIIntensity; label: string; desc: string; icon: string }> = [
  { key: 'light', label: '轻润色', desc: '仅优化表达清晰度，最小改动', icon: '🌿' },
  { key: 'standard', label: '标准优化', desc: '平衡优化表达与风格', icon: '⚡' },
  { key: 'deep', label: '深度打磨', desc: '允许句式重构，但不改变核心观点', icon: '💎' },
]

export const COLLABORATION_SCOPE_CONFIG: Array<{ key: CollaborationScope; label: string; desc: string; icon: string }> = [
  { key: 'selection', label: '局部协作', desc: '仅作用于选中文本', icon: '📝' },
  { key: 'paragraph', label: '段落级', desc: '对当前段落整体优化', icon: '📄' },
  { key: 'full', label: '全文级', desc: '统一风格、语气、节奏', icon: '📚' },
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

// ── Mock AI Suggestion Generator ────────────────────────────
// In production, this would call a real AI backend.
// For now it generates plausible mock suggestions.

const MOCK_SUGGESTIONS: Record<AgentRole, (text: string, intensity: AIIntensity) => { suggested: string; reason: string }> = {
  clarity_editor: (text, intensity) => {
    if (!text || text.length < 10) return { suggested: text, reason: '文本太短，无需润色' }
    const trimmed = text.replace(/其实/g, '').replace(/就是说/g, '').replace(/然后的话/g, '').trim()
    return {
      suggested: intensity === 'light' ? trimmed : trimmed.replace(/，/g, '，\n'),
      reason: '移除了口语化填充词，使表达更直接清晰',
    }
  },
  tone_stylist: (text, _intensity) => ({
    suggested: text,
    reason: '已按目标风格调整语气词和句式节奏',
  }),
  argument_enhancer: (text, _intensity) => ({
    suggested: text,
    reason: '强化了论点的逻辑递进关系，增加了过渡语句',
  }),
  conciseness_coach: (text, _intensity) => {
    if (!text || text.length < 20) return { suggested: text, reason: '段落已足够精简' }
    const shortened = text.slice(0, Math.floor(text.length * 0.8))
    return {
      suggested: shortened + '…',
      reason: `精简了约 ${Math.floor(text.length * 0.2)} 字，去除了重复表述`,
    }
  },
  hook_designer: (text, _intensity) => ({
    suggested: text,
    reason: '优化了开头的吸引力，使用悬念式引入',
  }),
}

export function generateMockSuggestion(
  agentRole: AgentRole,
  segmentId: string,
  text: string,
  scope: CollaborationScope,
  intensity: AIIntensity,
  selectionRange?: { start: number; end: number },
): AISuggestion {
  const targetText = selectionRange
    ? text.slice(selectionRange.start, selectionRange.end)
    : text
  const { suggested, reason } = MOCK_SUGGESTIONS[agentRole](targetText, intensity)
  return {
    id: `sug_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    agentRole,
    segmentId,
    scope,
    intensity,
    originalText: targetText,
    suggestedText: suggested,
    reason,
    status: 'pending',
    timestamp: Date.now(),
    selectionRange,
  }
}
