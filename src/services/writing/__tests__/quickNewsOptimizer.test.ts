import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FactCard } from '../../../types/workflow'
import { runAITask } from '../../aiTaskService'
import { optimizeQuickNews } from '../quickNewsOptimizer'

vi.mock('../../aiTaskService', () => ({ runAITask: vi.fn() }))
vi.mock('../../settings/llmConfigResolver', () => ({
  hasUsableLLMConfig: () => true,
  llmConfigResolver: { getLLMConfig: () => ({ aiTarget: 'model:api-openai' }) },
}))

const factCards: FactCard[] = [{
  id: 'fact-1',
  title: '产品本周开放预约',
  summary: '官方宣布产品本周开放预约，首批仅支持两个城市。',
  confidence: 'high',
  evidence: [{ id: 'evidence-1', title: '官方公告', url: 'https://example.com/official', published_at: '2026-07-15', source_role: 'primary', excerpt: '本周开放预约，首批仅支持两个城市。' }],
  claims: [{ id: 'claim-1', text: '本周开放预约，首批仅支持两个城市。', evidence_ids: ['evidence-1'], status: 'supported', confidence: 'high', verifier_model: 'test-model', verified_at: '2026-07-15T00:00:00Z' }],
}]

const request = (sourceFactIds = ['fact-1']) => ({
  segmentText: '这款产品已经来了，大家都可以买。',
  factCards,
  sourceFactIds,
  targetChars: { min: 240, max: 360 },
  editorialVoice: 'human' as const,
  tone: 'default' as const,
})

describe('quick news optimizer typed task boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(runAITask).mockResolvedValue({
      title: '本周开放预约',
      suggested_text: '官方宣布，这款产品将在本周开放预约，首批只支持两个城市。',
      source_fact_ids: ['fact-1'],
      change_summary: ['删除无依据表述'],
      unsupported_or_uncertain: ['所有人都可以买'],
      quality_checks: {
        answers_what_changed: true,
        answers_listener_relevance: true,
        tts_friendly: true,
        within_fact_boundary: true,
      },
    })
  })

  it('sends business data without constructing prompts or parsing raw JSON', async () => {
    const result = await optimizeQuickNews(request())

    expect(runAITask).toHaveBeenCalledWith(
      'writing.optimize_quick_news',
      'model:api-openai',
      { request: request() },
    )
    expect(result.sourceFactIds).toEqual(['fact-1'])
    expect(result.unsupportedOrUncertain).toEqual(['所有人都可以买'])
  })

  it('fails before AI when provenance is absent or unknown', async () => {
    await expect(optimizeQuickNews(request([]))).rejects.toThrow('没有绑定事实卡')
    await expect(optimizeQuickNews(request(['missing']))).rejects.toThrow('找不到这条快讯绑定的事实卡')
    expect(runAITask).not.toHaveBeenCalled()
  })
})
