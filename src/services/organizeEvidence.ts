import type {
  EvidenceFreshness,
  EvidenceRole,
  OrganizeEvidenceMetrics,
  OrganizeReportType,
  OrganizeResearchResult,
  OrganizeResearchSession,
  OrganizeResearchTask,
} from '../types/organize'
import { isCurrentKnowledgeCandidate } from './organizeKnowledge'

const EVIDENCE_ROLES = new Set<EvidenceRole>([
  'direct_fact', 'historical_context', 'mechanism', 'comparison',
  'counter_evidence', 'consumer_experience', 'expert_opinion', 'data_benchmark',
])
const FRESHNESS_VALUES = new Set<EvidenceFreshness>(['latest', 'year', 'any'])

export interface PlannedResearch {
  reportType: OrganizeReportType
  coreSubject: string
  tasks: OrganizeResearchTask[]
}

export interface EvidenceAssessment {
  index: number
  accepted: boolean
  role?: EvidenceRole
  taskId?: string
  relation?: string
  limitations?: string[]
  supportedKnowledgeIds?: string[]
}

function cleanText(value: unknown): string {
  return String(value || '').trim()
}

function strictText(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`研究计划格式错误：${label} 必须是非空字符串`)
  return value.trim()
}

function isCurrentTask(value: unknown): value is OrganizeResearchTask {
  if (!value || typeof value !== 'object') return false
  const task = value as Record<string, unknown>
  return typeof task.id === 'string' && /^[a-zA-Z0-9_-]+$/.test(task.id)
    && typeof task.question === 'string' && task.question.trim().length > 0
    && typeof task.purpose === 'string' && task.purpose.trim().length > 0
    && EVIDENCE_ROLES.has(task.role as EvidenceRole)
    && FRESHNESS_VALUES.has(task.freshness as EvidenceFreshness)
    && Array.isArray(task.queries) && task.queries.length >= 1 && task.queries.length <= 2
    && task.queries.every(query => typeof query === 'string' && query.trim().length > 0)
}

function isCurrentResult(value: unknown, provider: unknown, taskIds: Set<string>): value is OrganizeResearchResult {
  if (!value || typeof value !== 'object') return false
  const result = value as Record<string, unknown>
  return typeof result.id === 'string' && result.id.trim().length > 0
    && typeof result.title === 'string' && result.title.trim().length > 0
    && typeof result.url === 'string' && /^https?:\/\//i.test(result.url)
    && typeof result.excerpt === 'string' && result.excerpt.trim().length > 0
    && result.provider === provider
    && (result.publishedAt === undefined || typeof result.publishedAt === 'string')
    && (result.relevance === undefined || typeof result.relevance === 'number' && Number.isFinite(result.relevance))
    && (result.query === undefined || typeof result.query === 'string')
    && (result.taskId === undefined || typeof result.taskId === 'string' && taskIds.has(result.taskId))
    && (result.evidenceRole === undefined || EVIDENCE_ROLES.has(result.evidenceRole as EvidenceRole))
    && (result.relation === undefined || typeof result.relation === 'string' && result.relation.trim().length > 0)
    && (result.limitations === undefined || Array.isArray(result.limitations) && result.limitations.every(item => typeof item === 'string'))
}

