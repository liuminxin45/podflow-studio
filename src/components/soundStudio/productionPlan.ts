import type {
  ProductionClip,
  ProductionJoin,
  ProductionMusicSlot,
  ProductionPlan,
  ScriptSegment as WorkflowScriptSegment,
  VoiceSegment,
} from '../../types/workflow'

const MAX_TTS_CHARS = 180

function musicSlot(overrides: Partial<ProductionMusicSlot> = {}): ProductionMusicSlot {
  return {
    enabled: false,
    path: '',
    volume: 0.15,
    duration_ms: 5000,
    fade_in_ms: 500,
    fade_out_ms: 1000,
    ...overrides,
  }
}

export function splitScriptText(input: string, maxChars = MAX_TTS_CHARS): string[] {
  const normalized = String(input || '').replace(/[ \t]+/g, ' ').trim()
  if (!normalized) return []

  const paragraphs = normalized.split(/\n+/).map(item => item.trim()).filter(Boolean)
  const units: string[] = []
  for (const paragraph of paragraphs) {
    const sentences = paragraph.match(/.*?(?:[。！？!?；;]+|$)/g)?.map(item => item.trim()).filter(Boolean)
      || [paragraph]
    let current = ''
    for (const sentence of sentences) {
      const oversized = Array.from(
        { length: Math.ceil(sentence.length / maxChars) },
        (_, index) => sentence.slice(index * maxChars, (index + 1) * maxChars),
      )
      for (const part of oversized) {
        if (current && current.length + part.length > maxChars) {
          units.push(current)
          current = ''
        }
        current += part
        if (current.length >= maxChars) {
          units.push(current)
          current = ''
        }
      }
    }
    if (current) units.push(current)
  }
  return units.length ? units : [normalized]
}

function hashText(value: string): string {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

function scriptHash(segments: WorkflowScriptSegment[]): string {
  return hashText(JSON.stringify(segments.map(segment => ({
    id: segment.id,
    text: segment.text,
    speaker: segment.speaker || 'Host A',
  }))))
}

function clipId(parentId: string, index: number, total: number): string {
  return total === 1 ? parentId : `${parentId}__${String(index + 1).padStart(3, '0')}`
}

function defaultJoin(clip: ProductionClip, nextClip: ProductionClip): ProductionJoin {
  const sameSegment = clip.parent_segment_id === nextClip.parent_segment_id
  return {
    after_clip_id: clip.id,
    type: 'pause',
    duration_ms: sameSegment ? 150 : nextClip.segment_type === 'deep_dive' ? 1200 : 600,
  }
}

export function reconcileProductionPlan(
  segments: WorkflowScriptSegment[],
  existing?: Partial<ProductionPlan> | null,
  voices: VoiceSegment[] = [],
): ProductionPlan {
  const previousClips = new Map((existing?.clips || []).map(clip => [clip.id, clip]))
  const voiceById = new Map(voices.map(voice => [voice.segment_id, voice]))
  const clips: ProductionClip[] = []

  segments.forEach((segment, segmentIndex) => {
    const parts = splitScriptText(segment.text)
    const parentId = segment.id || `seg_${String(segmentIndex + 1).padStart(3, '0')}`
    parts.forEach((part, partIndex) => {
      const id = clipId(parentId, partIndex, parts.length)
      const previous = previousClips.get(id)
      const voice = voiceById.get(id)
      const textMatches = previous?.text === part
      const source = textMatches && ['tts', 'recording', 'local'].includes(previous?.source || '')
        ? previous!.source
        : voice?.engine === 'recording' ? 'recording' : 'tts'
      clips.push({
        id,
        parent_segment_id: parentId,
        segment_type: segment.type || 'custom',
        segment_title: segment.title || `第 ${segmentIndex + 1} 段`,
        text: part,
        speaker: segment.speaker || 'Host A',
        source_fact_ids: segment.source_fact_ids || [],
        source,
        path: textMatches ? previous?.path || voice?.path || '' : voice?.text === part ? voice.path : '',
        duration_seconds: textMatches
          ? Number(previous?.duration_seconds || voice?.duration_seconds || 0)
          : voice?.text === part ? Number(voice.duration_seconds || 0) : 0,
        trim_start_ms: textMatches ? Math.max(0, Number(previous?.trim_start_ms || 0)) : 0,
        trim_end_ms: textMatches ? Math.max(0, Number(previous?.trim_end_ms || 0)) : 0,
        generation_key: textMatches ? previous?.generation_key || voice?.generation_key || '' : '',
      })
    })
  })

  const previousJoins = new Map((existing?.joins || []).map(join => [join.after_clip_id, join]))
  const joins = clips.slice(0, -1).map((clip, index) => {
    const fallback = defaultJoin(clip, clips[index + 1])
    const saved = previousJoins.get(clip.id)
    return {
      after_clip_id: clip.id,
      type: saved?.type === 'transition' ? 'transition' as const : 'pause' as const,
      duration_ms: Math.min(15000, Math.max(0, Number(saved?.duration_ms ?? fallback.duration_ms))),
    }
  })

  return {
    version: 1,
    script_hash: scriptHash(segments),
    clips,
    joins,
    music: {
      intro: musicSlot(existing?.music?.intro),
      transition: musicSlot({ duration_ms: 1500, fade_in_ms: 150, fade_out_ms: 300, ...existing?.music?.transition }),
      bed: musicSlot(existing?.music?.bed),
      outro: musicSlot(existing?.music?.outro),
    },
    render: {
      output_format: existing?.render?.output_format || 'mp3',
      normalize_loudness: existing?.render?.normalize_loudness !== false,
      target_lufs: Number(existing?.render?.target_lufs ?? -16),
      true_peak_db: Number(existing?.render?.true_peak_db ?? -1),
    },
    updated_at: new Date().toISOString(),
  }
}

export function planContentSignature(plan?: Partial<ProductionPlan> | null): string {
  if (!plan) return ''
  return JSON.stringify({
    version: plan.version,
    script_hash: plan.script_hash,
    clips: plan.clips,
    joins: plan.joins,
    music: plan.music,
    render: plan.render,
  })
}
