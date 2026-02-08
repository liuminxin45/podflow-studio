const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  createWorkflow: (config) => ipcRenderer.invoke('workflow:create', config),
  getWorkflow: (workflowId) => ipcRenderer.invoke('workflow:get', workflowId),
  approveNode: (workflowId, nodeName, approved, modifiedOutput) => 
    ipcRenderer.invoke('workflow:approve', workflowId, nodeName, approved, modifiedOutput),
  onWorkflowUpdate: (callback) => ipcRenderer.on('workflow:update', (_, data) => callback(data)),
  getNodeSchema: (nodeName) => ipcRenderer.invoke('node:getSchema', nodeName),
  getAllNodeSchemas: () => ipcRenderer.invoke('node:getAllSchemas')
})
