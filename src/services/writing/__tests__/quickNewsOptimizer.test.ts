import { describe, expect, it } from 'vitest'
import type { FactCard } from '../../../types/workflow'
import {
  buildQuickNewsOptimizationMessages,
  parseQuickNewsOptimizationResult,
} from '../quickNewsOptimizer'

const factCards: FactCard[] = [
  {
    id: 'fact-1',
    title: '产品本周开放预约',
    summary: '官方宣布产品本周开放预约，首批仅支持两个城市。',
    source_title: '官方公告',
    source_url: 'https://example.com/official',
    published_at: '2026-07-15',
    claim: '本周开放预约，首批仅支持两个城市。',
    confidence: 'high',
  },
  {
    id: 'fact-unrelated',
    title: '另一条新闻',
    summary: '不得进入当前提示词。',
    source_title: '其他来源',
    source_url: 'https://example.com/other',
    published_at: '2026-07-15',
    claim: '与当前新闻无关。',
    confidence: 'high',
  },
]

function request(overrides: Record<string, unknown> = {}) {
  return {
    segmentText: '这款产品已经来了，大家都可以买。',
    factCards,
    sourceFactIds: ['fact-1'],
    previousSegmentText: '上一条是天气提醒。',
    nextSegmentText: '下一条关注出行。',
    targetChars: { min: 240, max: 360 },
    editorialVoice: 'human' as const,
    tone: 'default' as const,
    ...overrides,
  }
}

describe('quick news optimizer', () => {
  it('keeps the prompt limited to bound facts and carries the text target', () => {
    const messages = buildQuickNewsOptimizationMessages(request())
    const prompt = messages[1].content

    expect(prompt).toContain('fact-1')
    expect(prompt).toContain('240–360')
    expect(prompt).toContain('自然人味体系')
    expect(prompt).not.toContain('fact-unrelated')
    expect(prompt).not.toContain('不得进入当前提示词')
  })

  it('switches to the professional editorial system explicitly', () => {
    const messages = buildQuickNewsOptimizationMessages(request({ editorialVoice: 'professional' }))

    expect(messages[1].content).toContain('专业播报体系')
    expect(messages[1].content).toContain('不替听众做决定')
  })

  it('fails closed when provenance is absent or cannot be resolved', () => {
    expect(() => buildQuickNewsOptimizationMessages(request({ sourceFactIds: [] })))
      .toThrow('没有绑定事实卡')
    expect(() => buildQuickNewsOptimizationMessages(request({ sourceFactIds: ['missing'] })))
      .toThrow('找不到这条快讯绑定的事实卡')
  })

  it('accepts a fact-bound result and rejects changed provenance', () => {
    const raw = JSON.stringify({
      title: '本周开放预约，首批限两个城市',
      suggested_text: '官方宣布，这款产品将在本周开放预约，首批只支持两个城市。',
      source_fact_ids: ['fact-1'],
      change_summary: ['删除无依据的全面开售表述'],
      unsupported_or_uncertain: ['所有人都可以买'],
    })

    expect(parseQuickNewsOptimizationResult(raw, ['fact-1'])).toMatchObject({
      sourceFactIds: ['fact-1'],
      unsupportedOrUncertain: ['所有人都可以买'],
    })
    expect(() => parseQuickNewsOptimizationResult(
      raw.replace('fact-1', 'fact-unrelated'),
      ['fact-1'],
    )).toThrow('改变了快讯绑定的事实卡')
  })
})
