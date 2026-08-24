import type { EditorialVoice } from '../../types/settings'
import type { FactCard } from '../../types/workflow'
import type { SegmentTone } from '../../components/writing/types'
import { runAITask } from '../aiTaskService'
import { hasUsableLLMConfig, llmConfigResolver } from '../settings/llmConfigResolver'

export interface QuickNewsOptimizationRequest {
  segmentText: string
  factCards: FactCard[]
  sourceFactIds: string[]
  previousSegmentText?: string
  nextSegmentText?: string
  targetChars: { min: number; max: number }
  editorialVoice: EditorialVoice
  tone?: SegmentTone
}

export interface QuickNewsOptimizationResult {
  title: string
  suggestedText: string
  sourceFactIds: string[]
  changeSummary: string[]
  unsupportedOrUncertain: string[]
}

function validateRequest(request: QuickNewsOptimizationRequest): void {
  if (!request.segmentText.trim()) throw new Error('请先写入快讯正文')
  const ids = new Set(request.sourceFactIds.map(id => String(id).trim()).filter(Boolean))
  if (ids.size === 0) throw new Error('这条快讯没有绑定事实卡，无法安全优化')
  const knownIds = new Set(request.factCards.map(card => String(card.id || '')).filter(Boolean))
  const missing = [...ids].filter(id => !knownIds.has(id))
  if (missing.length > 0) throw new Error(`找不到这条快讯绑定的事实卡：${missing.join('、')}`)
}

export async function optimizeQuickNews(
  request: QuickNewsOptimizationRequest,
): Promise<QuickNewsOptimizationResult> {
  validateRequest(request)
  const config = llmConfigResolver.getLLMConfig('draft', true)
  if (!hasUsableLLMConfig(config)) throw new Error('请先在设置中配置可用的成稿 AI')

  const output = await runAITask(
    'writing.optimize_quick_news',
    config.aiTarget || '',
    { request },
  )
  return {
    title: output.title,
    suggestedText: output.suggested_text,
    sourceFactIds: output.source_fact_ids,
    changeSummary: output.change_summary,
    unsupportedOrUncertain: output.unsupported_or_uncertain,
  }
}
