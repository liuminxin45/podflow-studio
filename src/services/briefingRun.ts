import type { ContentItem, Workflow } from '../types/workflow'

export const BRIEFING_NODES = [
  'preprocess',
  'research',
  'topic_selection',
  'facts',
  'script',
  'tts',
  'audio_postprocess',
  'review',
] as const

export const DEFAULT_BRIEFING_NEWSNOW_SOURCES = [
  'weibo',
  'zhihu',
  'baidu',
  'ithome',
  '36kr-quick',
  'github-trending-today',
  'hackernews',
  'wallstreetcn-quick',
  'cls-telegraph',
  'zaobao',
]

export const PUBLIC_SAMPLE_URL = 'https://www.liuminxin.cn/works/podflow-studio#episode-player'

export interface BriefingRequest {
  topic: string
  materialText: string
}

export interface BriefingReadiness {
  loading: boolean
  ready: boolean
  issues: string[]
  llmLabel: string
  voiceLabel: string
}

export interface BriefingPhase {
  id: 'collect' | 'verify' | 'write' | 'voice'
  label: string
  nodes: string[]
}

export const BRIEFING_PHASES: BriefingPhase[] = [
  { id: 'collect', label: '收集素材', nodes: ['fetch', 'preprocess'] },
  { id: 'verify', label: '核验与选题', nodes: ['research', 'topic_selection', 'facts'] },
  { id: 'write', label: '撰写节目', nodes: ['script'] },
  { id: 'voice', label: '生成声音', nodes: ['tts', 'audio_postprocess', 'review'] },
]

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function titleFromUrl(value: string): string {
  try {
    const url = new URL(value)
    return url.hostname.replace(/^www\./, '')
  } catch {
    return '手动链接'
  }
}

export function parseBriefingMaterials(raw: string): ContentItem[] {
  const normalized = raw.replace(/\r\n/g, '\n').trim()
  if (!normalized) return []

  const items: ContentItem[] = []
  const textLines: string[] = []

  const flushText = () => {
    const content = textLines.join('\n').trim()
    textLines.length = 0
    if (!content) return
    const firstLine = content.split('\n').find(line => line.trim())?.trim() || '手动素材'
    items.push({
      title: firstLine.slice(0, 100),
      content,
      source: 'manual',
      source_id: `manual-note-${items.length + 1}`,
      source_name: '手动素材',
      type: 'manual_note',
    })
  }

  for (const line of normalized.split('\n')) {
    const value = line.trim()
    if (!value) {
      flushText()
      continue
    }
    if (isHttpUrl(value)) {
      flushText()
      items.push({
        title: titleFromUrl(value),
        content: '',
        url: value,
        source: 'manual',
        source_id: `manual-url-${items.length + 1}`,
        source_name: '手动链接',
        type: 'manual_url',
      })
      continue
    }
    textLines.push(line)
  }
  flushText()
  return items
}

export function buildBriefingFetchConfig(
  loaded: Record<string, any> | null | undefined,
  topic: string,
): Record<string, any> {
  const enabledSources = Array.isArray(loaded?.enabled_sources)
    ? loaded.enabled_sources.filter(Boolean)
    : []
  const newsNowSourceIds = Array.isArray(loaded?.newsnow_source_ids) && loaded.newsnow_source_ids.length > 0
    ? loaded.newsnow_source_ids
    : DEFAULT_BRIEFING_NEWSNOW_SOURCES

  return {
    ...(loaded || {}),
    topic: topic.trim(),
    enabled_sources: enabledSources,
    newsnow_source_ids: newsNowSourceIds,
    recency_hours: Number(loaded?.recency_hours || 24),
    result_limit: Number(loaded?.result_limit || 10),
    max_articles: Number(loaded?.max_articles || 50),
    min_relevance: Number(loaded?.min_relevance || 1),
    quality: Number(loaded?.quality || 1),
    freshness: Number(loaded?.freshness || 4),
  }
}

function hasLLMCredential(config: Record<string, any> | null): boolean {
  if (!config) return false
  if (config.provider_kind === 'local_agent') {
    return Boolean(config.local_agent_id && config.local_agent_command)
  }
  if (config.provider_kind === 'ollama') {
    return Boolean(config.api_base && config.llm_model)
  }
  return Boolean(
    config.llm_model
    && config.api_base
    && (config.api_key || config.api_key_env_var),
  )
}

function hasVoiceCredential(config: Record<string, any> | null): boolean {
  const engine = String(config?.engine || 'edge-tts')
  if (engine === 'edge-tts') return true
  if (engine === 'mock') return false
  if (engine === 'doubao_tts' || engine === 'voice_clone') {
    return Boolean(config?.doubao_app_id && config?.doubao_access_token && config?.doubao_voice_type)
  }
  if (engine === 'openai-compatible') {
    return Boolean(config?.api_base && (config?.api_key || config?.api_key_env_var))
  }
  return true
}

