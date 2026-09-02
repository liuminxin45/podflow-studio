import { Button } from 'antd'
import { ArrowRight, Check, Headphones, Play, ShieldCheck, WarningCircle } from '@phosphor-icons/react'
import type { Workflow } from '../../types/workflow'
import { briefingTitle, sourceCount } from '../../services/briefingRun'

interface Props {
  workflow: Workflow
  onPlay: () => void
  onOpenStudio: () => void
  onOpenPublish: () => void
  onStartNew: () => void
}

function gateLabel(status?: string) {
  if (status === 'passed') return '通过'
  if (status === 'failed') return '需处理'
  return '待完成'
}

export default function BriefingResult({ workflow, onPlay, onOpenStudio, onOpenPublish, onStartNew }: Props) {
  const readiness = workflow.state.release_readiness
  const gates = readiness?.gates
  const duration = Number(workflow.state.audio_outputs?.duration_seconds || 0)
  const minutes = duration > 0 ? `${Math.max(1, Math.round(duration / 60))} 分钟` : '音频已生成'
  const publishReady = readiness?.status === 'publish_ready'
  const previewReady = readiness?.status === 'preview_ready'

  return (
    <section className="briefing-result" aria-labelledby="briefing-result-title">
      <div className="briefing-result-copy">
        <span>{publishReady ? '可以正式发布' : previewReady ? '预览已就绪' : '草稿试听'}</span>
        <h1 id="briefing-result-title">{briefingTitle(workflow)}</h1>
        <p>{minutes}，引用 {sourceCount(workflow)} 个来源</p>
        <Button className="briefing-play-action" type="primary" size="large" icon={<Play weight="fill" />} onClick={onPlay}>
          播放节目
        </Button>
      </div>

      <div className={`briefing-review-summary ${publishReady ? 'is-ready' : ''}`}>
        <header>
          {publishReady ? <ShieldCheck weight="fill" /> : <WarningCircle weight="fill" />}
          <div>
            <strong>{publishReady ? '全部质量门禁已经通过' : '这份音频还不能直接发布'}</strong>
            <span>{publishReady ? '当前音频已经绑定人工终审结果。' : '可以试听和编辑，正式发布仍以质量门禁为准。'}</span>
          </div>
        </header>
        <dl>
          <div><dt>来源核验</dt><dd>{gateLabel(gates?.sources?.status)}{gates?.sources?.status === 'passed' && <Check />}</dd></div>
          <div><dt>事实检查</dt><dd>{gateLabel(gates?.facts?.status)}{gates?.facts?.status === 'passed' && <Check />}</dd></div>
          <div><dt>稿件门禁</dt><dd>{gateLabel(gates?.script?.status)}{gates?.script?.status === 'passed' && <Check />}</dd></div>
          <div><dt>人工终审</dt><dd>{gateLabel(gates?.human_approval?.status)}{gates?.human_approval?.status === 'passed' && <Check />}</dd></div>
        </dl>
      </div>

      <div className="briefing-result-actions">
        <Button icon={<Headphones />} onClick={onOpenStudio}>打开制作工作台</Button>
        <Button icon={<ArrowRight />} iconPosition="end" onClick={onOpenPublish}>检查并准备发布</Button>
        <Button type="text" onClick={onStartNew}>生成另一份节目</Button>
      </div>
    </section>
  )
}
