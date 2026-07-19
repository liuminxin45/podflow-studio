import { CheckCircle, WarningCircle } from '@phosphor-icons/react'
import { CloseOutlined } from '../icons/antdCompat'
import type { Workflow } from '../types/workflow'
import { deriveWorkflowStageStatuses, type DerivedStageStatus, type EffectiveStageStatus } from '../services/workflowStageStatus'
import GlobalSettingsButton from './GlobalSettingsButton'
import NavigationActionButton from './NavigationActionButton'
import WorkflowSaveButton from './WorkflowSaveButton'

interface Props {
  workflow: Workflow | null
  activeStageId?: string | null
  onStageClick: (stageId: string) => void
  onOpenSettings: () => void
  hasUnsavedChanges: boolean
  onSave: () => Promise<unknown> | unknown
  onClose: () => void
}

function WorkflowStep({ derived, active, onStageClick }: {
  derived: DerivedStageStatus
  active: boolean
  onStageClick: (stageId: string) => void
}) {
  const { stage, status, label, canEnter, locked, stale } = derived
  const completed = status === 'completed'
  const borderColor = active ? 'var(--accent-primary)' : getStepBorderColor(status, stage.color)
  const background = active ? 'var(--accent-light)' : 'var(--bg-secondary)'

  return (
    <button
      type="button"
      disabled={!canEnter}
      onClick={() => {
        if (canEnter) onStageClick(stage.id)
      }}
      style={{
        width: '100%',
        border: `1px solid ${borderColor}`,
        background,
        borderRadius: 6,
        padding: '8px 10px',
        display: 'flex',
        alignItems: 'center',
        gap: 7,
        minHeight: 40,
        position: 'relative',
        textAlign: 'left',
        cursor: canEnter ? 'pointer' : 'not-allowed',
        opacity: locked ? 0.62 : 1,
        boxShadow: 'none',
        transition: 'border-color 0.16s ease, background 0.16s ease',
      }}
      title={`${stage.label}：${label}。${derived.contract.reason}`}
    >
      {active && (
        <span style={{
          position: 'absolute',
          left: 4,
          top: 9,
          bottom: 9,
          width: 2,
          borderRadius: 2,
          background: 'var(--accent-primary)',
        }} />
      )}
      {completed && (
        <CheckCircle
          size={16}
          weight="fill"
          color="var(--success-color)"
          style={{ flexShrink: 0 }}
        />
      )}
      {stale && (
        <WarningCircle
          size={16}
          weight="fill"
          color="var(--warning-color)"
          style={{ flexShrink: 0 }}
        />
      )}
      <div
        className={`workflow-step-label ${active ? 'is-active' : ''}`}
        style={{
        minWidth: 0,
        flex: 1,
        fontSize: 13,
        fontWeight: active ? 600 : 500,
        color: locked ? 'var(--text-tertiary)' : stale ? 'var(--warning-color)' : 'var(--text-primary)',
        lineHeight: 1.2,
        }}
      >
        {stage.label}
      </div>
    </button>
  )
}

function getStepBorderColor(status: EffectiveStageStatus, stageColor: string) {
  switch (status) {
    case 'completed':
      return 'var(--border-color)'
    case 'running':
      return stageColor
    case 'failed':
      return 'var(--error-color)'
    case 'waiting_approval':
      return 'var(--warning-color)'
    case 'stale':
      return '#ead9a4'
    case 'locked':
      return 'var(--border-light)'
    default:
      return 'var(--border-color)'
  }
}

function WorkflowConnector({ completed }: { completed: boolean }) {
  const color = completed ? 'var(--success-color)' : 'var(--text-tertiary)'
  const lineColor = completed ? '#bed5c0' : 'var(--border-color)'

  return (
    <div
      aria-hidden="true"
      style={{
        height: 18,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        position: 'relative',
      }}
    >
      <div style={{
        width: 1,
        height: 18,
        background: lineColor,
        opacity: completed ? 0.8 : 0.55,
      }} />
      <div style={{
        position: 'absolute',
        bottom: 2,
        width: 7,
        height: 7,
        borderRight: `1.5px solid ${color}`,
        borderBottom: `1.5px solid ${color}`,
        transform: 'rotate(45deg)',
        opacity: completed ? 0.95 : 0.75,
      }} />
    </div>
  )
}

export default function WorkflowSidebar({
  workflow,
  activeStageId,
  onStageClick,
  onOpenSettings,
  hasUnsavedChanges,
  onSave,
  onClose,
}: Props) {
  const statuses = deriveWorkflowStageStatuses(workflow)

  return (
    <aside style={{
      width: 'var(--stage-nav-width)',
      flexShrink: 0,
      height: '100%',
      borderRight: '1px solid var(--border-color)',
      background: 'var(--bg-secondary)',
      display: 'flex',
      flexDirection: 'column',
      position: 'relative',
      zIndex: 1,
    }}>
      <div style={{ padding: 12, display: 'flex', flexDirection: 'column', overflow: 'auto', flex: 1, minHeight: 0 }}>
        {statuses.map((derived, index) => (
          <div key={derived.stage.id}>
            <WorkflowStep
              derived={derived}
              active={activeStageId === derived.stage.id}
              onStageClick={onStageClick}
            />
            {index < statuses.length - 1 && (
              <WorkflowConnector completed={derived.connectorCompleted} />
            )}
          </div>
        ))}
      </div>
      <div style={{ padding: 12, borderTop: '1px solid var(--border-light)', display: 'grid', gap: 4 }}>
        <WorkflowSaveButton hasUnsavedChanges={hasUnsavedChanges} onSave={onSave} fullWidth />
        <NavigationActionButton
          label="关闭节目"
          title="关闭节目"
          icon={<CloseOutlined style={{ fontSize: 14 }} />}
          onClick={onClose}
          borderless
        />
        <div style={{ height: 1, background: 'var(--border-light)', margin: '4px 0' }} />
        <GlobalSettingsButton onOpen={onOpenSettings} />
      </div>
    </aside>
  )
}
