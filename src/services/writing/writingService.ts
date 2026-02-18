import type { ContentCreationType } from '../../types/workflow'
import { llmService } from '../llmService'
import { ideationConfigManager } from '../ideation/config'
import { parseJSONFromLLM } from '../ideation/utils'
import type { WritingSegment } from '../../components/writing/types'
import { getWritingStrategy } from './strategies'
import { resolveWritingLLMTuning } from './llmTuning'
import type { WritingLLMTuning } from './llmTuning'

export type { WritingLLMTuning } from './llmTuning'

export interface WritingDraftProgress {
  segmentId: string
  index: number
  total: number
  status: 'generating' | 'success' | 'error'
  error?: string
}

export interface WritingDraftRequest {
  contentType: ContentCreationType
  title: string
  description: string
  manualSegments: WritingSegment[]
  segmentPromptOverrides?: Record<string, string>
  llmTuning?: WritingLLMTuning
  onProgress?: (progress: WritingDraftProgress) => void
}

export interface WritingDraftResult {
  title: string
  description: string
  segments: WritingSegment[]
  model: string
  generatedAt: number
  failedSegments?: Array<{ segmentId: string; error: string }>
}

class WritingService {
  private extractSegmentPayload(rawContent: string, segmentId: string): {
    content?: string
    sourceRefs?: WritingSegment['sourceReferences']
  } | null {
    try {
      const parsed = parseJSONFromLLM(rawContent)
      if (!parsed || typeof parsed !== 'object') return null

      const directContent = typeof parsed?.content === 'string' ? parsed.content.trim() : ''
      const directRefs = Array.isArray(parsed?.source_refs) ? parsed.source_refs : null

      const segmentItem = Array.isArray(parsed?.segments)
        ? parsed.segments.find((seg: any) => seg?.id === segmentId) || parsed.segments[0]
        : null

      const nestedContent = typeof segmentItem?.content === 'string' ? segmentItem.content.trim() : ''
      const nestedRefs = Array.isArray(segmentItem?.source_refs) ? segmentItem.source_refs : null

      const refsRaw = nestedRefs || directRefs
      const sourceRefs = Array.isArray(refsRaw)
        ? refsRaw
            .map((ref: any) => ({
              title: (ref?.title || '').trim(),
              url: (ref?.url || '').trim() || undefined,
              source: (ref?.source || '').trim() || undefined,
              published: (ref?.published || '').trim() || undefined,
            }))
            .filter((ref: { title: string }) => ref.title)
        : undefined

      const content = nestedContent || directContent
      if (!content && !sourceRefs) return null

      return {
        content: content || undefined,
        sourceRefs,
      }
    } catch {
      return null
    }
  }

  async isLLMAvailable(): Promise<boolean> {
    return ideationConfigManager.isLLMAvailable()
  }

  async regenerateSegmentDraft(options: {
    contentType: ContentCreationType
    title: string
    description: string
    segment: WritingSegment
    allSegments: WritingSegment[]
    promptOverride?: string
    llmTuning?: WritingLLMTuning
  }): Promise<WritingSegment> {
    const llmConfig = ideationConfigManager.getLLMConfig()
    if (!llmConfig) {
      throw new Error('LLM未配置，请先在 Settings 中配置。')
    }

    const strategy = getWritingStrategy(options.contentType)
    const resolvedTuning = resolveWritingLLMTuning(options.contentType, options.llmTuning)
    const targetIndex = Math.max(0, options.allSegments.findIndex((seg) => seg.id === options.segment.id))
    const prompt = strategy.buildSegmentPrompt({
      contentType: options.contentType,
      title: options.title,
      description: options.description,
      segment: options.segment,
      index: targetIndex,
      total: options.allSegments.length,
      allSegments: options.allSegments,
      promptOverride: options.promptOverride,
    })

    const response = await llmService.call({
      apiBase: llmConfig.apiBase,
      apiKey: llmConfig.apiKey,
      model: llmConfig.model,
      messages: [
        { role: 'system', content: strategy.systemPrompt },
        { role: 'user', content: prompt },
      ],
      temperature: resolvedTuning.temperature,
      timeout: resolvedTuning.timeout,
      maxTokens: resolvedTuning.maxTokens,
    })

    const rawContent = response.choices?.[0]?.message?.content?.trim()
    if (!rawContent) {
      throw new Error('LLM返回为空，无法生成段落草稿。')
    }

    const extracted = this.extractSegmentPayload(rawContent, options.segment.id)

    if (options.contentType !== 'news_brief' || options.segment.type !== 'news_item') {
      return {
        ...options.segment,
        content: extracted?.content || rawContent,
      }
    }

    if (!extracted?.sourceRefs?.length) {
      throw new Error('新闻段落生成失败：缺少来源，请补充可用来源后重试。')
    }

    if (extracted) {
      return {
        ...options.segment,
        content: extracted.content || options.segment.content,
        sourceReferences: extracted.sourceRefs || options.segment.sourceReferences || [],
      }
    }

    return {
      ...options.segment,
      content: rawContent,
    }
  }

  async generateAIDraft(request: WritingDraftRequest): Promise<WritingDraftResult> {
    const llmConfig = ideationConfigManager.getLLMConfig()
    if (!llmConfig) {
      throw new Error('LLM未配置，请先在 Settings 中配置。')
    }

    const generatedSegments: WritingSegment[] = []
    const failedSegments: Array<{ segmentId: string; error: string }> = []
    for (let idx = 0; idx < request.manualSegments.length; idx += 1) {
      const segment = request.manualSegments[idx]
      request.onProgress?.({
        segmentId: segment.id,
        index: idx,
        total: request.manualSegments.length,
        status: 'generating',
      })

      try {
        const nextSegment = await this.regenerateSegmentDraft({
          contentType: request.contentType,
          title: request.title,
          description: request.description,
          segment,
          allSegments: request.manualSegments,
          promptOverride: request.segmentPromptOverrides?.[segment.id],
          llmTuning: request.llmTuning,
        })
        generatedSegments.push(nextSegment)
        request.onProgress?.({
          segmentId: segment.id,
          index: idx,
          total: request.manualSegments.length,
          status: 'success',
        })
      } catch (error: any) {
        const errorMessage = error?.message || '段落生成失败'
        generatedSegments.push(segment)
        failedSegments.push({ segmentId: segment.id, error: errorMessage })
        request.onProgress?.({
          segmentId: segment.id,
          index: idx,
          total: request.manualSegments.length,
          status: 'error',
          error: errorMessage,
        })
      }
    }

    if (failedSegments.length === request.manualSegments.length && request.manualSegments.length > 0) {
      throw new Error(`AI 草稿生成失败：${failedSegments[0].error || '所有段落均生成失败'}`)
    }

    return {
      title: request.title,
      description: request.description,
      segments: generatedSegments,
      model: llmConfig.model,
      generatedAt: Date.now(),
      failedSegments,
    }
  }
}

export const writingService = new WritingService()
