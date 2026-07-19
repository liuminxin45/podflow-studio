import type { AudioProvider, OutputFormat } from './types'

export const AUDIO_PROVIDERS: Array<{
  id: AudioProvider
  label: string
  description: string
}> = [
  {
    id: 'edge-tts',
    label: 'Edge TTS',
    description: '无需 API Key，但生成时需要可访问 Edge 语音服务的网络。',
  },
  {
    id: 'openai-compatible',
    label: 'OpenAI 兼容语音',
    description: '调用已配置服务的 /audio/speech 接口。',
  },
  {
    id: 'doubao_tts',
    label: '豆包语音生成',
    description: '使用设置页配置的豆包 App ID、Access Token 和预置音色。',
  },
  {
    id: 'voice_clone',
    label: '豆包语音克隆',
    description: '使用设置页配置并已训练成功的豆包 Speaker ID。',
  },
]

export const VOICE_PRESETS: Record<AudioProvider, Array<{
  id: string
  label: string
  description: string
}>> = {
  'edge-tts': [
    { id: 'zh-CN-XiaoxiaoNeural', label: '晓晓', description: '自然、清晰的女声' },
    { id: 'zh-CN-YunjianNeural', label: '云健', description: '稳重、有力的男声' },
    { id: 'zh-CN-YunxiNeural', label: '云希', description: '年轻、亲和的男声' },
    { id: 'zh-CN-XiaoyiNeural', label: '晓伊', description: '明快、有活力的女声' },
  ],
  'openai-compatible': [
    { id: 'alloy', label: 'Alloy', description: '均衡、自然' },
    { id: 'onyx', label: 'Onyx', description: '低沉、稳重' },
    { id: 'nova', label: 'Nova', description: '轻快、友好' },
    { id: 'shimmer', label: 'Shimmer', description: '柔和、温暖' },
    { id: 'echo', label: 'Echo', description: '清晰、有表现力' },
  ],
  doubao_tts: [
    { id: 'zh_female_shuangkuaisisi_moon_bigtts', label: '爽快思思', description: '豆包默认预置音色' },
  ],
  voice_clone: [],
}

export const RATE_OPTIONS = [
  { value: '-10%', label: '稍慢' },
  { value: '+0%', label: '正常' },
  { value: '+10%', label: '稍快' },
] as const

export const OUTPUT_FORMATS: Array<{ value: OutputFormat; label: string }> = [
  { value: 'mp3', label: 'MP3 · 通用' },
  { value: 'wav', label: 'WAV · 无损' },
  { value: 'opus', label: 'Opus · 小体积' },
]

export const SEGMENT_COLORS = ['#e05a3f', '#3478c9', '#7655b5', '#168b83', '#a06a24']

export const PRODUCE_NODE_LABELS: Record<string, string> = {
  tts: '生成分段语音',
  audio_postprocess: '合成并处理音频',
  assets: '生成节目资产',
}
