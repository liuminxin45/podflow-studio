import { LLM_DEFAULTS, TOPIC_ANALYSIS } from '../constants/llm'
import type { ContentItem } from '../types/workflow'
import { LLMError } from '../types/llm'
import { llmService } from './llmService'
import {
  createLLMCallOptions,
  hasUsableLLMConfig,
  type LLMConfig,
} from './settings/llmConfigResolver'

export type TopicAnalyzedItem = ContentItem & {
  _topic_score?: number
  _topic_decision?: 'keep' | 'drop'
  _topic_reason?: string
  _topic_angle?: string
}

export type DiscoverAuditStageId = 'raw' | 'recency' | 'topic' | 'limit'

export interface DiscoverAuditEntry {
  id: string
  stageId: DiscoverAuditStageId
  outcome: 'passed' | 'failed'
  reason: string
  item: TopicAnalyzedItem
  topicScore?: number
}

export interface DiscoverAuditStage {
  id: DiscoverAuditStageId
  label: string
  inputCount: number
  passedCount: number
  failedCount: number
  skipped?: boolean
  entries: DiscoverAuditEntry[]
}

export interface DiscoverRunAudit {
  generatedAt: string
  coreTopic: string
  recencyHours: number
  resultLimit: number
  rawItems: DiscoverAuditEntry[]
  finalItems: DiscoverAuditEntry[]
  passedItems: DiscoverAuditEntry[]
  rejectedItems: DiscoverAuditEntry[]
  stages: DiscoverAuditStage[]
}

export interface DiscoverPostProcessConfig {
  coreTopic: string
  recencyHours: number
  resultLimit: number
}

export interface DiscoverPostProcessResult {
  items: TopicAnalyzedItem[]
  rawCount: number
  recencyCount: number
  topicMatchedCount?: number
  topicRejectedCount?: number
  limitedCount: number
  audit: DiscoverRunAudit
}

export type DiscoverPostProcessProgress =
  | {
      type: 'postprocess_started'
      rawCount: number
      recencyHours: number
      resultLimit: number
      topic: string
    }
  | {
      type: 'recency_done'
      rawCount: number
      recencyCount: number
      items: TopicAnalyzedItem[]
    }
  | {
      type: 'topic_skipped'
      total: number
      matchedCount: number
      items: TopicAnalyzedItem[]
    }
  | {
      type: 'topic_started'
      total: number
      batchSize: number
    }
  | {
      type: 'topic_batch_done'
      processed: number
      total: number
      matchedCount: number
      rejectedCount: number
      items: TopicAnalyzedItem[]
    }
  | {
      type: 'topic_done'
      total: number
      matchedCount: number
      rejectedCount: number
      items: TopicAnalyzedItem[]
    }
  | {
      type: 'limit_done'
      inputCount: number
      finalCount: number
      items: TopicAnalyzedItem[]
    }

export type DiscoverPostProcessProgressHandler = (event: DiscoverPostProcessProgress) => void

interface TopicAnalysisRow {
  index?: number
  score?: number
  decision?: string
  reason?: string
  angle?: string
}

