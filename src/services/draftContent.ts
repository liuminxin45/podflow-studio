import type { Script } from '../types/workflow'

/** Ignore editor bookkeeping, not spoken content or its provenance. */
export function draftContentSignature(script: Partial<Script> | undefined): string {
  return JSON.stringify({
    title: script?.title || '',
    description: script?.description || '',
    segments: (script?.segments || []).map(segment => ({
      id: segment.id,
      type: segment.type,
      title: segment.title || '',
      text: segment.text.trim(),
      facts: segment.source_fact_ids || [],
      claims: segment.source_claim_ids || [],
      speaker: segment.speaker || 'Host A',
    })),
  })
}
