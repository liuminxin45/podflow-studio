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

export interface AITaskInputs {
  'discover.classify_news': { titles: string[]; categories: Array<{ id: string; label: string }> }
  'discover.analyze_topic': { topic: string; items: object[] }
  'organize.plan_research': { topic: string; is_deep_dive: boolean; query_limit: number; sources: object[] }
  'organize.expand_knowledge': { topic: string; is_deep_dive: boolean; mode: 'hybrid' | 'web_only' | 'ai_knowledge'; research_plan: object; sources: object[] }
  'organize.assess_evidence': { core_subject: string; report_type: 'event' | 'explanatory' | 'trend'; research_tasks: object[]; knowledge_candidates: object[]; results: object[] }
  'organize.synthesize_research': { topic: string; core_subject: string; report_type: 'event' | 'explanatory' | 'trend'; is_deep_dive: boolean; sources: object[]; knowledge_candidates: object[] }
  'organize.verify_claim': { statement: string; web_results: object[] }
  'organize.ai_web_search': { query: string; time_requirement: string; max_results: number }
  'organize.verify_web_search': { date: string; minimum_results: number }
  'organize.select_deep_dive': { user_topic: string; preferred_unit_id?: number; candidates: object[] }
  'organize.plan_deep_dive': { user_topic: string; core_question: string; listener_value: string; source_material: object[]; probe_results: object[] }
  'organize.screen_deep_dive_evidence': { source_material: object[]; research_tasks: object[]; results: object[] }
  'organize.build_deep_dive_brief': { core_question: string; why_interesting: string; listener_value: string; evidence: object[] }
  'writing.optimize_quick_news': { request: unknown }
  'settings.connection_test': { probe: 'ready' }
}

type GenericTaskOutput = Record<string, unknown>

export interface AITaskOutputs {
  'discover.classify_news': { categories: string[] }
  'discover.analyze_topic': { items: Array<{ index: number; score: number; decision: 'keep' | 'drop'; reason: string; angle: string }> }
  'organize.plan_research': GenericTaskOutput
  'organize.expand_knowledge': GenericTaskOutput
  'organize.assess_evidence': GenericTaskOutput
  'organize.synthesize_research': GenericTaskOutput
  'organize.verify_claim': { supportedIndexes: number[]; relation: string; limitations: string[] }
  'organize.ai_web_search': { results: unknown[] }
  'organize.verify_web_search': { results: unknown[] }
  'organize.select_deep_dive': GenericTaskOutput
  'organize.plan_deep_dive': GenericTaskOutput
  'organize.screen_deep_dive_evidence': GenericTaskOutput
  'organize.build_deep_dive_brief': GenericTaskOutput
  'writing.optimize_quick_news': { title: string; suggested_text: string; source_fact_ids: string[]; change_summary: string[]; unsupported_or_uncertain: string[]; quality_checks: Record<string, boolean> }
  'settings.connection_test': { ok: true; message: string }
}

export type AITaskId = keyof AITaskInputs & keyof AITaskOutputs

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
