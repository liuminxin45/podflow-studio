const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  appLog: (level, message) => ipcRenderer.invoke('app:log', { level, message }),
  runtimePing: () => ipcRenderer.invoke('runtime:ping'),
  notifyRendererReady: (payload) => ipcRenderer.invoke('runtime:rendererReady', payload),
  createWorkflow: (config) => ipcRenderer.invoke('workflow:create', config),
  getWorkflow: (workflowId) => ipcRenderer.invoke('workflow:get', workflowId),
  listWorkflows: () => ipcRenderer.invoke('workflow:list'),
  openWorkflow: (workflowId) => ipcRenderer.invoke('workflow:open', workflowId),
  saveWorkflow: (workflowId) => ipcRenderer.invoke('workflow:save', workflowId),
  closeWorkflow: (workflowId) => ipcRenderer.invoke('workflow:close', workflowId),
  updateWorkflowMeta: (workflowId, meta) => ipcRenderer.invoke('workflow:updateMeta', workflowId, meta),
  duplicateWorkflow: (workflowId) => ipcRenderer.invoke('workflow:duplicate', workflowId),
  deleteWorkflow: (workflowId) => ipcRenderer.invoke('workflow:delete', workflowId),
  exportWorkflow: (workflowId) => ipcRenderer.invoke('workflow:export', workflowId),
  importWorkflow: () => ipcRenderer.invoke('workflow:import'),
  approveNode: (workflowId, nodeName, approved, modifiedOutput) => 
    ipcRenderer.invoke('workflow:approve', workflowId, nodeName, approved, modifiedOutput),
  approveAudio: (workflowId, input) => ipcRenderer.invoke('workflow:approveAudio', workflowId, input),
  setAppDirtyState: (dirty) => ipcRenderer.invoke('app:setDirtyState', dirty),
  updateWorkflowState: (workflowId, patch) => ipcRenderer.invoke('workflow:updateState', workflowId, patch),
  appendWorkflowLogs: (workflowId, entries) => ipcRenderer.invoke('workflow:appendLogs', workflowId, entries),
  clearWorkflowLogs: (workflowId) => ipcRenderer.invoke('workflow:clearLogs', workflowId),
  runWorkflowNodes: (workflowId, nodeNames) => ipcRenderer.invoke('workflow:runNodes', workflowId, nodeNames),
  previewWorkflowRerun: (workflowId, nodeName) => ipcRenderer.invoke('workflow:previewRerun', workflowId, nodeName),
  rerunWorkflowStage: (workflowId, nodeName) => ipcRenderer.invoke('workflow:rerunStage', workflowId, nodeName),
  updatePlayback: (workflowId, patch) => ipcRenderer.invoke('workflow:updatePlayback', workflowId, patch),
  getMediaUrl: (workflowId) => ipcRenderer.invoke('media:getUrl', workflowId),
  listSeries: () => ipcRenderer.invoke('series:list'),
  upsertSeries: (series) => ipcRenderer.invoke('series:upsert', series),
  assignEpisodeToSeries: (seriesId, workflowId) => ipcRenderer.invoke('series:assignEpisode', seriesId, workflowId),
  reorderSeriesEpisodes: (seriesId, episodeIds) => ipcRenderer.invoke('series:reorderEpisodes', seriesId, episodeIds),
  generateSeriesFeed: (seriesId) => ipcRenderer.invoke('series:generateFeed', seriesId),
  discoverRun: (workflowId, config) => ipcRenderer.invoke('discover:run', workflowId, config),
  saveRecording: (payload) => ipcRenderer.invoke('recording:save', payload),
  openPath: (targetPath) => ipcRenderer.invoke('file:openPath', targetPath),
  showItemInFolder: (targetPath) => ipcRenderer.invoke('file:showItemInFolder', targetPath),
  openExternal: (targetUrl) => ipcRenderer.invoke('file:openExternal', targetUrl),
  readImageAsDataUrl: (targetPath) => ipcRenderer.invoke('file:readImageAsDataUrl', targetPath),
  selectAudioFile: () => ipcRenderer.invoke('file:selectAudio'),
  selectSeriesCover: () => ipcRenderer.invoke('file:selectSeriesCover'),
  onWorkflowUpdate: (callback) => {
    const listener = (_, data) => callback(data)
    ipcRenderer.on('workflow:update', listener)
    return () => ipcRenderer.removeListener('workflow:update', listener)
  },
  onNeedApproval: (callback) => {
    const listener = (_, data) => callback(data)
    ipcRenderer.on('workflow:needApproval', listener)
    return () => ipcRenderer.removeListener('workflow:needApproval', listener)
  },
  saveNodeConfig: (nodeName, config) => ipcRenderer.invoke('config:save', nodeName, config),
  loadNodeConfig: (nodeName) => ipcRenderer.invoke('config:load', nodeName),
  loadAllConfigs: () => ipcRenderer.invoke('config:loadAll'),
  deleteNodeConfig: (nodeName) => ipcRenderer.invoke('config:delete', nodeName),
  resetAllConfigs: () => ipcRenderer.invoke('config:resetAll'),
  getFetchSources: () => ipcRenderer.invoke('fetch:getSources'),
  onDiscoverProgress: (callback) => {
    const listener = (_, data) => callback(data)
    ipcRenderer.on('discover:progress', listener)
    return () => ipcRenderer.removeListener('discover:progress', listener)
  },
  removeDiscoverProgressListeners: () => {
    ipcRenderer.removeAllListeners('discover:progress')
  },
  detectLocalAgents: () => ipcRenderer.invoke('aiTargets:detectLocalAgents'),
  aiRunTask: (request) => ipcRenderer.invoke('ai:runTask', request),
  aiCancelTask: (requestId) => ipcRenderer.invoke('ai:cancelTask', requestId),
  onAITaskEvent: (callback) => {
    const listener = (_event, taskEvent) => callback(taskEvent)
    ipcRenderer.on('ai:taskEvent', listener)
    return () => ipcRenderer.removeListener('ai:taskEvent', listener)
  },
  listDoubaoVoices: (params) => ipcRenderer.invoke('doubao:listVoices', params),
  tavilySearch: (params) => ipcRenderer.invoke('search:tavily', params),
  bochaSearch: (params) => ipcRenderer.invoke('search:bocha', params),
  doubaoSearch: (params) => ipcRenderer.invoke('search:doubao', params),
  searchCancel: (requestId) => ipcRenderer.invoke('search:cancel', requestId)
})
