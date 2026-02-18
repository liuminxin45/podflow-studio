import type { ContentCreationType, ScriptSection } from '../../types/workflow'
import { isContentCreationType } from '../../types/workflow'
import type { SegmentType, WritingLayerProps, WritingSegment } from './types'
import { SEGMENT_TYPE_CONFIG } from './types'

const CHINESE_NUMS = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十']

export type LayoutSeed = { id: string; type: SegmentType; label: string }
export type ContentLayout = {
  dynamicType: SegmentType
  dynamicLabelPrefix: string
  dynamicAddLabel: string
  minDynamicCount: number
  seeds: LayoutSeed[]
}

export const CONTENT_LAYOUTS: Record<ContentCreationType, ContentLayout> = {
  story: {
    dynamicType: 'mainline',
    dynamicLabelPrefix: '主线',
    dynamicAddLabel: '添加主线',
    minDynamicCount: 1,
    seeds: [
      { id: 'seg_opening', type: 'opening', label: '开场' },
      { id: 'seg_main_1', type: 'mainline', label: '主线一' },
      { id: 'seg_main_2', type: 'mainline', label: '主线二' },
      { id: 'seg_discuss', type: 'discussion', label: '延伸讨论' },
      { id: 'seg_closing', type: 'closing', label: '结尾' },
    ],
  },
  news_brief: {
    dynamicType: 'news_item',
    dynamicLabelPrefix: '新闻',
    dynamicAddLabel: '添加新闻',
    minDynamicCount: 1,
    seeds: [
      { id: 'seg_opening', type: 'opening', label: '开场导语' },
      { id: 'seg_news_1', type: 'news_item', label: '新闻一' },
      { id: 'seg_news_2', type: 'news_item', label: '新闻二' },
      { id: 'seg_news_3', type: 'news_item', label: '新闻三' },
      { id: 'seg_closing', type: 'closing', label: '结尾总结' },
    ],
  },
}

const SECTION_TO_SEGMENT_TYPE: Record<ScriptSection['type'], SegmentType> = {
  opening: 'opening',
  mainline: 'mainline',
  discussion: 'discussion',
  news_item: 'news_item',
  closing: 'closing',
  custom: 'custom',
}

export function indexedLabel(prefix: string, index: number): string {
  if (index >= 1 && index <= CHINESE_NUMS.length) return `${prefix}${CHINESE_NUMS[index - 1]}`
  return `${prefix}${index}`
}

export function createSegment(id: string, type: SegmentType, label: string): WritingSegment {
  return {
    id,
    type,
    label,
    content: '',
    tone: 'default',
    estimatedSeconds: SEGMENT_TYPE_CONFIG[type].defaultSeconds,
    status: 'draft',
    collapsed: false,
    sourceReferences: [],
  }
}

export function normalizeDynamicLabels(segments: WritingSegment[], layout: ContentLayout): WritingSegment[] {
  let idx = 0
  return segments.map((seg) => {
    if (seg.type !== layout.dynamicType) return seg
    idx += 1
    const label = indexedLabel(layout.dynamicLabelPrefix, idx)
    return seg.label === label ? seg : { ...seg, label }
  })
}

export function createDefaultWritingSegments(contentType: ContentCreationType): WritingSegment[] {
  const layout = CONTENT_LAYOUTS[contentType] || CONTENT_LAYOUTS.story
  const seeded = layout.seeds.map((seed) => createSegment(seed.id, seed.type, seed.label))
  return normalizeDynamicLabels(seeded, layout)
}

export function mapScriptToSegments(
  contentType: ContentCreationType,
  script: WritingLayerProps['initialScript'] | undefined,
): { resolvedType: ContentCreationType; segments: WritingSegment[] } {
  const resolvedType = isContentCreationType(script?.content_type)
    ? script.content_type
    : contentType
  const layout = CONTENT_LAYOUTS[resolvedType] || CONTENT_LAYOUTS.story

  if (Array.isArray(script?.sections) && script.sections.length > 0) {
    const fromSections = script.sections.map((section, idx) => {
      const segType = SECTION_TO_SEGMENT_TYPE[section?.type || 'custom'] || 'custom'
      return {
        ...createSegment(section?.id || `seg_${idx + 1}`, segType, section?.label || SEGMENT_TYPE_CONFIG[segType].label),
        content: section?.text || '',
        status: (section?.text || '').length > 20 ? ('editing' as const) : ('draft' as const),
        sourceReferences: Array.isArray(section?.source_refs)
          ? section.source_refs
              .map((ref) => ({
                title: (ref?.title || '').trim(),
                url: (ref?.url || '').trim() || undefined,
                source: (ref?.source || '').trim() || undefined,
                published: (ref?.published || '').trim() || undefined,
              }))
              .filter((ref) => ref.title)
          : (section?.references || [])
              .map((title) => (title || '').trim())
              .filter(Boolean)
              .map((title) => ({ title })),
      }
    })
    return { resolvedType, segments: normalizeDynamicLabels(fromSections, layout) }
  }

  const defaults = createDefaultWritingSegments(resolvedType)
  const dialogueTexts = (script?.dialogue || []).map(d => (d?.text || '').trim()).filter(Boolean)
  if (dialogueTexts.length === 0) return { resolvedType, segments: defaults }
  const hydrated = defaults.map((seg, idx) => {
    const incoming = dialogueTexts[idx] || ''
    if (!incoming) return seg
    return {
      ...seg,
      content: incoming,
      status: incoming.length > 20 ? ('editing' as const) : seg.status,
    }
  })
  return { resolvedType, segments: hydrated }
}

export const WRITING_LAYOUT_TEST_HELPERS = {
  indexedLabel,
  CONTENT_LAYOUTS,
  normalizeDynamicLabels,
  createDefaultWritingSegments,
  mapScriptToSegments,
}