export async function postProcessDiscoverItems(
  items: ContentItem[],
  config: DiscoverPostProcessConfig,
  llmConfig: LLMConfig | null,
  onProgress?: DiscoverPostProcessProgressHandler,
): Promise<DiscoverPostProcessResult> {
  const rawItems = items as TopicAnalyzedItem[]
  const recencyFiltered = filterByRecency(items, config.recencyHours)
  const topic = config.coreTopic.trim()
  const limit = normalizeResultLimit(config.resultLimit)
  onProgress?.({
    type: 'postprocess_started',
    rawCount: items.length,
    recencyHours: config.recencyHours,
    resultLimit: limit,
    topic,
  })
  onProgress?.({
    type: 'recency_done',
    rawCount: items.length,
    recencyCount: recencyFiltered.length,
    items: recencyFiltered,
  })

  if (!topic) {
    onProgress?.({
      type: 'topic_skipped',
      total: recencyFiltered.length,
      matchedCount: recencyFiltered.length,
      items: recencyFiltered,
    })
    const summarizedItems = applyLocalSummaries(recencyFiltered)
    const ordered = summarizedItems
    const limited = limitItemsPerSource(ordered, limit)
    onProgress?.({
      type: 'limit_done',
      inputCount: ordered.length,
      finalCount: limited.length,
      items: limited,
    })
    const audit = buildDiscoverAudit({
      rawItems,
      recencyFiltered,
      topic,
      analyzedItems: recencyFiltered,
      topicMatched: recencyFiltered,
      orderedItems: ordered,
      finalItems: limited,
      config: { ...config, resultLimit: limit },
      topicSkipped: true,
    })
    return {
      items: limited,
      rawCount: items.length,
      recencyCount: recencyFiltered.length,
      limitedCount: limited.length,
      audit,
    }
  }

  if (!hasUsableLLMConfig(llmConfig)) {
    throw new LLMError(
      '核心主题筛选需要可用的 AI 目标，请先在 Settings → AI 能力接口中配置默认 AI',
      'CONFIG',
    )
  }

  const analyzed = await analyzeTopicRelevance(recencyFiltered, topic, llmConfig, onProgress)
  const matched = analyzed
    .filter(item => item._topic_decision === 'keep')
    .sort((a, b) => (b._topic_score || 0) - (a._topic_score || 0))
  onProgress?.({
    type: 'topic_done',
    total: analyzed.length,
    matchedCount: matched.length,
    rejectedCount: analyzed.length - matched.length,
    items: analyzed,
  })
  const summarizedItems = applyLocalSummaries(matched)
  const ordered = summarizedItems
  const limited = limitItemsPerSource(ordered, limit)
  onProgress?.({
    type: 'limit_done',
    inputCount: ordered.length,
    finalCount: limited.length,
    items: limited,
  })
  const audit = buildDiscoverAudit({
    rawItems,
    recencyFiltered,
    topic,
    analyzedItems: analyzed,
    topicMatched: matched,
    orderedItems: ordered,
    finalItems: limited,
    config: { ...config, resultLimit: limit },
  })

  return {
    items: limited,
    rawCount: items.length,
    recencyCount: recencyFiltered.length,
    topicMatchedCount: matched.length,
    topicRejectedCount: analyzed.length - matched.length,
    limitedCount: limited.length,
    audit,
  }
}

function limitItemsPerSource(items: TopicAnalyzedItem[], limit: number): TopicAnalyzedItem[] {
  const counts = new Map<string, number>()
  return items.filter(item => {
    const sourceKey = item.source || item.source_id || item.source_name || 'unknown'
    const count = counts.get(sourceKey) || 0
    if (count >= limit) return false
    counts.set(sourceKey, count + 1)
    return true
  })
}

function buildDiscoverAudit(input: {
  rawItems: TopicAnalyzedItem[]
  recencyFiltered: TopicAnalyzedItem[]
  topic: string
  analyzedItems: TopicAnalyzedItem[]
  topicMatched: TopicAnalyzedItem[]
  orderedItems: TopicAnalyzedItem[]
  finalItems: TopicAnalyzedItem[]
  config: DiscoverPostProcessConfig & { resultLimit: number }
  topicSkipped?: boolean
}): DiscoverRunAudit {
  const recencySet = new Set(input.recencyFiltered)
  const topicMatchedSet = new Set(input.topicMatched)
  const finalSet = new Set(input.finalItems)
  const limitedOutSet = new Set(input.orderedItems.filter(item => !finalSet.has(item)))

  const rawStage = buildStage('raw', '原始采集', input.rawItems, item =>
    auditEntry(item, 'raw', 'passed', '数据源返回该素材'),
  )

  const recencyStage = buildStage('recency', '时效筛选', input.rawItems, item => {
    if (recencySet.has(item)) {
      return auditEntry(item, 'recency', 'passed', input.config.recencyHours > 0
        ? `发布时间在最近 ${input.config.recencyHours} 小时内`
        : '未限制发布时间')
    }
    return auditEntry(item, 'recency', 'failed', input.config.recencyHours > 0
      ? `发布时间不在最近 ${input.config.recencyHours} 小时内`
      : '未进入时效筛选结果')
  })

  const topicStage = input.topicSkipped
    ? buildStage(
      'topic',
      '主题筛选',
      input.recencyFiltered,
      item => auditEntry(item, 'topic', 'passed', '未设置核心主题，跳过主题筛选'),
      true,
    )
    : buildStage('topic', '主题筛选', input.analyzedItems, item => {
      const passed = topicMatchedSet.has(item)
      const score = Number(item._topic_score || 0)
      return auditEntry(
        item,
        'topic',
        passed ? 'passed' : 'failed',
        item._topic_reason || (passed ? `与主题「${input.topic}」匹配` : `与主题「${input.topic}」相关性不足`),
        { topicScore: score },
      )
    })

  const limitStage = buildStage('limit', '每源条数', input.orderedItems, item => {
    if (finalSet.has(item)) {
      return auditEntry(item, 'limit', 'passed', `保留到采集列表，每源条数上限为 ${input.config.resultLimit}`)
    }
    return auditEntry(item, 'limit', 'failed', `超过每源条数上限 ${input.config.resultLimit}，本轮未展示`)
  })

  const stages = [rawStage, recencyStage, topicStage, limitStage]
  const rawEntries = rawStage.entries
  const finalEntries = input.finalItems.map(item => auditEntry(item, 'limit', 'passed', '保留到采集列表'))
  const rejectedEntries = [
    ...recencyStage.entries.filter(entry => entry.outcome === 'failed'),
    ...topicStage.entries.filter(entry => entry.outcome === 'failed'),
    ...limitStage.entries.filter(entry => entry.outcome === 'failed' && limitedOutSet.has(entry.item)),
  ]
  const rejectedIds = new Set(rejectedEntries.map(entry => entry.id))
  const passedEntries = input.finalItems
    .filter(item => !rejectedIds.has(auditIdentity(item)))
    .map(item => auditEntry(
      item,
      'limit',
      'passed',
      '按后处理筛选结果保留',
    ))

  return {
    generatedAt: new Date().toISOString(),
    coreTopic: input.topic,
    recencyHours: input.config.recencyHours,
    resultLimit: input.config.resultLimit,
    rawItems: rawEntries,
    finalItems: finalEntries,
    passedItems: passedEntries,
    rejectedItems: rejectedEntries,
    stages,
  }
}

