import type {
  ContentItem,
  PlaybackState,
  RecoveryPlan,
  Series,
  Workflow,
  WorkflowCreateResult,
  WorkflowSummary,
} from './types/workflow'

declare global {
  interface DiscoverProgressData {
    runId: string
    type: string
    sourceId?: string
    sourceName?: string
    sourceIndex?: number
    sources?: string[]
    totalSources?: number
    items?: ContentItem[]
    itemCount?: number
    rawCount?: number
    duration?: number
    message?: string
    detail?: string
    timestamp?: string
  }

  interface FetchSource {
    id: string
    name: string
    description: string
  }

  interface ElectronAPI {
    appLog: (level: 'log' | 'warning' | 'error', message: string) => Promise<{ success: boolean }>
    runtimePing: () => Promise<{
      sessionId: string | null
      pid: number
      version: string
      userDataDir: string
      dataDir: string | null
      artifactDir: string | null
      windowMode: string
      cdpUrl: string | null
    }>
    notifyRendererReady: (payload: {
      title: string
      href: string
      readyState: string
    }) => Promise<{
      sessionId: string | null
      pid: number
      version: string
      userDataDir: string
      dataDir: string | null
      artifactDir: string | null
      windowMode: string
      cdpUrl: string | null
      title: string
      href: string
      readyState: string
    }>
    createWorkflow: (config: Record<string, any>) => Promise<WorkflowCreateResult>
    getWorkflow: (id: string) => Promise<Workflow | null>
    listWorkflows: () => Promise<WorkflowSummary[]>
    openWorkflow: (id: string) => Promise<Workflow>
    saveWorkflow: (id: string) => Promise<Workflow>
    closeWorkflow: (id: string) => Promise<{ success: boolean }>
    updateWorkflowMeta: (
      id: string,
      meta: { title: string; description: string }
    ) => Promise<Workflow>
    duplicateWorkflow: (id: string) => Promise<Workflow>
    deleteWorkflow: (id: string) => Promise<{ success: boolean }>
    exportWorkflow: (id: string) => Promise<{ success: boolean; canceled?: boolean; path?: string }>
    importWorkflow: () => Promise<{
      success: boolean
      canceled?: boolean
      workflow?: Workflow
      summary?: WorkflowSummary
    }>
    approveNode: (workflowId: string, nodeName: string, approved: boolean, modifiedOutput?: any) => Promise<{ status: string }>
    approveAudio: (workflowId: string, input: {
      reviewer: string
      notes?: string
      fullListenConfirmed: boolean
      pronunciationConfirmed: boolean
      editorialFinalConfirmed: boolean
    }) => Promise<Workflow>
    setAppDirtyState: (dirty: boolean) => Promise<{ success: boolean }>
    updateWorkflowState: (id: string, patch: Record<string, any>) => Promise<Workflow>
    appendWorkflowLogs: (id: string, entries: string[]) => Promise<Workflow>
    clearWorkflowLogs: (id: string) => Promise<Workflow>
    runWorkflowNodes: (id: string, nodeNames: string[]) => Promise<Workflow>
    previewWorkflowRerun: (id: string, nodeName: string) => Promise<RecoveryPlan>
    rerunWorkflowStage: (id: string, nodeName: string) => Promise<Workflow>
    updatePlayback: (id: string, patch: Partial<PlaybackState>) => Promise<PlaybackState>
    getMediaUrl: (id: string) => Promise<{ url: string }>
    listSeries: () => Promise<Series[]>
    upsertSeries: (series: Partial<Series> & { title: string }) => Promise<Series>
    assignEpisodeToSeries: (seriesId: string, workflowId: string) => Promise<{ series: Series; workflow: Workflow }>
    reorderSeriesEpisodes: (seriesId: string, episodeIds: string[]) => Promise<Series>
    generateSeriesFeed: (seriesId: string) => Promise<{
      feedPath: string
      episodeCount: number
      localPreviewOnly: boolean
      validation: { ok: boolean; warnings: string[] }
    }>
    discoverRun: (id: string, config: Record<string, any>) => Promise<Workflow>
    saveRecording: (payload: {
      episodeId: string
      segmentId: string
      mimeType: string
      durationSeconds: number
      data: ArrayBuffer
    }) => Promise<{ success: boolean; path: string; size: number; mimeType: string; durationSeconds: number }>
    openPath: (targetPath: string) => Promise<{ success: boolean; error?: string }>
    showItemInFolder: (targetPath: string) => Promise<{ success: boolean; error?: string }>
    openExternal: (targetUrl: string) => Promise<{ success: boolean; error?: string }>
    readImageAsDataUrl: (targetPath: string) => Promise<{
      success: boolean
      error?: string
      path?: string
      size?: number
      mimeType?: string
      dataUrl?: string
    }>
    selectAudioFile: () => Promise<{ success: boolean; canceled?: boolean; path?: string }>
    selectSeriesCover: () => Promise<{
      success: boolean
      canceled?: boolean
      error?: string
      path?: string
      width?: number
      height?: number
    }>
    onWorkflowUpdate: (callback: (data: Workflow | null) => void) => (() => void) | void
    onNeedApproval: (callback: (data: any) => void) => (() => void) | void
    saveNodeConfig: (nodeName: string, config: Record<string, any>) => Promise<{ success: boolean; error?: string }>
    loadNodeConfig: (nodeName: string) => Promise<Record<string, any> | null>
    loadAllConfigs: () => Promise<Record<string, Record<string, any>>>
    deleteNodeConfig: (nodeName: string) => Promise<{ success: boolean; error?: string }>
    resetAllConfigs: () => Promise<{ success: boolean; error?: string }>
    getFetchSources: () => Promise<FetchSource[]>
    onDiscoverProgress: (callback: (data: DiscoverProgressData) => void) => (() => void) | void
    removeDiscoverProgressListeners: () => void
    detectLocalAgents: () => Promise<Array<{
      id: string
      name: string
      command: string
      version: string
      available: boolean
      statusText: string
    }>>
    aiRunTask: (request: import('./types/llm').AITaskRequest) => Promise<import('./types/llm').AITaskResult>
    aiCancelTask: (requestId: string) => Promise<{ success: boolean }>
    onAITaskEvent: (callback: (event: import('./types/llm').AITaskEvent) => void) => () => void
    listDoubaoVoices: (params: {
      kind: 'preset' | 'clone'
      appId?: string
      accessKey: string
      secretKey: string
    }) => Promise<Array<{
      id: string
      name: string
      description: string
      status: string
      resourceId: string
      previewUrl: string
    }>>
    tavilySearch?: (params: {
      requestId?: string
      apiBase: string
      apiKey: string
      query: string
      topic?: 'news' | 'general' | 'finance'
      timeRange?: 'day' | 'week' | 'month' | 'year' | ''
      maxResults?: number
    }) => Promise<{
      provider: 'tavily'
      query: string
      responseTime?: number
      results: Array<{ id: string; title: string; url: string; excerpt: string; publishedAt?: string; relevance?: number }>
    }>
    bochaSearch?: (params: {
      requestId?: string
      apiBase: string
      apiKey: string
      query: string
      timeRange?: 'day' | 'week' | 'month' | 'year' | ''
      maxResults?: number
    }) => Promise<{
      provider: 'bocha'
      query: string
      results: Array<{ id: string; title: string; url: string; excerpt: string; publishedAt?: string }>
    }>
    doubaoSearch?: (params: {
      requestId?: string
      apiBase: string
      apiKey: string
      query: string
      timeRange?: 'day' | 'week' | 'month' | 'year' | ''
      maxResults?: number
    }) => Promise<{
      provider: 'doubao_search'
      query: string
      results: Array<{ id: string; title: string; url: string; excerpt: string; publishedAt?: string }>
    }>
    searchCancel?: (requestId: string) => Promise<{ success: boolean }>
  }

  interface Window {
    electronAPI: ElectronAPI
    __DEBUG_MODE__?: boolean
  }
}

export {}
