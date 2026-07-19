/**
 * LLM-based news classifier — pure AI, no keyword fallback
 *
 * Strategy: Send 20 titles at once as a JSON array → LLM returns a JSON
 * array of category IDs in the same order. Minimal tokens, maximum speed.
 *
 * - Title-only: only the headline is sent, not content/source
 * - Compact response: LLM returns ["cat1","cat2",...] — no reason/priority
 * - AbortSignal support: user can stop tagging mid-process
 * - Failed batches retry once, then items stay untagged for later retry
 * - No keyword fallback — classification is 100% LLM
 */

import type { ContentItem } from '../types/workflow'
import { VALID_CATEGORY_IDS, getCategoryById, getCategoryListForPrompt } from '../constants/categories'
import { llmService } from '../services/llmService'
import { LLMError } from '../types/llm'
import { isDebugModeEnabled } from './debugMode'
import {
  createLLMCallOptions,
  hasUsableLLMConfig,
  llmConfigResolver,
  type LLMConfig,
} from '../services/settings/llmConfigResolver'

export const MAX_NEWS_ITEMS = 500
const BATCH_SIZE = 20
const REQUEST_TIMEOUT = 60000 // 60s for larger batches

export type PriorityLevel = 'high' | 'normal' | 'low'

export interface LLMClassification {
  categoryId: string
  categoryLabel: string
  priority: PriorityLevel
  reason: string
  fromLLM: boolean
}

export type { LLMConfig }

export interface ClassifyProgress {
  total: number
  tagged: number
  untagged: number
  status: 'idle' | 'running' | 'done' | 'error' | 'stopped'
  error?: string
  detail?: string
}

export interface CategoryGroup {
  categoryId: string
  label: string
  color: string
  bg: string
  items: Array<{ index: number; item: ContentItem; classification: LLMClassification }>
  highCount: number
  normalCount: number
  lowCount: number
}

const PRIORITY_DISPLAY: Record<PriorityLevel, { label: string; color: string; bg: string }> = {
  high:   { label: '重要',   color: '#dc2626', bg: '#fef2f2' },
  normal: { label: '一般',   color: '#2563eb', bg: '#eff6ff' },
  low:    { label: '低优先', color: '#9ca3af', bg: '#f9fafb' },
}

export function getPriorityDisplay(priority: PriorityLevel) {
  return PRIORITY_DISPLAY[priority] || PRIORITY_DISPLAY.normal
}

export function getCategoryDisplay(categoryId: string) {
  const rule = getCategoryById(categoryId)
  return { label: rule.label, color: rule.color, bg: rule.bg }
}

export function enforceItemCap(items: ContentItem[]): ContentItem[] {
  if (items.length <= MAX_NEWS_ITEMS) return items
  const sorted = [...items].sort((a, b) => {
    const ta = a.published ? new Date(a.published).getTime() : 0
    const tb = b.published ? new Date(b.published).getTime() : 0
    return tb - ta
  })
  console.log(`[LLM Classifier] Enforcing ${MAX_NEWS_ITEMS} cap: trimming ${items.length - MAX_NEWS_ITEMS} oldest items`)
  return sorted.slice(0, MAX_NEWS_ITEMS)
}

/** Count items that still need tagging */
export function countUntagged(items: ContentItem[]): number {
  return items.filter(i => !i._tagged).length
}

/** Get indices of untagged items */
export function getUntaggedIndices(items: ContentItem[]): number[] {
  const indices: number[] = []
  for (let i = 0; i < items.length; i++) {
    if (!items[i]._tagged) indices.push(i)
  }
  return indices
}

/** Read the classification already stored on an item */
export function getItemClassification(item: ContentItem): LLMClassification | null {
  if (!item._tagged || !item._classification) return null
  return item._classification as LLMClassification
}

function applyTag(item: ContentItem, classification: LLMClassification) {
  item._tagged = true
  item._classification = {
    categoryId: classification.categoryId,
    categoryLabel: classification.categoryLabel,
    priority: classification.priority,
    reason: classification.reason,
    fromLLM: classification.fromLLM,
  }
}

/**
 * Build a compact system prompt. The LLM receives a JSON array of titles
 * and returns a JSON array of category IDs in the same order.
 *
 * Token budget per batch:
 *   System: ~150 tokens (sent once per batch)
 *   User:   ~20 titles × ~15 tokens = ~300 tokens
 *   Response: ~20 IDs × ~3 tokens = ~60 tokens
 *   Total: ~510 tokens per 20 items (vs ~2000+ in old approach)
 */
/** Cached system prompt — built once, reused across batches */
let _cachedSystemPrompt: string | null = null

