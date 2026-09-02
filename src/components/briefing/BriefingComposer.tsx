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

  return (
    <section className="briefing-composer" aria-labelledby="briefing-composer-title">
      <header>
        <h1 id="briefing-composer-title">今天想听什么？</h1>
        <p>输入一个关注主题，也可以粘贴链接或素材文字。留空则从已配置的推荐来源生成今日晨报。</p>
        <p>生成会自动完成研究、成稿、配音和机器审核，但不会自动发布。</p>
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
      </div>

      <div className="briefing-composer-footer">
        <div className={`briefing-readiness ${readiness.ready ? 'is-ready' : 'is-blocked'}`}>
          {readiness.loading ? (
            <span>正在检查 AI 和声音服务</span>
          ) : readiness.ready ? (
            <span>AI：{readiness.llmLabel}<b aria-hidden="true">/</b>声音：{readiness.voiceLabel}</span>
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
          disabled={!hasElectronBackend || readiness.loading || !readiness.ready}
          onClick={() => void onStart({ topic: topic.trim(), materialText: materialText.trim() })}
        >
          生成今日节目
        </Button>
      </div>

      <button type="button" className="briefing-sample-link" onClick={onOpenSample}>
        <Headphones />
        <span><strong>先试听公开样例</strong><small>在产品页打开一集已经完成终审的真实节目</small></span>
      </button>
    </section>
  )
}
