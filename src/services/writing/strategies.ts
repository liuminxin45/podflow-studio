import type { ContentCreationType } from '../../types/workflow'
import type { WritingSegment, WritingSourceReference } from '../../components/writing/types'

export interface WritingDraftContext {
  contentType: ContentCreationType
  title: string
  description: string
  manualSegments: WritingSegment[]
}

export interface SegmentDraftContext {
  contentType: ContentCreationType
  title: string
  description: string
  segment: WritingSegment
  index: number
  total: number
  allSegments: WritingSegment[]
  promptOverride?: string
}

export interface WritingDraftPayload {
  title?: string
  description?: string
  segments: Array<{
    id?: string
    label?: string
    content: string
    source_refs?: WritingSourceReference[]
  }>
}

export interface WritingStrategy {
  key: string
  matches: (type: ContentCreationType | string) => boolean
  systemPrompt: string
  buildUserPrompt: (ctx: WritingDraftContext) => string
  buildSegmentPrompt: (ctx: SegmentDraftContext) => string
  normalizePayload: (payload: any, ctx: WritingDraftContext) => WritingDraftPayload
}

const jsonOutputRules = [
  '只返回 JSON，不要输出 markdown。',
  'JSON 结构: {"title":"...", "description":"...", "segments":[{"id":"seg_x","label":"...","content":"...","source_refs":[{"title":"...","url":"..."}]}]}',
  'segments 长度应与输入段落一致。',
]

function normalizeCommonPayload(payload: any, ctx: WritingDraftContext): WritingDraftPayload {
  const rawSegments = Array.isArray(payload?.segments) ? payload.segments : []
  const normalizedSegments = ctx.manualSegments.map((manualSeg, idx) => {
    const incoming = rawSegments[idx] || rawSegments.find((s: any) => s?.id === manualSeg.id) || {}
    return {
      id: manualSeg.id,
      label: manualSeg.label,
      content: typeof incoming?.content === 'string' && incoming.content.trim()
        ? incoming.content.trim()
        : manualSeg.content,
      source_refs: Array.isArray(incoming?.source_refs)
        ? incoming.source_refs
            .map((ref: any) => ({
              title: (ref?.title || '').trim(),
              url: (ref?.url || '').trim() || undefined,
              source: (ref?.source || '').trim() || undefined,
              published: (ref?.published || '').trim() || undefined,
            }))
            .filter((ref: WritingSourceReference) => ref.title)
        : manualSeg.sourceReferences || [],
    }
  })

  return {
    title: typeof payload?.title === 'string' && payload.title.trim() ? payload.title.trim() : ctx.title,
    description: typeof payload?.description === 'string' && payload.description.trim() ? payload.description.trim() : ctx.description,
    segments: normalizedSegments,
  }
}

const storyStrategy: WritingStrategy = {
  key: 'story',
  matches: (type) => type === 'story',
  systemPrompt: [
    '你是播客写作编辑，擅长叙事型播客。',
    '保持真实、口语化，避免空话套话。',
    ...jsonOutputRules,
  ].join('\n'),
  buildUserPrompt: (ctx) => {
    const segmentText = ctx.manualSegments
      .map((seg, idx) => `${idx + 1}. [${seg.id}] ${seg.label}\n已有内容:\n${seg.content || '(空)'}\n`)
      .join('\n')

    return [
      `内容类型: story`,
      `标题: ${ctx.title || '(空)'}`,
      `简介: ${ctx.description || '(空)'}`,
      '任务: 先给出完整可播报的故事型稿件，要求有叙事节奏（开场吸引-主线推进-结尾收束），每段都可直接朗读。',
      '输入段落如下:',
      segmentText,
    ].join('\n\n')
  },
  buildSegmentPrompt: (ctx) => {
    return [
      `内容类型: story`,
      `节目标题: ${ctx.title || '(空)'}`,
      `节目简介: ${ctx.description || '(空)'}`,
      `当前段落: 第 ${ctx.index + 1}/${ctx.total} 段 - ${ctx.segment.label}`,
      `已有内容:\n${ctx.segment.content || '(空)'}`,
      '请输出该段可直接播报的正文，不要输出 JSON。',
      ctx.promptOverride ? `额外要求:\n${ctx.promptOverride}` : '',
    ].filter(Boolean).join('\n\n')
  },
  normalizePayload: normalizeCommonPayload,
}

