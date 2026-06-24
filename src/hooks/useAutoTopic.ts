import { useState, useCallback } from 'react'
import type { ContentItem } from '../types/workflow'
import { llmService } from '../services/llmService'
import { LLMError } from '../types/llm'
import { LLM_DEFAULTS, TOPIC_ANALYSIS } from '../constants/llm'

type EnrichedContentItem = ContentItem & {
  _topic_score?: number
  _topic_decision?: string
  _topic_reason?: string
  _topic_angle?: string
}

export interface AutoTopicConfig {
  target_topic: string
  time_range_hours: number
  focus_instruction: string
  max_items: number
}

interface LLMConfig {
  apiKey: string
  apiBase: string
  model: string
}

export type AnalysisStage = 'fetch' | 'filter' | 'analyze' | 'done'

export interface AutoTopicState {
  stage: AnalysisStage
  progress: number
  logs: string[]
  error?: string
  selectedItems: EnrichedContentItem[]
  rejectedItems: EnrichedContentItem[]
}

export function useAutoTopic(
  fetchContents: ContentItem[],
  llmConfig: LLMConfig | null,
  onRunFetch: () => Promise<void>
) {
  const [state, setState] = useState<AutoTopicState>({
    stage: 'fetch',
    progress: 0,
    logs: [],
    selectedItems: [],
    rejectedItems: [],
  })
  const [isProcessing, setIsProcessing] = useState(false)

  const addLog = useCallback((message: string) => {
    setState(prev => ({
      ...prev,
      logs: [...prev.logs, `${new Date().toLocaleTimeString()}: ${message}`],
    }))
  }, [])

  const filterByTime = useCallback((contents: ContentItem[], hours: number): EnrichedContentItem[] => {
    if (hours <= 0) return contents as EnrichedContentItem[]

    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000)
    return contents.filter(item => {
      const pubTime = item.published || (item as any).published_at
      if (!pubTime) return false

      try {
        const pubDate = new Date(pubTime)
        return pubDate >= cutoff
      } catch {
        return false
      }
    }) as EnrichedContentItem[]
  }, [])

  const analyzeBatch = useCallback(async (
    items: ContentItem[],
    config: AutoTopicConfig,
    onProgress: (progress: number) => void
  ): Promise<EnrichedContentItem[]> => {
    if (!llmConfig) {
      throw new LLMError('LLM config not available', 'AUTH')
    }

    const batchFn = async (batch: ContentItem[]): Promise<EnrichedContentItem[]> => {
      const prompt = buildAnalysisPrompt(batch, config)
      
      const response = await llmService.call({
        apiBase: llmConfig.apiBase,
        apiKey: llmConfig.apiKey,
        model: llmConfig.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: LLM_DEFAULTS.TEMPERATURE,
      })

      const content = response.choices[0].message.content
      const parsed = parseAnalysisResponse(content)
      
      return batch.map((item, idx) => {
        const result = parsed[idx] || { score: 0, decision: 'drop', reason: '解析失败', angle: '' }
        return {
          ...item,
          _topic_score: result.score,
          _topic_decision: result.decision,
          _topic_reason: result.reason,
          _topic_angle: result.angle,
        } as EnrichedContentItem
      })
    }

    return await llmService.batchAnalyze(items, batchFn, onProgress)
  }, [llmConfig])

  const execute = useCallback(async (config: AutoTopicConfig) => {
    if (!config.target_topic.trim()) {
      return
    }

    if (!llmConfig || !llmConfig.apiKey || !llmConfig.apiBase || !llmConfig.model) {
      setState(prev => ({
        ...prev,
        error: '未配置大模型 API，请先在 Settings → AI 能力接口中配置发现/搜索或文本模型',
      }))
      return
    }

    setIsProcessing(true)
    setState({ stage: 'fetch', progress: 10, logs: [], selectedItems: [], rejectedItems: [] })

    try {
      addLog('开始采集数据...')
      await onRunFetch()
      setState(prev => ({ ...prev, stage: 'filter', progress: 30 }))
      addLog(`采集完成，获取 ${fetchContents.length} 条内容`)

      addLog(`时效性过滤（${config.time_range_hours}h 内）...`)
      const timeFiltered = filterByTime(fetchContents, config.time_range_hours)
      setState(prev => ({ ...prev, progress: 40 }))
      addLog(`时效性过滤完成，保留 ${timeFiltered.length} 条`)

      if (timeFiltered.length === 0) {
        setState(prev => ({
          ...prev,
          stage: 'done',
          progress: 100,
          error: '没有满足时效性要求的内容',
        }))
        setIsProcessing(false)
        return
      }

      setState(prev => ({ ...prev, stage: 'analyze', progress: 50 }))
      addLog('开始 AI 分析内容相关性...')

      const analyzed = await analyzeBatch(timeFiltered, config, (progress) => {
        setState(prev => ({ ...prev, progress: 50 + progress * 0.4 }))
        addLog(`分析进度：${Math.round(progress * 100)}%`)
      })

      setState(prev => ({ ...prev, stage: 'done', progress: 100 }))
      addLog('AI 分析完成，正在生成推荐...')

      const sorted = analyzed.sort((a, b) => (b._topic_score || 0) - (a._topic_score || 0))
      const selected = sorted.filter(item => item._topic_decision === 'keep').slice(0, config.max_items)
      const rejected = sorted.filter(item => item._topic_decision !== 'keep')

      setState(prev => ({
        ...prev,
        selectedItems: selected,
        rejectedItems: rejected,
      }))
      addLog(`生成推荐完成：${selected.length} 条入选，${rejected.length} 条淘汰`)
    } catch (error: any) {
      const errorMsg = error instanceof LLMError ? error.message : (error?.message || String(error))
      addLog(`错误：${errorMsg}`)
      setState(prev => ({
        ...prev,
        stage: 'done',
        error: errorMsg,
      }))
    } finally {
      setIsProcessing(false)
    }
  }, [fetchContents, llmConfig, onRunFetch, addLog, filterByTime, analyzeBatch])

  return {
    state,
    isProcessing,
    execute,
  }
}

