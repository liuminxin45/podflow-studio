import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import WritingLayer from '../writing'

describe('WritingLayer draft persistence handoff', () => {
  it('emits the hydrated draft and every subsequent edit without an initial blank overwrite', async () => {
    const onDraftPatchChange = vi.fn()
    const workflow = {
      id: 'workflow-persistence',
      status: 'draft',
      currentNode: null,
      nodeExecutions: {},
      state: {
        episode_id: 'episode-persistence',
        facts: [],
        script: {},
        edited_script: {
          id: 'edited-1',
          title: '已保存标题',
          segments: [{
            id: 'seg-1',
            type: 'quick_news',
            title: '已保存快讯',
            text: '这是已经保存的正文。',
            source_fact_ids: [],
          }],
        },
      },
    }

    render(
      <WritingLayer
        visible
        onClose={vi.fn()}
        workflow={workflow as any}
        onDraftPatchChange={onDraftPatchChange}
      />,
    )

    await waitFor(() => expect(onDraftPatchChange).toHaveBeenCalled())
    expect(onDraftPatchChange.mock.calls[0][0].edited_script.segments[0].text).toBe('这是已经保存的正文。')

    onDraftPatchChange.mockClear()
    fireEvent.change(screen.getByDisplayValue('这是已经保存的正文。'), {
      target: { value: '这是切换页面前必须落盘的新正文。' },
    })

    await waitFor(() => {
      const patch = onDraftPatchChange.mock.calls.at(-1)?.[0]
      expect(patch.edited_script.segments[0].text).toBe('这是切换页面前必须落盘的新正文。')
    })
  })
})
