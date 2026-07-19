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

export function normalizeKnowledgeCandidates(value: unknown, limit = 8): OrganizeKnowledgeCandidate[] {
  if (!Array.isArray(value)) return []
  const ids = new Set<string>()
  return value.flatMap((candidate, index) => {
    if (!candidate || typeof candidate !== 'object') return []
    const raw = candidate as Record<string, unknown>
    const statement = cleanText(raw.statement)
    const role = raw.role as OrganizeKnowledgeRole
    if (!statement || !KNOWLEDGE_ROLES.has(role)) return []
    const requestedId = cleanText(raw.id)
    const baseId = /^[a-zA-Z0-9_-]+$/.test(requestedId) ? requestedId : `knowledge-${index + 1}`
    let id = baseId
    let suffix = 2
    while (ids.has(id)) {
      id = `${baseId}-${suffix}`
      suffix += 1
    }
    ids.add(id)
    return [{
      id,
      role,
      statement,
      basis: KNOWLEDGE_BASES.has(String(raw.basis)) ? raw.basis as OrganizeKnowledgeCandidate['basis'] : 'model_memory',
      temporalRisk: KNOWLEDGE_RISKS.has(String(raw.temporalRisk)) ? raw.temporalRisk as OrganizeKnowledgeCandidate['temporalRisk'] : 'medium',
      confidence: KNOWLEDGE_CONFIDENCES.has(String(raw.confidence)) ? raw.confidence as OrganizeKnowledgeCandidate['confidence'] : 'medium',
      verificationStatus: 'unverified' as const,
      verificationQuery: cleanText(raw.verificationQuery) || statement,
      limitations: cleanTextList(raw.limitations),
    }]
  }).slice(0, Math.max(0, limit))
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

export function knowledgePlanningInstruction(mode: OrganizeCompletionMode, isDeepDive: boolean): string {
  if (mode === 'web_only') return '不要返回 knowledgeCandidates。'
  const count = isDeepDive ? '5-8' : '3-5'
  return `同时返回 knowledgeCandidates（${count} 条），用于发挥模型自身的通用知识、历史记忆和分析能力。每项包含 id、role、statement、basis、temporalRisk、confidence、verificationQuery、limitations。role 只能是 historical_context、mechanism、comparison、counter_view、stakeholder、listener_question、practical_implication；basis 只能是 model_memory 或 model_inference。不得声称模型知识已有网页来源，不得编造 URL；最新状态、精确数字、日期、人物原话、法律政策和产品规格必须 temporalRisk=high。statement 应提供有信息量的背景、机制、对照、反方或听众问题，避免复述主材料。`
}
