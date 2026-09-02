import { Button } from 'antd'
import { Check, Circle, SpinnerGap, WarningCircle } from '@phosphor-icons/react'
import type { Workflow } from '../../types/workflow'
import {
  BRIEFING_PHASES,
  currentBriefingDetail,
  latestBriefingFailure,
  phaseStatus,
} from '../../services/briefingRun'

interface Props {
  workflow: Workflow
  onOpenStudio: () => void
  onStartNew: () => void
}

export default function BriefingProgress({ workflow, onOpenStudio, onStartNew }: Props) {
  const failure = latestBriefingFailure(workflow)

  if (failure) {
    return (
      <section className="briefing-run-state is-failed" aria-labelledby="briefing-failure-title">
        <WarningCircle size={30} weight="fill" />
        <div>
          <span>节目生成已停止</span>
          <h1 id="briefing-failure-title">停在“{failure.node}”</h1>
          <p>{failure.message}</p>
          <div className="briefing-state-actions">
            <Button type="primary" onClick={onOpenStudio}>打开制作工作台</Button>
            <Button onClick={onStartNew}>重新开始</Button>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="briefing-run-state" aria-labelledby="briefing-progress-title">
      <header>
        <span>正在制作今天的节目</span>
        <h1 id="briefing-progress-title">可以先去做别的事</h1>
        <p>{currentBriefingDetail(workflow)}</p>
      </header>
      <ol className="briefing-phase-list">
        {BRIEFING_PHASES.map(phase => {
          const status = phaseStatus(workflow, phase)
          return (
            <li key={phase.id} className={`is-${status}`}>
              <span aria-hidden="true">
                {status === 'completed' && <Check weight="bold" />}
                {status === 'running' && <SpinnerGap className="is-spinning" />}
                {status === 'pending' && <Circle />}
                {status === 'failed' && <WarningCircle weight="fill" />}
              </span>
              <strong>{phase.label}</strong>
              <small>{status === 'completed' ? '已完成' : status === 'running' ? '进行中' : status === 'failed' ? '失败' : '等待中'}</small>
            </li>
          )
        })}
      </ol>
      <p className="briefing-background-note">任务会在 Electron 后台继续运行。切换页面不会中断当前节点。</p>
    </section>
  )
}
