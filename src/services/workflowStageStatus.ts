import { STAGES, type StageDefinition, type StageStatus } from '../components/workflowStages'
import type { PodcastState, Workflow } from '../types/workflow'

export type WorkflowStageId = StageDefinition['id']
export type StageValidity = 'empty' | 'valid' | 'invalid' | 'stale' | 'running' | 'failed' | 'waiting_approval'
export type EffectiveStageStatus = StageStatus | 'locked' | 'stale'

export interface StageContract {
  stage_id: WorkflowStageId
  schema_version: 1
  status: StageValidity
  completed: boolean
  can_enter: boolean
  updated_at?: string
  blocked_by_stage_id?: WorkflowStageId
  reason: string
  outputs: Record<string, number | boolean | string>
}

export interface DerivedStageStatus {
  stage: StageDefinition
  contract: StageContract
  status: EffectiveStageStatus
  label: string
  completed: boolean
  canEnter: boolean
  locked: boolean
  stale: boolean
  connectorCompleted: boolean
}

function hasItems(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0
}

function hasObjectData(value: unknown): boolean {
  return Boolean(value && typeof value === 'object' && Object.keys(value).length > 0)
}

function countItems(value: unknown): number {
  return Array.isArray(value) ? value.length : 0
}

function countReadyItems(value: unknown): number {
  return Array.isArray(value)
    ? value.filter(item => item && typeof item === 'object' && (item as { _status?: unknown })._status === 'ready').length
    : 0
}

function hasReadyItems(value: unknown): boolean {
  return countReadyItems(value) > 0
}

function hasDraftFactsAndStructure(state: PodcastState): boolean {
  return Boolean(state.selected_topic?.title || state.selected_topic?.description) &&
    (hasItems(state.facts) || hasItems(state.selected_topics) || hasObjectData(state.episode_brief))
}

function hasDraftScript(state: PodcastState): boolean {
  return hasItems(state.edited_script?.segments) ||
    hasItems(state.script?.segments)
}