function buildBatchSystemPrompt(): string {
  if (_cachedSystemPrompt) return _cachedSystemPrompt

  const cats = getCategoryListForPrompt()
    .map(c => `${c.id}(${c.label})`)
    .join(', ')

  _cachedSystemPrompt = `你是新闻分类器。将每条新闻标题归入最匹配的一个类别。

可选类别ID: ${cats}

规则:
1. 输入是JSON字符串数组（新闻标题列表）
2. 输出必须是同等长度的JSON字符串数组，元素是类别英文ID
3. 输出数组长度必须与输入完全一致，顺序一一对应
4. 每个元素只能是上述类别ID之一
5. 如果标题无法明确归类，使用 "other"
6. 只返回JSON数组，不要任何其他文字、解释或markdown

示例:
输入: ["OpenAI发布GPT-5","欧盟通过AI监管法案","英伟达股价创新高"]
输出: ["breakthrough","regulation","market"]`

  return _cachedSystemPrompt
}

async function callLLM(
  config: LLMConfig,
  messages: Array<{ role: string; content: string }>,
  signal?: AbortSignal,
): Promise<string> {
  if (signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError')
  }

  try {
    const response = await llmService.call(createLLMCallOptions(config, {
      messages: messages.map(m => ({
        role: m.role as 'system' | 'user' | 'assistant',
        content: m.content,
      })),
      temperature: 0.05,
      maxTokens: 2000,
      timeout: REQUEST_TIMEOUT,
    }))

    return response.choices?.[0]?.message?.content || ''
  } catch (error: any) {
    if (signal?.aborted || error?.name === 'AbortError') {
      throw new DOMException('Aborted', 'AbortError')
    }
    if (error instanceof LLMError) {
      throw new Error(`LLM API error: ${error.message}`)
    }
    throw error
  }
}

/**
 * Parse compact LLM response: expects a JSON array of category ID strings.
 * e.g. ["regulation","breakthrough","market","other"]
 *
 * Handles common LLM quirks:
 * - Markdown code fences (```json ... ```)
 * - Extra whitespace/newlines
 * - Objects instead of strings
 * - Trailing commas
 */
function parseBatchResponse(raw: string, expectedCount: number): (string | null)[] {
  // Strip markdown code fences if present
  let cleaned = raw.trim()
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')

  // Find JSON array — use bracket matching for robustness
  let jsonStr: string | null = null
  const start = cleaned.indexOf('[')
  if (start !== -1) {
    let depth = 0
    for (let i = start; i < cleaned.length; i++) {
      if (cleaned[i] === '[') depth++
      else if (cleaned[i] === ']') depth--
      if (depth === 0) {
        jsonStr = cleaned.slice(start, i + 1)
        break
      }
    }
  }
  if (!jsonStr) {
    console.warn('[LLM Classifier] No JSON array found in response:', raw.slice(0, 200))
    return new Array(expectedCount).fill(null)
  }

  try {
    // Fix trailing commas (common LLM mistake)
    const fixedJson = jsonStr.replace(/,\s*\]/g, ']')
    const parsed = JSON.parse(fixedJson)
    if (!Array.isArray(parsed)) {
      console.warn('[LLM Classifier] Parsed result is not an array')
      return new Array(expectedCount).fill(null)
    }

    // Normalize each element
    const result: (string | null)[] = parsed.map((item: any) => {
      if (typeof item === 'string') {
        const id = item.trim().toLowerCase()
        return VALID_CATEGORY_IDS.has(id) ? id : null
      }
      if (typeof item === 'object' && item !== null) {
        const id = String(item.category || item.id || item.cat || '').trim().toLowerCase()
        return VALID_CATEGORY_IDS.has(id) ? id : null
      }
      return null
    })

    if (result.length !== expectedCount) {
      console.warn(`[LLM Classifier] Response length ${result.length} != expected ${expectedCount}`)
      if (result.length > expectedCount) {
        return result.slice(0, expectedCount)
      }
      // Pad with null for missing items
      while (result.length < expectedCount) {
        result.push(null)
      }
    }

    return result
  } catch (e) {
    console.warn('[LLM Classifier] JSON parse failed:', e, raw.slice(0, 200))
    return new Array(expectedCount).fill(null)
  }
}

/**
 * Classify a batch of items via LLM. Title-only, compact response.
 * Returns array of (categoryId | null) — null means LLM failed for that item.
 * Retries once on complete failure.
 */
