import { createRef } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const organizeResearchMockState = vi.hoisted(() => ({
  provider: 'tavily' as 'tavily' | 'default_ai',
}))

vi.mock('../../services/llmService', () => ({
  llmService: { call: vi.fn() },
}))

vi.mock('../../services/settings/llmConfigResolver', () => ({
  createLLMCallOptions: (_config: unknown, options: unknown) => options,
  hasUsableLLMConfig: () => true,
  llmTargetLabel: () => '本地代理：codex',
  llmConfigResolver: { getLLMConfig: () => ({ model: 'codex', apiBase: 'local-agent://codex', apiKey: 'local-agent' }) },
}))

vi.mock('../../services/organizeResearch', () => ({
  getOrganizeSearchStatus: () => ({
    provider: organizeResearchMockState.provider,
    ready: true,
    label: organizeResearchMockState.provider === 'tavily' ? 'Tavily' : '复用当前 AI 联网',
    reason: '',
  }),
  searchForOrganize: vi.fn(),
}))

import OrganizePanel, { type OrganizePanelHandle } from '../OrganizePanel'
import { llmService } from '../../services/llmService'
import { searchForOrganize } from '../../services/organizeResearch'
import { DEFAULT_SETTINGS } from '../../types/settings'
import { settingsRepository } from '../../services/settings/repository'

function researchPlan(queries: string[], reportType: 'event' | 'explanatory' | 'trend' = 'event') {
  return {
    coreSubject: '原始新闻核心主体',
    reportType,
    researchTasks: queries.map((query, index) => ({
      id: `task_${index + 1}`,
      question: `研究问题 ${index + 1}`,
      purpose: `核验维度 ${index + 1}`,
      role: index === 0 ? 'direct_fact' : 'historical_context',
      freshness: index === 0 ? 'year' : 'any',
      queries: [query],
    })),
  }
}

function evidenceAssessments(count: number) {
  return {
    assessments: Array.from({ length: count }, (_, index) => ({
      index,
      accepted: true,
      role: index === 0 ? 'direct_fact' : 'historical_context',
      taskId: `task_${index + 1}`,
      relation: `支撑研究问题 ${index + 1}`,
    })),
  }
}

function knowledgeExpansion(statement = '该模式可以追溯到更早的行业实践。') {
  return {
    knowledgeCandidates: Array.from({ length: 3 }, (_, index) => ({
      id: `history-${index + 1}`,
      role: 'historical_context',
      statement: index === 0 ? statement : `补充知识候选 ${index + 1}`,
      basis: 'model_memory',
      temporalRisk: 'low',
      confidence: 'medium',
      verificationQuery: `行业模式 发展历史 ${index + 1}`,
      limitations: ['需要进一步确认具体年份'],
    })),
  }
}

