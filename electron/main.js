const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')
const { spawn } = require('child_process')
const ConfigManager = require('./configManager')
const { validateNodeOutput } = require('./nodeValidator')

let mainWindow = null
let configManager = null

// Python workflow state
let currentWorkflow = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  })

  // Load React app
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }
}

// Run Python node as subprocess with timeout and error handling
function runPythonNode(nodeName, state, timeoutMs = 600000) {  // 增加到10分钟
  return new Promise((resolve, reject) => {
    const pythonPath = process.platform === 'win32' ? 'python' : 'python3'
    const proc = spawn(pythonPath, ['-m', `nodes.${nodeName}`], {
      cwd: path.join(__dirname, '..'),
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
    })

    let stdout = ''
    let stderr = ''
    let killed = false

    const timeout = setTimeout(() => {
      killed = true
      proc.kill('SIGTERM')
      setTimeout(() => proc.kill('SIGKILL'), 5000)
      reject(new Error(`Node ${nodeName} timeout after ${timeoutMs / 1000}s`))
    }, timeoutMs)

    proc.stdout.on('data', (data) => {
      stdout += data.toString()
    })

    proc.stderr.on('data', (data) => {
      stderr += data.toString()
    })

    proc.on('error', (err) => {
      clearTimeout(timeout)
      if (!killed) {
        reject(new Error(`Failed to spawn node ${nodeName}: ${err.message}`))
      }
    })

    proc.on('close', (code) => {
      clearTimeout(timeout)
      if (killed) return

      if (code !== 0) {
        reject(new Error(`Node ${nodeName} exited with code ${code}: ${stderr || 'No error output'}`))
      } else {
        try {
          const result = JSON.parse(stdout)
          resolve(result)
        } catch (e) {
          reject(new Error(`Failed to parse JSON from ${nodeName}: ${e.message}\nOutput: ${stdout.slice(0, 200)}`))
        }
      }
    })

    try {
      proc.stdin.write(JSON.stringify(state))
      proc.stdin.end()
    } catch (err) {
      clearTimeout(timeout)
      proc.kill()
      reject(new Error(`Failed to write input to ${nodeName}: ${err.message}`))
    }
  })
}

// IPC handlers
ipcMain.handle('workflow:create', async (event, config) => {
  if (currentWorkflow && currentWorkflow.status === 'running') {
    throw new Error('A workflow is already running. Please wait for it to complete.')
  }

  const workflowId = Date.now().toString()
  const episodeId = `ep_${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '_')}`
  
  currentWorkflow = {
    id: workflowId,
    state: {
      episode_id: episodeId,
      created_at: new Date().toISOString(),
      runtime_config: config || {},
      logs: [],
      errors: [],
      fetch_contents: [],
      manual_contents: [],
      raw_contents: [],
      cleaned_contents: [],
      researched_contents: [],
      selected_topic: {},
      selected_materials: [],
      script: {},
      stages: [],
      audio_segments: [],
      final_audio_path: '',
      audio_metadata: {},
      cover_path: '',
      intro_outro_paths: {},
      storage_info: {},
      rss_path: '',
      publish_status: {},
      subtitle_path: ''
    },
    status: 'running',
    currentNode: null,
    nodeExecutions: {},
    approvals: {}
  }

  if (mainWindow) {
    mainWindow.webContents.send('workflow:update', currentWorkflow)
  }

  setImmediate(() => runWorkflow(workflowId))

  return { workflowId, episodeId }
})

ipcMain.handle('workflow:get', async (event, workflowId) => {
  return currentWorkflow
})

ipcMain.handle('workflow:approve', async (event, workflowId, nodeName, approved, modifiedOutput) => {
  if (approved && modifiedOutput) {
    Object.assign(currentWorkflow.state, modifiedOutput)
  }
  currentWorkflow.approvals = currentWorkflow.approvals || {}
  currentWorkflow.approvals[nodeName] = approved ? 'approved' : 'rejected'
  
  if (approved) {
    // Resume workflow
    runWorkflow(workflowId, nodeName)
  }
  
  return { status: 'ok' }
})