async function classifyBatchLLM(
  batchItems: ContentItem[],
  config: LLMConfig,
  signal?: AbortSignal,
  _isRetry = false,
): Promise<(string | null)[]> {
  const debugMode = isDebugModeEnabled()
  
  if (debugMode && batchItems.length === 1) {
    const title = (batchItems[0].title || '无标题').slice(0, 50)
    const prompt = `标题：${title}\n分类(regulation/breakthrough/market/other)，输出JSON: {"category":"xxx"}`
    
    try {
      const response = await callLLM(config, [
        { role: 'user', content: prompt },
      ], signal)
      
      const parsed = JSON.parse(response)
      const categoryId = parsed.category || null
      return [VALID_CATEGORY_IDS.has(categoryId) ? categoryId : null]
    } catch {
      return [null]
    }
  }
  
  const titles = batchItems.map(item => item.title || '无标题')
  const userPrompt = JSON.stringify(titles)

  try {
    const response = await callLLM(config, [
      { role: 'system', content: buildBatchSystemPrompt() },
      { role: 'user', content: userPrompt },
    ], signal)

    const results = parseBatchResponse(response, batchItems.length)

    // Check if all results are null (complete failure)
    const validCount = results.filter(r => r !== null).length
    if (validCount === 0 && !_isRetry) {
      console.warn(`[LLM Classifier] Batch returned 0 valid results, retrying...`)
      return classifyBatchLLM(batchItems, config, signal, true)
    }

    // If most items failed on first try, retry once
    if (validCount < batchItems.length * 0.5 && !_isRetry) {
      console.warn(`[LLM Classifier] Only ${validCount}/${batchItems.length} valid, retrying...`)
      return classifyBatchLLM(batchItems, config, signal, true)
    }

    return results
  } catch (error: any) {
    if (error?.name === 'AbortError') throw error
    if (!_isRetry) {
      console.warn(`[LLM Classifier] Batch failed, retrying once:`, error?.message)
      return classifyBatchLLM(batchItems, config, signal, true)
    }
    throw error
  }
}

/**
 * Tag all untagged items in the array.
 * Mutates items in-place (sets _tagged=true, _classification={...}).
 * Respects already-tagged items, only processes untagged ones.
 *
 * @param signal - Optional AbortSignal to stop tagging mid-process.
 *                 When aborted, already-tagged items are kept, remaining stay untagged.
 * @returns the number of newly tagged items.
 */
