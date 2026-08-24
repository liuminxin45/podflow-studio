export interface LLMMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export type AIErrorCode =
  | 'AUTH'
  | 'RATE_LIMIT'
  | 'TIMEOUT'
  | 'NETWORK'
  | 'PARSE'
  | 'CONFIG'
  | 'PROVIDER'
  | 'CANCELLED'
  | 'QUALITY_GATE'
  | 'UNKNOWN'

export type AITaskEventType =
  | 'started'
  | 'progress'
  | 'text_delta'
  | 'tool_started'
  | 'tool_finished'
  | 'completed'
  | 'failed'
  | 'cancelled'

export interface AITaskRequest {
  version: 1
  request_id: string
  task_id: string
  target_id: string
  input: Record<string, unknown>
  stream: boolean
}

export interface AIUsage {
  input_tokens: number
  output_tokens: number
  total_tokens: number
  requests: number
}

export interface AIErrorPayload {
  code: AIErrorCode
  message: string
  retryable: boolean
  details: Record<string, unknown>
}

export interface AITaskResult {
  version: 1
  request_id: string
  task_id: string
  output: Record<string, unknown>
  usage: AIUsage
}

export interface AITaskEvent {
  version: 1
  request_id: string
  task_id: string
  sequence: number
  type: AITaskEventType
  payload: Record<string, unknown>
}

export interface LLMCallOptions {
  apiBase: string
  apiKey: string
  apiKeyEnvVar?: string
  model: string
  providerKind?: string
  localAgentId?: string
  localAgentCommand?: string
  localAgentArgs?: string[]
  localAgentOutputMode?: string
  aiTarget?: string
  messages: LLMMessage[]
  temperature?: number
  maxTokens?: number
  timeout?: number
  signal?: AbortSignal
  cacheMode?: 'default' | 'bypass'
}

export interface LLMResponse {
  id: string
  object: string
  created: number
  model: string
  choices: Array<{
    index: number
    message: LLMMessage
    finish_reason: string
  }>
  usage?: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

export type LLMAgentStreamEvent =
  | { type: 'init'; sessionId?: string }
  | { type: 'text_delta'; text: string }
  | { type: 'tool_start'; toolName: string; toolId?: string; input?: string }
  | { type: 'tool_done'; toolId?: string; output?: string }
  | { type: 'error'; message: string }
  | { type: 'done' }

export interface ModelInfo {
  id: string
  object: string
  created?: number
  owned_by?: string
}

export interface ModelsResponse {
  object: string
  data: ModelInfo[]
}

export interface LLMServiceConfig {
  useElectronProxy: boolean
  defaultTimeout: number
  retryAttempts: number
}

export interface PerformanceMetrics {
  totalCalls: number
  successfulCalls: number
  failedCalls: number
  totalDuration: number
  averageResponseTime: number
  failureRate: number
}

export interface RateLimitConfig {
  maxTokens: number
  refillRate: number
  refillInterval: number
}

export class LLMError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'NETWORK'
      | 'AUTH'
      | 'RATE_LIMIT'
      | 'TIMEOUT'
      | 'PARSE'
      | 'PROVIDER'
      | 'CONFIG'
      | 'CANCELLED'
      | 'QUALITY_GATE'
      | 'UNKNOWN',
    public readonly details?: any
  ) {
    super(message)
    this.name = 'LLMError'
  }
}
