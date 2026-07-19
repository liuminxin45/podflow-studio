import { describe, it, expect } from 'vitest'
import { WRITING_LAYOUT_TEST_HELPERS } from '../layout'
import type { Script } from '../../../types/workflow'

const {
  createDefaultWritingSegments,
  mapScriptToSegments,
  normalizeDynamicLabels,
  CONTENT_LAYOUTS,
} = WRITING_LAYOUT_TEST_HELPERS

describe('Writing layout helpers', () => {
  it('creates default news brief segments with normalized news labels', () => {
    const segments = createDefaultWritingSegments('news_brief')

    expect(segments.map((s) => s.type)).toEqual([
      'opening',
      'quick_news',
      'quick_news',
      'quick_news',
      'quick_news',
      'quick_news',
      'quick_news',
      'quick_news',
      'quick_news',
      'quick_news',
      'deep_dive',
      'closing',
    ])
    expect(segments.filter((s) => s.type === 'quick_news').map((s) => s.label)).toEqual([
      '快讯一', '快讯二', '快讯三', '快讯四', '快讯五', '快讯六', '快讯七', '快讯八', '快讯九',
    ])
  })

  it('normalizes dynamic labels after removal/reorder-like input', () => {
    const layout = CONTENT_LAYOUTS.news_brief
    const normalized = normalizeDynamicLabels([
      {
        id: 'seg_opening',
        type: 'opening',
        label: '开场导语',
        content: '',
        tone: 'default',
        estimatedSeconds: 90,
        isCompleted: false,
        collapsed: false,
      },
      {
        id: 'seg_news_x',
        type: 'quick_news',
        label: '快讯九',
        content: '',
        tone: 'default',
        estimatedSeconds: 100,
        isCompleted: false,
        collapsed: false,
      },
      {
        id: 'seg_news_y',
        type: 'quick_news',
        label: '快讯二十',
        content: '',
        tone: 'default',
        estimatedSeconds: 100,
        isCompleted: false,
        collapsed: false,
      },
    ], layout)

    expect(normalized.filter((s) => s.type === 'quick_news').map((s) => s.label)).toEqual(['快讯一', '快讯二'])
  })

  it('maps canonical script segments', () => {
    const script: Script = {
      content_type: 'news_brief',
      segments: [
        { id: 'o', type: 'opening', title: '自定义开头', text: '大家好，欢迎收听。', source_fact_ids: [], estimated_seconds: 5 },
        {
          id: 'n2',
          type: 'quick_news',
          title: '任意标签A',
          text: '第一条新闻内容，包含更多细节与影响分析，确保长度超过阈值进入编辑状态。',
          source_fact_ids: ['fact_1'],
          estimated_seconds: 12,
        },
        { id: 'n8', type: 'deep_dive', title: '任意标签B', text: '第二条新闻内容。', source_fact_ids: ['fact_2'], estimated_seconds: 20 },
        { id: 'c', type: 'closing', title: '自定义结尾', text: '以上就是今天的全部内容。', source_fact_ids: [], estimated_seconds: 5 },
      ],
    }

    const mapped = mapScriptToSegments('news_brief', script)

    expect(mapped.resolvedType).toBe('news_brief')
    expect(mapped.segments.filter((s) => s.type === 'quick_news').map((s) => s.label)).toEqual(['快讯一'])
    expect(mapped.segments.filter((s) => s.type === 'deep_dive').map((s) => s.label)).toEqual(['任意标签B'])
    expect(mapped.segments.find((s) => s.id === 'n2')?.estimatedSeconds).toBe(12)
    expect(mapped.segments.find((s) => s.id === 'n2')?.sourceFactIds).toEqual(['fact_1'])
  })

  it('uses the current default layout when no script segments exist', () => {
    const mapped = mapScriptToSegments('news_brief', { title: '测试' })

    expect(mapped.resolvedType).toBe('news_brief')
    expect(mapped.segments).toHaveLength(12)
    expect(mapped.segments.every(segment => segment.content === '')).toBe(true)
  })
})