const newsBriefStrategy: WritingStrategy = {
  key: 'news_brief',
  matches: (type) => type === 'news_brief',
  systemPrompt: [
    '你是新闻播客主编，擅长新闻早报稿件。',
    '必须结论先行，事实优先，不得杜撰来源。',
    ...jsonOutputRules,
  ].join('\n'),
  buildUserPrompt: (ctx) => {
    const segmentText = ctx.manualSegments
      .map((seg, idx) => {
        const refs = (seg.sourceReferences || []).map((ref) => ref.title).filter(Boolean)
        return `${idx + 1}. [${seg.id}] ${seg.label}\n已有内容:\n${seg.content || '(空)'}\n可用来源: ${refs.length > 0 ? refs.join('；') : '(无)'}`
      })
      .join('\n\n')

    return [
      `内容类型: news_brief`,
      `标题: ${ctx.title || '(空)'}`,
      `简介: ${ctx.description || '(空)'}`,
      '任务: 输出一篇新闻早报播客稿，每条新闻段都要带 source_refs，且至少 1 条来源。',
      '若输入段已有来源，优先复用并可补充。',
      '输入段落如下:',
      segmentText,
    ].join('\n\n')
  },
  buildSegmentPrompt: (ctx) => {
    const refs = (ctx.segment.sourceReferences || []).map((ref) => ref.title).filter(Boolean)
    return [
      `内容类型: news_brief`,
      `节目标题: ${ctx.title || '(空)'}`,
      `节目简介: ${ctx.description || '(空)'}`,
      `当前段落: 第 ${ctx.index + 1}/${ctx.total} 段 - ${ctx.segment.label}`,
      `已有内容:\n${ctx.segment.content || '(空)'}`,
      `可用来源: ${refs.length > 0 ? refs.join('；') : '(无)'}`,
      '请返回严格 JSON：{"content":"...","source_refs":[{"title":"...","url":"...","source":"..."}]}。',
      '要求：结论先行，事实优先，不得虚构来源。',
      ctx.promptOverride ? `额外要求:\n${ctx.promptOverride}` : '',
    ].filter(Boolean).join('\n\n')
  },
  normalizePayload: normalizeCommonPayload,
}

const placeholderStrategy: WritingStrategy = {
  key: 'placeholder',
  matches: () => true,
  systemPrompt: [
    '你是播客写作助手。',
    ...jsonOutputRules,
  ].join('\n'),
  buildUserPrompt: (ctx) => {
    const segmentText = ctx.manualSegments
      .map((seg, idx) => `${idx + 1}. [${seg.id}] ${seg.label}\n${seg.content || '(空)'}`)
      .join('\n\n')

    return [
      `内容类型: ${ctx.contentType}`,
      '当前类型尚未配置专属策略，先按通用稿件输出。',
      segmentText,
    ].join('\n\n')
  },
  buildSegmentPrompt: (ctx) => {
    return [
      `内容类型: ${ctx.contentType}`,
      `当前段落: ${ctx.segment.label}`,
      `已有内容:\n${ctx.segment.content || '(空)'}`,
      '请输出该段可直接播报的正文，不要输出 JSON。',
      ctx.promptOverride ? `额外要求:\n${ctx.promptOverride}` : '',
    ].filter(Boolean).join('\n\n')
  },
  normalizePayload: normalizeCommonPayload,
}

const STRATEGIES: WritingStrategy[] = [storyStrategy, newsBriefStrategy, placeholderStrategy]

export function getWritingStrategy(contentType: ContentCreationType | string): WritingStrategy {
  return STRATEGIES.find((strategy) => strategy.matches(contentType)) || placeholderStrategy
}