ipcMain.handle('node:getSchema', async (event, nodeName) => {
  return new Promise((resolve, reject) => {
    const pythonPath = process.platform === 'win32' ? 'python' : 'python3'
    const proc = spawn(pythonPath, [
      path.join(__dirname, '..', 'scripts', 'extract_node_schemas.py'),
      nodeName
    ], {
      cwd: path.join(__dirname, '..'),
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
    })

    let stdout = ''
    let stderr = ''

    proc.stdout.on('data', (data) => {
      stdout += data.toString()
    })

    proc.stderr.on('data', (data) => {
      stderr += data.toString()
    })

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Failed to get schema for ${nodeName}: ${stderr}`))
      } else {
        try {
          const schema = JSON.parse(stdout)
          resolve(schema)
        } catch (e) {
          reject(new Error(`Failed to parse schema JSON: ${e.message}`))
        }
      }
    })
  })
})

ipcMain.handle('node:getAllSchemas', async (event) => {
  return new Promise((resolve, reject) => {
    const pythonPath = process.platform === 'win32' ? 'python' : 'python3'
    const proc = spawn(pythonPath, [
      path.join(__dirname, '..', 'scripts', 'extract_node_schemas.py')
    ], {
      cwd: path.join(__dirname, '..'),
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
    })

    let stdout = ''
    let stderr = ''

    proc.stdout.on('data', (data) => {
      stdout += data.toString()
    })

    proc.stderr.on('data', (data) => {
      stderr += data.toString()
    })

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Failed to get all schemas: ${stderr}`))
      } else {
        try {
          const schemas = JSON.parse(stdout)
          resolve(schemas)
        } catch (e) {
          reject(new Error(`Failed to parse schemas JSON: ${e.message}`))
        }
      }
    })
  })
})

// Config management handlers
ipcMain.handle('config:save', async (event, nodeName, config) => {
  if (!configManager) {
    return { success: false, error: 'Config manager not initialized' }
  }
  return configManager.saveNodeConfig(nodeName, config)
})

ipcMain.handle('config:load', async (event, nodeName) => {
  if (!configManager) {
    return null
  }
  return configManager.loadNodeConfig(nodeName)
})

ipcMain.handle('config:loadAll', async (event) => {
  if (!configManager) {
    return {}
  }
  return configManager.loadAllConfigs()
})

ipcMain.handle('config:delete', async (event, nodeName) => {
  if (!configManager) {
    return { success: false, error: 'Config manager not initialized' }
  }
  return configManager.deleteNodeConfig(nodeName)
})

ipcMain.handle('config:resetAll', async (event) => {
  if (!configManager) {
    return { success: false, error: 'Config manager not initialized' }
  }
  return configManager.resetAllConfigs()
})