function buildStage(
  id: DiscoverAuditStageId,
  label: string,
  items: TopicAnalyzedItem[],
  mapItem: (item: TopicAnalyzedItem) => DiscoverAuditEntry,
  skipped = false,
): DiscoverAuditStage {
  const entries = items.map(mapItem)
  return {
    id,
    label,
    inputCount: items.length,
    passedCount: entries.filter(entry => entry.outcome === 'passed').length,
    failedCount: entries.filter(entry => entry.outcome === 'failed').length,
    skipped,
    entries,
  }
}

function auditEntry(
  item: TopicAnalyzedItem,
  stageId: DiscoverAuditStageId,
  outcome: DiscoverAuditEntry['outcome'],
  reason: string,
  extra: Partial<Pick<DiscoverAuditEntry, 'topicScore'>> = {},
): DiscoverAuditEntry {
  return {
    id: auditIdentity(item),
    stageId,
    outcome,
    reason,
    item,
    ...extra,
  }
}

function auditIdentity(item: TopicAnalyzedItem): string {
  return `${item.url || ''}|${item.title || ''}|${item.source || item.source_name || ''}|${item.published || ''}`
}

export function filterByRecency(items: ContentItem[], recencyHours: number): TopicAnalyzedItem[] {
  if (!Number.isFinite(recencyHours) || recencyHours <= 0) {
    return items as TopicAnalyzedItem[]
  }

  const cutoff = Date.now() - recencyHours * 60 * 60 * 1000
  return items.filter(item => {
    const published = item.published || (item as any).published_at
    if (!published) return false
    const timestamp = new Date(published).getTime()
    return Number.isFinite(timestamp) && timestamp >= cutoff
  }) as TopicAnalyzedItem[]
}

function normalizeResultLimit(value: number): number {
  if (!Number.isFinite(value)) return 10
  return Math.max(1, Math.min(100, Math.floor(value)))
}

function applyLocalSummaries(items: TopicAnalyzedItem[]): TopicAnalyzedItem[] {
  return items.map(item => ({
    ...item,
    summary: buildDeterministicSummary(item),
  }))
}

function buildDeterministicSummary(item: TopicAnalyzedItem): string {
  const title = cleanSummaryText(item.title || '')
  const candidates = [item.summary, item.content]
    .map(cleanSummaryText)
    .filter(Boolean)
    .filter(text => text.toLowerCase() !== title.toLowerCase())
  const source = candidates[0] || title
  if (source.length <= 180) return source
  const cut = source.slice(0, 180)
  const breakAt = Math.max(
    cut.lastIndexOf('。'),
    cut.lastIndexOf('！'),
    cut.lastIndexOf('？'),
    cut.lastIndexOf('. '),
    cut.lastIndexOf('，'),
    cut.lastIndexOf(', '),
  )
  if (breakAt >= 80) return `${cut.slice(0, breakAt + 1).trim()}`
  return `${cut.trim()}…`
}

