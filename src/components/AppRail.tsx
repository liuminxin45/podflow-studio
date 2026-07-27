import { GearSix, House, Plus, Radio } from '@phosphor-icons/react'

interface Props {
  homeActive: boolean
  workflowActive: boolean
  hasElectronBackend: boolean
  onHome: () => void
  onCreate: () => void
  onSettings: () => void
}

export default function AppRail({ homeActive, workflowActive, hasElectronBackend, onHome, onCreate, onSettings }: Props) {
  return (
    <aside className="app-rail" aria-label="主导航">
      <div className="app-rail-brand" title="PodFlow Studio">
        <span aria-hidden="true"><Radio weight="fill" /></span>
        <strong>PF</strong>
      </div>
      <nav className="app-rail-nav">
        <button type="button" className={homeActive ? 'is-active' : ''} aria-current={homeActive ? 'page' : undefined} aria-label="节目库" title="节目库" onClick={onHome}>
          <House weight={homeActive ? 'fill' : 'regular'} /><span>节目</span>
        </button>
        <button type="button" className={workflowActive ? 'is-active' : ''} aria-current={workflowActive ? 'page' : undefined} aria-label="当前制作" title="当前制作" disabled={!workflowActive}>
          <Radio weight={workflowActive ? 'fill' : 'regular'} /><span>制作</span>
        </button>
        <button type="button" aria-label="新增节目" title="新增节目" disabled={!hasElectronBackend} onClick={onCreate}>
          <Plus /><span>新建</span>
        </button>
      </nav>
      <button type="button" className="app-rail-settings" aria-label="设置" title="设置" onClick={onSettings}>
        <GearSix /><span>设置</span>
      </button>
    </aside>
  )
}
