const { makeNDJSONRequest, makeRequest } = require('./httpClient')
const { ensureLLMGateway, stopLLMGateway } = require('./llmGatewayProcess')


async function runAITask(request, target, signal, onEvent) {
  const gateway = await ensureLLMGateway()
  return makeNDJSONRequest({
    url: `${gateway.baseUrl}/ai/tasks/run`,
    headers: { 'Content-Type': 'application/json' },
    body: { request, target },
    timeout: 240000,
    signal,
    onEvent,
  })
}

async function cancelAITask(requestId) {
  const gateway = await ensureLLMGateway()
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await makeRequest({
      url: `${gateway.baseUrl}/ai/tasks/cancel`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { request_id: requestId },
      timeout: 10000,
    })
    if (response.body?.success || attempt === 2) return response.body
    await new Promise(resolve => setTimeout(resolve, 50))
  }
  return { success: false }
}

module.exports = { runAITask, cancelAITask, stopLLMGateway }