export function normalizeResearchPlan(
  plan: Record<string, unknown>,
  queryLimit: number,
): PlannedResearch {
  const rawReportType = plan.reportType
  if (rawReportType !== 'event' && rawReportType !== 'explanatory' && rawReportType !== 'trend') {
    throw new Error('研究计划格式错误：reportType 必须是 event、explanatory 或 trend')
  }
  const reportType: OrganizeReportType = rawReportType
  const coreSubject = strictText(plan.coreSubject, 'coreSubject')
  const rawTasks = Array.isArray(plan.researchTasks) ? plan.researchTasks : []
  if (rawTasks.length === 0) throw new Error('研究计划格式错误：researchTasks 必须是非空数组')
  const ids = new Set<string>()
  const tasks = rawTasks.flatMap((value, index) => {
    if (!value || typeof value !== 'object') throw new Error(`研究计划格式错误：第 ${index + 1} 个任务不是对象`)
    const task = value as Record<string, unknown>
    const queries = Array.isArray(task.queries)
      ? task.queries.map((query, queryIndex) => strictText(query, `第 ${index + 1} 个任务的 queries[${queryIndex}]`))
      : []
    if (queries.length < 1 || queries.length > 2) throw new Error(`研究计划格式错误：第 ${index + 1} 个任务必须包含 1-2 个 queries`)
    const id = strictText(task.id, `第 ${index + 1} 个任务的 id`)
    const question = strictText(task.question, `第 ${index + 1} 个任务的 question`)
    const purpose = strictText(task.purpose, `第 ${index + 1} 个任务的 purpose`)
    if (!/^[a-zA-Z0-9_-]+$/.test(id) || !question || !purpose) {
      throw new Error(`研究计划格式错误：第 ${index + 1} 个任务的 id、question 或 purpose 无效`)
    }
    if (ids.has(id)) throw new Error(`研究计划格式错误：任务 id 重复（${id}）`)
    ids.add(id)
    const rawRole = task.role as EvidenceRole
    const rawFreshness = task.freshness as EvidenceFreshness
    if (!EVIDENCE_ROLES.has(rawRole)) throw new Error(`研究计划格式错误：任务 ${id} 的 role 无效`)
    if (!FRESHNESS_VALUES.has(rawFreshness)) throw new Error(`研究计划格式错误：任务 ${id} 的 freshness 无效`)
    return [{
      id,
      question,
      purpose,
      role: rawRole,
      freshness: rawFreshness,
      queries,
    } satisfies OrganizeResearchTask]
  })
  const queryCount = tasks.reduce((count, task) => count + task.queries.length, 0)
  if (queryCount > queryLimit) throw new Error(`研究计划格式错误：queries 总数不能超过 ${queryLimit}`)
  return {
    reportType,
    coreSubject,
    tasks,
  }
}

export function isCurrentResearchSession(value: unknown): value is OrganizeResearchSession {
  if (!value || typeof value !== 'object') return false
  const session = value as Record<string, unknown>
  const metrics = session.metrics as Record<string, unknown> | undefined
  const tasksAreCurrent = Array.isArray(session.tasks) && session.tasks.length >= 2 && session.tasks.length <= 6 && session.tasks.every(isCurrentTask)
  const taskIds = tasksAreCurrent ? new Set((session.tasks as OrganizeResearchTask[]).map(task => task.id)) : new Set<string>()
  const taskIdsAreUnique = tasksAreCurrent && taskIds.size === (session.tasks as unknown[]).length
  const expectedQueries = tasksAreCurrent ? (session.tasks as OrganizeResearchTask[]).flatMap(task => task.queries) : []
  const queriesAreCurrent = Array.isArray(session.queries)
    && session.queries.every(query => typeof query === 'string' && query.trim().length > 0)
    && JSON.stringify(session.queries) === JSON.stringify(expectedQueries)
  const resultsAreCurrent = Array.isArray(session.results)
    && session.results.every(result => isCurrentResult(result, session.provider, taskIds))
  const resultIds = resultsAreCurrent ? new Set((session.results as OrganizeResearchResult[]).map(result => result.id)) : new Set<string>()
  const knowledgeCandidatesAreCurrent = session.knowledgeCandidates === undefined || Array.isArray(session.knowledgeCandidates)
    && session.knowledgeCandidates.every(isCurrentKnowledgeCandidate)
    && new Set(session.knowledgeCandidates.map(candidate => candidate.id)).size === session.knowledgeCandidates.length
    && session.knowledgeCandidates.every(candidate => (candidate.supportingResultIds || []).every(id => resultIds.has(id)))
  const metricValues = metrics ? ['retrieved', 'accepted', 'rejected', 'uniqueDomains', 'coveredTasks', 'totalTasks'].map(key => metrics[key]) : []
  const metricsAreCurrent = metricValues.length === 6
    && metricValues.every(metric => typeof metric === 'number' && Number.isFinite(metric) && Number.isInteger(metric) && metric >= 0)
    && metrics?.totalTasks === (session.tasks as unknown[] | undefined)?.length
    && Number(metrics?.accepted) + Number(metrics?.rejected) === Number(metrics?.retrieved)
    && Number(metrics?.coveredTasks) <= Number(metrics?.totalTasks)
    && Number(metrics?.uniqueDomains) <= Number(metrics?.accepted)
  const errorsAreCurrent = session.errors === undefined || Array.isArray(session.errors) && session.errors.every(value => {
    if (!value || typeof value !== 'object') return false
    const error = value as Record<string, unknown>
    return typeof error.query === 'string' && typeof error.message === 'string'
  })
  return (session.reportType === 'event' || session.reportType === 'explanatory' || session.reportType === 'trend')
    && typeof session.unitId === 'number' && Number.isFinite(session.unitId) && Number.isInteger(session.unitId) && session.unitId >= 0
    && (session.provider === 'tavily' || session.provider === 'bocha' || session.provider === 'default_ai')
    && (session.completionMode === undefined || session.completionMode === 'hybrid' || session.completionMode === 'web_only' || session.completionMode === 'ai_knowledge')
    && (session.status === 'searching' || session.status === 'completed' || session.status === 'partial' || session.status === 'failed')
    && typeof session.coreSubject === 'string' && session.coreSubject.trim().length > 0
    && tasksAreCurrent
    && taskIdsAreUnique
    && queriesAreCurrent
    && resultsAreCurrent
    && knowledgeCandidatesAreCurrent
    && metricsAreCurrent
    && errorsAreCurrent
    && (session.error === undefined || typeof session.error === 'string')
    && typeof session.updatedAt === 'string' && Number.isFinite(Date.parse(session.updatedAt))
}

