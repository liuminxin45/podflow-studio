const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
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
  updateWorkflowState: (workflowId, patch) => ipcRenderer.invoke('workflow:updateState', workflowId, patch),
  runWorkflowNodes: (workflowId, nodeNames) => ipcRenderer.invoke('workflow:runNodes', workflowId, nodeNames),
  saveRecording: (payload) => ipcRenderer.invoke('recording:save', payload),
  openPath: (targetPath) => ipcRenderer.invoke('file:openPath', targetPath),
  showItemInFolder: (targetPath) => ipcRenderer.invoke('file:showItemInFolder', targetPath),
  readImageAsDataUrl: (targetPath) => ipcRenderer.invoke('file:readImageAsDataUrl', targetPath),
  onWorkflowUpdate: (callback) => ipcRenderer.on('workflow:update', (_, data) => callback(data)),
  onNeedApproval: (callback) => ipcRenderer.on('workflow:needApproval', (_, data) => callback(data)),
  onAppCloseRequest: (callback) => {
    const listener = () => callback()
    ipcRenderer.on('app:close-request', listener)
    return () => ipcRenderer.removeListener('app:close-request', listener)
  },
  confirmAppClose: () => ipcRenderer.invoke('app:confirmClose'),
  onRadarUpdate: (callback) => ipcRenderer.on('radar:update', (_, data) => callback(data)),
  getNodeSchema: (nodeName) => ipcRenderer.invoke('node:getSchema', nodeName),
  getAllNodeSchemas: () => ipcRenderer.invoke('node:getAllSchemas'),
  saveNodeConfig: (nodeName, config) => ipcRenderer.invoke('config:save', nodeName, config),
  loadNodeConfig: (nodeName) => ipcRenderer.invoke('config:load', nodeName),
  loadAllConfigs: () => ipcRenderer.invoke('config:loadAll'),
  deleteNodeConfig: (nodeName) => ipcRenderer.invoke('config:delete', nodeName),
  resetAllConfigs: () => ipcRenderer.invoke('config:resetAll'),
  getFetchSources: () => ipcRenderer.invoke('fetch:getSources'),
  radarGetState: () => ipcRenderer.invoke('radar:getState'),
  radarStart: (config) => ipcRenderer.invoke('radar:start', config),
  radarStop: () => ipcRenderer.invoke('radar:stop'),
  radarRunOnce: (config) => ipcRenderer.invoke('radar:runOnce', config),
  radarClearContents: () => ipcRenderer.invoke('radar:clearContents'),
  radarUpdateContents: (contents) => ipcRenderer.invoke('radar:updateContents', contents),
  trendradarStart: (intervalMin) => ipcRenderer.invoke('trendradar:start', intervalMin),
  trendradarStop: () => ipcRenderer.invoke('trendradar:stop'),
  trendradarStatus: () => ipcRenderer.invoke('trendradar:status'),
  trendradarGetStatus: () => ipcRenderer.invoke('trendradar:getStatus'),
  trendradarGetConfig: () => ipcRenderer.invoke('trendradar:getConfig'),
  trendradarSaveConfig: (config) => ipcRenderer.invoke('trendradar:saveConfig', config),
  trendradarListSources: () => ipcRenderer.invoke('trendradar:listSources'),
  trendradarRunOnce: (config) => ipcRenderer.invoke('trendradar:runOnce', config),
  trendradarGetLatest: () => ipcRenderer.invoke('trendradar:getLatest'),
  trendradarGetTopics: () => ipcRenderer.invoke('trendradar:getTopics'),
  trendradarCheckUpdate: () => ipcRenderer.invoke('trendradar:checkUpdate'),
  trendradarUpdateDependency: (options) => ipcRenderer.invoke('trendradar:updateDependency', options),
  trendradarOpenReport: (reportPath) => ipcRenderer.invoke('trendradar:openReport', reportPath),
  onTrendradarLog: (callback) => ipcRenderer.on('trendradar:log', (_, data) => callback(data)),
  onTrendradarStatus: (callback) => ipcRenderer.on('trendradar:status', (_, data) => callback(data)),
  produceGenerate: (payload) => ipcRenderer.invoke('produce:generate', payload),
  onProduceProgress: (callback) => ipcRenderer.on('produce:progress', (_, data) => callback(data)),
  removeProduceProgressListeners: () => {
    ipcRenderer.removeAllListeners('produce:progress')
  },
  llmCall: (params) => ipcRenderer.invoke('llm:call', params),
  llmFetchModels: (params) => ipcRenderer.invoke('llm:fetchModels', params),
  onLLMStreamChunk: (callback) => ipcRenderer.on('llm:stream:chunk', (_, data) => callback(data)),
  onLLMStreamDone: (callback) => ipcRenderer.on('llm:stream:done', () => callback()),
  onLLMStreamError: (callback) => ipcRenderer.on('llm:stream:error', (_, error) => callback(error)),
  removeLLMStreamListeners: () => {
    ipcRenderer.removeAllListeners('llm:stream:chunk')
    ipcRenderer.removeAllListeners('llm:stream:done')
    ipcRenderer.removeAllListeners('llm:stream:error')
  }
})
