import { describe, expect, it } from 'vitest'
import {
  isCurrentKnowledgeCandidate,
  normalizeKnowledgeCandidates,
  promoteKnowledgeCandidates,
} from '../organizeKnowledge'

describe('organizeKnowledge', () => {
  it('normalizes model knowledge without allowing the model to self-verify it', () => {
    const candidates = normalizeKnowledgeCandidates([
      {
        id: 'history',
        role: 'historical_context',
        statement: '这项技术沿用了更早的产业标准。',
        basis: 'model_memory',
        temporalRisk: 'low',
        confidence: 'high',
        verificationStatus: 'verified',
        verificationQuery: '产业标准 发展史',
      },
      { id: 'bad', role: 'direct_fact', statement: '不允许的事实角色' },
    ])

    expect(candidates).toEqual([
      expect.objectContaining({
        id: 'history',
        role: 'historical_context',
        verificationStatus: 'unverified',
        verificationQuery: '产业标准 发展史',
      }),
    ])
    expect(isCurrentKnowledgeCandidate(candidates[0])).toBe(true)
  })

  it('promotes a knowledge candidate only when an accepted result supports it', () => {
    const [candidate] = normalizeKnowledgeCandidates([{
      id: 'mechanism',
      role: 'mechanism',
      statement: '规模效应可能降低单位成本。',
      basis: 'model_inference',
      temporalRisk: 'medium',
      confidence: 'medium',
    }])
    const evidence = [{
      id: 'source-1',
      title: '行业研究',
      url: 'https://example.com/report',
      excerpt: '单位成本随规模下降',
      provider: 'tavily' as const,
    }]

    const promoted = promoteKnowledgeCandidates(candidate ? [candidate] : [], new Map([
      ['mechanism', ['source-1', 'rejected-source']],
    ]), evidence)

    expect(promoted[0]).toMatchObject({ verificationStatus: 'verified', supportingResultIds: ['source-1'] })
    expect(isCurrentKnowledgeCandidate(promoted[0])).toBe(true)
  })
})
