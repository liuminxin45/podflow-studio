const { makeRequest, makeStreamingRequest } = require('./httpClient')

const DEFAULT_TIMEOUT = 30000
const STREAMING_TIMEOUT = 180000

function buildHeaders(apiBase, apiKey) {
  const headers = { 'Content-Type': 'application/json' }
  if (apiBase.includes('openai.azure.com')) {
    headers['api-key'] = apiKey
  } else {
    headers['Authorization'] = `Bearer ${apiKey}`
  }
  return headers
}

async function fetchModels({ apiBase, apiKey }) {
  const url = `${apiBase.replace(/\/$/, '')}/models`
  const headers = apiBase.includes('openai.azure.com')
    ? { 'api-key': apiKey }
    : { 'Authorization': `Bearer ${apiKey}` }

  try {
    const response = await makeRequest({ url, method: 'GET', headers, timeout: DEFAULT_TIMEOUT })
    return response.body
  } catch (error) {
    throw new Error(`Failed to fetch models: ${error.message}`)
  }
}

async function callLLM({ apiBase, apiKey, model, messages, temperature = 0.3, maxTokens, timeout, stream = false, eventSender = null }) {
  const url = `${apiBase.replace(/\/$/, '')}/chat/completions`
  const headers = buildHeaders(apiBase, apiKey)
  const body = { model, messages, temperature, stream }
  if (typeof maxTokens === 'number') {
    body.max_tokens = maxTokens
  }

  const requestTimeout = typeof timeout === 'number' ? timeout : STREAMING_TIMEOUT

  if (stream) {
    if (!eventSender) {
      throw new Error('eventSender is required for streaming mode')
    }

    return makeStreamingRequest({
      url,
      method: 'POST',
      headers,
      body,
      timeout: requestTimeout,
      onChunk: (content) => eventSender.send('llm:stream:chunk', content),
      onEnd: () => eventSender.send('llm:stream:done'),
      onError: (error) => eventSender.send('llm:stream:error', error)
    })
  } else {
    try {
      const response = await makeRequest({ url, method: 'POST', headers, body, timeout: requestTimeout })
      return response.body
    } catch (error) {
      throw new Error(`LLM call failed: ${error.message}`)
    }
  }
}

module.exports = {
  fetchModels,
  callLLM
}