describe('OrganizePanel research tolerance', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.localStorage.clear()
    organizeResearchMockState.provider = 'tavily'
    settingsRepository.save({
      ...structuredClone(DEFAULT_SETTINGS),
      creatorPreferences: {
        ...DEFAULT_SETTINGS.creatorPreferences,
        organizeCompletionMode: 'web_only',
      },
    })
  })

  it('keeps AI knowledge separate when hybrid web verification fails', async () => {
    settingsRepository.save({
      ...structuredClone(DEFAULT_SETTINGS),
      creatorPreferences: { ...DEFAULT_SETTINGS.creatorPreferences, organizeCompletionMode: 'hybrid' },
    })
    vi.mocked(llmService.call)
      .mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify(researchPlan(['历史核验', '机制核验'], 'explanatory')) } }] } as any)
      .mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify(knowledgeExpansion()) } }] } as any)
    vi.mocked(searchForOrganize).mockRejectedValue(new Error('搜索服务暂时不可用'))

    render(<OrganizePanel visible onClose={vi.fn()} contents={[{ title: '原始新闻', content: '原始内容', source: '来源甲' }]} />)
    fireEvent.click(screen.getByRole('button', { name: '自动补全资料' }))

    await waitFor(() => expect(screen.getByText('该模式可以追溯到更早的行业实践。')).toBeTruthy())
    expect(vi.mocked(llmService.call).mock.calls[0]?.[0]?.messages?.[0]?.content).not.toContain('knowledgeCandidates')
    expect(vi.mocked(llmService.call).mock.calls[1]?.[0]?.messages?.[0]?.content).toContain('knowledgeCandidates')
    expect(screen.getAllByText('未联网核验')).toHaveLength(3)
    expect(screen.getByText('0/3 已联网核验')).toBeTruthy()
    expect(screen.getByText(/联网核验失败，已保留 3 条 AI 知识候选/)).toBeTruthy()

    fireEvent.click(screen.getAllByRole('button', { name: '采纳为分析角度' })[0])
    expect((screen.getByLabelText('背景脉络') as HTMLTextAreaElement).value).toContain('AI 知识（未联网核验）')
  })

  it('runs AI-only knowledge expansion without calling web search', async () => {
    settingsRepository.save({
      ...structuredClone(DEFAULT_SETTINGS),
      creatorPreferences: {
        ...DEFAULT_SETTINGS.creatorPreferences,
        organizeCompletionMode: 'ai_knowledge',
      },
    })
    vi.mocked(llmService.call)
      .mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify(researchPlan(['背景问题', '机制问题'], 'explanatory')) } }] } as any)
      .mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify(knowledgeExpansion('可以从供需两端解释这一变化。')) } }] } as any)

    render(<OrganizePanel visible onClose={vi.fn()} contents={[{ title: '原始新闻', content: '原始内容', source: '来源甲' }]} />)
    expect(screen.queryByRole('button', { name: '选择 AI 补全模式' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '自动补全资料' }))

    await waitFor(() => expect(screen.getByText('可以从供需两端解释这一变化。')).toBeTruthy())
    expect(searchForOrganize).not.toHaveBeenCalled()
    expect(screen.getByText(/AI 知识扩展完成，共 3 条/)).toBeTruthy()
  })

  it('reports knowledge enum values when the model violates the confidence contract', async () => {
    settingsRepository.save({
      ...structuredClone(DEFAULT_SETTINGS),
      creatorPreferences: { ...DEFAULT_SETTINGS.creatorPreferences, organizeCompletionMode: 'hybrid' },
    })
    const invalidKnowledge = knowledgeExpansion()
    invalidKnowledge.knowledgeCandidates[0].confidence = 'moderate'
    const onProcessLog = vi.fn()
    vi.mocked(llmService.call)
      .mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify(researchPlan(['事实问题', '背景问题'])) } }] } as any)
      .mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify(invalidKnowledge) } }] } as any)

    render(<OrganizePanel
      visible
      onClose={vi.fn()}
      onProcessLog={onProcessLog}
      contents={[{ title: '原始新闻', content: '原始内容', source: '来源甲' }]}
    />)
    fireEvent.click(screen.getByRole('button', { name: '自动补全资料' }))

    await waitFor(() => expect(screen.getAllByText(/第 1 条候选 confidence 无效/).length).toBeGreaterThan(0))
    expect(onProcessLog).toHaveBeenCalledWith(expect.stringContaining('KNOWLEDGE_SHAPE request=1 count=3 confidences=["moderate","medium","medium"]'))
    expect(searchForOrganize).not.toHaveBeenCalled()
  })

  it('puts AI knowledge usage boundaries in the synthesis system prompt', async () => {
    vi.mocked(llmService.call).mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify({
      title: '整理后的标题',
      lead: '整理后的导语',
      coreFacts: '仅使用来源中的核心事实',
      background: '补充背景',
      impact: '补充影响',
      perspectives: 'AI 推演（未联网核验）：仍需观察后续变化',
      anchorSupported: true,
      usedSourceIndexes: [0, 1],
    }) } }] } as any)

    render(<OrganizePanel
      visible
      onClose={vi.fn()}
      contents={[{
        title: '原始新闻',
        content: '原始事实',
        source: '来源甲',
        _references: [{
          _referenceId: 'web-source',
          _referenceKind: 'report',
          title: '独立核验',
          content: '网页核验内容',
          source: '来源乙',
          url: 'https://example.com/report',
        }],
      } as any]}
      initialResearchSessions={[{
        unitId: 0,
        provider: 'tavily',
        completionMode: 'ai_knowledge',
        reportType: 'event',
        coreSubject: '原始新闻',
        knowledgeCandidates: [{
          id: 'mechanism',
          role: 'mechanism',
          statement: '可能存在规模效应。',
          basis: 'model_inference',
          temporalRisk: 'medium',
          confidence: 'medium',
          verificationStatus: 'unverified',
        }],
        queries: [],
        results: [],
        tasks: [],
        metrics: { retrieved: 0, accepted: 0, rejected: 0, uniqueDomains: 0, coveredTasks: 0, totalTasks: 0 },
        status: 'completed',
        updatedAt: '2026-07-17T00:00:00.000Z',
      } as any]}
    />)

    fireEvent.click(screen.getByRole('button', { name: 'AI 整理资料' }))
    await waitFor(() => expect(llmService.call).toHaveBeenCalledTimes(1))
    const options = vi.mocked(llmService.call).mock.calls[0]?.[0] as { messages?: Array<{ role: string; content: string }> }
    expect(options.messages?.[0]?.content).toContain('结构化的 AI 知识与推演候选')
    expect(options.messages?.[0]?.content).toContain('不能计入 usedSourceIndexes')
  })

  it('flushes current references and research evidence when an explicit save is requested', async () => {
    const ref = createRef<OrganizePanelHandle>()
    const onStateChange = vi.fn()
    const researchSessions = [{
      unitId: 0,
      provider: 'tavily' as const,
      queries: ['国家医保局 生育保险', '生育保险 历史背景'],
      results: [{
        id: 'official-source',
        title: '官方说明',
        url: 'https://example.com/official',
        excerpt: '官方核验内容',
        provider: 'tavily' as const,
      }],
      status: 'completed' as const,
      reportType: 'event' as const,
      coreSubject: '国家医保局生育保险政策',
      tasks: [
        { id: 'task_1', question: '政策内容', purpose: '核验政策', role: 'direct_fact' as const, freshness: 'year' as const, queries: ['国家医保局 生育保险'] },
        { id: 'task_2', question: '政策背景', purpose: '补充背景', role: 'historical_context' as const, freshness: 'any' as const, queries: ['生育保险 历史背景'] },
      ],
      metrics: { retrieved: 1, accepted: 1, rejected: 0, uniqueDomains: 1, coveredTasks: 1, totalTasks: 2 },
      updatedAt: '2026-07-16T00:00:00.000Z',
    }]

    render(<OrganizePanel
      ref={ref}
      visible
      onClose={vi.fn()}
      onStateChange={onStateChange}
      initialResearchSessions={researchSessions}
      contents={[{ title: '原始新闻', content: '原始内容', source: '来源甲' }]}
    />)
    fireEvent.click(screen.getByRole('button', { name: '手动添加' }))
    fireEvent.change(screen.getByPlaceholderText('资料标题 *'), { target: { value: '手动官方资料' } })
    fireEvent.change(screen.getByPlaceholderText('这份资料补充了什么'), { target: { value: '同一事件的官方核验内容' } })
    fireEvent.click(screen.getByRole('button', { name: '添加资料' }))

    await waitFor(() => expect(screen.getByText('手动官方资料')).toBeTruthy())
    await act(async () => { await ref.current?.flushState() })

    expect(onStateChange).toHaveBeenLastCalledWith(expect.objectContaining({
      candidates: [expect.objectContaining({
        title: '原始新闻',
        _references: [expect.objectContaining({ title: '手动官方资料' })],
      })],
      researchSessions,
    }))
  })

  it('allows AI-organized news to enter ideation even when it records source conflicts', async () => {
    vi.mocked(llmService.call)
      .mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify(researchPlan(['成功问题', '失败问题'])) } }] } as any)
      .mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify(evidenceAssessments(1)) } }] } as any)
      .mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify({
        title: '补全后的新闻', lead: '最新导语', coreFacts: '已核验事实', background: '背景', impact: '影响', perspectives: '仍有不确定性',
        hasConflict: true,
        anchorSupported: true,
        usedSourceIndexes: [0, 1, 2],
      }) } }] } as any)
    vi.mocked(searchForOrganize).mockImplementation(async query => {
      if (query === '失败问题') throw new Error('代理连接失败')
      return {
        provider: 'tavily', query,
        results: [{ id: 'source-1', title: '官方证据', url: 'https://example.com/official', excerpt: '官方发布的核验内容', provider: 'tavily' }],
      }
    })

    const onProceedToIdeate = vi.fn()
    render(<OrganizePanel visible onClose={vi.fn()} onProceedToIdeate={onProceedToIdeate} contents={[{ title: '原始新闻', content: '原始内容', source: '来源甲' }]} />)
    fireEvent.click(screen.getByRole('button', { name: '手动添加' }))
    fireEvent.change(screen.getByPlaceholderText('资料标题 *'), { target: { value: '人工补充证据' } })
    fireEvent.change(screen.getByPlaceholderText('这份资料补充了什么'), { target: { value: '人工核验内容' } })
    fireEvent.click(screen.getByRole('button', { name: '添加资料' }))
    fireEvent.click(screen.getByRole('button', { name: '自动补全资料' }))

    await waitFor(() => expect(screen.getByText('官方证据')).toBeTruthy())
    expect(screen.getByDisplayValue('原始新闻')).toBeTruthy()
    expect(llmService.call).toHaveBeenCalledTimes(2)
    expect(screen.getByText(/部分完成/)).toBeTruthy()
    expect(screen.getAllByText('失败问题').length).toBeGreaterThan(0)
    expect(screen.getByText('代理连接失败')).toBeTruthy()
    const researchToggle = screen.getByRole('button', { name: /研究记录/ })
    const organizeButton = screen.getByRole('button', { name: 'AI 整理资料' })
    const referencesHeading = screen.getByText('参考资料')
    expect(researchToggle.compareDocumentPosition(organizeButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    expect(organizeButton.compareDocumentPosition(referencesHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(Node.DOCUMENT_POSITION_FOLLOWING)

    fireEvent.click(organizeButton)
    await waitFor(() => expect(screen.getByDisplayValue('补全后的新闻')).toBeTruthy())
    const synthesisOptions = vi.mocked(llmService.call).mock.calls[2]?.[0] as {
      messages?: Array<{ role: string; content: string }>
    }
    const synthesisPrompt = synthesisOptions.messages?.find(item => item.role === 'user')?.content || ''
    const synthesisSystemPrompt = synthesisOptions.messages?.find(item => item.role === 'system')?.content || ''
    expect(synthesisPrompt).toContain('原始新闻')
    expect(synthesisPrompt).toContain('人工补充证据')
    expect(synthesisPrompt).toContain('官方证据')
    expect(synthesisSystemPrompt).toContain('hasConflict')

    fireEvent.click(screen.getByRole('button', { name: '使用 1 条新闻成稿' }))
    expect(onProceedToIdeate).toHaveBeenCalledWith(
      [expect.objectContaining({ title: '补全后的新闻', _status: 'ready' })],
      expect.any(Array),
      [expect.objectContaining({ title: '补全后的新闻', _status: 'ready' })],
    )

    expect(researchToggle.getAttribute('aria-expanded')).toBe('true')
    fireEvent.click(researchToggle)
    expect(researchToggle.getAttribute('aria-expanded')).toBe('false')
  }, 15_000)

  it('runs default AI searches one at a time and streams visible progress', async () => {
    organizeResearchMockState.provider = 'default_ai'
    settingsRepository.save({
      ...structuredClone(DEFAULT_SETTINGS),
      creatorPreferences: { ...DEFAULT_SETTINGS.creatorPreferences, organizeCompletionMode: 'hybrid' },
    })
    vi.mocked(llmService.call)
      .mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify(researchPlan(['问题一', '问题二', '问题三'])) } }] } as any)
      .mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify(knowledgeExpansion()) } }] } as any)
      .mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify(evidenceAssessments(3)) } }] } as any)

    let resolveFirst!: (value: any) => void
    vi.mocked(searchForOrganize).mockImplementation((query, onProgress) => {
      const response = {
        provider: 'default_ai' as const,
        query,
        results: [{ id: query, title: `${query}来源`, url: `https://example.com/${encodeURIComponent(query)}`, excerpt: '核验内容', provider: 'default_ai' as const }],
      }
      onProgress?.({ phase: 'browsing', detail: '当前 AI 正在调用自身联网工具' })
      if (query === '问题一') return new Promise(resolve => { resolveFirst = resolve })
      return Promise.resolve(response)
    })

    render(<OrganizePanel visible onClose={vi.fn()} contents={[{ title: '原始新闻', content: '原始内容', source: '来源甲' }]} />)
    fireEvent.click(screen.getByRole('button', { name: '自动补全资料' }))

    await waitFor(() => expect(searchForOrganize).toHaveBeenCalledTimes(1))
    expect(screen.getByText('当前 AI 正在调用自身联网工具')).toBeTruthy()
    await act(async () => {
      resolveFirst({
        provider: 'default_ai',
        query: '问题一',
        results: [{ id: 'one', title: '问题一来源', url: 'https://example.com/one', excerpt: '核验内容', provider: 'default_ai' }],
      })
    })

    await waitFor(() => expect(searchForOrganize).toHaveBeenCalledTimes(3))
    await waitFor(() => expect(screen.getByRole('button', { name: '自动补全资料' }).hasAttribute('disabled')).toBe(false))
  }, 15_000)

  it('reports a readable planning error when the AI returns non-JSON text', async () => {
    vi.mocked(llmService.call).mockResolvedValue({
      choices: [{ message: { content: "There's an authentication problem with the local agent." } }],
    } as any)

    render(<OrganizePanel visible onClose={vi.fn()} contents={[{ title: '原始新闻', content: '原始内容', source: '来源甲' }]} />)
    fireEvent.click(screen.getByRole('button', { name: '自动补全资料' }))

    await waitFor(() => expect(screen.getAllByText(/制定搜索问题失败：AI 未返回有效 JSON/).length).toBeGreaterThan(0))
    expect(screen.getAllByText(/There's an authentication problem/).length).toBeGreaterThan(0)
    expect(searchForOrganize).not.toHaveBeenCalled()
    expect(screen.queryByText(/Unexpected token/)).toBeNull()
  })

  it('retries completion immediately with the same model after a parse failure', async () => {
    vi.mocked(llmService.call)
      .mockResolvedValueOnce({ choices: [{ message: { content: 'invalid response' } }] } as any)
      .mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify(researchPlan(['重试问题一', '重试问题二'])) } }] } as any)
      .mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify(evidenceAssessments(2)) } }] } as any)
    vi.mocked(searchForOrganize).mockImplementation(async query => ({
      provider: 'tavily',
      query,
      results: [{ id: query, title: `${query}来源`, url: `https://example.com/${encodeURIComponent(query)}`, excerpt: '重试核验内容', provider: 'tavily' }],
    }) as any)

    render(<OrganizePanel visible onClose={vi.fn()} contents={[{ title: '原始新闻', content: '原始内容', source: '来源甲' }]} />)
    const completionButton = screen.getByRole('button', { name: '自动补全资料' })
    fireEvent.click(completionButton)
    await waitFor(() => expect(screen.getAllByText(/制定搜索问题失败：AI 未返回有效 JSON/).length).toBeGreaterThan(0))
    await waitFor(() => expect(completionButton.hasAttribute('disabled')).toBe(false))

    fireEvent.click(completionButton)

    await waitFor(() => expect(llmService.call).toHaveBeenCalledTimes(3))
    expect(searchForOrganize).toHaveBeenCalledTimes(2)
    await waitFor(() => expect(completionButton.hasAttribute('disabled')).toBe(false))
    expect(vi.mocked(llmService.call).mock.calls.every(([options]) => options.cacheMode === 'bypass')).toBe(true)
  })

  it('rejects Markdown-wrapped JSON instead of extracting it', async () => {
    vi.mocked(llmService.call).mockResolvedValue({
      choices: [{ message: { content: `\`\`\`json\n${JSON.stringify(researchPlan(['问题一', '问题二']))}\n\`\`\`` } }],
    } as any)

    render(<OrganizePanel visible onClose={vi.fn()} contents={[{ title: '原始新闻', content: '原始内容', source: '来源甲' }]} />)
    fireEvent.click(screen.getByRole('button', { name: '自动补全资料' }))

    await waitFor(() => expect(screen.getAllByText(/制定搜索问题失败：AI 未返回有效 JSON/).length).toBeGreaterThan(0))
    expect(searchForOrganize).not.toHaveBeenCalled()
  })

  it('reports provider output truncation before attempting to parse partial JSON', async () => {
    const onProcessLog = vi.fn()
    vi.mocked(llmService.call).mockResolvedValue({
      choices: [{ finish_reason: 'length', message: { content: '{"coreSubject":"原始新闻","researchTasks":[' } }],
    } as any)

    render(<OrganizePanel visible onClose={vi.fn()} onProcessLog={onProcessLog} contents={[{ title: '原始新闻', content: '原始内容', source: '来源甲' }]} />)
    fireEvent.click(screen.getByRole('button', { name: '自动补全资料' }))

    await waitFor(() => expect(screen.getAllByText(/AI 输出达到长度上限/).length).toBeGreaterThan(0))
    expect(onProcessLog).toHaveBeenCalledWith(expect.stringContaining('responseChars=39 finishReason=length'))
    expect(searchForOrganize).not.toHaveBeenCalled()
  })

  it('reports research-task query counts when the model violates the planning contract', async () => {
    const onProcessLog = vi.fn()
    const plan = researchPlan(['背景问题'], 'explanatory')
    plan.researchTasks.unshift({
      id: 'facts',
      question: '事实核验',
      purpose: '核验核心事实',
      role: 'direct_fact',
      freshness: 'year',
      queries: ['事实问题一', '事实问题二', '事实问题三'],
    })
    vi.mocked(llmService.call).mockResolvedValue({
      choices: [{ message: { content: JSON.stringify(plan) } }],
    } as any)

    render(<OrganizePanel visible onClose={vi.fn()} onProcessLog={onProcessLog} contents={[{ title: '原始新闻', content: '原始内容', source: '来源甲' }]} />)
    fireEvent.click(screen.getByRole('button', { name: '自动补全资料' }))

    await waitFor(() => expect(screen.getAllByText(/第 1 个任务必须包含 1-2 个 queries/).length).toBeGreaterThan(0))
    expect(onProcessLog).toHaveBeenCalledWith(expect.stringContaining('PLAN_SHAPE request=1 taskCount=2 queryCounts=[3,1]'))
    const planningPrompt = vi.mocked(llmService.call).mock.calls[0]?.[0]?.messages?.[0]?.content || ''
    expect(planningPrompt).toContain('每项 queries 必须包含 1-2 个')
    expect(searchForOrganize).not.toHaveBeenCalled()
  })

  it('rejects the removed researchQueries response instead of converting it', async () => {
    vi.mocked(llmService.call).mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({ researchQueries: ['旧版问题一', '旧版问题二'] }) } }],
    } as any)

    render(<OrganizePanel visible onClose={vi.fn()} contents={[{ title: '原始新闻', content: '原始内容', source: '来源甲' }]} />)
    fireEvent.click(screen.getByRole('button', { name: '自动补全资料' }))

    await waitFor(() => expect(screen.getAllByText(/研究计划格式错误：reportType/).length).toBeGreaterThan(0))
    expect(searchForOrganize).not.toHaveBeenCalled()
    expect(screen.queryByText('旧版问题一')).toBeNull()
  })

  it('uses a specific headline as a safe search anchor when the AI asks for clarification', async () => {
    const onProcessLog = vi.fn()
    vi.mocked(llmService.call)
      .mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify({ ...researchPlan(['智能眼镜 官方信息', '智能眼镜 售价核验']), needsClarification: true }) } }] } as any)
      .mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify(evidenceAssessments(1)) } }] } as any)
    vi.mocked(searchForOrganize).mockImplementation(async query => ({
      provider: 'tavily',
      query,
      results: [{ id: query, title: '核验来源', url: `https://example.com/${encodeURIComponent(query)}`, excerpt: '可核验内容', provider: 'tavily' }],
    }))

    render(<OrganizePanel
      visible
      onClose={vi.fn()}
      onProcessLog={onProcessLog}
      contents={[{ title: '某公司发布新款智能眼镜并公布售价', content: '简短快讯', source: '来源甲' }]}
    />)
    fireEvent.click(screen.getByRole('button', { name: '自动补全资料' }))

    await waitFor(() => expect(searchForOrganize).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.getByText('核验来源')).toBeTruthy())
    expect(onProcessLog).toHaveBeenCalledWith(expect.stringContaining('CLARIFICATION_OVERRIDDEN'))
    expect(onProcessLog).toHaveBeenCalledWith(expect.stringContaining('SUCCESS'))
  })

  it('uses the expanded research and synthesis contract for the unique deep dive', async () => {
    vi.mocked(llmService.call)
      .mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify({
        ...researchPlan(['最新事实', '形成机制', '普通人门槛', '反方证据'], 'explanatory'),
      }) } }] } as any)
      .mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify(evidenceAssessments(4)) } }] } as any)
      .mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify({
        title: '深度整理后的标题',
        lead: '最新变化',
        coreFacts: '关键事实与数字',
        background: '必要时间线',
        impact: '影响对象',
        perspectives: '反方证据与未知边界',
        listenerQuestions: '普通人最关心的四个问题及回答',
        explanatoryAngles: '机制、参与者、场景与限制',
        practicalValue: { action: '当前能做什么', boundary: '不能下什么结论' },
        hasConflict: false,
        topicSupported: true,
        usedSourceIndexes: [0, 1, 2],
      }) } }] } as any)
    vi.mocked(searchForOrganize).mockImplementation(async query => ({
      provider: 'tavily',
      query,
      results: [{
        id: query,
        title: `${query}来源`,
        url: `https://example.com/${encodeURIComponent(query)}`,
        excerpt: `${query}的可核验内容`,
        provider: 'tavily',
      }],
    }))

    render(<OrganizePanel visible onClose={vi.fn()} contents={[{ title: '原始新闻', content: '原始内容', source: '来源甲' }]} />)
    fireEvent.click(screen.getByRole('button', { name: '设为深度稿' }))
    fireEvent.click(screen.getByRole('button', { name: '自动补全深度资料' }))

    await waitFor(() => expect(searchForOrganize).toHaveBeenCalledTimes(4))
    const planningOptions = vi.mocked(llmService.call).mock.calls[0]?.[0] as {
      maxTokens?: number
      timeout?: number
      messages?: Array<{ role: string; content: string }>
    }
    expect(planningOptions.maxTokens).toBe(2600)
    expect(planningOptions.timeout).toBe(240_000)
    expect(planningOptions.messages?.[0]?.content).toContain('4-6 个')

    const screeningOptions = vi.mocked(llmService.call).mock.calls[1]?.[0] as {
      timeout?: number
      messages?: Array<{ role: string; content: string }>
    }
    expect(screeningOptions.timeout).toBe(480_000)
    expect(screeningOptions.messages?.[1]?.content).toContain('本批搜索结果')

    await waitFor(() => expect(screen.getByRole('button', { name: 'AI 整理深度资料' })).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'AI 整理深度资料' }))
    await waitFor(() => expect(screen.getByDisplayValue('深度整理后的标题')).toBeTruthy())

    const synthesisOptions = vi.mocked(llmService.call).mock.calls[2]?.[0] as {
      maxTokens?: number
      timeout?: number
      messages?: Array<{ role: string; content: string }>
    }
    expect(synthesisOptions.maxTokens).toBe(4200)
    expect(synthesisOptions.timeout).toBe(360_000)
    expect(synthesisOptions.messages?.[0]?.content).toContain('listenerQuestions')
    expect(screen.getByDisplayValue('普通人最关心的四个问题及回答')).toBeTruthy()
    expect(screen.getByDisplayValue('机制、参与者、场景与限制')).toBeTruthy()
    const practicalValue = (screen.getByLabelText('现实价值与结论边界') as HTMLTextAreaElement).value
    expect(practicalValue).toContain('当前能做什么')
    expect(practicalValue).toContain('不能下什么结论')
  }, 15_000)

  it('screens a large deep-dive result set in bounded batches', async () => {
    const assessmentBatch = (count: number) => ({
      assessments: Array.from({ length: count }, (_, index) => ({
        index,
        accepted: true,
        relation: `本批第 ${index + 1} 条支持研究任务`,
      })),
    })
    vi.mocked(llmService.call)
      .mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify({
        ...researchPlan(['事实核验', '形成机制', '历史背景', '反方证据'], 'explanatory'),
      }) } }] } as any)
      .mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify(assessmentBatch(5)) } }] } as any)
      .mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify(assessmentBatch(5)) } }] } as any)
      .mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify(assessmentBatch(2)) } }] } as any)
    vi.mocked(searchForOrganize).mockImplementation(async query => ({
      provider: 'tavily',
      query,
      results: Array.from({ length: 3 }, (_, index) => ({
        id: `${query}-${index}`,
        title: `${query}来源${index + 1}`,
        url: `https://${encodeURIComponent(query)}-${index}.example.com/report`,
        excerpt: `${query}的第 ${index + 1} 条可核验内容`,
        provider: 'tavily',
      })),
    }))

    render(<OrganizePanel visible onClose={vi.fn()} contents={[{ title: '原始新闻', content: '原始内容', source: '来源甲' }]} />)
    fireEvent.click(screen.getByRole('button', { name: '设为深度稿' }))
    fireEvent.click(screen.getByRole('button', { name: '自动补全深度资料' }))

    await waitFor(() => expect(screen.getByText(/网页 12 · AI 0/)).toBeTruthy())
    expect(llmService.call).toHaveBeenCalledTimes(4)
    const firstBatch = vi.mocked(llmService.call).mock.calls[1]?.[0] as { timeout?: number; messages?: Array<{ content: string }> }
    const secondBatch = vi.mocked(llmService.call).mock.calls[2]?.[0] as { timeout?: number; messages?: Array<{ content: string }> }
    const thirdBatch = vi.mocked(llmService.call).mock.calls[3]?.[0] as { timeout?: number; messages?: Array<{ content: string }> }
    expect(firstBatch.timeout).toBe(480_000)
    expect(secondBatch.timeout).toBe(480_000)
    expect(thirdBatch.timeout).toBe(480_000)
    expect(firstBatch.messages?.[1]?.content).toContain('"index":4')
    expect(firstBatch.messages?.[1]?.content).not.toContain('"index":5')
    expect(secondBatch.messages?.[1]?.content).toContain('"index":4')
    expect(secondBatch.messages?.[1]?.content).not.toContain('"index":5')
    expect(thirdBatch.messages?.[1]?.content).toContain('"index":1')
    expect(thirdBatch.messages?.[1]?.content).not.toContain('"index":2')
  }, 15_000)

  it('rejects evidence screening responses with duplicate indexes', async () => {
    vi.mocked(llmService.call)
      .mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify(researchPlan(['事实核验', '历史背景'])) } }] } as any)
      .mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify({ assessments: [
        { index: 0, accepted: true, relation: '支持事实核验' },
        { index: 1, accepted: true, relation: '支持历史背景' },
        { index: 1, accepted: false, relation: '重复且冲突的判断' },
      ] }) } }] } as any)
    vi.mocked(searchForOrganize).mockImplementation(async query => ({
      provider: 'tavily',
      query,
      results: [{ id: query, title: `${query}来源`, url: `https://${encodeURIComponent(query)}.example.com`, excerpt: '可核验内容', provider: 'tavily' }],
    }))

    render(<OrganizePanel visible onClose={vi.fn()} contents={[{ title: '原始新闻', content: '原始内容', source: '来源甲' }]} />)
    fireEvent.click(screen.getByRole('button', { name: '自动补全资料' }))

    await waitFor(() => expect(screen.getAllByText(/应返回 2 条逐条评估，实际返回 3 条/).length).toBeGreaterThan(0))
    expect(screen.queryByText('支持事实核验')).toBeNull()
  }, 15_000)

  it('does not let a cancelled request clear the next request progress timer', async () => {
    let resolveFirstPlan!: (value: any) => void
    vi.mocked(llmService.call)
      .mockReturnValueOnce(new Promise(resolve => { resolveFirstPlan = resolve }) as any)
      .mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify(researchPlan(['新请求事实', '新请求背景'])) } }] } as any)
    vi.mocked(searchForOrganize).mockImplementation(() => new Promise(() => {}) as any)

    render(<OrganizePanel visible onClose={vi.fn()} contents={[{ title: '原始新闻', content: '原始内容', source: '来源甲' }]} />)
    fireEvent.click(screen.getByRole('button', { name: '自动补全资料' }))
    fireEvent.click(await screen.findByRole('button', { name: '停止补全' }))
    fireEvent.click(await screen.findByRole('button', { name: '自动补全资料' }))
    await waitFor(() => expect(screen.getByText('当前阶段：联网核验')).toBeTruthy())

    await act(async () => {
      resolveFirstPlan({ choices: [{ message: { content: JSON.stringify(researchPlan(['旧请求事实', '旧请求背景'])) } }] })
    })

    await waitFor(() => expect(screen.getByRole('button', { name: /研究记录/ }).textContent).toMatch(/联网核验 \/ [1-9]\d* 秒/), { timeout: 2500 })
    fireEvent.click(screen.getByRole('button', { name: '停止补全' }))
  }, 15_000)

  it('gives searching a fresh independent timeout budget after planning', async () => {
    vi.useFakeTimers()
    let view: ReturnType<typeof render> | undefined
    try {
      let searchSignal: AbortSignal | undefined
      vi.mocked(llmService.call).mockResolvedValueOnce({
        choices: [{ message: { content: JSON.stringify(researchPlan(['阶段事实', '阶段背景'])) } }],
      } as any)
      vi.mocked(searchForOrganize).mockImplementation((_query, _onProgress, signal) => {
        searchSignal = signal
        return new Promise((_resolve, reject) => {
          signal?.addEventListener('abort', () => reject(signal.reason), { once: true })
        }) as any
      })

      view = render(<OrganizePanel visible onClose={vi.fn()} contents={[{ title: '原始新闻', content: '原始内容', source: '来源甲' }]} />)
      fireEvent.click(screen.getByRole('button', { name: '自动补全资料' }))
      await act(async () => { await vi.advanceTimersByTimeAsync(0) })

      expect(searchForOrganize).toHaveBeenCalledTimes(2)
      expect(searchSignal?.aborted).toBe(false)
      await act(async () => { await vi.advanceTimersByTimeAsync(179_999) })
      expect(searchSignal?.aborted).toBe(false)
      await act(async () => { await vi.advanceTimersByTimeAsync(1) })
      expect(searchSignal?.aborted).toBe(true)
      expect((searchSignal?.reason as Error)?.message).toContain('联网核验阶段超时（180秒）')
    } finally {
      view?.unmount()
      vi.useRealTimers()
    }
  }, 15_000)

  it('uses historical, comparative, and counter evidence for an explanatory report without a same-event gate', async () => {
    vi.mocked(llmService.call)
      .mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify({
        coreSubject: '米村拌饭门店火爆原因',
        reportType: 'explanatory',
        researchTasks: [
          { id: 'facts', question: '火爆是否成立', purpose: '核验现象', role: 'direct_fact', freshness: 'year', queries: ['米村拌饭 排队'] },
          { id: 'history', question: '如何扩张', purpose: '补充历史', role: 'historical_context', freshness: 'any', queries: ['米村拌饭 发展史'] },
          { id: 'comparison', question: '同类品牌有何差异', purpose: '建立对照', role: 'comparison', freshness: 'any', queries: ['中式快餐 门店 对比'] },
          { id: 'counter', question: '有哪些反例', purpose: '检验结论', role: 'counter_evidence', freshness: 'any', queries: ['米悦 米线 门店'] },
        ],
      }) } }] } as any)
      .mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify({ assessments: [
        { index: 0, accepted: true, role: 'direct_fact', taskId: 'facts', relation: '核验门店排队现象' },
        { index: 1, accepted: true, role: 'historical_context', taskId: 'history', relation: '说明扩张时间线' },
        { index: 2, accepted: true, role: 'comparison', taskId: 'comparison', relation: '提供同业门店效率对照' },
        { index: 3, accepted: false, relation: '同名米线品牌，与核心对象无关' },
      ] }) } }] } as any)
      .mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify({
        title: '米村拌饭为何持续排队', lead: '从扩张与效率解释火爆', coreFacts: '多地门店存在排队现象', background: '品牌扩张时间线', impact: '影响消费者与加盟市场', perspectives: '对照案例不能直接证明因果',
        listenerQuestions: '排队是否等于盈利', explanatoryAngles: '扩张、效率与品类定位', practicalValue: '区分热度与经营质量',
        hasConflict: false, topicSupported: true, usedSourceIndexes: [1, 2, 3],
      }) } }] } as any)
    vi.mocked(searchForOrganize).mockImplementation(async (query, _onProgress, _signal, options) => ({
      provider: 'tavily',
      query,
      results: [{
        id: query,
        title: `${query}来源`,
        url: `https://${query.includes('排队') ? 'facts' : query.includes('发展史') ? 'history' : query.includes('中式快餐') ? 'comparison' : 'wrong'}.example.test/report`,
        excerpt: `${query}的资料`,
        provider: 'tavily',
      }],
      options,
    } as any))

    render(<OrganizePanel visible onClose={vi.fn()} contents={[{ title: '为什么米村拌饭各个门店都那么火？', content: '观察到多个门店排队', source: '主来源' }]} />)
    fireEvent.click(screen.getByRole('button', { name: '设为深度稿' }))
    fireEvent.click(screen.getByRole('button', { name: '自动补全深度资料' }))

    await waitFor(() => expect(screen.getByText('原因解释')).toBeTruthy())
    expect(screen.getByText('3/4')).toBeTruthy()
    expect(screen.getByText('历史背景')).toBeTruthy()
    expect(screen.queryByText('米悦 米线 门店来源')).toBeNull()
    expect(vi.mocked(searchForOrganize).mock.calls[0]?.[3]).toMatchObject({ timeRange: 'year', maxResults: 8 })
    expect(vi.mocked(searchForOrganize).mock.calls[1]?.[3]).toMatchObject({ timeRange: 'noLimit', maxResults: 8 })

    fireEvent.click(screen.getByRole('button', { name: 'AI 整理深度资料' }))
    await waitFor(() => expect(screen.getByDisplayValue('米村拌饭为何持续排队')).toBeTruthy())
    const synthesisOptions = vi.mocked(llmService.call).mock.calls[2]?.[0] as { messages?: Array<{ role: string; content: string }> }
    expect(synthesisOptions.messages?.[0]?.content).toContain('不要求描述同一时间发生的单一事件')
    expect(synthesisOptions.messages?.[1]?.content).toContain('historical_context')
  }, 15_000)

  it.each([
    { deep: false, button: 'AI 整理资料' },
    { deep: true, button: 'AI 整理深度资料' },
  ])('keeps incomplete AI output in editing state (deep=$deep)', async ({ deep, button }) => {
    vi.mocked(llmService.call).mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({
        title: '不完整整理结果',
        lead: '只有导语',
        coreFacts: '只有一条事实',
        anchorSupported: true,
        usedSourceIndexes: deep ? [0, 1, 2] : [0, 1],
      }) } }],
    } as any)

    render(<OrganizePanel visible onClose={vi.fn()} contents={[
      {
        title: '原始新闻',
        content: '原始事实',
        source: '主来源',
        _references: [
          { title: '独立核验一', content: '同一事件的核验事实', source: '来源乙' },
          ...(deep ? [{ title: '独立核验二', content: '同一事件的补充事实', source: '来源丙' }] : []),
        ],
      } as any,
    ]} />)
    if (deep) fireEvent.click(screen.getByRole('button', { name: '设为深度稿' }))
    fireEvent.click(screen.getByRole('button', { name: button }))

    await waitFor(() => expect(screen.getByDisplayValue('不完整整理结果')).toBeTruthy())
    const synthesisOptions = vi.mocked(llmService.call).mock.calls[0]?.[0] as { timeout?: number }
    expect(synthesisOptions.timeout).toBe(deep ? 360_000 : 180_000)
    expect(screen.getByRole('button', { name: '标记为整理完成' }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByRole('button', { name: '还没有已整理完成的新闻' }).hasAttribute('disabled')).toBe(true)
    expect(screen.queryByLabelText('整理完成')).toBeNull()
  }, 15_000)

  it('keeps synthesis failures visible and writes the validation failure to workflow logs', async () => {
    const onProcessLog = vi.fn()
    vi.mocked(llmService.call).mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({
        title: '无法核验的整理结果',
        anchorSupported: false,
        usedSourceIndexes: [0],
      }) } }],
    } as any)

    render(<OrganizePanel
      visible
      onClose={vi.fn()}
      onProcessLog={onProcessLog}
      contents={[{
        title: '原始新闻',
        content: '原始事实',
        source: '主来源',
        _references: [{
          _referenceId: 'manual-support',
          _referenceKind: 'report',
          title: '独立核验',
          content: '同一事件的核验事实',
          source: '来源乙',
        }],
      } as any]}
    />)
    fireEvent.click(screen.getByRole('button', { name: 'AI 整理资料' }))
    expect(await screen.findByText('AI 处理概览')).toBeTruthy()
    expect(screen.getByText(/最长 180 秒/)).toBeTruthy()

    expect((await screen.findByRole('alert')).textContent).toContain('参考资料不足以核验主材料对应的同一事件')
    expect(onProcessLog).toHaveBeenCalledWith(expect.stringContaining('SYNTHESIS_START'))
    expect(onProcessLog).toHaveBeenCalledWith(expect.stringContaining('SYNTHESIS_VALIDATION'))
    expect(onProcessLog).toHaveBeenCalledWith(expect.stringContaining('SYNTHESIS_FAILED'))
  })

  it('lets the user stop auto completion and aborts the active AI request', async () => {
    const onProcessLog = vi.fn()
    vi.mocked(llmService.call).mockImplementation((options: any) => new Promise((_resolve, reject) => {
      options.signal?.addEventListener('abort', () => reject(options.signal.reason), { once: true })
    }) as any)

    render(<OrganizePanel visible onClose={vi.fn()} onProcessLog={onProcessLog} contents={[{ title: '原始新闻', content: '原始内容', source: '来源甲' }]} />)
    fireEvent.click(screen.getByRole('button', { name: '自动补全资料' }))

    const stopButton = await screen.findByRole('button', { name: '停止补全' })
    const callOptions = vi.mocked(llmService.call).mock.calls[0]?.[0] as { timeout?: number; signal?: AbortSignal }
    expect(callOptions.timeout).toBe(180_000)
    expect(callOptions.signal?.aborted).toBe(false)
    expect(screen.getByText('当前阶段：制定计划')).toBeTruthy()
    expect(screen.getByText(/本阶段最多 180 秒/)).toBeTruthy()

    fireEvent.click(stopButton)

    await waitFor(() => expect(screen.getByRole('button', { name: '自动补全资料' })).toBeTruthy())
    expect(callOptions.signal?.aborted).toBe(true)
    expect(onProcessLog).toHaveBeenCalledWith(expect.stringContaining('CANCELLED'))
  }, 15_000)

  it('lets the user stop AI synthesis and aborts the active request without showing a failure', async () => {
    const onProcessLog = vi.fn()
    vi.mocked(llmService.call).mockImplementation((options: any) => new Promise((_resolve, reject) => {
      options.signal?.addEventListener('abort', () => reject(options.signal.reason), { once: true })
    }) as any)

    render(<OrganizePanel visible onClose={vi.fn()} onProcessLog={onProcessLog} contents={[{
      title: '原始新闻',
      content: '原始事实',
      source: '来源甲',
      _references: [{
        _referenceId: 'manual-support',
        _referenceKind: 'report',
        title: '独立核验',
        content: '同一事件的核验事实',
        source: '来源乙',
      }],
    } as any]} />)
    fireEvent.click(screen.getByRole('button', { name: 'AI 整理资料' }))

    const stopButton = await screen.findByRole('button', { name: '停止整理' })
    const callOptions = vi.mocked(llmService.call).mock.calls[0]?.[0] as { signal?: AbortSignal }
    expect(callOptions.signal?.aborted).toBe(false)
    expect(screen.getByText('AI 处理概览')).toBeTruthy()

    fireEvent.click(stopButton)

    await waitFor(() => expect(screen.getByRole('button', { name: 'AI 整理资料' })).toBeTruthy())
    expect(callOptions.signal?.aborted).toBe(true)
    expect(screen.getByText('已手动停止')).toBeTruthy()
    expect(screen.queryByText('上次自动整理失败')).toBeNull()
    expect(onProcessLog).toHaveBeenCalledWith(expect.stringContaining('SYNTHESIS_CANCELLED'))
  }, 15_000)

  it('clears the phase timeout when a never-settling provider is cancelled', async () => {
    vi.useFakeTimers()
    let view: ReturnType<typeof render> | undefined
    try {
      const onProcessLog = vi.fn()
      vi.mocked(llmService.call).mockReturnValue(new Promise(() => {}) as any)
      view = render(<OrganizePanel visible onClose={vi.fn()} onProcessLog={onProcessLog} contents={[{ title: '原始新闻', content: '原始内容', source: '来源甲' }]} />)
      fireEvent.click(screen.getByRole('button', { name: '自动补全资料' }))
      fireEvent.click(screen.getByRole('button', { name: '停止补全' }))

      await act(async () => { await vi.advanceTimersByTimeAsync(180_000) })
      expect(onProcessLog).toHaveBeenCalledWith(expect.stringContaining('CANCELLED'))
      expect(onProcessLog).not.toHaveBeenCalledWith(expect.stringContaining('PHASE_TIMEOUT'))
    } finally {
      view?.unmount()
      vi.useRealTimers()
    }
  }, 15_000)

  it('shows only one spinner while source completion is running', async () => {
    vi.mocked(llmService.call).mockReturnValue(new Promise(() => {}) as any)
    const view = render(<OrganizePanel visible onClose={vi.fn()} contents={[{ title: '原始新闻', content: '原始内容', source: '来源甲' }]} />)

    fireEvent.click(screen.getByRole('button', { name: '自动补全资料' }))

    await waitFor(() => expect(view.container.querySelectorAll('.is-spinning')).toHaveLength(1))
    expect(screen.getByText('研究记录').closest('.organize-research-title')?.querySelector('.is-spinning')).toBeTruthy()
  })

  it('discards a late research plan after discovery replaces the material set', async () => {
    let resolvePlan!: (value: any) => void
    vi.mocked(llmService.call).mockReturnValue(new Promise(resolve => { resolvePlan = resolve }) as any)
    const view = render(<OrganizePanel visible onClose={vi.fn()} contents={[{ title: '旧新闻', content: '旧内容', source: '旧来源' }]} />)
    fireEvent.click(screen.getByRole('button', { name: '自动补全资料' }))
    await waitFor(() => expect(llmService.call).toHaveBeenCalledTimes(1))

    view.rerender(<OrganizePanel visible onClose={vi.fn()} contents={[{ title: '新新闻', content: '新内容', source: '新来源' }]} />)
    await waitFor(() => expect(screen.getByDisplayValue('新新闻')).toBeTruthy())
    await act(async () => {
      resolvePlan({ choices: [{ message: { content: JSON.stringify(researchPlan(['旧新闻查询一', '旧新闻查询二'])) } }] })
    })

    await waitFor(() => expect(screen.getByRole('button', { name: '自动补全资料' }).hasAttribute('disabled')).toBe(false))
    expect(searchForOrganize).not.toHaveBeenCalled()
    expect(screen.queryByText('旧新闻查询')).toBeNull()
  }, 15_000)

  it('preserves manual field edits made while automatic synthesis is pending', async () => {
    let resolveSynthesis!: (value: any) => void
    vi.mocked(llmService.call).mockReturnValue(new Promise(resolve => { resolveSynthesis = resolve }) as any)
    render(<OrganizePanel visible onClose={vi.fn()} contents={[
      {
        title: '原始新闻',
        content: '原始事实',
        source: '来源甲',
        _references: [{
          _referenceId: 'manual-support',
          _referenceKind: 'report',
          title: '独立核验',
          content: '同一事件的独立核验内容',
          source: '来源丙',
        }],
      } as any,
      { title: '候选新闻', content: '候选事实', source: '来源乙' },
    ]} />)
    fireEvent.click(screen.getByRole('button', { name: 'AI 整理资料' }))
    expect(await screen.findByText('AI 处理概览')).toBeTruthy()
    expect(screen.getByText(/AI 正在阅读 2 份资料/)).toBeTruthy()
    expect(screen.getByText(/最长 180 秒/)).toBeTruthy()
    expect(screen.getByRole('button', { name: '合并新闻' }).hasAttribute('disabled')).toBe(true)
    expect(screen.getAllByRole('button', { name: /删除/ }).every(button => button.hasAttribute('disabled'))).toBe(true)
    expect(screen.queryByRole('button', { name: /标记存在分歧|分歧已处理/ })).toBeNull()
    fireEvent.change(screen.getByLabelText('一句话导语'), { target: { value: '用户在等待时写的导语' } })

    await act(async () => {
      resolveSynthesis({ choices: [{ message: { content: JSON.stringify({
        title: 'AI 标题', lead: 'AI 导语', coreFacts: 'AI 事实', background: 'AI 背景', impact: 'AI 影响', perspectives: 'AI 观点',
        anchorSupported: true, usedSourceIndexes: [0, 1],
      }) } }] })
    })

    await waitFor(() => expect(screen.getByDisplayValue('AI 标题')).toBeTruthy())
    expect(screen.getByDisplayValue('用户在等待时写的导语')).toBeTruthy()
    expect(screen.getByDisplayValue('AI 背景')).toBeTruthy()
  }, 15_000)

  it('aborts invalidated synthesis and keeps the replacement progress timer alive', async () => {
    let resolveFirstSynthesis!: (value: any) => void
    let firstSignal: AbortSignal | undefined
    let secondSignal: AbortSignal | undefined
    vi.mocked(llmService.call)
      .mockImplementationOnce((options: any) => {
        firstSignal = options.signal
        return new Promise(resolve => { resolveFirstSynthesis = resolve }) as any
      })
      .mockImplementationOnce((options: any) => {
        secondSignal = options.signal
        return new Promise(() => {}) as any
      })
    const source = (title: string) => ({
      title,
      content: `${title}事实`,
      source: '来源甲',
      _references: [{
        _referenceId: `${title}-support`,
        _referenceKind: 'report',
        title: `${title}独立核验`,
        content: `${title}独立核验事实`,
        source: '来源乙',
      }],
    } as any)

    const view = render(<OrganizePanel visible onClose={vi.fn()} contents={[source('旧新闻')]} />)
    fireEvent.click(screen.getByRole('button', { name: 'AI 整理资料' }))
    await waitFor(() => expect(firstSignal?.aborted).toBe(false))

    view.rerender(<OrganizePanel visible onClose={vi.fn()} contents={[source('新新闻')]} />)
    await waitFor(() => expect(screen.getByDisplayValue('新新闻')).toBeTruthy())
    expect(firstSignal?.aborted).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'AI 整理资料' }))
    await waitFor(() => expect(secondSignal?.aborted).toBe(false))

    await act(async () => {
      resolveFirstSynthesis({ choices: [{ message: { content: '{}' } }] })
    })
    await waitFor(() => expect(screen.getByText(/已等待 [1-9]\d* 秒/)).toBeTruthy(), { timeout: 2500 })

    view.unmount()
    expect(secondSignal?.aborted).toBe(true)
  }, 15_000)
})
