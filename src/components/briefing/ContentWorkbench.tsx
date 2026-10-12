import { useState } from 'react'
import { Alert, Button, Drawer } from 'antd'
import type { Workflow } from '../../types/workflow'
import WritingLayer from '../writing'
import { draftContentSignature } from '../../services/draftContent'

interface Props {
  workflow: Workflow
  visible: boolean
  onClose: () => void
  onSources: () => void
  onRegenerate: () => Promise<void>
  onDraftPatchChange: (patch: Record<string, any>) => void
  onConfirm: (patch: Record<string, any>) => Promise<void>
}

/** The default editor consumes the real fact packet; it never rebuilds it from UI selections. */
export default function ContentWorkbench({ workflow, visible, onClose, onSources, onRegenerate, onDraftPatchChange, onConfirm }: Props) {
  const [sourcesOpen, setSourcesOpen] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')
  const brief = workflow.state.runtime_config.quick_brief
  const script = workflow.state.edited_script?.segments?.length ? workflow.state.edited_script : workflow.state.script
  const changed = (patch: Record<string, any>) => draftContentSignature(patch.edited_script) !== draftContentSignature(script)
  if (!visible) return null
  return (
    <div className="stage-workbench creation-page">
      {error && <Alert type="error" message={error} showIcon />}
      {generating && <Alert type="info" message="正在重新成稿，当前稿件暂时只读；失败时会保留原稿。" />}
      <div ref={element => { if (element) element.inert = generating || workflow.status === 'running' }} style={{ flex: 1, minHeight: 0 }}>
      <WritingLayer
        visible embedded onClose={onClose} workflow={workflow}
        headerTitle="打磨内容" proceedLabel="确认内容，进入试听交付"
        episodeTitle={script?.title || workflow.state.selected_topic?.title || ''}
        episodeDesc={script?.description || ''}
        headerLeadingActions={<>
          <Button onClick={() => setSourcesOpen(true)}>来源与核验</Button>
          <Button loading={generating} disabled={workflow.status === 'running'} onClick={async () => {
            setGenerating(true)
            setError('')
            try { await onRegenerate() } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) }
            finally { setGenerating(false) }
          }}>重新成稿</Button>
        </>}
        onDraftPatchChange={patch => { if (!generating && changed(patch)) onDraftPatchChange(patch) }}
        onProceedToProduction={async patch => {
          setError('')
          try { await onConfirm(changed(patch) ? patch : {}) }
          catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) }
        }}
      />
      </div>
      <Drawer title="来源与核验" open={sourcesOpen} onClose={() => setSourcesOpen(false)} width={480}>
        <p>讲给：{brief?.audience || '未指定听众'}</p>
        <p>听后收获：{brief?.takeaway || '未指定'}</p>
        <Alert type="info" message="核对结论是否有依据、是否交代限制；机器核验不能替代你的判断。" />
        {(workflow.state.facts || []).map(fact => <section key={fact.id}>
          <h3>{fact.title}</h3><p>{fact.summary}</p>
          <ul>{(fact.claims || []).map(claim => <li key={claim.id}>{claim.text} · {claim.status === 'supported' ? '有证据支持' : claim.status === 'conflicted' ? '证据冲突' : '证据不足'}</li>)}</ul>
          <ul>{(fact.evidence || []).map((source, index) => <li key={`${source.url}-${index}`}>
            {/^https?:\/\//i.test(source.url || '') ? <a href={source.url} target="_blank" rel="noreferrer">{source.title || source.url}</a> : '缺少可追踪的原文链接'}
            {source.excerpt && <p>{source.excerpt}</p>}
          </li>)}</ul>
        </section>)}
        {!workflow.state.facts?.length && <Alert type="warning" message="还没有事实卡片，不能据此发布。" />}
        <Button onClick={() => { setSourcesOpen(false); onSources() }}>补充与整理素材</Button>
      </Drawer>
    </div>
  )
}
