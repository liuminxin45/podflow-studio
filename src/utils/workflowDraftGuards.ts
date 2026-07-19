import type { CandidateItem } from '../types/organize'
import type { OrganizeResearchSession } from '../types/organize'
import { isCurrentResearchSession } from '../services/organizeEvidence'

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

export function buildOrganizeUiPatch(candidates: CandidateItem[], researchSessions: OrganizeResearchSession[] = []) {
  return {
    candidates,
    researchSessions: researchSessions.filter(isCurrentResearchSession),
  }
}
