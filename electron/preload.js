const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  appLog: (level, message) => ipcRenderer.invoke('app:log', { level, message }),
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
  setAppDirtyState: (dirty) => ipcRenderer.invoke('app:setDirtyState', dirty),
  updateWorkflowState: (workflowId, patch) => ipcRenderer.invoke('workflow:updateState', workflowId, patch),
  appendWorkflowLogs: (workflowId, entries) => ipcRenderer.invoke('workflow:appendLogs', workflowId, entries),
  runWorkflowNodes: (workflowId, nodeNames) => ipcRenderer.invoke('workflow:runNodes', workflowId, nodeNames),
  discoverRun: (workflowId, config) => ipcRenderer.invoke('discover:run', workflowId, config),
  saveRecording: (payload) => ipcRenderer.invoke('recording:save', payload),
  openPath: (targetPath) => ipcRenderer.invoke('file:openPath', targetPath),
  showItemInFolder: (targetPath) => ipcRenderer.invoke('file:showItemInFolder', targetPath),
  readImageAsDataUrl: (targetPath) => ipcRenderer.invoke('file:readImageAsDataUrl', targetPath),
  selectAudioFile: () => ipcRenderer.invoke('file:selectAudio'),
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
  llmCall: (params) => ipcRenderer.invoke('llm:call', params),
  llmCancel: (requestId) => ipcRenderer.invoke('llm:cancel', requestId),
  llmFetchModels: (params) => ipcRenderer.invoke('llm:fetchModels', params),
  listDoubaoVoices: (params) => ipcRenderer.invoke('doubao:listVoices', params),
  tavilySearch: (params) => ipcRenderer.invoke('search:tavily', params),
  bochaSearch: (params) => ipcRenderer.invoke('search:bocha', params),
  searchCancel: (requestId) => ipcRenderer.invoke('search:cancel', requestId),
  onLLMStreamEvent: (callback) => ipcRenderer.on('llm:stream:event', (_, data) => callback(data)),
  onLLMStreamChunk: (callback) => ipcRenderer.on('llm:stream:chunk', (_, data) => callback(data)),
  onLLMStreamDone: (callback) => ipcRenderer.on('llm:stream:done', () => callback()),
  onLLMStreamError: (callback) => ipcRenderer.on('llm:stream:error', (_, error) => callback(error)),
  removeLLMStreamListeners: () => {
    ipcRenderer.removeAllListeners('llm:stream:event')
    ipcRenderer.removeAllListeners('llm:stream:chunk')
    ipcRenderer.removeAllListeners('llm:stream:done')
    ipcRenderer.removeAllListeners('llm:stream:error')
  }
})
