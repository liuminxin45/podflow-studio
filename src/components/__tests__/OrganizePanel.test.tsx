import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import OrganizePanel from '../OrganizePanel'

vi.mock('antd', async importOriginal => {
  const actual = await importOriginal<typeof import('antd')>()
  return {
    ...actual,
    message: {
      ...actual.message,
      error: vi.fn(),
      info: vi.fn(),
      success: vi.fn(),
      warning: vi.fn(),
    },
  }
})

vi.mock('../../services/deepDiveSelection', async importOriginal => {
  const actual = await importOriginal<typeof import('../../services/deepDiveSelection')>()
  return {
    ...actual,
    analyzeAndResearchDeepDive: vi.fn(),
  }
})

import { analyzeAndResearchDeepDive } from '../../services/deepDiveSelection'

const contents = [
  { title: '新闻一', content: '第一条新闻的核心事实', source: '来源甲', url: 'https://example.com/one' },
  { title: '新闻二', content: '第二条新闻补充了另一方观点', source: '来源乙', url: 'https://example.com/two' },
]

function renderPanel(onProceedToIdeate = vi.fn()) {
  render(
    <OrganizePanel
      visible
      onClose={vi.fn()}
      contents={contents}
      onProceedToIdeate={onProceedToIdeate}
    />,
  )
  return onProceedToIdeate
}

