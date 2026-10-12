import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import ContentWorkbench from '../briefing/ContentWorkbench'
import type { Workflow } from '../../types/workflow'

const workflow = {
  id: 'focused', status: 'completed', state: {
    episode_id: 'focused', runtime_config: { quick_brief: { audience: '普通听众', takeaway: '理解边界' } },
    selected_topic: { title: '主题' },
    facts: [{ id: 'f1', title: '事实标题', summary: '事实摘要', confidence: 'high',
      claims: [{ id: 'c1', text: '有依据的结论', status: 'supported' }],
      evidence: [{ id: 'e1', url: 'https://example.com/source', title: '原始来源', excerpt: '原文依据' }],
    }],
    edited_script: { id: 'script-1', title: '主题', description: '介绍', segments: [
      { id: 's1', type: 'quick_news', title: '核心问题', text: '已核验的口播正文。', source_fact_ids: ['f1'], source_claim_ids: ['c1'], speaker: 'Host A', estimated_seconds: 10 },
    ] },
  },
} as unknown as Workflow

function props() {
  return { workflow, visible: true, onClose: vi.fn(), onSources: vi.fn(), onRegenerate: vi.fn(), onDraftPatchChange: vi.fn(), onConfirm: vi.fn() }
}

describe('focused content workbench', () => {
  it('opens without rewriting facts, invalidating audio or losing claim bindings', async () => {
    const handlers = props()
    render(<ContentWorkbench {...handlers} />)
    await screen.findByDisplayValue('已核验的口播正文。')
    expect(handlers.onDraftPatchChange).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '来源与核验' }))
    expect(await screen.findByRole('link', { name: '原始来源' })).toHaveProperty('href', 'https://example.com/source')
    expect(screen.getByText('有依据的结论 · 有证据支持')).toBeTruthy()
  })

  it('keeps provenance when editing and passes an explicit confirmation', async () => {
    const handlers = props()
    render(<ContentWorkbench {...handlers} />)
    fireEvent.change(await screen.findByDisplayValue('已核验的口播正文。'), { target: { value: '修改后的正文。' } })
    await waitFor(() => expect(handlers.onDraftPatchChange).toHaveBeenCalled())
    const patch = handlers.onDraftPatchChange.mock.calls.at(-1)![0]
    expect(patch.edited_script.segments[0]).toMatchObject({ text: '修改后的正文。', source_fact_ids: ['f1'], source_claim_ids: ['c1'] })
    expect(patch).not.toHaveProperty('facts')
    fireEvent.click(screen.getByRole('button', { name: '确认内容，进入试听交付' }))
    await waitFor(() => expect(handlers.onConfirm).toHaveBeenCalledWith(patch))
  })

  it('keeps a regeneration failure visible while preserving the draft', async () => {
    const handlers = props()
    handlers.onRegenerate.mockRejectedValue(new Error('模型超时'))
    render(<ContentWorkbench {...handlers} />)
    fireEvent.click(screen.getByRole('button', { name: '重新成稿' }))
    expect(await screen.findByText('模型超时')).toBeTruthy()
    expect(screen.getByDisplayValue('已核验的口播正文。')).toBeTruthy()
  })
})
