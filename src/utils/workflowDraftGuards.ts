import type {
  CandidateItem,
  DeepDiveBrief,
  DepthCandidateAssessment,
  DepthSelectionState,
  OrganizeResearchSession,
  OrganizeResearchTask,
} from '../types/organize'
import type { ContentItem } from '../types/workflow'
import { isCurrentResearchSession } from '../services/organizeEvidence'
import { contentIdentity } from './contentIdentity'

const EMPTY_EDITORIAL = {
  lead: '',
  coreFacts: '',
  background: '',
  impact: '',
  perspectives: '',
  listenerQuestions: '',
  explanatoryAngles: '',
  practicalValue: '',
}

function isCandidateItem(value: unknown): value is CandidateItem {
  if (!value || typeof value !== 'object') return false
  const candidate = value as CandidateItem
  return typeof candidate._id === 'number'
    && typeof candidate._order === 'number'
    && ['primary', 'important', 'backup'].includes(candidate._priority)
    && ['needs_context', 'editing', 'conflict', 'ready'].includes(candidate._status || '')
    && (!candidate._isDeepDive || isCurrentDeepDiveBrief(candidate._deepDiveBrief))
}

function isResearchTask(value: unknown): value is OrganizeResearchTask {
  if (!value || typeof value !== 'object') return false
  const task = value as Record<string, unknown>
  return typeof task.id === 'string'
    && typeof task.question === 'string'
    && typeof task.purpose === 'string'
    && typeof task.role === 'string'
    && typeof task.freshness === 'string'
    && Array.isArray(task.queries)
    && task.queries.every(query => typeof query === 'string')
}

function isDepthCandidateAssessment(value: unknown): value is DepthCandidateAssessment {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return typeof candidate.unitId === 'number'
    && typeof candidate.coreQuestion === 'string'
    && typeof candidate.whyInteresting === 'string'
    && typeof candidate.listenerValue === 'string'
    && Array.isArray(candidate.probeTasks) && candidate.probeTasks.every(isResearchTask)
    && Array.isArray(candidate.probeResults)
    && typeof candidate.eligible === 'boolean'
    && Array.isArray(candidate.gateReasons) && candidate.gateReasons.every(reason => typeof reason === 'string')
    && typeof candidate.uniqueDomains === 'number'
}

export function isCurrentDepthSelectionState(value: unknown): value is DepthSelectionState {
  if (!value || typeof value !== 'object') return false
  const state = value as Record<string, unknown>
  return state.version === 1
    && ['idle', 'triaging', 'probing', 'researching', 'selected', 'provisional', 'none', 'failed'].includes(String(state.status))
    && typeof state.inputFingerprint === 'string'
    && /^[a-f0-9]{8}$/.test(state.inputFingerprint)
    && (state.source === undefined || state.source === 'automatic' || state.source === 'manual')
    && (state.selectedUnitId === undefined || typeof state.selectedUnitId === 'number')
    && (state.provisionalUnitId === undefined || typeof state.provisionalUnitId === 'number')
    && Array.isArray(state.candidates) && state.candidates.every(isDepthCandidateAssessment)
    && Array.isArray(state.attemptedUnitIds) && state.attemptedUnitIds.every(id => typeof id === 'number')
    && typeof state.updatedAt === 'string' && Number.isFinite(Date.parse(state.updatedAt))
}

function isDeepDiveClaim(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false
  const claim = value as Record<string, unknown>
  return typeof claim.text === 'string' && claim.text.trim().length > 0
    && Array.isArray(claim.sourceUrls)
    && claim.sourceUrls.length > 0
    && claim.sourceUrls.every(url => typeof url === 'string' && url.trim().length > 0)
    && ['low', 'medium', 'high'].includes(String(claim.confidence))
}

function isDeepDiveSection(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false
  const section = value as Record<string, unknown>
  return typeof section.title === 'string' && section.title.trim().length > 0
    && typeof section.question === 'string' && section.question.trim().length > 0
    && typeof section.listenerValue === 'string' && section.listenerValue.trim().length > 0
    && Array.isArray(section.claims)
    && section.claims.length > 0
    && section.claims.every(isDeepDiveClaim)
}

export function isCurrentDeepDiveBrief(value: unknown): value is DeepDiveBrief {
  if (!value || typeof value !== 'object') return false
  const brief = value as Record<string, unknown>
  return brief.version === 1
    && typeof brief.inputFingerprint === 'string' && /^[a-f0-9]{8}$/.test(brief.inputFingerprint)
    && typeof brief.coreQuestion === 'string' && brief.coreQuestion.trim().length > 0
    && typeof brief.whyNow === 'string' && brief.whyNow.trim().length > 0
    && typeof brief.thesisBoundary === 'string' && brief.thesisBoundary.trim().length > 0
    && Array.isArray(brief.sections) && brief.sections.length >= 2 && brief.sections.every(isDeepDiveSection)
    && Array.isArray(brief.counterpoints) && brief.counterpoints.every(isDeepDiveClaim)
    && Array.isArray(brief.limitations) && brief.limitations.every(item => typeof item === 'string')
    && Array.isArray(brief.sourceUrls)
    && brief.sourceUrls.length > 0
    && brief.sourceUrls.every(url => typeof url === 'string' && url.trim().length > 0)
    && typeof brief.generatedAt === 'string' && Number.isFinite(Date.parse(brief.generatedAt))
}

export function toCandidateItems(value: unknown): CandidateItem[] {
  if (!Array.isArray(value)) return []
  return value.filter(isCandidateItem)
}

export function prepareCandidateForDraft(unit: CandidateItem): CandidateItem {
  const editorial = { ...EMPTY_EDITORIAL, ...unit._editorial }
  const content = [
    editorial.lead,
    editorial.coreFacts || unit.content || '',
    editorial.background,
    editorial.impact,
    editorial.perspectives,
    editorial.listenerQuestions,
    editorial.explanatoryAngles,
    editorial.practicalValue,
  ].map(value => value.trim()).filter(Boolean).join('\n\n')

  return {
    ...unit,
    content,
    summary: editorial.lead || unit.summary,
  }
}

export function readyCandidatesForDraft(value: unknown): CandidateItem[] {
  return toCandidateItems(value)
    .filter(candidate => candidate._status === 'ready')
    .map(prepareCandidateForDraft)
}

export function contentOriginKeys(item: ContentItem): string[] {
  const originKeys = (item as CandidateItem)._originKeys
  return Array.isArray(originKeys) && originKeys.length > 0
    ? originKeys
    : [contentIdentity(item)]
}

export function organizeWorkspaceMatchesSelection(
  candidates: unknown,
  selectedItems: ContentItem[],
): boolean {
  const selectedKeys = new Set(selectedItems.map(contentIdentity))
  const workspaceKeys = new Set(toCandidateItems(candidates).flatMap(contentOriginKeys))

  return selectedKeys.size === workspaceKeys.size
    && [...selectedKeys].every(key => workspaceKeys.has(key))
}

export function buildOrganizeUiPatch(
  candidates: CandidateItem[],
  researchSessions: OrganizeResearchSession[] = [],
  depthSelection?: DepthSelectionState,
) {
  return {
    candidates,
    researchSessions: researchSessions.filter(isCurrentResearchSession),
    ...(depthSelection && isCurrentDepthSelectionState(depthSelection) ? { depthSelection } : {}),
  }
}
