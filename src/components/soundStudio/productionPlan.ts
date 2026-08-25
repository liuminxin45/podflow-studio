import type {
  ProductionClip,
  ProductionJoin,
  ProductionMusicSlot,
  ProductionPlan,
  ScriptSegment as WorkflowScriptSegment,
  VoiceSegment,
} from '../../types/workflow'

const MAX_TTS_CHARS = 140
const MAX_TTS_SENTENCES = 2

function musicSlot(overrides: Partial<ProductionMusicSlot> = {}): ProductionMusicSlot {
  return {
    asset_id: '',
    path: '',
    gain_db: -4,
    duration_ms: 5000,
    fade_in_ms: 500,
    fade_out_ms: 1000,
    voice_overlap_ms: 0,
    duck_db: 0,
    rights_ref: 'assets/audio/RIGHTS.md#make-funk',
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
    let sentenceCount = 0
    for (const sentence of sentences) {
      const oversized = Array.from(
        { length: Math.ceil(sentence.length / maxChars) },
        (_, index) => sentence.slice(index * maxChars, (index + 1) * maxChars),
      )
      for (const part of oversized) {
        if (current && (current.length + part.length > maxChars || sentenceCount >= MAX_TTS_SENTENCES)) {
          units.push(current)
          current = ''
          sentenceCount = 0
        }
        current += part
        sentenceCount += 1
        if (current.length >= maxChars) {
          units.push(current)
          current = ''
          sentenceCount = 0
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
  if (!sameSegment && nextClip.segment_type === 'deep_dive') {
    return { after_clip_id: clip.id, type: 'bridge', duration_ms: 2400 }
  }
  if (!sameSegment && clip.segment_type === 'quick_news' && nextClip.segment_type === 'quick_news') {
    return { after_clip_id: clip.id, type: 'sting', duration_ms: 1350 }
  }
  return {
    after_clip_id: clip.id,
    type: 'pause',
    duration_ms: sameSegment
      ? Math.min(380, Math.max(220, clip.direction.pause_after_ms))
      : Math.max(clip.direction.pause_after_ms, 600),
  }
}

const DIRECTION_PROFILES = {
  opening: { intent: 'opening_warm', provider_emotion: 'happy', emotion_scale: 2, energy: 0.72, pace: 0.96 },
  quick_news: { intent: 'quick_news', provider_emotion: 'neutral', emotion_scale: 1, energy: 0.68, pace: 1.02 },
  deep_dive: { intent: 'deep_dive', provider_emotion: 'neutral', emotion_scale: 1, energy: 0.55, pace: 0.94 },
  closing: { intent: 'closing_relaxed', provider_emotion: 'happy', emotion_scale: 1, energy: 0.48, pace: 0.92 },
  custom: { intent: 'natural_narration', provider_emotion: 'neutral', emotion_scale: 1, energy: 0.58, pace: 0.97 },
} as const

function speechDirection(type: WorkflowScriptSegment['type'], value: string): ProductionClip['direction'] {
  const profile = DIRECTION_PROFILES[type] || DIRECTION_PROFILES.custom
  const emphasis = [...value.matchAll(/“([^”]{2,12})”|([A-Za-z][A-Za-z0-9.-]{1,15})|(\d+(?:\.\d+)?%?)/g)]
    .map(match => match[1] || match[2] || match[3])
    .filter((item, index, all) => Boolean(item) && all.indexOf(item) === index)
    .slice(0, 2)
  return {
    ...profile,
    intent: /[？?]/.test(value) ? 'rhetorical_question' : profile.intent,
    pause_before_ms: 0,
    pause_after_ms: type === 'quick_news' ? 450 : 650,
    emphasis,
  }
}

export function reconcileProductionPlan(
  segments: WorkflowScriptSegment[],
  existing?: Partial<ProductionPlan> | null,
  voices: VoiceSegment[] = [],
): ProductionPlan {
  if (existing?.version != null && existing.version !== 4) {
    throw new Error(`不支持制作计划版本 ${existing.version}，当前版本为 4，请重新生成制作计划。`)
  }
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
        context_before: '',
        context_after: '',
        direction: textMatches && previous?.direction
          ? previous.direction
          : speechDirection(segment.type || 'custom', part),
        speaker: segment.speaker || 'Host A',
        source_fact_ids: segment.source_fact_ids || [],
        source_claim_ids: segment.source_claim_ids || [],
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

  clips.forEach((clip, index) => {
    clip.context_before = index > 0 ? clips[index - 1].text.slice(-120) : ''
    clip.context_after = index + 1 < clips.length ? clips[index + 1].text.slice(0, 120) : ''
  })

  const previousJoins = new Map((existing?.joins || []).map(join => [join.after_clip_id, join]))
  const joins = clips.slice(0, -1).map((clip, index) => {
    const fallback = defaultJoin(clip, clips[index + 1])
    const saved = previousJoins.get(clip.id)
    const savedType = saved?.type
    return {
      after_clip_id: clip.id,
      type: savedType === 'pause' || savedType === 'sting' || savedType === 'bridge'
        ? savedType
        : fallback.type,
      duration_ms: Math.min(15000, Math.max(0, Number(saved?.duration_ms ?? fallback.duration_ms))),
    }
  })

  return {
    version: 4,
    quality_profile: 'podflow_morning_v4',
    script_hash: scriptHash(segments),
    clips,
    joins,
    music: {
      intro: musicSlot({ asset_id: 'make-funk-intro', path: 'assets/audio/podflow-intro.wav', gain_db: -2, duration_ms: 12000, fade_in_ms: 120, fade_out_ms: 1000, voice_overlap_ms: 4000, duck_db: 11, ...existing?.music?.intro }),
      sting: musicSlot({ asset_id: 'make-funk-sting', path: 'assets/audio/podflow-transition.wav', duration_ms: 1350, fade_in_ms: 50, fade_out_ms: 220, ...existing?.music?.sting }),
      bridge: musicSlot({ asset_id: 'make-funk-bridge', path: 'assets/audio/podflow-bridge.wav', duration_ms: 2400, fade_in_ms: 80, fade_out_ms: 350, ...existing?.music?.bridge }),
      outro: musicSlot({ asset_id: 'make-funk-outro', path: 'assets/audio/podflow-outro.wav', gain_db: -2, duration_ms: 10000, fade_in_ms: 900, fade_out_ms: 1200, voice_overlap_ms: 4000, duck_db: 11, ...existing?.music?.outro }),
    },
    render: {
      output_format: existing?.render?.output_format || 'mp3',
      sample_rate_hz: 48000,
      mp3_bitrate: '160k',
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