describe('OrganizePanel news unit editor', () => {
  it('keeps raw news units out of the draft until they are organized', () => {
    renderPanel()

    expect(screen.queryByText('新闻单元')).toBeNull()
    expect(screen.queryByText(/条可播报/)).toBeNull()
    expect(screen.queryByText('资料工作区')).toBeNull()
    expect(screen.queryByText('先补资料，再整理成稿')).toBeNull()
    expect(screen.getByRole('button', { name: '还没有已整理完成的新闻' }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByText('核心事实明确')).toBeTruthy()
    expect(screen.getByText('至少两个独立来源')).toBeTruthy()
    expect(screen.getByText('新闻条目 · 2')).toBeTruthy()
    expect(screen.getByTitle('新闻一')).toBeTruthy()
    expect(screen.queryByText(/待补充.*个来源/)).toBeNull()
    expect(screen.queryByRole('button', { name: /标记存在分歧|分歧已处理/ })).toBeNull()
    const completeButton = screen.getByRole('button', { name: '标记为整理完成' })
    expect(completeButton.hasAttribute('disabled')).toBe(true)
    expect(screen.getByPlaceholderText('新闻标题').closest('.organize-story-titlebar')?.lastElementChild).toBe(completeButton)
    const researchButton = screen.getByRole('button', { name: '自动补全资料' })
    const organizeButton = screen.getByRole('button', { name: 'AI 整理资料' })
    expect(researchButton.className).toContain('ant-btn-primary')
    expect(organizeButton.className).toContain('ant-btn-primary')
    expect(researchButton.querySelector('.ant-btn-icon')).toBeTruthy()
    expect(organizeButton.querySelector('.ant-btn-icon')).toBeTruthy()
    expect(screen.queryByText('整理的事实起点')).toBeNull()
    expect(screen.queryByText(/^0 份$/)).toBeNull()
    expect(screen.getByText('第一条新闻的核心事实', { selector: 'p' }).getAttribute('title')).toBe('第一条新闻的核心事实')
  })

  it('only proceeds with manually completed news units', () => {
    const onProceed = renderPanel()

    fireEvent.click(screen.getByRole('button', { name: '手动添加' }))
    fireEvent.change(screen.getByPlaceholderText('资料标题 *'), { target: { value: '监管机构回应' } })
    fireEvent.change(screen.getByPlaceholderText('来源'), { target: { value: '来源丙' } })
    fireEvent.change(screen.getByPlaceholderText('原文链接'), { target: { value: 'https://example.com/regulator' } })
    fireEvent.change(screen.getByPlaceholderText('这份资料补充了什么'), { target: { value: '补充了监管视角' } })
    fireEvent.click(screen.getByRole('button', { name: '添加资料' }))

    fireEvent.change(screen.getByLabelText('一句话导语'), { target: { value: '一句话说明核心变化' } })
    fireEvent.change(screen.getByLabelText('背景脉络'), { target: { value: '此前的发展背景' } })
    fireEvent.change(screen.getByLabelText('影响与意义'), { target: { value: '对行业产生的影响' } })
    fireEvent.change(screen.getByLabelText('各方观点与不确定性'), { target: { value: '官方与第三方观点仍有差异' } })
    fireEvent.change(screen.getByLabelText('听众真正关心的问题'), { target: { value: '这项变化会直接影响哪些人？' } })
    fireEvent.change(screen.getByLabelText('现实影响与结论边界'), { target: { value: '现阶段影响既有用户，长期安排仍待确认。' } })

    expect(screen.queryByLabelText('整理完成')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '标记为整理完成' }))
    expect(screen.getByLabelText('整理完成')).toBeTruthy()

    const proceed = screen.getByRole('button', { name: '使用 1 条新闻成稿' })
    fireEvent.click(proceed)
    expect(onProceed).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          title: '新闻一',
          content: expect.stringContaining('对行业产生的影响'),
          _status: 'ready',
        }),
      ],
      [],
      [
        expect.objectContaining({ title: '新闻一', _status: 'ready' }),
        expect.objectContaining({ title: '新闻二', _status: 'needs_context' }),
      ],
      expect.objectContaining({ status: 'idle' }),
    )
  })

  it('does not count a manual note as an independent source', () => {
    renderPanel()

    fireEvent.click(screen.getByRole('button', { name: '手动添加' }))
    fireEvent.change(screen.getByPlaceholderText('资料标题 *'), { target: { value: '内部整理笔记' } })
    fireEvent.change(screen.getByPlaceholderText('来源'), { target: { value: '编辑笔记' } })
    fireEvent.change(screen.getByPlaceholderText('这份资料补充了什么'), { target: { value: '模型知识与编辑判断' } })
    fireEvent.click(screen.getByRole('button', { name: '添加资料' }))

    fireEvent.change(screen.getByLabelText('一句话导语'), { target: { value: '一句话说明核心变化' } })
    fireEvent.change(screen.getByLabelText('背景脉络'), { target: { value: '此前的发展背景' } })
    fireEvent.change(screen.getByLabelText('影响与意义'), { target: { value: '对行业产生的影响' } })
    fireEvent.change(screen.getByLabelText('各方观点与不确定性'), { target: { value: '仍有信息需要核验' } })

    expect(screen.getByRole('button', { name: '标记为整理完成' }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByText('至少两个独立来源').closest('span')?.className).not.toContain('is-done')
  })

  it('blocks AI organization until a manual source draft is saved or cancelled', () => {
    renderPanel()

    const completeButton = screen.getByRole('button', { name: '自动补全资料' })
    const organizeButton = screen.getByRole('button', { name: 'AI 整理资料' })
    fireEvent.click(screen.getByRole('button', { name: '手动添加' }))
    fireEvent.change(screen.getByPlaceholderText('资料标题 *'), { target: { value: '尚未保存的资料' } })

    expect(completeButton.hasAttribute('disabled')).toBe(true)
    expect(organizeButton.hasAttribute('disabled')).toBe(true)
    expect(screen.getByText('请先添加或取消当前资料，再继续自动处理。')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /^取\s*消$/ }))
    expect(completeButton.hasAttribute('disabled')).toBe(false)
    expect(organizeButton.hasAttribute('disabled')).toBe(false)
  })

  it('merges another news unit into the active unit as a reference source', () => {
    renderPanel()

    expect(screen.queryByRole('checkbox', { name: '选择合并 新闻二' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '合并新闻' }))
    expect(screen.getByLabelText('当前合并目标')).toBeTruthy()
    expect(screen.queryByRole('button', { name: '删除 新闻二' })).toBeNull()
    fireEvent.click(screen.getByRole('checkbox', { name: '选择合并 新闻二' }))
    fireEvent.click(screen.getByRole('button', { name: /并入当前/ }))

    expect(screen.getByText('参考资料')).toBeTruthy()
    expect(screen.getByText('1 份')).toBeTruthy()
    expect(screen.getByText('来源乙')).toBeTruthy()
    expect(screen.getAllByText('新闻二').length).toBe(1)
    expect(screen.getByRole('button', { name: '撤销' })).toBeTruthy()
  })

  it('requires confirmation before deleting a news unit', async () => {
    const onRemoveFromMaterialPool = vi.fn()
    const view = render(
      <OrganizePanel
        visible
        onClose={vi.fn()}
        contents={contents}
        onRemoveFromMaterialPool={onRemoveFromMaterialPool}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '删除 新闻二' }))
    expect(await screen.findByText('确认删除这条新闻？')).toBeTruthy()
    expect(screen.getAllByText('新闻二').length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole('button', { name: /^删\s*除$/ }))
    await waitFor(() => expect(screen.queryByTitle('新闻二')).toBeNull())
    expect(onRemoveFromMaterialPool).toHaveBeenCalledWith(['url:https://example.com/two'])

    view.rerender(
      <OrganizePanel
        visible
        onClose={vi.fn()}
        contents={[contents[0]]}
        onRemoveFromMaterialPool={onRemoveFromMaterialPool}
      />,
    )
    await waitFor(() => expect(screen.queryByTitle('新闻二')).toBeNull())
  }, 15_000)

  it('keeps every discovery source selected when news units are merged', () => {
    const onRemoveFromMaterialPool = vi.fn()
    render(
      <OrganizePanel
        visible
        onClose={vi.fn()}
        contents={contents}
        onRemoveFromMaterialPool={onRemoveFromMaterialPool}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '合并新闻' }))
    fireEvent.click(screen.getByRole('checkbox', { name: '选择合并 新闻二' }))
    fireEvent.click(screen.getByRole('button', { name: /并入当前/ }))

    expect(screen.getByText('新闻条目 · 1')).toBeTruthy()
    expect(onRemoveFromMaterialPool).not.toHaveBeenCalled()
  })

  it('keeps exactly one evidence-backed deep-dive selection and expands its editorial checklist', async () => {
    const selectionResult = (id: number, title: string) => ({
      selectedUnit: {
        _id: id,
        _order: id,
        _priority: 'important' as const,
        _status: 'ready' as const,
        _isDeepDive: true,
        title,
        content: `${title}的深度资料`,
        _deepDiveBrief: {
          version: 1 as const,
          inputFingerprint: '1234abcd',
          coreQuestion: '为什么值得深挖？',
          whyNow: '现在需要解释。',
          thesisBoundary: '只说明已有证据。',
          sections: [
            { title: '事实', question: '发生了什么？', listenerValue: '理解事实', claims: [{ text: '事实一', sourceUrls: ['https://a.test'], confidence: 'high' as const }] },
            { title: '机制', question: '为什么发生？', listenerValue: '理解机制', claims: [{ text: '机制一', sourceUrls: ['https://b.test'], confidence: 'medium' as const }] },
          ],
          counterpoints: [{ text: '仍有边界', sourceUrls: ['https://c.test'], confidence: 'medium' as const }],
          limitations: [],
          sourceUrls: ['https://a.test', 'https://b.test', 'https://c.test'],
          generatedAt: '2026-07-29T00:00:00.000Z',
        },
      },
      researchSession: {
        unitId: id,
        provider: 'tavily' as const,
        researchProfile: 'deep' as const,
        inputFingerprint: '1234abcd',
        completionMode: 'web_only' as const,
        queries: ['事实', '机制', '反方', '影响'],
        results: [
          { id: 'a', title: '来源 A', url: 'https://a.test', excerpt: '事实', provider: 'tavily' as const, taskId: 'facts', evidenceRole: 'direct_fact' as const },
          { id: 'b', title: '来源 B', url: 'https://b.test', excerpt: '机制', provider: 'tavily' as const, taskId: 'mechanism', evidenceRole: 'mechanism' as const },
          { id: 'c', title: '来源 C', url: 'https://c.test', excerpt: '反方', provider: 'tavily' as const, taskId: 'counter', evidenceRole: 'counter_evidence' as const },
        ],
        status: 'completed' as const,
        updatedAt: '2026-07-29T00:00:00.000Z',
        reportType: 'explanatory' as const,
        coreSubject: '深度问题',
        tasks: [
          { id: 'facts', question: '事实', purpose: '事实', role: 'direct_fact' as const, freshness: 'latest' as const, queries: ['事实'] },
          { id: 'mechanism', question: '机制', purpose: '机制', role: 'mechanism' as const, freshness: 'any' as const, queries: ['机制'] },
          { id: 'counter', question: '反方', purpose: '反方', role: 'counter_evidence' as const, freshness: 'any' as const, queries: ['反方'] },
          { id: 'impact', question: '影响', purpose: '影响', role: 'consumer_experience' as const, freshness: 'year' as const, queries: ['影响'] },
        ],
        metrics: { retrieved: 3, accepted: 3, rejected: 0, uniqueDomains: 3, coveredTasks: 3, totalTasks: 4 },
      },
      state: {
        version: 1 as const,
        status: 'selected' as const,
        inputFingerprint: '1234abcd',
        source: 'manual' as const,
        selectedUnitId: id,
        candidates: [],
        attemptedUnitIds: [id],
        updatedAt: '2026-07-29T00:00:00.000Z',
      },
    })
    vi.mocked(analyzeAndResearchDeepDive)
      .mockResolvedValueOnce(selectionResult(0, '新闻一'))
      .mockResolvedValueOnce(selectionResult(1, '新闻二'))
    renderPanel()

    fireEvent.click(screen.getByRole('button', { name: '优先核验此条' }))
    await waitFor(() => expect(screen.getByRole('button', { name: '已通过深度核验' }).getAttribute('aria-pressed')).toBe('true'))
    expect(screen.getByLabelText('深度稿扩展整理')).toBeTruthy()
    expect(screen.getByText('至少三个独立来源')).toBeTruthy()
    expect(screen.getByLabelText('深度稿')).toBeTruthy()

    fireEvent.click(screen.getByTitle('新闻二'))
    expect(screen.getByRole('button', { name: '优先核验此条' }).getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(screen.getByRole('button', { name: '优先核验此条' }))

    await waitFor(() => expect(screen.getAllByLabelText('深度稿')).toHaveLength(1))
    expect(screen.getByDisplayValue('新闻二')).toBeTruthy()
  }, 15_000)

  it('replaces the workspace when discovery provides a new material set', async () => {
    const view = render(
      <OrganizePanel visible onClose={vi.fn()} contents={contents} />,
    )

    view.rerender(
      <OrganizePanel
        visible
        onClose={vi.fn()}
        contents={[{ title: '重新发现的新闻', content: '新内容', source: '新来源' }]}
      />,
    )

    await waitFor(() => expect(screen.getAllByText('重新发现的新闻').length).toBeGreaterThan(0))
    expect(screen.queryByText('新闻二')).toBeNull()

    view.rerender(<OrganizePanel visible onClose={vi.fn()} contents={[]} />)
    await waitFor(() => expect(screen.getByText('没有待整理的新闻')).toBeTruthy())
    expect(screen.queryByDisplayValue('重新发现的新闻')).toBeNull()
  })
})