export async function inspectBriefingReadiness(): Promise<BriefingReadiness> {
  if (!window.electronAPI?.loadNodeConfig) {
    return {
      loading: false,
      ready: false,
      issues: ['当前页面没有连接 Electron 后端'],
      llmLabel: '不可用',
      voiceLabel: '不可用',
    }
  }

  const [scriptConfig, ttsConfig] = await Promise.all([
    window.electronAPI.loadNodeConfig('script'),
    window.electronAPI.loadNodeConfig('tts'),
  ])
  const issues: string[] = []
  if (!hasLLMCredential(scriptConfig)) issues.push('尚未配置可用的 AI 成稿目标')
  if (!hasVoiceCredential(ttsConfig)) issues.push('当前声音配置只能生成 mock 音频或缺少凭据')

  return {
    loading: false,
    ready: issues.length === 0,
    issues,
    llmLabel: hasLLMCredential(scriptConfig)
      ? String(scriptConfig?.llm_model || scriptConfig?.local_agent_id || '已配置')
      : '未配置',
    voiceLabel: hasVoiceCredential(ttsConfig)
      ? String(ttsConfig?.engine || 'edge-tts')
      : '未配置',
  }
}

export function isQuickBriefWorkflow(workflow: Workflow | null | undefined): boolean {
  return Boolean(workflow?.state?.runtime_config?.quick_brief?.requested_at)
}

export function phaseStatus(
  workflow: Workflow | null,
  phase: BriefingPhase,
): 'pending' | 'running' | 'completed' | 'failed' {
  if (!workflow) return 'pending'
  const statuses = phase.nodes.map(node => workflow.nodeExecutions?.[node]?.status || 'pending')
  if (statuses.some(status => status === 'failed')) return 'failed'
  if (statuses.some(status => status === 'running')) return 'running'
  if (statuses.every(status => status === 'completed')) return 'completed'
  return 'pending'
}

export function currentBriefingDetail(workflow: Workflow | null): string {
  const node = workflow?.currentNode
  if (!node) {
    if (workflow?.state?.audio_outputs?.final_audio_path) return '节目已经生成，可以开始试听。'
    return '准备生成节目。'
  }
  const details: Record<string, string> = {
    fetch: '正在读取推荐来源和你提供的素材。',
    preprocess: '正在清理重复内容并保留可用信息。',
    research: '正在补充背景并核对来源。',
    topic_selection: '正在确定本期快讯和重点解读。',
    facts: '正在生成可追踪的事实卡片。',
    script: '正在根据事实卡片撰写口播稿。',
    tts: '正在把确认后的稿件转换成声音。',
    audio_postprocess: '正在装配片头、转场和最终音频。',
    review: '正在检查来源、稿件、发音和音频质量。',
  }
  return details[node] || `正在执行 ${node}。`
}

export function briefingStageForNode(node: string | null | undefined): string {
  if (node === 'fetch') return 'discover'
  if (node === 'preprocess') return 'organize'
  if (node === 'tts' || node === 'audio_postprocess') return 'produce'
  if (node === 'review' || node === 'publish') return 'publish'
  return 'draft'
}

export function latestBriefingFailure(workflow: Workflow | null): { node: string; message: string } | null {
  if (!workflow) return null
  const failedNode = Object.entries(workflow.nodeExecutions || {})
    .find(([, execution]) => execution.status === 'failed')?.[0]
  const error = [...(workflow.state?.errors || [])]
    .reverse()
    .find(item => !failedNode || !item.node || item.node === failedNode)
  if (!failedNode && !error) {
    const attemptedNodes = Object.keys(workflow.nodeExecutions || {})
    const missingAudio = isQuickBriefWorkflow(workflow)
      && workflow.status !== 'running'
      && attemptedNodes.length > 0
      && !workflow.state.audio_outputs?.final_audio_path
    if (!missingAudio) return null
    return {
      node: attemptedNodes.at(-1) || 'audio_postprocess',
      message: '工作流已经停止，但没有生成可播放音频。请打开制作工作台查看节点输出。',
    }
  }
  return {
    node: failedNode || error?.node || 'unknown',
    message: error?.message || `${failedNode || '工作流'}执行失败`,
  }
}

export function briefingTitle(workflow: Workflow | null): string {
  return workflow?.state?.edited_script?.title
    || workflow?.state?.script?.title
    || workflow?.state?.selected_topic?.title
    || '今日新闻简报'
}

export function sourceCount(workflow: Workflow | null): number {
  const urls = new Set<string>()
  for (const fact of workflow?.state?.facts || []) {
    for (const evidence of fact.evidence || []) {
      if (evidence.url) urls.add(evidence.url)
    }
  }
  return urls.size || Number(workflow?.state?.selected_materials?.length || workflow?.state?.fetch_contents?.length || 0)
}
