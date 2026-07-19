import type { Priority } from '../constants/priorities'
import type { ContentItem } from './workflow'

export interface OrganizeItem extends ContentItem {
  _source_channel?: 'auto'
  _id: number
}

export type NewsUnitStatus = 'needs_context' | 'editing' | 'conflict' | 'ready'

export interface NewsReference extends ContentItem {
  _referenceId: string
  _referenceKind: 'report' | 'note'
  _originKey?: string
  _evidenceRole?: EvidenceRole
  _researchTaskId?: string
  _relation?: string
  _limitations?: string[]
}

export interface NewsEditorial {
  lead: string
  coreFacts: string
  background: string
  impact: string
  perspectives: string
  listenerQuestions: string
  explanatoryAngles: string
  practicalValue: string
}

export type OrganizeSearchProvider = 'tavily' | 'bocha' | 'default_ai'
export type OrganizeCompletionMode = 'hybrid' | 'web_only' | 'ai_knowledge'
export type OrganizeReportType = 'event' | 'explanatory' | 'trend'
export type EvidenceFreshness = 'latest' | 'year' | 'any'
export type EvidenceRole = 'direct_fact' | 'historical_context' | 'mechanism' | 'comparison' | 'counter_evidence' | 'consumer_experience' | 'expert_opinion' | 'data_benchmark'
export type OrganizeKnowledgeRole = 'historical_context' | 'mechanism' | 'comparison' | 'counter_view' | 'stakeholder' | 'listener_question' | 'practical_implication'
export type OrganizeKnowledgeBasis = 'model_memory' | 'model_inference'
export type OrganizeKnowledgeRisk = 'low' | 'medium' | 'high'
export type OrganizeKnowledgeConfidence = 'low' | 'medium' | 'high'
export type OrganizeKnowledgeVerification = 'unverified' | 'verified' | 'conflicted'

export interface OrganizeKnowledgeCandidate {
  id: string
  role: OrganizeKnowledgeRole
  statement: string
  basis: OrganizeKnowledgeBasis
  temporalRisk: OrganizeKnowledgeRisk
  confidence: OrganizeKnowledgeConfidence
  verificationStatus: OrganizeKnowledgeVerification
  verificationQuery?: string
  supportingResultIds?: string[]
  limitations?: string[]
}

export interface OrganizeResearchTask {
  id: string
  question: string
  purpose: string
  role: EvidenceRole
  freshness: EvidenceFreshness
  queries: string[]
}

export interface OrganizeEvidenceMetrics {
  retrieved: number
  accepted: number
  rejected: number
  uniqueDomains: number
  coveredTasks: number
  totalTasks: number
}

export interface OrganizeResearchResult {
  id: string
  title: string
  url: string
  excerpt: string
  publishedAt?: string
  relevance?: number
  provider: OrganizeSearchProvider
  query?: string
  taskId?: string
  evidenceRole?: EvidenceRole
  relation?: string
  limitations?: string[]
}

export interface OrganizeResearchSession {
  unitId: number
  provider: OrganizeSearchProvider
  completionMode?: OrganizeCompletionMode
  queries: string[]
  results: OrganizeResearchResult[]
  knowledgeCandidates?: OrganizeKnowledgeCandidate[]
  status: 'searching' | 'completed' | 'partial' | 'failed'
  error?: string
  errors?: Array<{ query: string; message: string }>
  updatedAt: string
  reportType: OrganizeReportType
  coreSubject: string
  tasks: OrganizeResearchTask[]
  metrics: OrganizeEvidenceMetrics
}

export interface CandidateItem extends OrganizeItem {
  _priority: Priority
  _order: number
  _isDeepDive?: boolean
  _status?: NewsUnitStatus
  _references?: NewsReference[]
  _editorial?: NewsEditorial
  _originKeys?: string[]
}