// Fetch sources management
ipcMain.handle('fetch:getSources', async (event) => {
  return new Promise((resolve, reject) => {
    const pythonPath = process.platform === 'win32' ? 'python' : 'python3'
    const proc = spawn(pythonPath, [
      path.join(__dirname, '..', 'scripts', 'get_fetch_sources.py')
    ], {
      cwd: path.join(__dirname, '..'),
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
    })

    let stdout = ''
    let stderr = ''

    proc.stdout.on('data', (data) => {
      stdout += data.toString()
    })

    proc.stderr.on('data', (data) => {
      stderr += data.toString()
    })

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Failed to get fetch sources: ${stderr}`))
      } else {
        try {
          const sources = JSON.parse(stdout)
          resolve(sources)
        } catch (e) {
          reject(new Error(`Failed to parse sources JSON: ${e.message}`))
        }
      }
    })
  })
})

async function runWorkflow(workflowId, resumeFrom = null) {
  // 6-stage creator workflow: 发现 → 整理 → 构思 → 写作 → 制作 → 发布
  // Each stage groups internal sub-nodes
  const nodes = [
    'fetch', 'manual', 'merge',           // 发现 (discover)
    'preprocess',                          // 整理 (organize)
    'research', 'topic_selection',         // 构思 (ideate) — creation studio
    'script',                              // 写作 (write)
    'tts', 'audio_postprocess', 'assets',  // 制作 (produce)
    'review',                              // 发布 (publish) — pre-publish check
    'publish'                              // 发布 (publish) — store + distribute
  ]

  let startIndex = resumeFrom ? nodes.indexOf(resumeFrom) : 0

  for (let i = startIndex; i < nodes.length; i++) {
    const nodeName = nodes[i]
    
    currentWorkflow.currentNode = nodeName
    currentWorkflow.nodeExecutions[nodeName] = {
      status: 'running',
      startedAt: new Date().toISOString()
    }

    if (mainWindow) {
      mainWindow.webContents.send('workflow:update', currentWorkflow)
    }

    try {
      // 加载节点配置
      const nodeConfig = configManager ? configManager.loadNodeConfig(nodeName) : null
      
      // 如果有配置，将其添加到state中传递给Python节点
      if (nodeConfig) {
        currentWorkflow.state.runtime_config = currentWorkflow.state.runtime_config || {}
        currentWorkflow.state.runtime_config[nodeName] = nodeConfig
      }
      
      const startTime = Date.now()
      const result = await runPythonNode(nodeName, currentWorkflow.state)
      const duration = (Date.now() - startTime) / 1000

      if (!result || typeof result !== 'object') {
        throw new Error(`Invalid result from ${nodeName}: expected object, got ${typeof result}`)
      }

      currentWorkflow.state = result
      
      validateNodeOutput(nodeName, result)
      
      currentWorkflow.nodeExecutions[nodeName] = {
        status: 'completed',
        startedAt: currentWorkflow.nodeExecutions[nodeName].startedAt,
        completedAt: new Date().toISOString(),
        duration
      }

      if (result.errors && result.errors.length > 0) {
        console.warn(`Node ${nodeName} completed with errors:`, result.errors)
      }

      if (mainWindow) {
        mainWindow.webContents.send('workflow:update', currentWorkflow)
      }

      // 检查是否需要审批（针对script节点）
      if (nodeName === 'script' && !currentWorkflow.approvals?.script) {
        // 加载script节点配置，检查是否需要审批
        const scriptConfig = configManager ? configManager.loadNodeConfig('script') : null
        console.log('[Approval Check] Script config:', scriptConfig)
        const requireApproval = scriptConfig?.require_approval ?? false
        console.log('[Approval Check] Require approval:', requireApproval)

        if (requireApproval) {
          console.log('[Approval] Pausing workflow for approval')
          currentWorkflow.status = 'waiting_approval'
          currentWorkflow.nodeExecutions[nodeName].status = 'waiting_approval'
          
          if (mainWindow) {
            mainWindow.webContents.send('workflow:update', currentWorkflow)
            // 发送审批请求事件
            console.log('[Approval] Sending needApproval event to frontend')
            mainWindow.webContents.send('workflow:needApproval', {
              workflowId,
              nodeName,
              data: currentWorkflow.state
            })
          }
          return // 暂停工作流，等待审批
        } else {
          console.log('[Approval] Auto-approval mode, continuing workflow')
        }
      }
    } catch (error) {
      console.error(`Node ${nodeName} failed:`, error)
      
      currentWorkflow.nodeExecutions[nodeName] = {
        status: 'failed',
        startedAt: currentWorkflow.nodeExecutions[nodeName].startedAt,
        completedAt: new Date().toISOString(),
        error: error.message,
        errorStack: error.stack
      }
      currentWorkflow.status = 'failed'
      currentWorkflow.state.errors = currentWorkflow.state.errors || []
      currentWorkflow.state.errors.push({
        node: nodeName,
        message: error.message,
        timestamp: new Date().toISOString()
      })

      if (mainWindow) {
        mainWindow.webContents.send('workflow:update', currentWorkflow)
      }
      return
    }
  }

  currentWorkflow.status = 'completed'
  if (mainWindow) {
    mainWindow.webContents.send('workflow:update', currentWorkflow)
  }
}

app.whenReady().then(() => {
  configManager = new ConfigManager()
  createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})