function buildAnalysisPrompt(batch: ContentItem[], config: AutoTopicConfig): string {
  const prompt = `你是专业的内容主编。

# 选题任务
主题：${config.target_topic}
${config.focus_instruction ? `要求：${config.focus_instruction}` : ''}

# 待分析文章
${batch.map((item, idx) => `${idx + 1}. ${item.title || '无标题'}
摘要：${(item.content || (item as any).summary || '无摘要').slice(0, 150)}`).join('\n\n')}

# 任务
对每篇文章评估是否匹配选题主题。

# 输出要求
直接输出 JSON 数组，不要任何其他文字：
[
  {"index": 1, "score": 85, "decision": "keep", "reason": "高度匹配主题，内容有价值", "angle": "技术突破视角"},
  {"index": 2, "score": 30, "decision": "drop", "reason": "偏离主题", "angle": ""}
]

评分标准：80-100=强相关，60-79=相关，40-59=弱相关，0-39=不相关
decision: score>=${TOPIC_ANALYSIS.MIN_MATCH_SCORE} 用 "keep"，否则 "drop"`

  return prompt
}

function parseAnalysisResponse(content: string): any[] {
  let parsed = content.trim()

  if (parsed.includes('```json')) {
    parsed = parsed.split('```json')[1].split('```')[0].trim()
  } else if (parsed.includes('```')) {
    parsed = parsed.split('```')[1].split('```')[0].trim()
  }

  try {
    const results = JSON.parse(parsed)
    if (!Array.isArray(results)) {
      throw new Error('Response is not an array')
    }
    return results
  } catch (error: any) {
    console.error('[useAutoTopic] JSON parse failed:', parsed)
    throw new LLMError(`JSON 解析失败: ${error.message}`, 'PARSE', { content: parsed })
  }
}