function cleanSummaryText(value?: string): string {
  if (!value) return ''
  return value
    .replace(/<a\b[^>]*>(.*?)<\/a>/gi, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

async function analyzeTopicRelevance(
  items: TopicAnalyzedItem[],
  topic: string,
  llmConfig: LLMConfig,
  onProgress?: DiscoverPostProcessProgressHandler,
): Promise<TopicAnalyzedItem[]> {
  const results: TopicAnalyzedItem[] = []
  const batchSize = LLM_DEFAULTS.BATCH_SIZE
  onProgress?.({
    type: 'topic_started',
    total: items.length,
    batchSize,
  })

  for (let start = 0; start < items.length; start += batchSize) {
    const batch = items.slice(start, start + batchSize)
    const response = await llmService.call(createLLMCallOptions(llmConfig, {
      messages: [
        {
          role: 'user',
          content: buildTopicPrompt(batch, topic),
        },
      ],
      temperature: LLM_DEFAULTS.TEMPERATURE,
      maxTokens: Math.min(4000, Math.max(1000, batch.length * 300)),
      timeout: llmConfig.timeout,
    }))

    const parsed = parseTopicAnalysis(response.choices?.[0]?.message?.content || '')
    const analyzedBatch = applyTopicAnalysis(batch, parsed)
    results.push(...analyzedBatch)
    const matchedCount = results.filter(item => item._topic_decision === 'keep').length
    onProgress?.({
      type: 'topic_batch_done',
      processed: results.length,
      total: items.length,
      matchedCount,
      rejectedCount: results.length - matchedCount,
      items: analyzedBatch,
    })
  }

  return results
}

function buildTopicPrompt(batch: TopicAnalyzedItem[], topic: string): string {
  return `你是专业的播客内容主编。

# 核心主题
${topic}

# 待筛选素材
${batch.map((item, idx) => `${idx + 1}. ${item.title || '无标题'}
来源：${item.source_name || item.source || '未知'}
发布时间：${item.published || '未知'}
摘要：${(item.content || item.summary || '无摘要').slice(0, 240)}`).join('\n\n')}

# 任务
判断每条素材是否适合围绕核心主题进入后续整理。

# 输出要求
只输出 JSON 数组，不要 Markdown，不要解释：
[
  {"index": 1, "score": 85, "decision": "keep", "reason": "与主题强相关", "angle": "可展开角度"},
  {"index": 2, "score": 30, "decision": "drop", "reason": "偏离主题", "angle": ""}
]

评分标准：80-100=强相关，60-79=相关，40-59=弱相关，0-39=不相关。
decision: score>=${TOPIC_ANALYSIS.MIN_MATCH_SCORE} 用 "keep"，否则 "drop"。`
}

function parseTopicAnalysis(content: string): TopicAnalysisRow[] {
  const cleaned = content.trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
  const arrayStart = cleaned.indexOf('[')
  const arrayEnd = cleaned.lastIndexOf(']')
  const jsonText = arrayStart >= 0 && arrayEnd > arrayStart
    ? cleaned.slice(arrayStart, arrayEnd + 1)
    : cleaned
  const parsed = JSON.parse(jsonText)
  if (!Array.isArray(parsed)) {
    throw new LLMError('核心主题筛选返回格式不是 JSON 数组', 'PARSE', { content })
  }
  return parsed
}

function applyTopicAnalysis(batch: TopicAnalyzedItem[], rows: TopicAnalysisRow[]): TopicAnalyzedItem[] {
  const rowsByIndex = new Map<number, TopicAnalysisRow>()
  rows.forEach((row, offset) => {
    const index = Number(row.index || offset + 1)
    rowsByIndex.set(index - 1, row)
  })

  return batch.map((item, index) => {
    const row = rowsByIndex.get(index)
    const score = Number(row?.score || 0)
    const decision = row?.decision === 'keep' || score >= TOPIC_ANALYSIS.MIN_MATCH_SCORE
      ? 'keep'
      : 'drop'
    return {
      ...item,
      _topic_score: score,
      _topic_decision: decision,
      _topic_reason: String(row?.reason || ''),
      _topic_angle: String(row?.angle || ''),
    }
  })
}
