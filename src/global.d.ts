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

interface ElectronAPI {
  createWorkflow: (config: Record<string, any>) => Promise<WorkflowCreateResult>
  getWorkflow: (id: string) => Promise<Workflow | null>
  approveNode: (workflowId: string, nodeName: string, approved: boolean, modifiedOutput?: any) => Promise<{ status: string }>
  onWorkflowUpdate: (callback: (data: Workflow) => void) => void
  onNeedApproval: (callback: (data: any) => void) => void
  onRadarUpdate: (callback: (data: any) => void) => void
  getNodeSchema: (nodeName: string) => Promise<any>
  getAllNodeSchemas: () => Promise<any>
  saveNodeConfig: (nodeName: string, config: any) => Promise<{ success: boolean; error?: string }>
  loadNodeConfig: (nodeName: string) => Promise<any>
  loadAllConfigs: () => Promise<Record<string, any>>
  deleteNodeConfig: (nodeName: string) => Promise<{ success: boolean; error?: string }>
  resetAllConfigs: () => Promise<{ success: boolean; error?: string }>
  getFetchSources: () => Promise<any[]>
  radarGetState: () => Promise<any>
  radarStart: (config: any) => Promise<any>
  radarStop: () => Promise<any>
  radarRunOnce: (config: any) => Promise<any>
  radarClearContents: () => Promise<any>
  radarUpdateContents: (contents: any[]) => Promise<any>
  trendradarStart: (intervalMin: number) => Promise<any>
  trendradarStop: () => Promise<any>
  trendradarStatus: () => Promise<any>
  onTrendradarLog: (callback: (data: any) => void) => void
  onTrendradarStatus: (callback: (data: any) => void) => void
  llmCall: (params: LLMCallParams) => Promise<LLMResponse>
  llmFetchModels: (params: { apiBase: string; apiKey: string }) => Promise<any>
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}

export {}
