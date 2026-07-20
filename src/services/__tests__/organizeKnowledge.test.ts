import { describe, expect, it } from 'vitest'
import {
  isCurrentKnowledgeCandidate,
  knowledgeExpansionInstruction,
  parseKnowledgeCandidates,
  promoteKnowledgeCandidates,
} from '../organizeKnowledge'

describe('organizeKnowledge', () => {
  it('uses a dedicated current-only contract for AI knowledge expansion', () => {
    const prompt = knowledgeExpansionInstruction('hybrid', false)

    expect(prompt).toContain('只返回 JSON 对象')
    expect(prompt).toContain('不得返回研究计划')
    expect(prompt).toContain('3-5 条')
    expect(prompt).toContain('temporalRisk 和 confidence 都只能是 low、medium 或 high')
    expect(prompt).toContain('limitations 必须是字符串数组')
    expect(() => knowledgeExpansionInstruction('web_only', false)).toThrow('纯联网模式不应调用 AI 知识扩展')
  })

  it('parses the complete model contract without allowing the model to self-verify it', () => {
    const candidates = parseKnowledgeCandidates(Array.from({ length: 3 }, (_, index) => ({
        id: 'history',
        ...(index > 0 ? { id: `history-${index + 1}` } : {}),
        role: 'historical_context',
        statement: '这项技术沿用了更早的产业标准。',
        basis: 'model_memory',
        temporalRisk: 'low',
        confidence: 'high',
        verificationQuery: '产业标准 发展史',
        limitations: [],
      })), { min: 3, max: 5 })

    expect(candidates[0]).toEqual(
      expect.objectContaining({
        id: 'history',
        role: 'historical_context',
        verificationStatus: 'unverified',
        verificationQuery: '产业标准 发展史',
      }),
    )
    expect(isCurrentKnowledgeCandidate(candidates[0])).toBe(true)
  })

  it('rejects an incomplete or malformed knowledge response as a whole', () => {
    const response = Array.from({ length: 3 }, (_, index) => ({
      id: `candidate-${index + 1}`,
      role: index === 1 ? 'direct_fact' : 'historical_context',
      statement: index === 1 ? '不允许的事实角色' : `历史背景 ${index + 1}`,
      basis: 'model_memory',
      temporalRisk: 'low',
      confidence: 'medium',
      verificationQuery: `核验问题 ${index + 1}`,
      limitations: [],
    }))

    expect(() => parseKnowledgeCandidates(response, { min: 3, max: 5 })).toThrow('第 2 条候选 statement 或 role 无效')
  })

  it('rejects confidence values outside the declared enum', () => {
    const response = Array.from({ length: 3 }, (_, index) => ({
      id: `candidate-${index + 1}`,
      role: 'historical_context',
      statement: `历史背景 ${index + 1}`,
      basis: 'model_memory',
      temporalRisk: 'low',
      confidence: index === 0 ? 'moderate' : 'medium',
      verificationQuery: `核验问题 ${index + 1}`,
      limitations: [],
    }))

    expect(() => parseKnowledgeCandidates(response, { min: 3, max: 5 })).toThrow('第 1 条候选 confidence 无效')
  })

  it('promotes a knowledge candidate only when an accepted result supports it', () => {
    const [candidate] = parseKnowledgeCandidates([{
      id: 'mechanism',
      role: 'mechanism',
      statement: '规模效应可能降低单位成本。',
      basis: 'model_inference',
      temporalRisk: 'medium',
      confidence: 'medium',
      verificationQuery: '规模效应 单位成本',
      limitations: [],
    }], { min: 1, max: 1 })
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
