import type { ContentCreationType, SupportedContentCreationType } from '../../types/workflow'
import { isContentCreationType, resolveSupportedContentCreationType } from '../../types/workflow'
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

export const CONTENT_LAYOUTS: Record<SupportedContentCreationType, ContentLayout> = {
  news_brief: {
    dynamicType: 'quick_news',
    dynamicLabelPrefix: '快讯',
    dynamicAddLabel: '添加快讯',
    minDynamicCount: 1,
    seeds: [
      { id: 'seg_opening', type: 'opening', label: '开场导语' },
      { id: 'seg_quick_1', type: 'quick_news', label: '快讯一' },
      { id: 'seg_quick_2', type: 'quick_news', label: '快讯二' },
      { id: 'seg_quick_3', type: 'quick_news', label: '快讯三' },
      { id: 'seg_quick_4', type: 'quick_news', label: '快讯四' },
      { id: 'seg_quick_5', type: 'quick_news', label: '快讯五' },
      { id: 'seg_quick_6', type: 'quick_news', label: '快讯六' },
      { id: 'seg_quick_7', type: 'quick_news', label: '快讯七' },
      { id: 'seg_quick_8', type: 'quick_news', label: '快讯八' },
      { id: 'seg_quick_9', type: 'quick_news', label: '快讯九' },
      { id: 'seg_deep_dive', type: 'deep_dive', label: '深度解读' },
      { id: 'seg_closing', type: 'closing', label: '收尾' },
    ],
  },
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
    estimatedSeconds: 0,
    isCompleted: false,
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
  const layout = CONTENT_LAYOUTS[resolveSupportedContentCreationType(contentType)]
  const seeded = layout.seeds.map((seed) => createSegment(seed.id, seed.type, seed.label))
  return normalizeDynamicLabels(seeded, layout)
}

export function mapScriptToSegments(
  contentType: ContentCreationType,
  script: WritingLayerProps['initialScript'] | undefined,
): { resolvedType: SupportedContentCreationType; segments: WritingSegment[] } {
  const requestedType: ContentCreationType = isContentCreationType(script?.content_type)
    ? script.content_type
    : contentType
  const resolvedType = resolveSupportedContentCreationType(requestedType)
  const layout = CONTENT_LAYOUTS[resolvedType]

  if (Array.isArray(script?.segments) && script.segments.length > 0) {
    const fromScript = script.segments.map((segment, idx) => {
      const segType = segment.type
      return {
        ...createSegment(segment.id || `seg_${idx + 1}`, segType, segment.title || SEGMENT_TYPE_CONFIG[segType].label),
        content: segment.text,
        sourceFactIds: segment.source_fact_ids,
        estimatedSeconds: segment.estimated_seconds,
      }
    })
    return { resolvedType, segments: normalizeDynamicLabels(fromScript, layout) }
  }

  return { resolvedType, segments: createDefaultWritingSegments(resolvedType) }
}

export const WRITING_LAYOUT_TEST_HELPERS = {
  indexedLabel,
  CONTENT_LAYOUTS,
  normalizeDynamicLabels,
  createDefaultWritingSegments,
  mapScriptToSegments,
}
