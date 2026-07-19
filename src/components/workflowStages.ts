import type { Workflow } from '../types/workflow'

export type StageStatus = 'pending' | 'running' | 'completed' | 'failed' | 'waiting_approval'

export interface StageDefinition {
  id: string
  label: string
  subtitle: string
  subNodes: string[]
  color: string
}

export const STAGES: StageDefinition[] = [
  { id: 'discover', label: '发现', subtitle: '世界在发生什么', subNodes: ['fetch'], color: '#3b82f6' },
  { id: 'organize', label: '整理', subtitle: '去噪、筛选、归类', subNodes: ['preprocess'], color: '#06b6d4' },
  { id: 'draft', label: '成稿', subtitle: '事实卡片、结构确认、口播稿', subNodes: ['research', 'topic_selection', 'facts', 'script'], color: '#8b5cf6' },
  { id: 'produce', label: '制作', subtitle: '让文字变成声音', subNodes: ['tts', 'audio_postprocess', 'assets'], color: '#10b981' },
  { id: 'publish', label: '发布', subtitle: '归档并同步到发布目标', subNodes: ['publish'], color: '#ef4444' },
]

function hasItems(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0
}

function hasObjectData(value: unknown): boolean {
  return Boolean(value && typeof value === 'object' && Object.keys(value).length > 0)
}

function hasDraftFactsAndStructure(state: Workflow['state']): boolean {
  return Boolean(state.selected_topic?.title || state.selected_topic?.description) &&
    (
      hasItems((state as any).facts) ||
      hasItems((state as any).selected_topics) ||
      hasObjectData((state as any).episode_brief)
    )
}

function hasDraftScript(state: Workflow['state']): boolean {
  return hasItems(state.edited_script?.segments) ||
    hasItems(state.script?.segments) ||
    Boolean(state.script?.title || state.script?.description)
}

function isStageCompletedByState(stage: StageDefinition, workflow: Workflow): boolean {
  const state = workflow.state || {}
  switch (stage.id) {
    case 'discover':
      return hasItems(state.selected_materials) || hasItems(state.fetch_contents)
    case 'organize':
      return hasItems(state.cleaned_contents)
    case 'draft':
      return hasDraftFactsAndStructure(state) && hasDraftScript(state)
    case 'produce':
      return Boolean(state.audio_outputs?.final_audio_path) || hasItems(state.voice_segments)
    case 'publish':
      return hasObjectData(state.publish_outputs)
    default:
      return false
  }
}

export function getStageStatus(stage: StageDefinition, workflow: Workflow | null): StageStatus {
  if (!workflow) return 'pending'
  const statuses = stage.subNodes.map(n => workflow.nodeExecutions?.[n]?.status || 'pending')
  if (statuses.some(s => s === 'failed')) return 'failed'
  if (statuses.some(s => s === 'waiting_approval')) return 'waiting_approval'
  if (statuses.some(s => s === 'running')) return 'running'
  if (isStageCompletedByState(stage, workflow)) return 'completed'
  if (statuses.every(s => s === 'completed')) return 'completed'
  if (statuses.some(s => s === 'completed')) return 'running'
  return 'pending'
}

export function getStageDuration(stage: StageDefinition, workflow: Workflow | null): number {
  if (!workflow) return 0
  return stage.subNodes.reduce((sum, n) => sum + (workflow.nodeExecutions?.[n]?.duration || 0), 0)
}

export function getStageProgress(stage: StageDefinition, workflow: Workflow | null) {
  const completed = stage.subNodes.filter(n => workflow?.nodeExecutions?.[n]?.status === 'completed').length
  return { completed, total: stage.subNodes.length }
}

export function getStatusLabel(status: StageStatus): string {
  switch (status) {
    case 'completed': return '已完成'
    case 'running': return '进行中'
    case 'failed': return '失败'
    case 'waiting_approval': return '待确认'
    default: return '待开始'
  }
}

export function getStatusColor(status: StageStatus, fallbackColor = 'var(--accent-primary)'): string {
  switch (status) {
    case 'completed': return 'var(--success-color)'
    case 'running': return fallbackColor
    case 'failed': return 'var(--error-color)'
    case 'waiting_approval': return 'var(--warning-color)'
    default: return 'var(--text-tertiary)'
  }
}

export function getStatusIcon(status: StageStatus): string {
  switch (status) {
    case 'completed': return '完成'
    case 'running': return '…'
    case 'failed': return '!'
    case 'waiting_approval': return '?'
    default: return ''
  }
}

export function getNextStage(workflow: Workflow | null): StageDefinition {
  return STAGES.find(stage => getStageStatus(stage, workflow) !== 'completed') || STAGES[STAGES.length - 1]
}

export function getStageStats(workflow: Workflow | null) {
  const statuses = STAGES.map(stage => getStageStatus(stage, workflow))
  return {
    completed: statuses.filter(status => status === 'completed').length,
    running: statuses.filter(status => status === 'running').length,
    failed: statuses.filter(status => status === 'failed').length,
    waitingApproval: statuses.filter(status => status === 'waiting_approval').length,
    total: STAGES.length,
  }
}
