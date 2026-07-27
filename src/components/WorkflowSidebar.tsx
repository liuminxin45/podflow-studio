import { CheckCircle, GearSix, House, Plus, Radio } from '@phosphor-icons/react'
import { CloseOutlined } from '../icons/antdCompat'
import type { Workflow } from '../types/workflow'
import { deriveWorkflowStageStatuses, type DerivedStageStatus } from '../services/workflowStageStatus'
import NavigationActionButton from './NavigationActionButton'
import WorkflowSaveButton from './WorkflowSaveButton'
import WorkflowFailureNotice, { latestWorkflowFailure } from './WorkflowFailureNotice'

interface Props {
  workflow: Workflow | null
  activeStageId?: string | null
  onStageClick: (stageId: string) => void
  onOpenSettings: () => void
  hasUnsavedChanges: boolean
  onSave: () => Promise<unknown> | unknown
  onClose: () => void
  homeActive?: boolean
  settingsActive?: boolean
  hasElectronBackend?: boolean
  onHome?: () => void
  onCreate?: () => void
}

function WorkflowStep({ derived, active, onStageClick }: {
  derived: DerivedStageStatus
  active: boolean
  onStageClick: (stageId: string) => void
}) {
  const { stage, status, label, canEnter } = derived
  const completed = status === 'completed'

  return (
    <button
      type="button"
      className={`workflow-stage-button ${active ? 'is-active' : ''} is-${status}`}
      disabled={!canEnter}
      onClick={() => {
        if (canEnter) onStageClick(stage.id)
      }}
      title={`${stage.label}：${label}。${derived.contract.reason}`}
    >
      <span className="workflow-stage-state" aria-hidden="true">
        {completed ? <CheckCircle size={14} weight="fill" /> : <i />}
      </span>
      <span className={`workflow-step-label ${active ? 'is-active' : ''}`}>{stage.label}</span>
      <small>{label}</small>
    </button>
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
  homeActive = false,
  settingsActive = false,
  hasElectronBackend = false,
  onHome = () => undefined,
  onCreate = () => undefined,
}: Props) {
  const statuses = deriveWorkflowStageStatuses(workflow)
  const failure = latestWorkflowFailure(workflow)

  return (
    <aside className="workflow-sidebar">
      <header className="workflow-sidebar-brand">
        <span aria-hidden="true"><Radio weight="fill" /></span>
        <div><strong>PodFlow</strong><small>Studio</small></div>
      </header>

      <nav className="workflow-primary-nav" aria-label="主导航">
        <button type="button" className={homeActive ? 'is-active' : ''} aria-current={homeActive ? 'page' : undefined} onClick={onHome}>
          <House weight={homeActive ? 'fill' : 'regular'} /><span>节目库</span>
        </button>
        <button type="button" disabled={!hasElectronBackend} onClick={onCreate}>
          <Plus /><span>新建节目</span>
        </button>
      </nav>

      {workflow && (
        <>
          <header className="workflow-sidebar-header">
            <span>当前节目</span>
            <strong>{workflow.state?.selected_topic?.title || workflow.state?.script?.title || '未命名节目'}</strong>
          </header>
          <div className="workflow-stage-list">
            {statuses.map((derived) => (
              <div key={derived.stage.id}>
                <WorkflowStep derived={derived} active={activeStageId === derived.stage.id} onStageClick={onStageClick} />
              </div>
            ))}
          </div>
        </>
      )}

      <div className="workflow-sidebar-footer">
        {workflow && (
          <>
            {failure && <WorkflowFailureNotice compact workflow={workflow} failure={failure} />}
            <WorkflowSaveButton hasUnsavedChanges={hasUnsavedChanges} onSave={onSave} fullWidth />
            <NavigationActionButton label="关闭节目" title="关闭节目" icon={<CloseOutlined style={{ fontSize: 14 }} />} onClick={onClose} borderless />
          </>
        )}
        <button type="button" className={`workflow-settings-link ${settingsActive ? 'is-active' : ''}`} aria-current={settingsActive ? 'page' : undefined} onClick={onOpenSettings}>
          <GearSix /><span>设置</span>
        </button>
      </div>
    </aside>
  )
}
