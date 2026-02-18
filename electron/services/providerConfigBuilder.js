const PROVIDER_TO_ENGINE = {
  edge_tts: 'edge-tts',
  doubao_tts: 'doubao_tts',
  voice_clone: 'voice_clone',
}

const SPEED_TO_RATE = {
  slower: '-20%',
  normal: '+0%',
  faster: '+20%',
}

function buildTTSConfig(payload, baseTtsConfig) {
  const requestedProvider = payload?.voiceProvider || 'edge_tts'
  const providerConfig = payload?.providerConfig || {}
  
  const config = {
    ...baseTtsConfig,
    engine: PROVIDER_TO_ENGINE[requestedProvider] || 'edge-tts',
    rate: SPEED_TO_RATE[payload?.speedLevel] || baseTtsConfig.rate || '+0%',
    api_base: String(providerConfig.apiBase || baseTtsConfig.api_base || baseTtsConfig.apiBase || '').trim(),
    api_key: String(providerConfig.apiKey || baseTtsConfig.api_key || baseTtsConfig.apiKey || '').trim(),
    model: String(providerConfig.model || baseTtsConfig.model || '').trim(),
    request_timeout_sec: Number(providerConfig.requestTimeoutSec) || Number(baseTtsConfig.request_timeout_sec) || 60,
    doubao_app_id: String(providerConfig.doubaoAppId || baseTtsConfig.doubao_app_id || '').trim(),
    doubao_access_token: String(providerConfig.doubaoAccessToken || baseTtsConfig.doubao_access_token || '').trim(),
    doubao_cluster: String(providerConfig.doubaoCluster || baseTtsConfig.doubao_cluster || 'volcano_tts').trim(),
    doubao_voice_type: String(providerConfig.doubaoVoiceType || baseTtsConfig.doubao_voice_type || 'zh_female_shuangkuaisisi_moon_bigtts').trim(),
    doubao_endpoint: String(providerConfig.doubaoEndpoint || baseTtsConfig.doubao_endpoint || 'https://openspeech.bytedance.com/api/v1/tts').trim(),
  }

  const voiceMapping = { ...(baseTtsConfig.voice_mapping || baseTtsConfig.voiceMapping || {}) }
  if (!voiceMapping['Host A']) voiceMapping['Host A'] = 'zh-CN-XiaoxiaoNeural'
  if (!voiceMapping['Host B']) voiceMapping['Host B'] = 'zh-CN-YunxiNeural'
  config.voice_mapping = voiceMapping

  return config
}

function validateProviderConfig(requestedProvider, config) {
  const errors = []
  const warnings = []
  const providerName = String(config.provider || 'openai_compatible').trim()

  if (requestedProvider === 'doubao_tts') {
    if (!config.doubao_app_id || !config.doubao_access_token) {
      errors.push('Doubao TTS 需要配置 AppID 与 Access Token')
    }
    if (!config.doubao_cluster || !config.doubao_voice_type || !config.doubao_endpoint) {
      errors.push('Doubao TTS 需要配置 Cluster / VoiceType / Endpoint')
    }
    if (providerName !== 'doubao_tts') {
      warnings.push('当前音频能力提供方不是 Doubao，已尝试使用 Doubao 字段生成。')
    }
  }

  if (requestedProvider === 'voice_clone') {
    if (!config.api_base || !config.api_key || !config.model) {
      errors.push('Voice Clone 需要配置 API Base / API Key / Model')
    }
  }

  return { errors, warnings }
}

function buildStages(segments) {
  return segments
    .map((seg, index) => {
      const text = String(seg?.content || '').trim()
      if (!text) return null
      return {
        index,
        order: index,
        speaker: index % 2 === 0 ? 'Host A' : 'Host B',
        text,
        estimated_duration: Math.max(5, Number(seg?.estimatedSeconds) || 30),
      }
    })
    .filter(Boolean)
}

module.exports = {
  PROVIDER_TO_ENGINE,
  buildTTSConfig,
  validateProviderConfig,
  buildStages,
}
