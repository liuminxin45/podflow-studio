const crypto = require('crypto')

const OPEN_API_HOST = 'open.volcengineapi.com'
const OPEN_API_SERVICE = 'speech_saas_prod'
const SIGNED_HEADERS = 'content-type;host;x-content-sha256;x-date'

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function hmac(key, value, encoding) {
  return crypto.createHmac('sha256', key).update(value).digest(encoding)
}

function utcTimestamp(now = new Date()) {
  return now.toISOString().replace(/[:-]|\.\d{3}/g, '')
}

function redactCredentialText(value, credentials = []) {
  let safe = String(value || '')
  for (const credential of credentials) {
    if (credential) safe = safe.split(String(credential)).join('[masked]')
  }
  return safe.replace(/[A-Za-z0-9_-]{20,}/g, '[masked]')
}

function describeOpenAPIError(apiError, credentials = []) {
  const code = String(apiError?.Code || '')
  const message = redactCredentialText(apiError?.Message || code, credentials)
  if (/SignatureDoesNotMatch/i.test(code) || /request signature.*does not match/i.test(message)) {
    return '签名校验失败：请填写同一条火山引擎“API 访问密钥”中的 Access Key ID 和 Secret Access Key；不要填写豆包 App ID、Access Token 或方舟 API Key。若已找不到该 Secret Access Key，请在访问控制中创建一对新密钥。'
  }
  if (/InvalidAccessKey|AccessKey.*(invalid|not exist)/i.test(`${code} ${message}`)) {
    return 'Access Key ID 无效或已停用：请到火山引擎“API 访问密钥”页面确认该密钥处于启用状态，并与对应的 Secret Access Key 配对使用。'
  }
  return message || '未知错误'
}

function signedRequest({ accessKey, secretKey, action, version, region, body, now = new Date() }) {
  const payload = JSON.stringify(body)
  const payloadHash = sha256(payload)
  const xDate = utcTimestamp(now)
  const shortDate = xDate.slice(0, 8)
  const query = `Action=${encodeURIComponent(action)}&Version=${encodeURIComponent(version)}`
  const contentType = 'application/json; charset=utf-8'
  const canonicalHeaders = [
    `content-type:${contentType}`,
    `host:${OPEN_API_HOST}`,
    `x-content-sha256:${payloadHash}`,
    `x-date:${xDate}`,
    '',
  ].join('\n')
  const canonicalRequest = [
    'POST',
    '/',
    query,
    canonicalHeaders,
    SIGNED_HEADERS,
    payloadHash,
  ].join('\n')
  const scope = `${shortDate}/${region}/${OPEN_API_SERVICE}/request`
  const stringToSign = [
    'HMAC-SHA256',
    xDate,
    scope,
    sha256(canonicalRequest),
  ].join('\n')
  const dateKey = hmac(secretKey, shortDate)
  const regionKey = hmac(dateKey, region)
  const serviceKey = hmac(regionKey, OPEN_API_SERVICE)
  const signingKey = hmac(serviceKey, 'request')
  const signature = hmac(signingKey, stringToSign, 'hex')

  return {
    url: `https://${OPEN_API_HOST}/?${query}`,
    body: payload,
    headers: {
      'Content-Type': contentType,
      'X-Content-Sha256': payloadHash,
      'X-Date': xDate,
      Authorization: `HMAC-SHA256 Credential=${accessKey}/${scope}, SignedHeaders=${SIGNED_HEADERS}, Signature=${signature}`,
    },
  }
}

async function callOpenAPI(params, fetchImpl = globalThis.fetch) {
  const request = signedRequest(params)
  const response = await fetchImpl(request.url, {
    method: 'POST',
    headers: request.headers,
    body: request.body,
  })
  const raw = await response.text()
  let result
  try {
    result = raw ? JSON.parse(raw) : {}
  } catch (error) {
    throw new Error(`豆包音色接口返回了无效 JSON: ${error.message}`)
  }
  const apiError = result?.ResponseMetadata?.Error
  if (!response.ok || apiError) {
    const detail = apiError
      ? describeOpenAPIError(apiError, [params.accessKey, params.secretKey])
      : `HTTP ${response.status}`
    throw new Error(`豆包音色接口调用失败: ${detail}`)
  }
  return result?.Result || {}
}

function presetVoice(speaker) {
  const voiceType = String(speaker?.VoiceType || '').trim()
  return {
    id: voiceType,
    name: String(speaker?.Name || voiceType).trim(),
    description: String(speaker?.Description || '').trim(),
    status: 'available',
    resourceId: String(speaker?.ResourceID || '').trim(),
    previewUrl: String(speaker?.TrialURL || speaker?.ShortTrialURL || '').trim(),
  }
}

function cloneVoice(status) {
  const speakerId = String(status?.SpeakerID || status?.SpeakerId || status?.speaker_id || '').trim()
  const state = String(status?.State || status?.Status || '').trim()
  return {
    id: speakerId,
    name: String(status?.Alias || status?.Name || speakerId).trim(),
    description: state ? `状态: ${state}` : '',
    status: state || 'Unknown',
    resourceId: 'volc.megatts.default',
    previewUrl: String(status?.DemoAudio || status?.DemoAudioURL || '').trim(),
  }
}

async function listPresetVoices(credentials, fetchImpl = globalThis.fetch) {
  const voices = []
  for (let page = 1; page <= 20; page += 1) {
    const result = await callOpenAPI({
      ...credentials,
      action: 'ListSpeakers',
      version: '2025-05-20',
      region: 'cn-beijing',
      body: {
        ResourceIDs: ['seed-tts-1.0', 'seed-tts-2.0'],
        Page: page,
        Limit: 100,
      },
    }, fetchImpl)
    const speakers = Array.isArray(result.Speakers) ? result.Speakers : []
    voices.push(...speakers.map(presetVoice).filter(voice => voice.id))
    if (!speakers.length || voices.length >= Number(result.Total || 0)) break
  }
  return voices
}

async function listCloneVoices(credentials, appId, fetchImpl = globalThis.fetch) {
  const voices = []
  for (let page = 1; page <= 20; page += 1) {
    const result = await callOpenAPI({
      ...credentials,
      action: 'BatchListMegaTTSTrainStatus',
      version: '2023-11-07',
      region: 'cn-north-1',
      body: {
        AppID: String(appId),
        PageNumber: page,
        PageSize: 100,
      },
    }, fetchImpl)
    const statuses = Array.isArray(result.Statuses) ? result.Statuses : []
    voices.push(...statuses.map(cloneVoice).filter(voice => voice.id))
    if (!statuses.length || voices.length >= Number(result.TotalCount || 0)) break
  }
  return voices
}

async function listDoubaoVoices(params, fetchImpl = globalThis.fetch) {
  const accessKey = String(params?.accessKey || '').trim()
  const secretKey = String(params?.secretKey || '').trim()
  const kind = params?.kind === 'clone' ? 'clone' : 'preset'
  if (!accessKey || !secretKey) {
    throw new Error('刷新豆包音色需要火山引擎账号级 Access Key 和 Secret Key')
  }
  const credentials = { accessKey, secretKey }
  if (kind === 'clone') {
    const appId = String(params?.appId || '').trim()
    if (!appId) throw new Error('查询复刻音色需要 APP ID')
    return listCloneVoices(credentials, appId, fetchImpl)
  }
  return listPresetVoices(credentials, fetchImpl)
}

module.exports = {
  redactCredentialText,
  describeOpenAPIError,
  signedRequest,
  listDoubaoVoices,
  listPresetVoices,
  listCloneVoices,
}
