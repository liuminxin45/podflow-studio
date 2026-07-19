import { describe, expect, it } from 'vitest'
import type { ScriptSegment } from '../../types/workflow'
import { reconcileProductionPlan, splitScriptText } from '../soundStudio/productionPlan'

function segment(overrides: Partial<ScriptSegment> = {}): ScriptSegment {
  return {
    id: 'seg_001',
    type: 'quick_news',
    title: '新闻',
    text: '第一句。第二句。',
    source_fact_ids: ['fact_001'],
    estimated_seconds: 12,
    speaker: 'Host A',
    ...overrides,
  }
}

describe('production plan', () => {
  it('splits long narration on sentence boundaries', () => {
    const text = `${'第一部分内容。'.repeat(20)}${'第二部分内容。'.repeat(20)}`
    const clips = splitScriptText(text, 60)

    expect(clips.length).toBeGreaterThan(2)
    expect(clips.join('')).toBe(text)
    expect(clips.every(item => item.length <= 60)).toBe(true)
  })

  it('keeps clip edits when the script text is unchanged', () => {
    const initial = reconcileProductionPlan([segment()])
    initial.clips[0] = {
      ...initial.clips[0],
      path: 'D:\\audio\\clip.wav',
      duration_seconds: 3.5,
      trim_start_ms: 120,
      source: 'recording',
    }
    initial.joins = []

    const restored = reconcileProductionPlan([segment()], initial)

    expect(restored.clips[0]).toEqual(expect.objectContaining({
      id: 'seg_001',
      path: 'D:\\audio\\clip.wav',
      trim_start_ms: 120,
      source: 'recording',
    }))
  })

  it('invalidates stale audio when a clip text changes', () => {
    const initial = reconcileProductionPlan([segment()])
    initial.clips[0].path = 'old.wav'
    initial.clips[0].generation_key = 'old-key'

    const changed = reconcileProductionPlan([segment({ text: '已经修改的稿件。' })], initial)

    expect(changed.clips[0].path).toBe('')
    expect(changed.clips[0].generation_key).toBe('')
    expect(changed.clips[0].source).toBe('tts')
  })

  it('uses shorter pauses within a section and a long lead-in before deep dive', () => {
    const plan = reconcileProductionPlan([
      segment({ id: 'quick', text: '短句。'.repeat(80) }),
      segment({ id: 'deep', type: 'deep_dive', title: '深度', text: '进入深度解读。' }),
    ])
    const beforeDeep = plan.joins.find(join => join.after_clip_id === plan.clips.at(-2)?.id)

    expect(plan.joins.some(join => join.duration_ms === 150)).toBe(true)
    expect(beforeDeep?.duration_ms).toBe(1200)
  })
})
