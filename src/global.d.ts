import type { Workflow, WorkflowCreateResult } from './types/workflow'

interface LLMCallParams {
  apiBase: string
  apiKey: string
  model: string
  messages: Array<{ role: string; content: string }>
  temperature?: number
  maxTokens?: number
  timeout?: number
}

interface LLMResponse {
  choices: Array<{
    message: {
      content: string
    }
  }>
}

interface ProduceGeneratePayload {
  episodeId?: string
  voiceProvider?: 'edge_tts' | 'doubao_tts' | 'voice_clone'
  speedLevel?: 'slower' | 'normal' | 'faster'
  segments: Array<{
    id: string
    type: string
    label: string
    content: string
    estimatedSeconds: number
  }>
  providerConfig?: {
    provider?: string
    apiBase?: string
    apiKey?: string
    model?: string
    requestTimeoutSec?: number
    doubaoAppId?: string
    doubaoAccessToken?: string
    doubaoCluster?: string
    doubaoVoiceType?: string
    doubaoEndpoint?: string
  }
}

interface ProduceGenerateResult {
  episodeId: string
  providerRequested: string
  providerApplied: string
  warnings: string[]
  audioSegments: string[]
  finalAudioPath: string
  audioMetadata: Record<string, unknown>
  logs: Array<{ level?: string; message: string }>
  errors: Array<{ node?: string; message: string }>
}

interface ProduceProgressData {
  episodeId: string
  stage: string
  status: 'running' | 'completed' | 'failed'
  progress: number
  detail: string
}

interface ElectronAPI {
  createWorkflow: (config: Record<string, unknown>) => Promise<WorkflowCreateResult>
  getWorkflow: (id: string) => Promise<Workflow | null>
  approveNode: (workflowId: string, nodeName: string, approved: boolean, modifiedOutput?: unknown) => Promise<{ status: string }>
  onWorkflowUpdate: (callback: (data: Workflow) => void) => void
  onNeedApproval: (callback: (data: unknown) => void) => void
  onRadarUpdate: (callback: (data: unknown) => void) => void
  getNodeSchema: (nodeName: string) => Promise<unknown>
  getAllNodeSchemas: () => Promise<unknown>
  saveNodeConfig: (nodeName: string, config: unknown) => Promise<{ success: boolean; error?: string }>
  loadNodeConfig: (nodeName: string) => Promise<unknown>
  loadAllConfigs: () => Promise<Record<string, unknown>>
  deleteNodeConfig: (nodeName: string) => Promise<{ success: boolean; error?: string }>
  resetAllConfigs: () => Promise<{ success: boolean; error?: string }>
  getFetchSources: () => Promise<unknown[]>
  radarGetState: () => Promise<unknown>
  radarStart: (config: unknown) => Promise<unknown>
  radarStop: () => Promise<unknown>
  radarRunOnce: (config: unknown) => Promise<unknown>
  radarClearContents: () => Promise<unknown>
  radarUpdateContents: (contents: unknown[]) => Promise<unknown>
  trendradarStart: (intervalMin: number) => Promise<unknown>
  trendradarStop: () => Promise<unknown>
  trendradarStatus: () => Promise<unknown>
  onTrendradarLog: (callback: (data: unknown) => void) => void
  onTrendradarStatus: (callback: (data: unknown) => void) => void
  produceGenerate: (payload: ProduceGeneratePayload) => Promise<ProduceGenerateResult>
  onProduceProgress: (callback: (data: ProduceProgressData) => void) => void
  removeProduceProgressListeners: () => void
  llmCall: (params: LLMCallParams) => Promise<LLMResponse>
  llmFetchModels: (params: { apiBase: string; apiKey: string }) => Promise<unknown>
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}

export {}
