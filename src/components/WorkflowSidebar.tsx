import type { Workflow } from '../types/workflow'
import {
  STAGES,
  getStageStatus,
  getStatusColor,
  getStatusLabel,
  type StageDefinition,
} from './workflowStages'

interface Props {
  workflow: Workflow | null
  activeStageId?: string | null
  onStageClick: (stageId: string) => void
}

function WorkflowStep({ stage, workflow, active, onStageClick }: {
  stage: StageDefinition
  workflow: Workflow | null
  active: boolean
  onStageClick: (stageId: string) => void
}) {
  const status = getStageStatus(stage, workflow)
  const statusColor = getStatusColor(status, stage.color)
  const isStrongState = status === 'completed' || status === 'failed' || status === 'waiting_approval'
  const borderColor = active ? 'var(--accent-primary)' : status === 'pending' ? 'var(--border-color)' : statusColor
  const borderWidth = isStrongState ? 2 : 1

  return (
    <button
      type="button"
      onClick={() => onStageClick(stage.id)}
      style={{
        width: '100%',
        border: `${borderWidth}px solid ${borderColor}`,
        background: active ? 'var(--accent-light)' : status === 'pending' ? 'var(--bg-secondary)' : `${stage.color}08`,
        borderRadius: 8,
        padding: borderWidth === 2 ? '9px 11px' : '10px 12px',
        display: 'flex',
        alignItems: 'center',
        position: 'relative',
        textAlign: 'left',
        cursor: 'pointer',
        boxShadow: active ? '0 8px 22px rgba(37, 99, 235, 0.14)' : status === 'running' ? `0 8px 22px ${stage.color}14` : 'none',
        transition: 'border-color 0.2s ease, box-shadow 0.2s ease, background 0.2s ease, transform 0.2s ease',
      }}
      title={`${stage.label}：${getStatusLabel(status)}`}
    >
      {active && (
        <span style={{
          position: 'absolute',
          left: 5,
          top: 8,
          bottom: 8,
          width: 3,
          borderRadius: 999,
          background: 'var(--accent-primary)',
        }} />
      )}
      <div style={{ fontSize: 14, fontWeight: isStrongState ? 800 : 700, color: 'var(--text-primary)' }}>
        {stage.label}
      </div>
    </button>
  )
}

function WorkflowConnector() {
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
        background: 'linear-gradient(180deg, var(--border-color), var(--text-tertiary))',
        opacity: 0.55,
      }} />
      <div style={{
        position: 'absolute',
        bottom: 2,
        width: 7,
        height: 7,
        borderRight: '1.5px solid var(--text-tertiary)',
        borderBottom: '1.5px solid var(--text-tertiary)',
        transform: 'rotate(45deg)',
        opacity: 0.75,
      }} />
    </div>
  )
}

export default function WorkflowSidebar({ workflow, activeStageId, onStageClick }: Props) {
  return (
    <aside style={{
      width: 148,
      flexShrink: 0,
      height: '100%',
      borderRight: '1px solid var(--border-color)',
      background: 'var(--bg-secondary)',
      display: 'flex',
      flexDirection: 'column',
      position: 'relative',
      zIndex: 1201,
    }}>
      <div style={{ padding: '18px 16px 12px', borderBottom: '1px solid var(--border-light)' }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>流程导航</div>
      </div>
      <div style={{ padding: 12, display: 'flex', flexDirection: 'column', overflow: 'auto' }}>
        {STAGES.map((stage, index) => (
          <div key={stage.id}>
            <WorkflowStep
              stage={stage}
              workflow={workflow}
              active={activeStageId === stage.id}
              onStageClick={onStageClick}
            />
            {index < STAGES.length - 1 && <WorkflowConnector />}
          </div>
        ))}
      </div>
    </aside>
  )
}