export async function tagUntaggedItems(
  items: ContentItem[],
  config: LLMConfig | null,
  onProgress?: (progress: ClassifyProgress) => void,
  signal?: AbortSignal,
): Promise<number> {
  const untaggedIndices = getUntaggedIndices(items)
  const totalCount = items.length
  const alreadyTagged = totalCount - untaggedIndices.length

  if (untaggedIndices.length === 0) {
    onProgress?.({ total: totalCount, tagged: totalCount, untagged: 0, status: 'done' })
    return 0
  }

  onProgress?.({
    total: totalCount,
    tagged: alreadyTagged,
    untagged: untaggedIndices.length,
    status: 'running',
    detail: '正在准备首批请求...',
  })

  // No LLM config → cannot tag (pure AI mode, no keyword fallback)
  if (!hasUsableLLMConfig(config)) {
    console.warn(`[LLM Classifier] No LLM config available — cannot classify ${untaggedIndices.length} items`)
    onProgress?.({
      total: totalCount,
      tagged: alreadyTagged,
      untagged: untaggedIndices.length,
      status: 'error',
      error: '未配置 AI 目标，请先在设置中选择可用的本地代理、本地模型或 API 模型',
      detail: '缺少模型配置',
    })
    return 0
  }

  // LLM classification in batches of 20 titles
  console.log(`[LLM Classifier] Classifying ${untaggedIndices.length} items via LLM (batch=${BATCH_SIZE}, model=${config.model})`)
  let newlyTagged = 0
  let failedCount = 0

  const batches: number[][] = []
  for (let i = 0; i < untaggedIndices.length; i += BATCH_SIZE) {
    batches.push(untaggedIndices.slice(i, i + BATCH_SIZE))
  }

  for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
    // Check abort before each batch
    if (signal?.aborted) {
      console.log(`[LLM Classifier] Aborted after ${newlyTagged} items (batch ${batchIdx}/${batches.length})`)
      const remaining = untaggedIndices.length - newlyTagged
      onProgress?.({
        total: totalCount,
        tagged: alreadyTagged + newlyTagged,
        untagged: remaining,
        status: 'stopped',
        detail: '已暂停，等待继续',
      })
      return newlyTagged
    }

    const batch = batches[batchIdx]
    const batchItems = batch.map(idx => items[idx])

    onProgress?.({
      total: totalCount,
      tagged: alreadyTagged + newlyTagged,
      untagged: untaggedIndices.length - newlyTagged,
      status: 'running',
      detail: `正在处理第 ${batchIdx + 1}/${batches.length} 批...`,
    })

    try {
      const categoryIds = await classifyBatchLLM(batchItems, config, signal)

      // Apply LLM results — only tag items where LLM returned a valid ID
      for (let localIdx = 0; localIdx < batch.length; localIdx++) {
        const globalIdx = batch[localIdx]
        const catId = categoryIds[localIdx]

        if (catId) {
          const catRule = getCategoryById(catId)
          applyTag(items[globalIdx], {
            categoryId: catId,
            categoryLabel: catRule.label,
            priority: 'normal',
            reason: '',
            fromLLM: true,
          })
          newlyTagged++
        } else {
          // LLM didn't return a valid result — leave untagged for later retry
          failedCount++
        }
      }
    } catch (error: any) {
      // If aborted, exit cleanly
      if (error?.name === 'AbortError' || signal?.aborted) {
        console.log(`[LLM Classifier] Aborted during batch ${batchIdx}`)
        const remaining = untaggedIndices.length - newlyTagged
        onProgress?.({
          total: totalCount,
          tagged: alreadyTagged + newlyTagged,
          untagged: remaining,
          status: 'stopped',
          detail: '已暂停，等待继续',
        })
        return newlyTagged
      }

      // API error — leave entire batch untagged (already retried inside classifyBatchLLM)
      console.warn(`[LLM Classifier] Batch ${batchIdx} failed after retry:`, error?.message)
      failedCount += batch.length
    }

    onProgress?.({
      total: totalCount,
      tagged: alreadyTagged + newlyTagged,
      untagged: untaggedIndices.length - newlyTagged,
      status: 'running',
      detail: batchIdx < batches.length - 1
        ? `第 ${batchIdx + 1}/${batches.length} 批完成，准备下一批...`
        : '正在收尾...',
    })
  }

  const finalUntagged = countUntagged(items)
  const finalStatus = failedCount > 0 && newlyTagged === 0 ? 'error' : 'done'

  onProgress?.({
    total: totalCount,
    tagged: totalCount - finalUntagged,
    untagged: finalUntagged,
    status: finalStatus,
    error: failedCount > 0 ? `${failedCount} 条分类失败，可稍后重试` : undefined,
    detail: finalStatus === 'done' ? '分类完成' : '分类失败，请稍后重试',
  })

  console.log(`[LLM Classifier] Done. Tagged ${newlyTagged}, failed ${failedCount} (${batches.length} batches). Total: ${totalCount}`)
  return newlyTagged
}

export async function loadLLMConfig(): Promise<LLMConfig | null> {
  return llmConfigResolver.getLLMConfig('discover')
}

/**
 * Group items by their _classification category.
 * Untagged items go into a special 'unclassified' group.
 */
export function groupByCategory(items: ContentItem[]): CategoryGroup[] {
  const groupMap = new Map<string, CategoryGroup>()

  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    const classification: LLMClassification = item._tagged && item._classification
      ? item._classification as LLMClassification
      : { categoryId: 'unclassified', categoryLabel: '未分类', priority: 'normal' as PriorityLevel, reason: '', fromLLM: false }

    const catId = classification.categoryId
    const catRule = catId === 'unclassified'
      ? { id: 'unclassified', label: '未分类', color: '#9ca3af', bg: '#f3f4f6', keywords: [] }
      : getCategoryById(catId)

    if (!groupMap.has(catId)) {
      groupMap.set(catId, {
        categoryId: catId,
        label: catRule.label,
        color: catRule.color,
        bg: catRule.bg,
        items: [],
        highCount: 0,
        normalCount: 0,
        lowCount: 0,
      })
    }

    const group = groupMap.get(catId)!
    group.items.push({ index: i, item, classification })

    if (classification.priority === 'high') group.highCount++
    else if (classification.priority === 'normal') group.normalCount++
    else group.lowCount++
  }

  // Sort items within each group by priority
  const priorityOrder: Record<PriorityLevel, number> = { high: 0, normal: 1, low: 2 }
  groupMap.forEach(group => {
    group.items.sort((a, b) => priorityOrder[a.classification.priority] - priorityOrder[b.classification.priority])
  })

  // Sort groups: high count desc → total desc, "other" and "unclassified" always last
  const groups = Array.from(groupMap.values())
  groups.sort((a, b) => {
    if (a.categoryId === 'unclassified') return 1
    if (b.categoryId === 'unclassified') return -1
    if (a.categoryId === 'other') return 1
    if (b.categoryId === 'other') return -1
    if (a.highCount !== b.highCount) return b.highCount - a.highCount
    return b.items.length - a.items.length
  })

  return groups
}