function completedByState(stage: StageDefinition, state: PodcastState): boolean {
  switch (stage.id) {
    case 'discover':
      return hasItems(state.selected_materials) || hasItems(state.fetch_contents)
    case 'organize':
      return hasReadyItems((state.organize_ui as any)?.candidates) ||
        hasReadyItems(state.selected_materials)
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

function hasStageArtifacts(stage: StageDefinition, state: PodcastState): boolean {
  switch (stage.id) {
    case 'discover':
      return hasItems(state.selected_materials) || hasItems(state.fetch_contents)
    case 'organize':
      return hasItems(state.cleaned_contents) || hasItems((state.organize_ui as any)?.candidates)
    case 'draft':
      return hasItems(state.facts) ||
        hasItems(state.selected_topics) ||
        hasObjectData(state.episode_brief) ||
        Boolean(state.selected_topic?.title || state.selected_topic?.description) ||
        hasDraftScript(state)
    case 'produce':
      return Boolean(state.audio_outputs?.final_audio_path) || hasItems(state.voice_segments)
    case 'publish':
      return hasObjectData(state.publish_outputs)
    default:
      return false
  }
}

function stageOutputs(stage: StageDefinition, state: PodcastState): Record<string, number | boolean | string> {
  switch (stage.id) {
    case 'discover':
      return {
        fetch_contents_count: countItems(state.fetch_contents),
        selected_materials_count: countItems(state.selected_materials),
      }
    case 'organize':
      return {
        cleaned_contents_count: countItems(state.cleaned_contents),
        organize_candidates_count: countItems((state.organize_ui as any)?.candidates),
        ready_organize_candidates_count: countReadyItems((state.organize_ui as any)?.candidates),
      }
    case 'draft':
      return {
        facts_count: countItems(state.facts),
        selected_topics_count: countItems(state.selected_topics),
        has_selected_topic: Boolean(state.selected_topic?.title || state.selected_topic?.description),
        has_episode_brief: hasObjectData(state.episode_brief),
        edited_segments_count: countItems(state.edited_script?.segments),
        script_segments_count: countItems(state.script?.segments),
      }
    case 'produce':
      return {
        voice_segments_count: countItems(state.voice_segments),
        has_final_audio: Boolean(state.audio_outputs?.final_audio_path),
      }
    case 'publish':
      return {
        has_feed_xml: Boolean(state.publish_outputs?.feed_xml),
        has_publish_outputs: hasObjectData(state.publish_outputs),
      }
    default:
      return {}
  }
}

function stageExecutionStatus(stage: StageDefinition, workflow: Workflow): StageStatus | null {
  const statuses = stage.subNodes.map(node => workflow.nodeExecutions?.[node]?.status || 'pending')
  if (statuses.some(status => status === 'failed')) return 'failed'
  if (statuses.some(status => status === 'waiting_approval')) return 'waiting_approval'
  if (statuses.some(status => status === 'running')) return 'running'
  if (statuses.some(status => status === 'completed')) return 'completed'
  return null
}

function statusLabel(status: EffectiveStageStatus): string {
  switch (status) {
    case 'completed': return '已完成'
    case 'running': return '进行中'
    case 'failed': return '失败'
    case 'waiting_approval': return '待确认'
    case 'locked': return '未解锁'
    case 'stale': return '需重新生成'
    default: return '待开始'
  }
}

function ownReason(stage: StageDefinition, completed: boolean): string {
  if (completed) return `${stage.label}层输出有效`
  return `${stage.label}层还没有有效输出`
}

export function deriveWorkflowStageStatuses(workflow: Workflow | null): DerivedStageStatus[] {
  if (!workflow) {
    return STAGES.map((stage, index) => {
      const locked = index > 0
      const status: EffectiveStageStatus = locked ? 'locked' : 'pending'
      return {
        stage,
        status,
        label: statusLabel(status),
        completed: false,
        canEnter: !locked,
        locked,
        stale: false,
        connectorCompleted: false,
        contract: {
          stage_id: stage.id,
          schema_version: 1,
          status: locked ? 'invalid' : 'empty',
          completed: false,
          can_enter: !locked,
          blocked_by_stage_id: locked ? STAGES[0].id : undefined,
          reason: locked ? '请先创建并完成发现层' : '尚未创建节目',
          outputs: {},
        },
      }
    })
  }

  let previousValid = true
  let blockingStage: StageDefinition | null = null

  return STAGES.map(stage => {
    const executionStatus = stageExecutionStatus(stage, workflow)
    const ownCompleted = completedByState(stage, workflow.state)
    const ownArtifacts = hasStageArtifacts(stage, workflow.state)
    const outputs = stageOutputs(stage, workflow.state)
    const dependencyBlocked = !previousValid
    let status: EffectiveStageStatus
    let validity: StageValidity
    let reason = ownReason(stage, ownCompleted)

    if (dependencyBlocked) {
      status = ownArtifacts ? 'stale' : 'locked'
      validity = ownArtifacts ? 'stale' : 'invalid'
      reason = `请先完成${blockingStage?.label || '前序'}层`
    } else if (executionStatus === 'failed') {
      status = 'failed'
      validity = 'failed'
      reason = `${stage.label}层执行失败`
    } else if (executionStatus === 'waiting_approval') {
      status = 'waiting_approval'
      validity = 'waiting_approval'
      reason = `${stage.label}层等待确认`
    } else if (executionStatus === 'running') {
      status = 'running'
      validity = 'running'
      reason = `${stage.label}层正在运行`
    } else if (ownCompleted) {
      status = 'completed'
      validity = 'valid'
    } else {
      status = 'pending'
      validity = 'empty'
    }

    const completed = status === 'completed'
    const canEnter = !dependencyBlocked
    const contract: StageContract = {
      stage_id: stage.id,
      schema_version: 1,
      status: validity,
      completed,
      can_enter: canEnter,
      updated_at: workflow.state.discover_meta?.generated_at as string | undefined,
      blocked_by_stage_id: dependencyBlocked ? blockingStage?.id : undefined,
      reason,
      outputs,
    }

    const derived: DerivedStageStatus = {
      stage,
      contract,
      status,
      label: statusLabel(status),
      completed,
      canEnter,
      locked: status === 'locked',
      stale: status === 'stale',
      connectorCompleted: completed,
    }

    if (!completed && previousValid) {
      previousValid = false
      blockingStage = stage
    }

    return derived
  })
}

export function deriveWorkflowStageStatusMap(workflow: Workflow | null): Record<WorkflowStageId, DerivedStageStatus> {
  return Object.fromEntries(
    deriveWorkflowStageStatuses(workflow).map(status => [status.stage.id, status]),
  ) as Record<WorkflowStageId, DerivedStageStatus>
}

export function canEnterStage(workflow: Workflow | null, stageId: string): boolean {
  const status = deriveWorkflowStageStatusMap(workflow)[stageId as WorkflowStageId]
  return Boolean(status?.canEnter)
}
