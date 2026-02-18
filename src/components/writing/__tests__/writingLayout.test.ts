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

    expect(segments.map((s) => s.type)).toEqual(['opening', 'news_item', 'news_item', 'news_item', 'closing'])
    expect(segments.filter((s) => s.type === 'news_item').map((s) => s.label)).toEqual(['新闻一', '新闻二', '新闻三'])
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
        status: 'draft',
        collapsed: false,
      },
      {
        id: 'seg_news_x',
        type: 'news_item',
        label: '新闻九',
        content: '',
        tone: 'default',
        estimatedSeconds: 100,
        status: 'draft',
        collapsed: false,
      },
      {
        id: 'seg_news_y',
        type: 'news_item',
        label: '新闻二十',
        content: '',
        tone: 'default',
        estimatedSeconds: 100,
        status: 'draft',
        collapsed: false,
      },
    ], layout)

    expect(normalized.filter((s) => s.type === 'news_item').map((s) => s.label)).toEqual(['新闻一', '新闻二'])
  })

  it('maps structured sections and keeps content_type-driven layout', () => {
    const script: Script = {
      content_type: 'news_brief',
      sections: [
        { id: 'o', type: 'opening', label: '自定义开头', text: '大家好，欢迎收听。' },
        {
          id: 'n2',
          type: 'news_item',
          label: '任意标签A',
          text: '第一条新闻内容，包含更多细节与影响分析，确保长度超过阈值进入编辑状态。',
          source_refs: [{ title: '新华社：宏观数据快讯' }],
        },
        { id: 'n8', type: 'news_item', label: '任意标签B', text: '第二条新闻内容，包含背景、关键数据与后续变化，确保长度超过阈值进入编辑状态。' },
        { id: 'c', type: 'closing', label: '自定义结尾', text: '以上就是今天的全部内容。' },
      ],
    }

    const mapped = mapScriptToSegments('story', script)

    expect(mapped.resolvedType).toBe('news_brief')
    expect(mapped.segments.filter((s) => s.type === 'news_item').map((s) => s.label)).toEqual(['新闻一', '新闻二'])
    expect(mapped.segments.find((s) => s.id === 'n2')?.status).toBe('editing')
    expect(mapped.segments.find((s) => s.id === 'n2')?.sourceReferences?.[0]?.title).toBe('新华社：宏观数据快讯')
  })

  it('falls back to dialogue hydration when sections are absent', () => {
    const mapped = mapScriptToSegments('story', {
      title: '测试',
      dialogue: [
        { speaker: 'A', text: '开场内容' },
        { speaker: 'B', text: '这是足够长的主线内容，用于验证状态会进入 editing。' },
      ],
    })

    expect(mapped.resolvedType).toBe('story')
    expect(mapped.segments[0].content).toBe('开场内容')
    expect(mapped.segments[1].status).toBe('editing')
  })
})
