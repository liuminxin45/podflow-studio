import { describe, expect, it } from 'vitest'
import {
  applyEvidenceAssessments,
  dedupeResearchResults,
  freshnessToTimeRange,
  isCurrentResearchSession,
  normalizeResearchPlan,
} from '../organizeEvidence'

describe('organizeEvidence', () => {
  it('keeps task-specific evidence roles and freshness policies', () => {
    const plan = normalizeResearchPlan({
      reportType: 'explanatory',
      coreSubject: '米村拌饭门店火爆原因',
      researchTasks: [
        { id: 'facts', question: '门店是否火爆', purpose: '核验现象', role: 'direct_fact', freshness: 'year', queries: ['“米村拌饭” 排队 门店'] },
        { id: 'history', question: '如何扩张', purpose: '历史背景', role: 'historical_context', freshness: 'any', queries: ['米村拌饭 发展史', '米村拌饭 门店扩张'] },
      ],
    }, 3)

    expect(plan).toMatchObject({ reportType: 'explanatory', coreSubject: '米村拌饭门店火爆原因' })
    expect(plan.tasks).toHaveLength(2)
    expect(plan.tasks[1]).toMatchObject({ role: 'historical_context', freshness: 'any' })
    expect(freshnessToTimeRange(plan.tasks[0].freshness)).toBe('year')
    expect(freshnessToTimeRange(plan.tasks[1].freshness)).toBe('noLimit')
    expect(freshnessToTimeRange('latest')).toBe('month')
  })

  it('deduplicates tracking URLs and rejects unrelated evidence through assessments', () => {
    const results = dedupeResearchResults([
      { id: 'a', title: '品牌发展史', url: 'https://www.example.com/story?utm_source=x', excerpt: '历史', provider: 'tavily', taskId: 'history' },
      { id: 'b', title: '品牌发展史', url: 'https://example.com/story?utm_source=y', excerpt: '重复', provider: 'tavily', taskId: 'history' },
      { id: 'c', title: '同名米线品牌', url: 'https://other.test/wrong', excerpt: '无关', provider: 'tavily', taskId: 'facts' },
    ])
    expect(results).toHaveLength(2)

    const screened = applyEvidenceAssessments(results, [
      { index: 0, accepted: true, role: 'historical_context', taskId: 'history', relation: '说明品牌扩张时间线' },
      { index: 1, accepted: false, relation: '同名误命中' },
    ], [
      { id: 'facts', question: '事实', purpose: '事实', role: 'direct_fact', freshness: 'year', queries: ['事实'] },
      { id: 'history', question: '历史', purpose: '历史', role: 'historical_context', freshness: 'any', queries: ['历史'] },
    ])

    expect(screened.accepted).toEqual([expect.objectContaining({ id: 'a', evidenceRole: 'historical_context' })])
    expect(screened.metrics).toMatchObject({ retrieved: 2, accepted: 1, rejected: 1, coveredTasks: 1, totalTasks: 2 })
  })

  it('does not let hallucinated task ids or empty relations inflate coverage', () => {
    const screened = applyEvidenceAssessments([
      { id: 'a', title: '来源甲', url: 'https://a.test', excerpt: '摘要', provider: 'tavily', taskId: 'facts' },
      { id: 'b', title: '来源乙', url: 'https://b.test', excerpt: '摘要', provider: 'tavily', taskId: 'facts' },
    ], [
      { index: 0, accepted: true, taskId: 'invented', relation: '声称覆盖不存在的任务' },
      { index: 1, accepted: true, taskId: 'facts', relation: '' },
    ], [{ id: 'facts', question: '事实', purpose: '核验事实', role: 'direct_fact', freshness: 'year', queries: ['事实'] }])

    expect(screened.accepted).toEqual([expect.objectContaining({ id: 'a', taskId: 'facts' })])
    expect(screened.metrics.coveredTasks).toBe(1)
  })

  it.each([undefined, 'invalid'])('rejects a plan with reportType=%s', reportType => {
    expect(() => normalizeResearchPlan({
      reportType,
      coreSubject: '事件主体',
      researchTasks: [{ id: 'facts', question: '核验什么', purpose: '核验事实', role: 'direct_fact', freshness: 'year', queries: ['核验事实'] }],
    }, 3)).toThrow('reportType')
  })

  it('rejects the removed researchQueries contract', () => {
    expect(() => normalizeResearchPlan({
      reportType: 'event',
      coreSubject: '事件主体',
      researchQueries: ['旧版查询'],
    }, 3)).toThrow('researchTasks')
  })

  it('rejects oversized query plans instead of silently truncating tasks', () => {
    expect(() => normalizeResearchPlan({
      reportType: 'event',
      coreSubject: '事件主体',
      researchTasks: [
        { id: 'facts', question: '事实', purpose: '核验事实', role: 'direct_fact', freshness: 'year', queries: ['查询一', '查询二'] },
        { id: 'context', question: '背景', purpose: '核验背景', role: 'historical_context', freshness: 'any', queries: ['查询三', '查询四'] },
      ],
    }, 3)).toThrow('queries 总数不能超过 3')
  })

  it.each([
    { field: 'coreSubject object', mutate: (plan: any) => { plan.coreSubject = {} } },
    { field: 'numeric task id', mutate: (plan: any) => { plan.researchTasks[0].id = 123 } },
    { field: 'numeric question', mutate: (plan: any) => { plan.researchTasks[0].question = 42 } },
    { field: 'numeric query', mutate: (plan: any) => { plan.researchTasks[0].queries = [123] } },
  ])('rejects type coercion for $field', ({ mutate }) => {
    const plan: any = {
      reportType: 'event',
      coreSubject: '事件主体',
      researchTasks: [{ id: 'facts', question: '事实', purpose: '核验事实', role: 'direct_fact', freshness: 'year', queries: ['查询'] }],
    }
    mutate(plan)
    expect(() => normalizeResearchPlan(plan, 3)).toThrow('研究计划格式错误')
  })

  it('accepts only complete current research sessions', () => {
    const current: any = {
      unitId: 0,
      provider: 'tavily',
      completionMode: 'hybrid',
      queries: ['事实查询', '背景查询'],
      results: [{ id: 'r1', title: '来源', url: 'https://example.com', excerpt: '摘要', provider: 'tavily', taskId: 'facts' }],
      knowledgeCandidates: [{
        id: 'history-note',
        role: 'historical_context',
        statement: '可追溯到更早的行业实践。',
        basis: 'model_memory',
        temporalRisk: 'low',
        confidence: 'medium',
        verificationStatus: 'verified',
        verificationQuery: '行业实践 发展历史',
        supportingResultIds: ['r1'],
      }],
      status: 'completed',
      reportType: 'event',
      coreSubject: '事件主体',
      tasks: [
        { id: 'facts', question: '事实', purpose: '核验事实', role: 'direct_fact', freshness: 'year', queries: ['事实查询'] },
        { id: 'context', question: '背景', purpose: '补充背景', role: 'historical_context', freshness: 'any', queries: ['背景查询'] },
      ],
      metrics: { retrieved: 1, accepted: 1, rejected: 0, uniqueDomains: 1, coveredTasks: 1, totalTasks: 2 },
      updatedAt: '2026-07-17T00:00:00.000Z',
    }
    expect(isCurrentResearchSession(current)).toBe(true)

    for (const mutate of [
      (session: any) => { delete session.updatedAt },
      (session: any) => { session.results = [null] },
      (session: any) => { session.metrics.accepted = -1 },
      (session: any) => { session.tasks[1].id = 'facts' },
      (session: any) => { session.tasks[0].queries = ['一', '二', '三'] },
      (session: any) => { session.knowledgeCandidates[0].supportingResultIds = ['missing-result'] },
      (session: any) => { session.unitId = Number.NaN },
    ]) {
      const invalid = structuredClone(current)
      mutate(invalid)
      expect(isCurrentResearchSession(invalid)).toBe(false)
    }
  })
})
