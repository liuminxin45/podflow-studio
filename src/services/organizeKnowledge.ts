import type {
  OrganizeCompletionMode,
  OrganizeKnowledgeCandidate,
  OrganizeKnowledgeRole,
  OrganizeResearchResult,
} from '../types/organize'

const KNOWLEDGE_ROLES = new Set<OrganizeKnowledgeRole>([
  'historical_context',
  'mechanism',
  'comparison',
  'counter_view',
  'stakeholder',
  'listener_question',
  'practical_implication',
])
const KNOWLEDGE_BASES = new Set(['model_memory', 'model_inference'])
const KNOWLEDGE_RISKS = new Set(['low', 'medium', 'high'])
const KNOWLEDGE_CONFIDENCES = new Set(['low', 'medium', 'high'])
const KNOWLEDGE_VERIFICATION_STATUSES = new Set(['unverified', 'verified', 'conflicted'])

function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function cleanTextList(value: unknown): string[] {
  return Array.isArray(value) ? value.map(cleanText).filter(Boolean) : []
}

export function parseKnowledgeCandidates(value: unknown, expected: { min: number; max: number }): OrganizeKnowledgeCandidate[] {
  if (!Array.isArray(value) || value.length < expected.min || value.length > expected.max) {
    throw new Error(`AI 知识格式错误：knowledgeCandidates 必须包含 ${expected.min}-${expected.max} 条`)
  }
  const ids = new Set<string>()
  return value.map((candidate, index) => {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
      throw new Error(`AI 知识格式错误：第 ${index + 1} 条候选不是对象`)
    }
    const raw = candidate as Record<string, unknown>
    const statement = cleanText(raw.statement)
    const role = raw.role as OrganizeKnowledgeRole
    const id = cleanText(raw.id)
    const verificationQuery = cleanText(raw.verificationQuery)
    const limitations = cleanTextList(raw.limitations)
    if (!/^[a-zA-Z0-9_-]+$/.test(id) || ids.has(id)) {
      throw new Error(`AI 知识格式错误：第 ${index + 1} 条候选 id 无效或重复`)
    }
    if (!statement || !KNOWLEDGE_ROLES.has(role)) throw new Error(`AI 知识格式错误：第 ${index + 1} 条候选 statement 或 role 无效`)
    if (!KNOWLEDGE_BASES.has(String(raw.basis))) throw new Error(`AI 知识格式错误：第 ${index + 1} 条候选 basis 无效`)
    if (!KNOWLEDGE_RISKS.has(String(raw.temporalRisk))) throw new Error(`AI 知识格式错误：第 ${index + 1} 条候选 temporalRisk 无效`)
    if (!KNOWLEDGE_CONFIDENCES.has(String(raw.confidence))) throw new Error(`AI 知识格式错误：第 ${index + 1} 条候选 confidence 无效`)
    if (!verificationQuery) throw new Error(`AI 知识格式错误：第 ${index + 1} 条候选 verificationQuery 不能为空`)
    if (!Array.isArray(raw.limitations) || limitations.length !== raw.limitations.length) {
      throw new Error(`AI 知识格式错误：第 ${index + 1} 条候选 limitations 必须是字符串数组`)
    }
    ids.add(id)
    return {
      id,
      role,
      statement,
      basis: raw.basis as OrganizeKnowledgeCandidate['basis'],
      temporalRisk: raw.temporalRisk as OrganizeKnowledgeCandidate['temporalRisk'],
      confidence: raw.confidence as OrganizeKnowledgeCandidate['confidence'],
      verificationStatus: 'unverified' as const,
      verificationQuery,
      limitations,
    }
  })
}

export function isCurrentKnowledgeCandidate(value: unknown): value is OrganizeKnowledgeCandidate {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  const supportingResultIds = candidate.supportingResultIds
  return typeof candidate.id === 'string' && /^[a-zA-Z0-9_-]+$/.test(candidate.id)
    && typeof candidate.statement === 'string' && candidate.statement.trim().length > 0
    && KNOWLEDGE_ROLES.has(candidate.role as OrganizeKnowledgeRole)
    && KNOWLEDGE_BASES.has(String(candidate.basis))
    && KNOWLEDGE_RISKS.has(String(candidate.temporalRisk))
    && KNOWLEDGE_CONFIDENCES.has(String(candidate.confidence))
    && KNOWLEDGE_VERIFICATION_STATUSES.has(String(candidate.verificationStatus))
    && (candidate.verificationQuery === undefined || typeof candidate.verificationQuery === 'string')
    && (supportingResultIds === undefined || Array.isArray(supportingResultIds) && supportingResultIds.every(id => typeof id === 'string' && id.trim().length > 0))
    && (candidate.verificationStatus !== 'verified' || Array.isArray(supportingResultIds) && supportingResultIds.length > 0)
    && (candidate.limitations === undefined || Array.isArray(candidate.limitations) && candidate.limitations.every(item => typeof item === 'string'))
}

export function promoteKnowledgeCandidates(
  candidates: OrganizeKnowledgeCandidate[],
  supportingResultIdsByCandidate: Map<string, string[]>,
  evidence: OrganizeResearchResult[],
): OrganizeKnowledgeCandidate[] {
  const acceptedIds = new Set(evidence.map(item => item.id))
  return candidates.map(candidate => {
    const supportingResultIds = Array.from(new Set(supportingResultIdsByCandidate.get(candidate.id) || []))
      .filter(id => acceptedIds.has(id))
    if (supportingResultIds.length === 0) return candidate
    return {
      ...candidate,
      verificationStatus: 'verified',
      supportingResultIds,
    }
  })
}

export function knowledgeExpansionInstruction(mode: OrganizeCompletionMode, isDeepDive: boolean): string {
  if (mode === 'web_only') throw new Error('纯联网模式不应调用 AI 知识扩展')
  const count = isDeepDive ? '5-8' : '3-5'
  return `只返回 JSON 对象 {"knowledgeCandidates": [...]}，knowledgeCandidates 必须有 ${count} 条，用于发挥模型自身的通用知识、历史记忆和分析能力。每项包含 id、role、statement、basis、temporalRisk、confidence、verificationQuery、limitations。role 只能是 historical_context、mechanism、comparison、counter_view、stakeholder、listener_question、practical_implication；basis 只能是 model_memory 或 model_inference；temporalRisk 和 confidence 都只能是 low、medium 或 high，不得使用中文、百分比或其他等级。limitations 必须是字符串数组，没有限制时返回空数组。不得返回研究计划，不得声称模型知识已有网页来源，不得编造 URL；最新状态、精确数字、日期、人物原话、法律政策和产品规格必须 temporalRisk=high。statement 和 verificationQuery 应简洁，提供背景、机制、对照、反方或听众问题，避免复述主材料。`
}
