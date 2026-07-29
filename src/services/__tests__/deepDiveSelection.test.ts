import { describe, expect, it } from 'vitest'
import type { CandidateItem, DepthCandidateAssessment } from '../../types/organize'
import {
  buildDepthInputFingerprint,
  evaluateDepthProbe,
} from '../deepDiveSelection'

function unit(id: number, title: string): CandidateItem {
  return {
    _id: id,
    _order: id,
    _priority: 'important',
    _status: 'editing',
    title,
    content: `${title}的原始内容`,
  }
}

function candidate(results: DepthCandidateAssessment['probeResults']) {
  return {
    unitId: 1,
    coreQuestion: '为什么这件事值得继续追问？',
    whyInteresting: '它包含可以解释的机制。',
    listenerValue: '帮助听众做出实际判断。',
    dimensions: {
      explanatoryDepth: 'high' as const,
      audienceImpact: 'high' as const,
      evidencePotential: 'high' as const,
      distinctiveness: 'medium' as const,
    },
    probeTasks: [
      {
        id: 'facts',
        question: '事实是否成立',
        purpose: '核验直接事实',
        role: 'direct_fact' as const,
        freshness: 'latest' as const,
        queries: ['事实查询'],
      },
      {
        id: 'mechanism',
        question: '机制是什么',
        purpose: '确认解释空间',
        role: 'mechanism' as const,
        freshness: 'any' as const,
        queries: ['机制查询'],
      },
    ],
    probeResults: results,
  }
}

describe('deepDiveSelection', () => {
  it('builds a stable fingerprint and invalidates it when the material changes', () => {
    const first = buildDepthInputFingerprint([unit(1, '新闻一'), unit(2, '新闻二')], '晨间新闻')
    const reordered = buildDepthInputFingerprint([unit(2, '新闻二'), unit(1, '新闻一')], '晨间新闻')
    const edited = buildDepthInputFingerprint([unit(1, '新闻一已更新'), unit(2, '新闻二')], '晨间新闻')

    expect(first).toMatch(/^[a-f0-9]{8}$/)
    expect(reordered).toBe(first)
    expect(edited).not.toBe(first)
  })

  it('accepts a probe only when direct facts, expansion evidence and two domains are present', () => {
    const assessment = evaluateDepthProbe(candidate([
      {
        id: 'fact-result',
        title: '官方事实',
        url: 'https://official.example/report',
        excerpt: '直接事实',
        provider: 'tavily',
        taskId: 'facts',
        evidenceRole: 'direct_fact',
      },
      {
        id: 'mechanism-result',
        title: '机制解释',
        url: 'https://analysis.example/story',
        excerpt: '机制解释',
        provider: 'tavily',
        taskId: 'mechanism',
        evidenceRole: 'mechanism',
      },
    ]))

    expect(assessment.eligible).toBe(true)
    expect(assessment.uniqueDomains).toBe(2)
    expect(assessment.gateReasons).toEqual([])
  })

  it('rejects a popular-looking candidate when independent expansion evidence is absent', () => {
    const assessment = evaluateDepthProbe(candidate([
      {
        id: 'fact-result',
        title: '同一来源事实',
        url: 'https://official.example/report',
        excerpt: '直接事实',
        provider: 'tavily',
        taskId: 'facts',
        evidenceRole: 'direct_fact',
      },
    ]))

    expect(assessment.eligible).toBe(false)
    expect(assessment.gateReasons).toContain('缺少能展开机制、影响、比较、反证或数据尺度的资料')
    expect(assessment.gateReasons).toContain('独立来源不足 2 个')
  })
})