function canonicalUrl(value: string): string {
  try {
    const url = new URL(value)
    url.hash = ''
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|spm$|from$|source$)/i.test(key)) url.searchParams.delete(key)
    }
    return `${url.hostname.replace(/^www\./, '').toLowerCase()}${url.pathname.replace(/\/$/, '')}${url.search}`
  } catch {
    return value.trim().toLowerCase()
  }
}

function canonicalTitle(value: string): string {
  return value.toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '')
}

export function sourceDomain(value: string): string {
  try {
    return new URL(value).hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    return ''
  }
}

export function dedupeResearchResults(results: OrganizeResearchResult[]): OrganizeResearchResult[] {
  const urls = new Set<string>()
  const titles = new Set<string>()
  return results.filter(result => {
    const url = canonicalUrl(result.url)
    const title = canonicalTitle(result.title)
    if ((url && urls.has(url)) || (title && titles.has(title))) return false
    if (url) urls.add(url)
    if (title) titles.add(title)
    return true
  })
}

export function applyEvidenceAssessments(
  results: OrganizeResearchResult[],
  assessments: EvidenceAssessment[],
  tasks: OrganizeResearchTask[],
): { accepted: OrganizeResearchResult[]; rejected: number; metrics: OrganizeEvidenceMetrics } {
  const byIndex = new Map(assessments.map(item => [item.index, item]))
  const taskById = new Map(tasks.map(task => [task.id, task]))
  const accepted = results.flatMap((result, index) => {
    const assessment = byIndex.get(index)
    const relation = cleanText(assessment?.relation)
    if (!assessment?.accepted || !relation) return []
    const assessedTask = assessment.taskId ? taskById.get(assessment.taskId) : undefined
    const intendedTask = result.taskId ? taskById.get(result.taskId) : undefined
    const task = assessedTask || intendedTask
    if (!task) return []
    const assessedRole = assessment.role && EVIDENCE_ROLES.has(assessment.role) ? assessment.role : undefined
    return [{
      ...result,
      evidenceRole: assessedRole || task.role,
      taskId: task.id,
      relation,
      limitations: Array.isArray(assessment.limitations) ? assessment.limitations.map(cleanText).filter(Boolean) : [],
    }]
  })
  const domains = new Set(accepted.map(item => sourceDomain(item.url)).filter(Boolean))
  const coveredTasks = new Set(accepted.map(item => item.taskId).filter(Boolean))
  return {
    accepted,
    rejected: results.length - accepted.length,
    metrics: {
      retrieved: results.length,
      accepted: accepted.length,
      rejected: results.length - accepted.length,
      uniqueDomains: domains.size,
      coveredTasks: coveredTasks.size,
      totalTasks: tasks.length,
    },
  }
}

export function freshnessToTimeRange(freshness: EvidenceFreshness): 'month' | 'year' | 'noLimit' {
  if (freshness === 'latest') return 'month'
  return freshness === 'year' ? 'year' : 'noLimit'
}
