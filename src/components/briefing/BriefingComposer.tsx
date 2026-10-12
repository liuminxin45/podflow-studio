import { useState } from 'react'
import { Button, Input } from 'antd'
import { ArrowRight, Headphones, SlidersHorizontal } from '@phosphor-icons/react'
import type { BriefingReadiness, BriefingRequest } from '../../services/briefingRun'

interface Props {
  busy: boolean
  hasElectronBackend: boolean
  readiness: BriefingReadiness
  onStart: (request: BriefingRequest) => Promise<void> | void
  onOpenSettings: () => void
  onOpenSample: () => void
}

export default function BriefingComposer({
  busy,
  hasElectronBackend,
  readiness,
  onStart,
  onOpenSettings,
  onOpenSample,
}: Props) {
  const [topic, setTopic] = useState('')
  const [materialText, setMaterialText] = useState('')
  const [audience, setAudience] = useState('')
  const [takeaway, setTakeaway] = useState('')

  return (
    <section className="briefing-composer" aria-labelledby="briefing-composer-title">
      <header>
        <h1 id="briefing-composer-title">开始一集</h1>
        <p>今天想讲清楚什么？一个问题就够了，也可以从你提供的素材开始。</p>
        <p>先核验来源、生成稿件。你确认内容后再制作声音；不会自动发布。</p>
      </header>

      <div className="briefing-composer-form">
        <label className="briefing-field">
          <span>关注主题</span>
          <Input
            value={topic}
            onChange={event => setTopic(event.target.value)}
            placeholder="例如：AI 编程工具、国内科技新闻"
            disabled={busy}
            maxLength={120}
          />
        </label>
        <details className="briefing-optional">
          <summary>补充素材与听众（可选）</summary>
        <label className="briefing-field">
          <span>讲给谁听（可选）</span>
          <Input value={audience} onChange={event => setAudience(event.target.value)} disabled={busy} maxLength={200} placeholder="例如：想了解 AI 工具的普通上班族" />
        </label>
        <label className="briefing-field">
          <span>希望听众带走什么（可选）</span>
          <Input value={takeaway} onChange={event => setTakeaway(event.target.value)} disabled={busy} maxLength={300} placeholder="例如：理解哪些工作值得交给 AI，以及它的边界" />
        </label>
        <label className="briefing-field">
          <span>指定素材</span>
          <Input.TextArea
            value={materialText}
            onChange={event => setMaterialText(event.target.value)}
            placeholder={'每行粘贴一个网页链接，或直接粘贴需要整理的文字。\n这部分可以留空。'}
            disabled={busy}
            autoSize={{ minRows: 4, maxRows: 8 }}
          />
        </label>
        </details>
      </div>

      <div className="briefing-composer-footer">
        <div className={`briefing-readiness ${readiness.ready ? 'is-ready' : 'is-blocked'}`}>
          {readiness.loading ? (
            <span>正在检查成稿服务</span>
          ) : readiness.ready ? (
            <span>AI：{readiness.llmLabel} · 声音服务可在审稿后配置</span>
          ) : (
            <>
              <span>{readiness.issues[0] || '还没有完成运行配置'}</span>
              <Button type="link" icon={<SlidersHorizontal />} onClick={onOpenSettings}>打开设置</Button>
            </>
          )}
        </div>
        <Button
          className="briefing-primary-action"
          type="primary"
          size="large"
          icon={<ArrowRight />}
          iconPosition="end"
          loading={busy}
          disabled={!hasElectronBackend || readiness.loading || !readiness.ready || !(topic.trim() || materialText.trim())}
          onClick={() => void onStart({ topic: topic.trim(), materialText: materialText.trim(), audience: audience.trim(), takeaway: takeaway.trim() })}
        >
          研究并生成稿件
        </Button>
      </div>

      <button type="button" className="briefing-sample-link" onClick={onOpenSample}>
        <Headphones />
        <span><strong>先试听公开样例</strong><small>在产品页打开一集已经完成终审的真实节目</small></span>
      </button>
    </section>
  )
}
