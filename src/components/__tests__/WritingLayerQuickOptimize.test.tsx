import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../services/writing/quickNewsOptimizer', () => ({
  optimizeQuickNews: vi.fn(),
}))

import WritingLayer from '../writing'
import { optimizeQuickNews } from '../../services/writing/quickNewsOptimizer'

describe('WritingLayer single quick-news optimization', () => {
  beforeEach(() => {
    vi.mocked(optimizeQuickNews).mockReset()
  })

  it('applies the fact-bound optimizer result from the segment button', async () => {
    vi.mocked(optimizeQuickNews).mockResolvedValue({
      title: '本周开放预约，首批限两个城市',
      suggestedText: '官方宣布，这款产品将在本周开放预约，首批只支持两个城市。',
      sourceFactIds: ['fact-1'],
      changeSummary: ['删除无依据的全面开售表述'],
      unsupportedOrUncertain: ['所有人都可以买'],
    })
    const workflow = {
      id: 'workflow-optimize',
      status: 'draft',
      currentNode: null,
      nodeExecutions: {},
      state: {
        episode_id: 'episode-optimize',
        facts: [{
          id: 'fact-1',
          title: '产品本周开放预约',
          summary: '官方宣布产品本周开放预约，首批仅支持两个城市。',
          source_title: '官方公告',
          source_url: 'https://example.com/official',
          published_at: '2026-07-15',
          claim: '本周开放预约，首批仅支持两个城市。',
          confidence: 'high',
        }],
        script: {
          id: 'script-1',
          title: '测试早报',
          segments: [{
            id: 'seg-quick-1',
            type: 'quick_news',
            title: '产品开放预约',
            text: '这款产品已经来了，大家都可以买。',
            source_fact_ids: ['fact-1'],
          }],
        },
        edited_script: {},
      },
    }

    render(
      <WritingLayer
        visible
        onClose={vi.fn()}
        workflow={workflow as any}
        characterTargets={{ quick_news: { min: 240, max: 360 } }}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '优化这条快讯' }))

    await waitFor(() => expect(optimizeQuickNews).toHaveBeenCalledWith(expect.objectContaining({
      segmentText: '这款产品已经来了，大家都可以买。',
      sourceFactIds: ['fact-1'],
      targetChars: { min: 240, max: 360 },
    })))
    expect(await screen.findByDisplayValue('官方宣布，这款产品将在本周开放预约，首批只支持两个城市。')).toBeTruthy()
    expect(screen.getByDisplayValue('本周开放预约，首批限两个城市')).toBeTruthy()
  })

  it('does not apply an optimization result after the user edits the requested segment', async () => {
    let resolveOptimization: ((value: any) => void) | undefined
    const pendingResult = new Promise<any>(resolve => {
      resolveOptimization = resolve
    })
    vi.mocked(optimizeQuickNews).mockReturnValue(pendingResult)
    const workflow = {
      id: 'workflow-stale-optimize',
      status: 'draft',
      currentNode: null,
      nodeExecutions: {},
      state: {
        episode_id: 'episode-stale-optimize',
        facts: [{
          id: 'fact-1',
          title: '产品本周开放预约',
          summary: '官方宣布产品本周开放预约。',
          source_url: 'https://example.com/official',
          claim: '本周开放预约。',
          confidence: 'high',
        }],
        script: {
          id: 'script-stale-1',
          title: '测试早报',
          segments: [{
            id: 'seg-quick-1',
            type: 'quick_news',
            title: '产品开放预约',
            text: '优化请求发起时的正文。',
            source_fact_ids: ['fact-1'],
          }],
        },
        edited_script: {},
      },
    }

    render(<WritingLayer visible onClose={vi.fn()} workflow={workflow as any} />)

    fireEvent.click(screen.getByRole('button', { name: '优化这条快讯' }))
    await waitFor(() => expect(optimizeQuickNews).toHaveBeenCalledTimes(1))
    fireEvent.change(screen.getByDisplayValue('优化请求发起时的正文。'), {
      target: { value: '用户在等待时刚刚写入的正文。' },
    })

    await act(async () => {
      resolveOptimization?.({
        title: '过期标题',
        suggestedText: '不应覆盖用户输入的过期结果。',
        sourceFactIds: ['fact-1'],
        changeSummary: [],
        unsupportedOrUncertain: [],
      })
      await pendingResult
    })

    expect(screen.getByDisplayValue('用户在等待时刚刚写入的正文。')).toBeTruthy()
    expect(screen.queryByDisplayValue('不应覆盖用户输入的过期结果。')).toBeNull()
  })

  it('keeps optimization disabled when the quick news has no explicit fact binding', () => {
    const workflow = {
      id: 'workflow-unbound-optimize',
      status: 'draft',
      currentNode: null,
      nodeExecutions: {},
      state: {
        episode_id: 'episode-unbound-optimize',
        facts: [{
          id: 'fact-1',
          title: '与段落标题完全相同',
          summary: '一条存在但未绑定的事实卡。',
          source_url: 'https://example.com/fact',
        }],
        script: {
          id: 'script-unbound-1',
          segments: [{
            id: 'seg-quick-1',
            type: 'quick_news',
            title: '与段落标题完全相同',
            text: '这条快讯没有显式来源绑定。',
            source_fact_ids: [],
          }],
        },
        edited_script: {},
      },
    }

    render(<WritingLayer visible onClose={vi.fn()} workflow={workflow as any} />)

    const button = screen.getByRole('button', { name: '优化这条快讯' })
    expect(button.hasAttribute('disabled')).toBe(true)
    expect(button.getAttribute('title')).toBe('这条快讯没有绑定事实卡，无法安全优化')
  })
})
