import { llmService } from '../llmService'
import { safeParseJSON } from '../ideation/utils'
import { llmConfigResolver } from '../settings/llmConfigResolver'

const VOICE_PROVIDERS = ['edge_tts', 'doubao_tts', 'voice_clone'] as const
const VOICE_STYLES = ['natural', 'steady', 'deep', 'relaxed', 'warm', 'energetic'] as const
const EMOTION_LEVELS = ['subtle', 'moderate', 'expressive'] as const
const SPEED_LEVELS = ['slower', 'normal', 'faster'] as const
const PAUSE_STYLES = ['minimal', 'natural', 'dramatic'] as const
const EXPRESSION_TONES = ['firm', 'friendly', 'calm'] as const

type VoiceProvider = (typeof VOICE_PROVIDERS)[number]
type VoiceStyle = (typeof VOICE_STYLES)[number]
type EmotionLevel = (typeof EMOTION_LEVELS)[number]
type SpeedLevel = (typeof SPEED_LEVELS)[number]
type PauseStyle = (typeof PAUSE_STYLES)[number]
type ExpressionTone = (typeof EXPRESSION_TONES)[number]

interface ScriptSegmentSnapshot {
  id: string
  label: string
  content: string
  estimatedSeconds: number
}

export interface SmartVoiceContext {
  episodeTitle?: string
  episodeDescription?: string
  globalTone?: string
  segments: ScriptSegmentSnapshot[]
  current: {
    provider: VoiceProvider
    voiceStyle: VoiceStyle
    emotionLevel: EmotionLevel
    speedLevel: SpeedLevel
    pauseStyle: PauseStyle
    expressionTone: ExpressionTone | null
  }
}

export interface SmartVoiceRecommendation {
  provider: VoiceProvider
  voiceStyle: VoiceStyle
  emotionLevel: EmotionLevel
  speedLevel: SpeedLevel
  pauseStyle: PauseStyle
  expressionTone: ExpressionTone | null
  reason: string
  llmSummary: string
}

function normalizeEnum<T extends readonly string[]>(value: unknown, allowed: T, fallback: T[number]): T[number] {
  if (typeof value !== 'string') return fallback
  const normalized = value.trim().toLowerCase()
  const found = allowed.find((item) => item === normalized)
  return (found ?? fallback) as T[number]
}

function normalizeExpressionTone(value: unknown): ExpressionTone | null {
  if (value == null || value === '') return null
  return normalizeEnum(value, EXPRESSION_TONES, 'friendly')
}

function buildPrompt(context: SmartVoiceContext): string {
  const compactSegments = context.segments
    .slice(0, 8)
    .map((seg, index) => {
      const excerpt = (seg.content || '').replace(/\s+/g, ' ').trim().slice(0, 120)
      return `${index + 1}. ${seg.label}(${seg.estimatedSeconds}s): ${excerpt}`
    })
    .join('\n')

  return [
    '请你充当播客声音导演，帮我选择最合适的“智能声音”配置。',
    '',
    '可选 provider 仅允许以下之一：edge_tts | doubao_tts | voice_clone',
    '可选 voiceStyle: natural | steady | deep | relaxed | warm | energetic',
    '可选 emotionLevel: subtle | moderate | expressive',
    '可选 speedLevel: slower | normal | faster',
    '可选 pauseStyle: minimal | natural | dramatic',
    '可选 expressionTone: firm | friendly | calm | null',
    '',
    '目标：兼顾自然度、信息密度、可听性，避免过激语气。',
    '',
    `节目标题: ${context.episodeTitle || '未命名节目'}`,
    `节目简介: ${context.episodeDescription || ''}`,
    `全局语气: ${context.globalTone || ''}`,
    '',
    `当前配置: ${JSON.stringify(context.current)}`,
    '',
    '稿件片段:',
    compactSegments || '（无片段）',
    '',
    '只返回 JSON，不要 markdown，不要额外解释。格式如下：',
    '{',
    '  "provider": "edge_tts|doubao_tts|voice_clone",',
    '  "voiceStyle": "natural|steady|deep|relaxed|warm|energetic",',
    '  "emotionLevel": "subtle|moderate|expressive",',
    '  "speedLevel": "slower|normal|faster",',
    '  "pauseStyle": "minimal|natural|dramatic",',
    '  "expressionTone": "firm|friendly|calm|null",',
    '  "reason": "一句话解释为什么这样选",',
    '  "llmSummary": "给用户看的简短建议，20~60字"',
    '}',
  ].join('\n')
}

function fallbackRecommendation(context: SmartVoiceContext, reason: string): SmartVoiceRecommendation {
  return {
    provider: context.current.provider,
    voiceStyle: context.current.voiceStyle,
    emotionLevel: context.current.emotionLevel,
    speedLevel: context.current.speedLevel,
    pauseStyle: context.current.pauseStyle,
    expressionTone: context.current.expressionTone,
    reason,
    llmSummary: '已保留你当前的声音配置。',
  }
}

export async function recommendSmartVoice(context: SmartVoiceContext): Promise<SmartVoiceRecommendation> {
  const config = llmConfigResolver.getLLMConfig('produce')
  if (!config) {
    throw new Error('未检测到可用的音频/文本大模型配置，请先到设置页配置 API。')
  }

  const response = await llmService.call({
    apiBase: config.apiBase,
    apiKey: config.apiKey,
    model: config.model,
    messages: [
      {
        role: 'system',
        content: '你是播客制作助手，必须返回可解析 JSON，且遵循给定枚举值。',
      },
      {
        role: 'user',
        content: buildPrompt(context),
      },
    ],
    temperature: 0.2,
    maxTokens: 700,
    timeout: 60000,
  })

  const raw = response.choices?.[0]?.message?.content?.trim() || ''
  if (!raw) {
    return fallbackRecommendation(context, '模型返回为空，已保留当前声音配置。')
  }

  const parsed = safeParseJSON<Record<string, unknown> | null>(raw, null)
  if (!parsed || typeof parsed !== 'object') {
    return fallbackRecommendation(context, '模型建议解析失败，已保留当前声音配置。')
  }

  return {
    provider: normalizeEnum(parsed.provider, VOICE_PROVIDERS, context.current.provider),
    voiceStyle: normalizeEnum(parsed.voiceStyle, VOICE_STYLES, context.current.voiceStyle),
    emotionLevel: normalizeEnum(parsed.emotionLevel, EMOTION_LEVELS, context.current.emotionLevel),
    speedLevel: normalizeEnum(parsed.speedLevel, SPEED_LEVELS, context.current.speedLevel),
    pauseStyle: normalizeEnum(parsed.pauseStyle, PAUSE_STYLES, context.current.pauseStyle),
    expressionTone: normalizeExpressionTone(parsed.expressionTone),
    reason: typeof parsed.reason === 'string' && parsed.reason.trim()
      ? parsed.reason.trim()
      : '已根据稿件内容自动匹配更合适的声音参数。',
    llmSummary: typeof parsed.llmSummary === 'string' && parsed.llmSummary.trim()
      ? parsed.llmSummary.trim()
      : '已完成智能声音匹配。',
  }
}
