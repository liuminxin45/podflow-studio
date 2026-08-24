const { makeRequest, makeStreamingRequest } = require('./httpClient')
const { ensureLLMGateway, stopLLMGateway } = require('./llmGatewayProcess')

const DEFAULT_TIMEOUT = 30000
const STREAMING_TIMEOUT = 180000

function resolveRuntimeApiKey(apiKey, apiKeyEnvVar) {
  const directKey = String(apiKey || '').trim()
  if (directKey) return directKey

  const envName = String(apiKeyEnvVar || '').trim()
  if (!envName) return ''

  const envKey = String(process.env[envName] || '').trim()
  if (!envKey) {
    throw new Error(`Environment variable ${envName} is not available to the app process`)
  }
  return envKey
}

async function fetchModels({ apiBase, apiKey, apiKeyEnvVar, providerKind = 'openai_compatible' }) {
  const gateway = await ensureLLMGateway()
  const url = `${gateway.baseUrl}/models`
  const runtimeApiKey = resolveRuntimeApiKey(apiKey, apiKeyEnvVar)

  try {
    const response = await makeRequest({
      url,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: {
        api_base: apiBase,
        api_key: runtimeApiKey,
        provider_kind: providerKind,
        timeout: Math.ceil(DEFAULT_TIMEOUT / 1000)
      },
      timeout: DEFAULT_TIMEOUT
    })
    return response.body
  } catch (error) {
    throw new Error(`Failed to fetch models: ${error.message}`)
  }
}

async function callLLM(params) {
  const {
    apiBase,
    apiKey,
    apiKeyEnvVar,
    model,
    messages,
    temperature = 0.3,
    maxTokens,
    timeout,
    stream = false,
    eventSender = null,
    providerKind = 'openai_compatible',
    signal,
  } = params
  const gateway = await ensureLLMGateway()
  const url = `${gateway.baseUrl}/chat/completions`
  const headers = { 'Content-Type': 'application/json' }
  const requestTimeout = typeof timeout === 'number' ? timeout : STREAMING_TIMEOUT
  const runtimeApiKey = resolveRuntimeApiKey(apiKey, apiKeyEnvVar)
  const body = {
    api_base: apiBase,
    api_key: runtimeApiKey,
    model,
    provider_kind: providerKind,
    request_id: params.requestId,
    local_agent_id: params.localAgentId,
    local_agent_command: params.localAgentCommand,
    local_agent_args: params.localAgentArgs,
    local_agent_output_mode: params.localAgentOutputMode,
    ai_target: params.aiTarget,
    messages,
    temperature,
    timeout: Math.ceil(requestTimeout / 1000),
    stream
  }
  if (typeof maxTokens === 'number') {
    body.max_tokens = maxTokens
  }

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
      onError: (error) => eventSender.send('llm:stream:error', error),
      signal,
    })
  } else {
    try {
      const response = await makeRequest({ url, method: 'POST', headers, body, timeout: requestTimeout, signal })
      return response.body
    } catch (error) {
      throw new Error(`LLM call failed: ${error.message}`)
    }
  }
}

module.exports = {
  fetchModels,
  callLLM,
  stopLLMGateway
}
