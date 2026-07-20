import { describe, expect, it } from 'vitest'
import {
  buildOrganizeUiPatch,
  contentOriginKeys,
  organizeWorkspaceMatchesSelection,
  prepareCandidateForDraft,
  readyCandidatesForDraft,
  toCandidateItems,
} from '../workflowDraftGuards'

describe('buildOrganizeUiPatch', () => {
  it('builds the current organize UI payload', () => {
    const candidates = [{
      _id: 1,
      _order: 0,
      _priority: 'backup' as const,
      title: '新闻一',
      content: '内容',
    }]

    const patch = buildOrganizeUiPatch(candidates)

    expect(patch.candidates).toBe(candidates)
    expect(JSON.stringify(patch)).toBe(JSON.stringify({ candidates, researchSessions: [] }))
  })

  it('preserves only current structured organize research sessions', () => {
    const sessions = [{
      unitId: 0,
      provider: 'tavily' as const,
      queries: ['核验发布时间', '历史背景'],
      results: [],
      status: 'completed' as const,
      reportType: 'event' as const,
      coreSubject: '发布时间核验',
      tasks: [
        { id: 'task_1', question: '何时发布', purpose: '核验发布时间', role: 'direct_fact' as const, freshness: 'year' as const, queries: ['核验发布时间'] },
        { id: 'task_2', question: '背景是什么', purpose: '补充历史背景', role: 'historical_context' as const, freshness: 'any' as const, queries: ['历史背景'] },
      ],
      metrics: { retrieved: 0, accepted: 0, rejected: 0, uniqueDomains: 0, coveredTasks: 0, totalTasks: 2 },
      updatedAt: '2026-07-11T00:00:00.000Z',
    }]
    expect(buildOrganizeUiPatch([], sessions).researchSessions).toEqual(sessions)
  })

  it('drops removed researchQueries-style sessions at the persistence boundary', () => {
    const removedShape = [{ unitId: 0, provider: 'tavily', queries: ['旧查询'], results: [], status: 'completed', updatedAt: '2026-07-11T00:00:00.000Z' }]

    expect(buildOrganizeUiPatch([], removedShape as never).researchSessions).toEqual([])
  })

  it('rejects items that do not satisfy the current candidate contract', () => {
    expect(toCandidateItems([{ title: '缺少整理元数据', content: '内容' }])).toEqual([])
  })

  it('hands only ready candidates to draft and composes the complete evidence packet', () => {
    const ready = {
      _id: 1,
      _order: 0,
      _priority: 'important' as const,
      _status: 'ready' as const,
      title: '已整理新闻',
      content: '原始短句',
      summary: '旧摘要',
      _editorial: {
        lead: '一句话导语',
        coreFacts: '关键事实与数字',
        background: '背景脉络',
        impact: '听众影响',
        perspectives: '不同说法与边界',
        listenerQuestions: '',
        explanatoryAngles: '',
        practicalValue: '',
      },
    }
    const pending = {
      ...ready,
      _id: 2,
      _order: 1,
      _status: 'needs_context' as const,
      title: '尚未整理新闻',
    }

    expect(prepareCandidateForDraft(ready).content).toContain('关键事实与数字')
    expect(readyCandidatesForDraft([ready, pending])).toEqual([
      expect.objectContaining({
        title: '已整理新闻',
        summary: '一句话导语',
        content: expect.stringContaining('不同说法与边界'),
      }),
    ])
  })

  it('matches discovery selection to organized origins after titles change or units merge', () => {
    const selection = [
      { title: '原始标题 A', url: 'https://example.com/a' },
      { title: '原始标题 B', url: 'https://example.com/b' },
    ]
    const merged = [{
      _id: 1,
      _order: 0,
      _priority: 'important' as const,
      _status: 'ready' as const,
      title: '整理后的合并标题',
      _originKeys: ['url:https://example.com/a', 'url:https://example.com/b'],
    }]

    expect(organizeWorkspaceMatchesSelection(merged, selection)).toBe(true)
    expect(organizeWorkspaceMatchesSelection(merged, selection.slice(0, 1))).toBe(false)
  })

  it('keeps the original identity for a URL-less material after its title is edited', () => {
    const edited = {
      title: '整理后的标题',
      source_id: 'manual',
      _originKeys: ['source-title:manual|原始标题'],
    }

    expect(contentOriginKeys(edited as any)).toEqual(['source-title:manual|原始标题'])
  })
})
