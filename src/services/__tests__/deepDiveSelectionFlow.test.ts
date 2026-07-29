import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../llmService', () => ({
  llmService: { call: vi.fn() },
}))

vi.mock('../settings/llmConfigResolver', () => ({
  createLLMCallOptions: (_config: unknown, options: unknown) => options,
  hasUsableLLMConfig: () => true,
  llmConfigResolver: {
    getLLMConfig: () => ({
      model: 'test-model',
      apiBase: 'local-agent://test',
      apiKey: 'local-agent',
      providerKind: 'local_agent',
      localAgentId: 'test',
      localAgentCommand: 'test',
    }),
  },
}))

vi.mock('../organizeResearch', () => ({
  getOrganizeSearchStatus: () => ({
    provider: 'tavily',
    ready: true,
    label: 'Tavily',
    reason: '',
  }),
  searchForOrganize: vi.fn(),
}))

import { analyzeAndResearchDeepDive } from '../deepDiveSelection'
import { llmService } from '../llmService'
import { searchForOrganize } from '../organizeResearch'

function response(content: unknown) {
  return {
    choices: [{
      finish_reason: 'stop',
      message: { content: JSON.stringify(content) },
    }],
  } as any
}

describe('analyzeAndResearchDeepDive', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('selects one candidate only after probe, full evidence screening and a source-bound brief', async () => {
    const triage = {
      candidates: [{
        unitId: 0,
        coreQuestion: '这项变化为什么会影响普通人的实际成本？',
        whyInteresting: '事件背后存在可解释的成本转移机制。',
        listenerValue: '帮助听众判断自己会受到什么影响。',
        dimensions: {
          explanatoryDepth: 'high',
          audienceImpact: 'high',
          evidencePotential: 'high',
          distinctiveness: 'medium',
        },
        probeTasks: [
          { id: 'probe_fact', question: '事件是否成立', purpose: '核验直接事实', role: 'direct_fact', freshness: 'latest', queries: ['probe fact'] },
          { id: 'probe_mechanism', question: '是否有解释空间', purpose: '核验机制', role: 'mechanism', freshness: 'any', queries: ['probe mechanism'] },
        ],
      }],
    }
    const plan = {
      coreSubject: '普通人实际成本变化',
      reportType: 'explanatory',
      researchTasks: [
        { id: 'facts', question: '发生了什么', purpose: '核验事实', role: 'direct_fact', freshness: 'latest', queries: ['full fact'] },
        { id: 'impact', question: '影响谁', purpose: '核验听众影响', role: 'consumer_experience', freshness: 'year', queries: ['full impact'] },
        { id: 'counter', question: '有哪些边界', purpose: '核验反方材料', role: 'counter_evidence', freshness: 'any', queries: ['full counter'] },
        { id: 'scale', question: '规模如何', purpose: '核验数据尺度', role: 'data_benchmark', freshness: 'year', queries: ['full scale'] },
      ],
    }
    const screening = {
      assessments: [
        { index: 0, accepted: true, taskId: 'facts', role: 'direct_fact', relation: '核验事件成立' },
        { index: 1, accepted: true, taskId: 'scale', role: 'mechanism', relation: '解释形成机制' },
        { index: 2, accepted: true, taskId: 'facts', role: 'direct_fact', relation: '补充直接事实' },
        { index: 3, accepted: true, taskId: 'impact', role: 'consumer_experience', relation: '说明普通人影响' },
        { index: 4, accepted: true, taskId: 'counter', role: 'counter_evidence', relation: '说明结论边界' },
        { index: 5, accepted: true, taskId: 'scale', role: 'data_benchmark', relation: '说明数据尺度' },
      ],
    }
    const urls = Array.from({ length: 6 }, (_, index) => `https://source-${index}.test/report`)
    const brief = {
      coreQuestion: '这项变化为什么会影响普通人的实际成本？',
      whyNow: '变化已经进入实际执行阶段。',
      thesisBoundary: '只能说明公开证据支持的成本变化。',
      sections: [
        {
          title: '事实',
          question: '发生了什么？',
          listenerValue: '确认事件边界。',
          claims: [{ text: '事件已经发生。', sourceUrls: [urls[0]], confidence: 'high' }],
        },
        {
          title: '影响',
          question: '谁会受到影响？',
          listenerValue: '理解实际成本。',
          claims: [{ text: '部分用户成本会变化。', sourceUrls: [urls[3]], confidence: 'medium' }],
        },
      ],
      counterpoints: [{ text: '影响并不覆盖所有人。', sourceUrls: [urls[4]], confidence: 'medium' }],
      limitations: ['仍需等待更多执行数据。'],
    }
    vi.mocked(llmService.call)
      .mockResolvedValueOnce(response(triage))
      .mockResolvedValueOnce(response(plan))
      .mockResolvedValueOnce(response(screening))
      .mockResolvedValueOnce(response(brief))
    vi.mocked(searchForOrganize).mockImplementation(async (query: string) => {
      const indexByQuery = new Map([
        ['probe fact', 0],
        ['probe mechanism', 1],
        ['full fact', 2],
        ['full impact', 3],
        ['full counter', 4],
        ['full scale', 5],
      ])
      const index = indexByQuery.get(query)
      if (index === undefined) throw new Error(`unexpected query ${query}`)
      return {
        provider: 'tavily',
        query,
        results: [{
          id: `result-${index}`,
          title: `来源 ${index}`,
          url: urls[index],
          excerpt: `证据 ${index}`,
          provider: 'tavily',
        }],
      }
    })

    const result = await analyzeAndResearchDeepDive({
      units: [{
        _id: 0,
        _order: 0,
        _priority: 'important',
        _status: 'editing',
        title: '待核验新闻',
        content: '原始新闻内容',
      }],
      userTopic: '本期新闻',
    })

    expect(result.state).toMatchObject({ status: 'selected', selectedUnitId: 0, attemptedUnitIds: [0] })
    expect(result.selectedUnit).toMatchObject({ _isDeepDive: true, _status: 'ready' })
    expect(result.selectedUnit?._deepDiveBrief?.sourceUrls).toEqual([urls[0], urls[3], urls[4]])
    expect(result.researchSession).toMatchObject({
      researchProfile: 'deep',
      status: 'completed',
      metrics: { uniqueDomains: 6, accepted: 6 },
    })
  })
})
