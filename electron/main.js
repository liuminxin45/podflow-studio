const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron')
const path = require('path')
const fs = require('fs')
const { spawn } = require('child_process')
const ConfigManager = require('./configManager')
const { validateNodeOutput } = require('./nodeValidator')
const { fetchModels, callLLM } = require('./llmService')
const { PROVIDER_TO_ENGINE, buildTTSConfig, validateProviderConfig, buildStages } = require('./services/providerConfigBuilder')

const PYTHON_PATH = process.platform === 'win32' ? 'python' : 'python3'
const PROJECT_ROOT = path.join(__dirname, '..')
function resolveTrendRadarPythonPath() {
  const explicit = process.env.TRENDRADAR_PYTHON_PATH || process.env.TREND_RADAR_PYTHON_PATH
  if (explicit) return explicit
  const managedPython = process.platform === 'win32'
    ? path.join(PROJECT_ROOT, '.venv-trendradar', 'Scripts', 'python.exe')
    : path.join(PROJECT_ROOT, '.venv-trendradar', 'bin', 'python')
  if (fs.existsSync(managedPython)) return managedPython
  return PYTHON_PATH
}
const TRENDRADAR_PYTHON_PATH = resolveTrendRadarPythonPath()
const SPAWN_SHELL = process.platform === 'win32'
const CDP_DEBUG_ENABLED = process.env.CDP_DEBUG === '1' || process.env.CDP_ACCEPTANCE === '1'
const CDP_PORT = process.env.CDP_PORT || process.env.CDP_ACCEPTANCE_PORT || (CDP_DEBUG_ENABLED ? '9222' : '')
const CDP_HOST = process.env.CDP_HOST || '127.0.0.1'
const ENABLE_FAKE_MEDIA = process.env.CDP_ACCEPTANCE === '1' || process.env.CDP_FAKE_MEDIA === '1'

if (CDP_PORT) {
  app.commandLine.appendSwitch('remote-debugging-port', String(CDP_PORT))
  app.commandLine.appendSwitch('remote-debugging-address', String(CDP_HOST))
  console.log(`[CDP] Remote debugging enabled at http://${CDP_HOST}:${CDP_PORT}`)
}

if (ENABLE_FAKE_MEDIA) {
  app.commandLine.appendSwitch('use-fake-device-for-media-stream')
  app.commandLine.appendSwitch('use-fake-ui-for-media-stream')
}

function getCleanSpawnEnv(extra = {}) {
  const env = { ...process.env }
  const proxyKeys = [
    'HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'NO_PROXY',
    'http_proxy', 'https_proxy', 'all_proxy', 'no_proxy',
  ]
  for (const key of proxyKeys) {
    delete env[key]
  }
  return {
    ...env,
    PYTHONIOENCODING: 'utf-8',
    NO_PROXY: '*',
    no_proxy: '*',
    ...extra,
  }
}

let mainWindow = null
let configManager = null

let currentWorkflow = null
const WORKFLOW_DIR = path.join(__dirname, '..', 'out', 'workflows')

// TrendRadar daemon process
let trendradarDaemon = null

const DEFAULT_RADAR_STATE = {
  enabled: false,
  intervalMin: 30,
  keepLast: 500,
  lastRunAt: null,
  lastError: null,
  lastNewCount: 0,
  lastFetchedCount: 0,
  running: false,
  runStartedAt: null,
  lastRunContents: [],
  contents: []
}

let radarState = { ...DEFAULT_RADAR_STATE }
let radarTimer = null

function broadcastWorkflowUpdate() {
  if (mainWindow) {
    mainWindow.webContents.send('workflow:update', currentWorkflow)
  }
}

function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
}

function mergeStatePatch(target, patch) {
  if (!isPlainObject(patch)) return target
  for (const [key, value] of Object.entries(patch)) {
    if (isPlainObject(value) && isPlainObject(target[key])) {
      target[key] = mergeStatePatch({ ...target[key] }, value)
    } else {
      target[key] = value
    }
  }
  return target
}

function sanitizePathPart(value, fallback = 'unknown') {
  const safe = String(value || '').replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_')
  return safe || fallback
}

function createInitialState(episodeId, runtimeConfig) {
  return {
    episode_id: episodeId,
    created_at: new Date().toISOString(),
    runtime_config: runtimeConfig || {},
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
    recording_segments: [],
    final_audio_path: '',
    audio_metadata: {},
    cover_path: '',
    intro_outro_paths: {},
    review_summary: {},
    storage_info: {},
    rss_path: '',
    publish_status: {},
    subtitle_path: '',
    trendradar_meta: {},
    discover_ui: {},
    organize_ui: {},
    episode_brief: {},
    writing_meta: {}
  }
}

function ensureWorkflowDir() {
  fs.mkdirSync(WORKFLOW_DIR, { recursive: true })
}

function workflowFilePath(workflowId) {
  return path.join(WORKFLOW_DIR, `${sanitizePathPart(workflowId)}.json`)
}

function resolveProjectPath(targetPath) {
  if (!targetPath) return ''
  return path.isAbsolute(targetPath)
    ? targetPath
    : path.join(__dirname, '..', targetPath)
}

function imageMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase()
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
  if (ext === '.webp') return 'image/webp'
  if (ext === '.gif') return 'image/gif'
  if (ext === '.svg') return 'image/svg+xml'
  return 'image/png'
}

function normalizeWorkflow(workflow) {
  if (!workflow || typeof workflow !== 'object') {
    throw new Error('Invalid workflow file')
  }
  const state = workflow.state || createInitialState(workflow.state?.episode_id, {})
  state.runtime_config = state.runtime_config || {}
  state.logs = state.logs || []
  state.errors = state.errors || []
  state.fetch_contents = state.fetch_contents || []
  state.manual_contents = state.manual_contents || []
  state.raw_contents = state.raw_contents || []
  state.cleaned_contents = state.cleaned_contents || []
  state.researched_contents = state.researched_contents || []
  state.selected_topic = state.selected_topic || {}
  state.selected_materials = state.selected_materials || []
  state.script = state.script || {}
  state.stages = state.stages || []
  state.audio_segments = state.audio_segments || []
  state.recording_segments = state.recording_segments || []
  state.audio_metadata = state.audio_metadata || {}
  state.intro_outro_paths = state.intro_outro_paths || {}
  state.review_summary = state.review_summary || {}
  state.storage_info = state.storage_info || {}
  state.publish_status = state.publish_status || {}
  state.trendradar_meta = state.trendradar_meta || {}
  state.discover_ui = state.discover_ui || {}
  state.organize_ui = state.organize_ui || {}
  state.episode_brief = state.episode_brief || {}
  state.writing_meta = state.writing_meta || {}
  state.episode_id = state.episode_id || `ep_${workflow.id || Date.now()}`
  state.created_at = state.created_at || new Date().toISOString()

  return {
    id: String(workflow.id || Date.now()),
    state,
    status: workflow.status || 'draft',
    currentNode: workflow.currentNode || null,
    nodeExecutions: workflow.nodeExecutions || {},
    approvals: workflow.approvals || {}
  }
}

function saveWorkflow(workflow) {
  if (!workflow?.id) return
  ensureWorkflowDir()
  fs.writeFileSync(workflowFilePath(workflow.id), JSON.stringify(normalizeWorkflow(workflow), null, 2), 'utf8')
}

function loadWorkflow(workflowId) {
  const filePath = workflowFilePath(workflowId)
  if (!fs.existsSync(filePath)) return null
  return normalizeWorkflow(JSON.parse(fs.readFileSync(filePath, 'utf8')))
}

function getWorkflowTitle(workflow) {
  return workflow?.state?.selected_topic?.title ||
    workflow?.state?.script?.title ||
    workflow?.state?.episode_title ||
    '未命名节目'
}

function getWorkflowDescription(workflow) {
  return workflow?.state?.selected_topic?.description ||
    workflow?.state?.script?.description ||
    workflow?.state?.episode_description ||
    ''
}

function createWorkflowSummary(workflow) {
  const normalized = normalizeWorkflow(workflow)
  const filePath = workflowFilePath(normalized.id)
  const isSaved = fs.existsSync(filePath)
  let updatedAt = normalized.state.created_at
  try {
    if (isSaved) {
      updatedAt = fs.statSync(filePath).mtime.toISOString()
    }
  } catch {}

  return {
    id: normalized.id,
    episodeId: normalized.state.episode_id,
    title: getWorkflowTitle(normalized),
    description: getWorkflowDescription(normalized),
    status: normalized.status,
    createdAt: normalized.state.created_at,
    updatedAt,
    previewPath: normalized.state.cover_path || '',
    isCurrent: currentWorkflow?.id === normalized.id,
    isSaved
  }
}

function listSavedWorkflows() {
  ensureWorkflowDir()
  const workflows = fs.readdirSync(WORKFLOW_DIR)
    .filter(name => name.endsWith('.json'))
    .map(name => {
      try {
        const workflow = normalizeWorkflow(JSON.parse(fs.readFileSync(path.join(WORKFLOW_DIR, name), 'utf8')))
        if (currentWorkflow?.id === workflow.id) {
          return createWorkflowSummary(currentWorkflow)
        }
        return createWorkflowSummary(workflow)
      } catch (error) {
        console.warn(`[Workflow] Failed to read ${name}:`, error.message)
        return null
      }
    })
    .filter(Boolean)

  if (currentWorkflow && !workflows.some(item => item.id === currentWorkflow.id)) {
    workflows.push(createWorkflowSummary(currentWorkflow))
  }

  return workflows.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
}

function loadLatestWorkflow() {
  const workflows = listSavedWorkflows()
  if (workflows.length === 0) return null
  return loadWorkflow(workflows[0].id)
}

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

  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL || 'http://127.0.0.1:5174')
    if (process.env.OPEN_DEVTOOLS === '1') {
      mainWindow.webContents.openDevTools()
    }
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.webContents.once('did-finish-load', () => {
    broadcastWorkflowUpdate()
  })

  if (process.env.CDP_ACCEPTANCE === '1') {
    mainWindow.webContents.once('did-finish-load', () => {
      setTimeout(() => {
        const { runCdpAcceptance } = require('./acceptanceRunner')
        runCdpAcceptance({
          app,
          mainWindow,
          projectRoot: path.join(__dirname, '..')
        }).catch((error) => {
          console.error('[CDP Acceptance] Unhandled failure:', error)
          app.quit()
        })
      }, 500)
    })
  }
}

function runPythonNode(nodeName, state, timeoutMs = 600000) {
  return new Promise((resolve, reject) => {
    const proc = spawn(PYTHON_PATH, ['-m', `nodes.${nodeName}`], {
      cwd: path.join(__dirname, '..'),
      env: getCleanSpawnEnv(),
      shell: SPAWN_SHELL
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

function runTrendRadarCli(action, payload = {}, timeoutMs = 300000) {
  return new Promise((resolve, reject) => {
    const userDataDir = app.getPath('userData')
    const proc = spawn(TRENDRADAR_PYTHON_PATH, [
      path.join(__dirname, '..', 'scripts', 'trendradar_cli.py'),
      action,
      '--user-data-dir',
      userDataDir
    ], {
      cwd: path.join(__dirname, '..'),
      env: { ...process.env, PYTHONIOENCODING: 'utf-8', AUTO_PODCAST_USER_DATA: userDataDir },
      shell: SPAWN_SHELL
    })

    let stdout = ''
    let stderr = ''
    let killed = false
    const timeout = setTimeout(() => {
      killed = true
      proc.kill('SIGTERM')
      setTimeout(() => proc.kill('SIGKILL'), 5000)
      reject(new Error(`TrendRadar ${action} timeout after ${timeoutMs / 1000}s`))
    }, timeoutMs)

    proc.stdout.on('data', (data) => { stdout += data.toString() })
    proc.stderr.on('data', (data) => {
      stderr += data.toString()
      if (mainWindow && data.toString().trim()) {
        mainWindow.webContents.send('trendradar:log', data.toString())
      }
    })
    proc.on('error', (err) => {
      clearTimeout(timeout)
      if (!killed) reject(new Error(`Failed to run TrendRadar ${action}: ${err.message}`))
    })
    proc.on('close', (code) => {
      clearTimeout(timeout)
      if (killed) return
      try {
        const result = JSON.parse(stdout || '{}')
        if (code !== 0 || result.success === false) {
          reject(new Error(result.error || stderr || `TrendRadar ${action} exited with code ${code}`))
          return
        }
        resolve(result)
      } catch (e) {
        reject(new Error(`Failed to parse TrendRadar ${action} JSON: ${e.message}\nOutput: ${stdout.slice(0, 200)}`))
      }
    })

    try {
      proc.stdin.write(JSON.stringify(payload || {}))
      proc.stdin.end()
    } catch (err) {
      clearTimeout(timeout)
      proc.kill()
      reject(new Error(`Failed to write TrendRadar ${action} input: ${err.message}`))
    }
  })
}

function getRadarCachePath() {
  return path.join(app.getPath('userData'), 'radar-cache.json')
}

function loadRadarCache() {
  try {
    const cachePath = getRadarCachePath()
    if (fs.existsSync(cachePath)) {
      const raw = JSON.parse(fs.readFileSync(cachePath, 'utf-8'))
      return {
        ...DEFAULT_RADAR_STATE,
        ...raw,
        running: false,
        contents: Array.isArray(raw.contents) ? raw.contents : []
      }
    }
  } catch (error) {
    console.warn('Failed to load radar cache:', error)
  }
  return { ...DEFAULT_RADAR_STATE }
}

function saveRadarCache() {
  try {
    const cachePath = getRadarCachePath()
    fs.writeFileSync(cachePath, JSON.stringify({ ...radarState, running: false }, null, 2), 'utf-8')
  } catch (error) {
    console.warn('Failed to save radar cache:', error)
  }
}

function broadcastRadarUpdate() {
  if (mainWindow) {
    mainWindow.webContents.send('radar:update', radarState)
  }
}

function applyRadarDefaults(config = {}) {
  return {
    monitor_enabled: false,
    monitor_interval_min: 30,
    monitor_keep_last: 500,
    ...config
  }
}

function mergeRadarContents(existing, incoming, keepLast) {
  const combined = [...incoming, ...existing]
  const seen = new Set()
  const merged = []
  const limit = Math.max(10, keepLast || 100)
  for (const item of combined) {
    const key = `${item?.url || ''}|${item?.title || ''}|${item?.source || ''}`
    if (seen.has(key)) continue
    seen.add(key)
    merged.push(item)
    if (merged.length >= limit) break
  }
  return merged
}

function scheduleRadar() {
  if (radarTimer) {
    clearInterval(radarTimer)
    radarTimer = null
  }
  if (!radarState.enabled) return
  const intervalMs = Math.max(5, radarState.intervalMin || 30) * 60 * 1000
  radarTimer = setInterval(() => runRadarOnce(), intervalMs)
}

async function runRadarOnce(configOverride = null) {
  // Guard: reset stuck running state after 5 minutes
  if (radarState.running && radarState.runStartedAt) {
    const elapsed = Date.now() - radarState.runStartedAt
    if (elapsed > 5 * 60 * 1000) {
      console.warn('[Radar] Force-resetting stuck running state after', Math.round(elapsed / 1000), 's')
      radarState.running = false
    }
  }
  if (radarState.running) {
    console.warn('[Radar] Already running, skipping')
    return radarState
  }
  const fetchConfig = applyRadarDefaults(
    configOverride || (configManager ? configManager.loadNodeConfig('fetch') : null) || {}
  )

  radarState.intervalMin = fetchConfig.monitor_interval_min || radarState.intervalMin
  radarState.keepLast = fetchConfig.monitor_keep_last || radarState.keepLast
  radarState.running = true
  radarState.runStartedAt = Date.now()
  broadcastRadarUpdate()

  try {
    console.log('[Radar] Running fetch with enabled_sources:', fetchConfig.enabled_sources || '(none, will auto-fill)')
    const state = {
      runtime_config: { fetch: fetchConfig },
      logs: [],
      errors: [],
      fetch_contents: [],
      manual_contents: [],
      raw_contents: []
    }
    const result = await runPythonNode('fetch', state)
    const incoming = Array.isArray(result?.fetch_contents) ? result.fetch_contents : []
    // Log per-source counts
    const sourceCounts = {}
    for (const item of incoming) {
      const src = item?.source || 'unknown'
      sourceCounts[src] = (sourceCounts[src] || 0) + 1
    }
    console.log(`[Radar] Fetched ${incoming.length} items:`, sourceCounts)
    if (result?.logs) {
      for (const log of result.logs) console.log('[Radar:py]', log)
    }
    if (result?.errors?.length) {
      console.warn('[Radar] Errors from fetch node:', result.errors)
    }
    // Count genuinely new items (not duplicates of what we already had)
    const existingKeys = new Set((radarState.contents || []).map(item =>
      `${item?.url || ''}|${item?.title || ''}|${item?.source || ''}`
    ))
    const newCount = incoming.filter(item => {
      const key = `${item?.url || ''}|${item?.title || ''}|${item?.source || ''}`
      return !existingKeys.has(key)
    }).length
    radarState.lastRunContents = incoming
    radarState.contents = mergeRadarContents(radarState.contents || [], incoming, radarState.keepLast)
    radarState.lastNewCount = newCount
    radarState.lastFetchedCount = incoming.length
    radarState.lastRunAt = new Date().toISOString()
    radarState.lastError = null
    console.log(`[Radar] New: ${radarState.lastNewCount}, Total fetched: ${incoming.length}, Total stored: ${radarState.contents.length}`)
  } catch (error) {
    console.error('[Radar] Fetch failed:', error.message)
    console.error('[Radar] Stack:', error.stack)
    radarState.lastError = error.message
    radarState.lastNewCount = 0
    radarState.lastFetchedCount = 0
    radarState.lastRunContents = []
  } finally {
    radarState.running = false
    saveRadarCache()
    broadcastRadarUpdate()
  }
  return radarState
}

function startRadarService(configOverride = null, options = {}) {
  const fetchConfig = applyRadarDefaults(
    configOverride || (configManager ? configManager.loadNodeConfig('fetch') : null) || {}
  )
  const runImmediately = options.runImmediately !== false
  radarState.enabled = true
  radarState.intervalMin = fetchConfig.monitor_interval_min || 30
  radarState.keepLast = fetchConfig.monitor_keep_last || 100
  scheduleRadar()
  saveRadarCache()
  broadcastRadarUpdate()
  if (runImmediately) {
    runRadarOnce(fetchConfig)
  }
}

function stopRadarService() {
  if (radarTimer) {
    clearInterval(radarTimer)
    radarTimer = null
  }
  radarState.enabled = false
  radarState.running = false
  saveRadarCache()
  broadcastRadarUpdate()
}

// IPC handlers
ipcMain.handle('workflow:list', async () => {
  return listSavedWorkflows()
})

ipcMain.handle('workflow:create', async (event, config) => {
  if (currentWorkflow && currentWorkflow.status === 'running') {
    throw new Error('A workflow is already running. Please wait for it to complete.')
  }

  const workflowId = Date.now().toString()
  const episodeId = `ep_${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '_')}`
  const shouldAutoRun = config?.autoRun !== false
  const runtimeConfig = { ...(config || {}) }
  delete runtimeConfig.autoRun
  
  currentWorkflow = {
    id: workflowId,
    state: createInitialState(episodeId, runtimeConfig),
    status: shouldAutoRun ? 'running' : 'draft',
    currentNode: null,
    nodeExecutions: {},
    approvals: {}
  }

  broadcastWorkflowUpdate()

  if (shouldAutoRun) {
    setImmediate(() => runWorkflow(workflowId))
  }

  return { workflowId, episodeId }
})

ipcMain.handle('workflow:get', async (event, workflowId) => {
  if (!workflowId) return currentWorkflow
  if (currentWorkflow?.id === workflowId) return currentWorkflow
  return loadWorkflow(workflowId)
})

ipcMain.handle('workflow:open', async (event, workflowId) => {
  const workflow = loadWorkflow(workflowId)
  if (!workflow) {
    throw new Error('Workflow not found')
  }
  currentWorkflow = workflow
  broadcastWorkflowUpdate()
  return currentWorkflow
})

ipcMain.handle('workflow:save', async (event, workflowId) => {
  const workflow = currentWorkflow?.id === workflowId ? currentWorkflow : loadWorkflow(workflowId)
  if (!workflow) {
    throw new Error('Workflow not found')
  }
  workflow.state.logs = workflow.state.logs || []
  workflow.state.logs.push(`[Electron] 节目已保存 ${new Date().toISOString()}`)
  if (currentWorkflow?.id === workflow.id) {
    currentWorkflow = workflow
  }
  saveWorkflow(workflow)
  broadcastWorkflowUpdate()
  return currentWorkflow?.id === workflow.id ? currentWorkflow : workflow
})

ipcMain.handle('workflow:close', async (event, workflowId) => {
  if (currentWorkflow?.id === workflowId) {
    currentWorkflow = null
    broadcastWorkflowUpdate()
  }
  return { success: true }
})

ipcMain.handle('workflow:updateMeta', async (event, workflowId, meta) => {
  const workflow = currentWorkflow?.id === workflowId ? currentWorkflow : loadWorkflow(workflowId)
  if (!workflow) {
    throw new Error('Workflow not found')
  }

  workflow.state.selected_topic = workflow.state.selected_topic || {}
  workflow.state.script = workflow.state.script || {}
  if (typeof meta?.title === 'string') {
    workflow.state.selected_topic.title = meta.title
    workflow.state.script.title = meta.title
  }
  if (typeof meta?.description === 'string') {
    workflow.state.selected_topic.description = meta.description
    workflow.state.script.description = meta.description
  }
  if (typeof meta?.previewPath === 'string') {
    workflow.state.cover_path = meta.previewPath
  }
  workflow.state.logs = workflow.state.logs || []
  workflow.state.logs.push(`[Electron] 节目信息已更新 ${new Date().toISOString()}`)

  if (currentWorkflow?.id === workflow.id) {
    currentWorkflow = workflow
    broadcastWorkflowUpdate()
  } else {
    saveWorkflow(workflow)
  }

  return workflow
})

ipcMain.handle('workflow:duplicate', async (event, workflowId) => {
  const source = currentWorkflow?.id === workflowId ? currentWorkflow : loadWorkflow(workflowId)
  if (!source) {
    throw new Error('Workflow not found')
  }

  const copied = normalizeWorkflow(JSON.parse(JSON.stringify(source)))
  copied.id = Date.now().toString()
  copied.state.episode_id = `ep_${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '_')}`
  copied.state.created_at = new Date().toISOString()
  copied.state.selected_topic = copied.state.selected_topic || {}
  copied.state.script = copied.state.script || {}
  const originalTitle = getWorkflowTitle(source)
  copied.state.selected_topic.title = `${originalTitle} 副本`
  copied.state.script.title = copied.state.selected_topic.title
  copied.state.logs = copied.state.logs || []
  copied.state.logs.push(`[Electron] 从 ${source.id} 复制 ${new Date().toISOString()}`)
  currentWorkflow = copied
  broadcastWorkflowUpdate()
  return currentWorkflow
})

ipcMain.handle('workflow:delete', async (event, workflowId) => {
  if (currentWorkflow?.id === workflowId && currentWorkflow.status === 'running') {
    throw new Error('运行中的节目不能删除')
  }

  const filePath = workflowFilePath(workflowId)
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath)
  }
  if (currentWorkflow?.id === workflowId) {
    currentWorkflow = null
    broadcastWorkflowUpdate()
  }
  return { success: true }
})

ipcMain.handle('workflow:export', async (event, workflowId) => {
  const workflow = currentWorkflow?.id === workflowId ? currentWorkflow : loadWorkflow(workflowId)
  if (!workflow) {
    throw new Error('Workflow not found')
  }

  const defaultName = `${sanitizePathPart(getWorkflowTitle(workflow), workflow.state.episode_id || workflow.id)}.json`
  const result = await dialog.showSaveDialog(mainWindow, {
    title: '导出节目',
    defaultPath: defaultName,
    filters: [{ name: 'Auto-Podcast 节目', extensions: ['json'] }]
  })
  if (result.canceled || !result.filePath) {
    return { success: false, canceled: true }
  }
  fs.writeFileSync(result.filePath, JSON.stringify(normalizeWorkflow(workflow), null, 2), 'utf8')
  return { success: true, path: result.filePath }
})

ipcMain.handle('workflow:import', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '导入节目',
    properties: ['openFile'],
    filters: [{ name: 'Auto-Podcast 节目', extensions: ['json'] }]
  })
  if (result.canceled || !result.filePaths?.[0]) {
    return { success: false, canceled: true }
  }

  const raw = JSON.parse(fs.readFileSync(result.filePaths[0], 'utf8'))
  const imported = normalizeWorkflow(raw.workflow || raw)
  let workflowId = sanitizePathPart(imported.id || Date.now())
  while (fs.existsSync(workflowFilePath(workflowId))) {
    workflowId = `${sanitizePathPart(imported.id || 'imported')}_${Date.now()}`
  }
  imported.id = workflowId
  imported.state.episode_id = imported.state.episode_id || `ep_imported_${Date.now()}`
  imported.state.logs = imported.state.logs || []
  imported.state.logs.push(`[Electron] 从 ${result.filePaths[0]} 导入 ${new Date().toISOString()}`)
  currentWorkflow = imported
  broadcastWorkflowUpdate()
  return { success: true, workflow: currentWorkflow, summary: createWorkflowSummary(currentWorkflow) }
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

ipcMain.handle('workflow:updateState', async (event, workflowId, patch) => {
  if (!currentWorkflow || currentWorkflow.id !== workflowId) {
    throw new Error('Workflow not found')
  }

  currentWorkflow.state = mergeStatePatch({ ...currentWorkflow.state }, patch || {})
  currentWorkflow.state.logs = currentWorkflow.state.logs || []
  currentWorkflow.state.logs.push(`[Electron] State updated from UI at ${new Date().toISOString()}`)
  broadcastWorkflowUpdate()
  return currentWorkflow
})

ipcMain.handle('workflow:runNodes', async (event, workflowId, nodeNames) => {
  if (!currentWorkflow || currentWorkflow.id !== workflowId) {
    throw new Error('Workflow not found')
  }
  const requested = Array.isArray(nodeNames) ? nodeNames.filter(Boolean) : []
  if (requested.length === 0) {
    throw new Error('No nodes requested')
  }
  if (currentWorkflow.status === 'running') {
    throw new Error('Workflow is already running')
  }

  currentWorkflow.status = 'running'
  currentWorkflow.currentNode = null
  broadcastWorkflowUpdate()
  await runWorkflow(workflowId, null, requested)
  return currentWorkflow
})

ipcMain.handle('recording:save', async (event, payload) => {
  const episodeId = sanitizePathPart(payload?.episodeId || currentWorkflow?.state?.episode_id)
  const segmentId = sanitizePathPart(payload?.segmentId || `segment_${Date.now()}`)
  const mimeType = String(payload?.mimeType || 'audio/webm')
  const extension = mimeType.includes('wav') ? 'wav' : mimeType.includes('mpeg') || mimeType.includes('mp3') ? 'mp3' : 'webm'
  const rawData = payload?.data

  if (!rawData) {
    throw new Error('Missing recording data')
  }

  const buffer = Buffer.from(rawData instanceof ArrayBuffer ? new Uint8Array(rawData) : rawData)
  if (buffer.length === 0) {
    throw new Error('Recording data is empty')
  }

  const outDir = path.join(__dirname, '..', 'out', 'recordings', episodeId)
  fs.mkdirSync(outDir, { recursive: true })
  const filePath = path.join(outDir, `${segmentId}_${Date.now()}.${extension}`)
  fs.writeFileSync(filePath, buffer)

  return {
    success: true,
    path: filePath,
    size: buffer.length,
    mimeType,
    durationSeconds: Number(payload?.durationSeconds || 0)
  }
})

ipcMain.handle('file:openPath', async (event, targetPath) => {
  if (!targetPath || !fs.existsSync(targetPath)) {
    return { success: false, error: 'Path does not exist' }
  }
  const error = await shell.openPath(targetPath)
  return error ? { success: false, error } : { success: true }
})

ipcMain.handle('file:showItemInFolder', async (event, targetPath) => {
  if (!targetPath || !fs.existsSync(targetPath)) {
    return { success: false, error: 'Path does not exist' }
  }
  shell.showItemInFolder(targetPath)
  return { success: true }
})

ipcMain.handle('file:readImageAsDataUrl', async (event, targetPath) => {
  const filePath = resolveProjectPath(targetPath)
  if (!filePath || !fs.existsSync(filePath)) {
    return { success: false, error: 'Path does not exist' }
  }
  const stat = fs.statSync(filePath)
  if (!stat.isFile()) {
    return { success: false, error: 'Path is not a file' }
  }
  if (stat.size > 10 * 1024 * 1024) {
    return { success: false, error: 'Image is larger than 10MB' }
  }
  const mimeType = imageMimeType(filePath)
  const data = fs.readFileSync(filePath).toString('base64')
  return {
    success: true,
    path: filePath,
    size: stat.size,
    mimeType,
    dataUrl: `data:${mimeType};base64,${data}`
  }
})

ipcMain.handle('node:getSchema', async (event, nodeName) => {
  return new Promise((resolve, reject) => {
    const proc = spawn(PYTHON_PATH, [
      path.join(__dirname, '..', 'scripts', 'extract_node_schemas.py'),
      nodeName
    ], {
      cwd: path.join(__dirname, '..'),
      env: getCleanSpawnEnv(),
      shell: SPAWN_SHELL
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
    const proc = spawn(PYTHON_PATH, [
      path.join(__dirname, '..', 'scripts', 'extract_node_schemas.py')
    ], {
      cwd: path.join(__dirname, '..'),
      env: getCleanSpawnEnv(),
      shell: SPAWN_SHELL
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

ipcMain.handle('radar:getState', async () => {
  return radarState
})

ipcMain.handle('radar:start', async (event, config) => {
  startRadarService(config)
  return radarState
})

ipcMain.handle('radar:stop', async () => {
  stopRadarService()
  return radarState
})

ipcMain.handle('radar:runOnce', async (event, config) => {
  await runRadarOnce(config)
  return radarState
})

ipcMain.handle('radar:clearContents', async () => {
  radarState.contents = []
  radarState.lastRunContents = []
  radarState.lastNewCount = 0
  radarState.lastFetchedCount = 0
  saveRadarCache()
  broadcastRadarUpdate()
  return radarState
})

ipcMain.handle('radar:updateContents', async (event, contents) => {
  radarState.contents = contents || []
  saveRadarCache()
  broadcastRadarUpdate()
  return radarState
})

ipcMain.handle('produce:generate', async (event, payload = {}) => {
  const segments = Array.isArray(payload?.segments) ? payload.segments : []
  if (segments.length === 0) {
    throw new Error('没有可生成的稿件段落，请先完成写作内容。')
  }

  const episodeId = payload?.episodeId
    || `ep_${new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '_')}`
  const requestedProvider = payload?.voiceProvider || 'edge_tts'

  const baseTtsConfig = (configManager && configManager.loadNodeConfig('tts')) || {}
  const basePostConfig = (configManager && configManager.loadNodeConfig('audio_postprocess')) || {}

  const runtimeTtsConfig = buildTTSConfig(payload, baseTtsConfig)
  const validation = validateProviderConfig(requestedProvider, { ...runtimeTtsConfig, provider: payload?.providerConfig?.provider })

  if (validation.errors.length > 0) {
    throw new Error(validation.errors.join('; '))
  }

  const stages = buildStages(segments)
  if (stages.length === 0) {
    throw new Error('没有可生成的有效文案，请先补充段落内容。')
  }

  let state = {
    episode_id: episodeId,
    stages,
    logs: [],
    errors: [],
    runtime_config: {
      tts: runtimeTtsConfig,
      audio_postprocess: basePostConfig,
    },
    audio_segments: [],
    final_audio_path: '',
    audio_metadata: {},
  }

  const sendProgress = (progress) => {
    event.sender.send('produce:progress', {
      episodeId,
      ...progress,
    })
  }

  try {
    sendProgress({ stage: 'tts', status: 'running', progress: 25, detail: '正在生成语音片段...' })
    state = await runPythonNode('tts', state, 600000)

    sendProgress({ stage: 'audio_postprocess', status: 'running', progress: 70, detail: '正在合并与后处理音频...' })
    state = await runPythonNode('audio_postprocess', state, 600000)

    if (!state?.final_audio_path) {
      const lastError = Array.isArray(state?.errors) && state.errors.length > 0
        ? state.errors[state.errors.length - 1]?.message
        : ''
      throw new Error(lastError || '音频生成失败：未得到最终音频文件。')
    }

    sendProgress({ stage: 'done', status: 'completed', progress: 100, detail: '音频生成完成' })

    return {
      episodeId,
      providerRequested: requestedProvider,
      providerApplied: PROVIDER_TO_ENGINE[requestedProvider] || 'edge-tts',
      warnings: validation.warnings,
      audioSegments: state.audio_segments || [],
      finalAudioPath: state.final_audio_path,
      audioMetadata: state.audio_metadata || {},
      logs: state.logs || [],
      errors: state.errors || [],
    }
  } catch (error) {
    sendProgress({ stage: 'failed', status: 'failed', progress: 100, detail: error?.message || '生成失败' })
    throw error
  }
})

ipcMain.handle('llm:fetchModels', async (event, { apiBase, apiKey }) => {
  try {
    return await fetchModels({ apiBase, apiKey })
  } catch (error) {
    throw new Error(`Failed to fetch models: ${error.message}`)
  }
})

ipcMain.handle('llm:call', async (event, { apiBase, apiKey, model, messages, temperature, maxTokens, timeout, stream }) => {
  try {
    console.log('[LLM][IPC] call start', {
      model,
      stream: !!stream,
      messageCount: Array.isArray(messages) ? messages.length : 0,
      temperature,
      maxTokens,
      timeout,
    })

    return await callLLM({
      apiBase,
      apiKey,
      model,
      messages,
      temperature,
      maxTokens,
      timeout,
      stream,
      eventSender: stream ? event.sender : null
    })
  } catch (error) {
    const rawMessage = String(error?.message || 'Unknown error')
    const normalizedMessage = rawMessage.replace(/^LLM call failed:\s*/i, '')
    console.error('[LLM][IPC] call failed', {
      model,
      stream: !!stream,
      timeout,
      maxTokens,
      message: normalizedMessage,
    })
    throw new Error(normalizedMessage)
  } finally {
    console.log('[LLM][IPC] call end', { model, stream: !!stream })
  }
})

function startTrendRadarDaemon(intervalMin = 30) {
  if (trendradarDaemon) {
    console.log('[TrendRadar] Daemon already running (PID:', trendradarDaemon.pid, ')')
    return
  }

  const projectRoot = path.join(__dirname, '..')
  const trendradarDir = path.join(projectRoot, 'engine', 'trendradar')
  if (!fs.existsSync(trendradarDir)) {
    console.log('[TrendRadar] Skipping daemon start — engine/trendradar not found (clone the submodule first)')
    return
  }

  trendradarDaemon = spawn(TRENDRADAR_PYTHON_PATH, [
    '-m', 'engine.daemon',
    '--interval', String(intervalMin)
  ], {
    cwd: projectRoot,
    env: getCleanSpawnEnv(),
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false,
    shell: SPAWN_SHELL
  })

  console.log(`[TrendRadar] Daemon started (PID=${trendradarDaemon.pid}, interval=${intervalMin}min)`)

  trendradarDaemon.stdout.on('data', (data) => {
    const lines = data.toString().trim().split('\n')
    for (const line of lines) {
      console.log('[TrendRadar]', line)
    }
    if (mainWindow) {
      mainWindow.webContents.send('trendradar:log', data.toString())
    }
  })

  trendradarDaemon.stderr.on('data', (data) => {
    console.error('[TrendRadar:err]', data.toString().trim())
  })

  trendradarDaemon.on('close', (code) => {
    console.log(`[TrendRadar] Daemon exited (code=${code})`)
    trendradarDaemon = null
    if (mainWindow) {
      mainWindow.webContents.send('trendradar:status', { status: 'stopped', code })
    }
  })

  trendradarDaemon.on('error', (err) => {
    console.error('[TrendRadar] Daemon spawn error:', err.message)
    trendradarDaemon = null
  })
}

function stopTrendRadarDaemon() {
  if (!trendradarDaemon) return
  console.log('[TrendRadar] Stopping daemon (PID:', trendradarDaemon.pid, ')')
  trendradarDaemon.kill('SIGTERM')
  setTimeout(() => {
    if (trendradarDaemon) {
      trendradarDaemon.kill('SIGKILL')
      trendradarDaemon = null
    }
  }, 5000)
}

ipcMain.handle('trendradar:start', async (event, intervalMin) => {
  startTrendRadarDaemon(intervalMin || 30)
  return { running: !!trendradarDaemon, pid: trendradarDaemon?.pid }
})

ipcMain.handle('trendradar:stop', async () => {
  stopTrendRadarDaemon()
  return { running: false }
})

ipcMain.handle('trendradar:status', async () => {
  // Read daemon status file for detailed info
  const statusPath = path.join(__dirname, '..', 'engine', 'trendradar_data', 'status.json')
  let daemonStatus = { status: 'not_running' }
  try {
    if (fs.existsSync(statusPath)) {
      daemonStatus = JSON.parse(fs.readFileSync(statusPath, 'utf-8'))
    }
  } catch (e) { /* ignore */ }
  return {
    processRunning: !!trendradarDaemon,
    pid: trendradarDaemon?.pid || null,
    ...daemonStatus
  }
})

ipcMain.handle('trendradar:getStatus', async () => {
  const status = await runTrendRadarCli('status')
  return {
    ...status,
    processRunning: !!trendradarDaemon,
    pid: trendradarDaemon?.pid || status.pid || null,
  }
})

ipcMain.handle('trendradar:getConfig', async () => {
  return runTrendRadarCli('get-config')
})

ipcMain.handle('trendradar:saveConfig', async (event, config) => {
  return runTrendRadarCli('save-config', { config })
})

ipcMain.handle('trendradar:listSources', async () => {
  return runTrendRadarCli('list-sources')
})

ipcMain.handle('trendradar:runOnce', async (event, config) => {
  if (mainWindow) {
    mainWindow.webContents.send('trendradar:status', { status: 'running' })
  }
  try {
    const result = await runTrendRadarCli('run-once', { config }, 600000)
    if (mainWindow) {
      mainWindow.webContents.send('trendradar:status', { status: 'idle', itemCount: result.items?.length || 0 })
    }
    return result
  } catch (error) {
    if (mainWindow) {
      mainWindow.webContents.send('trendradar:status', { status: 'error', error: error.message })
    }
    throw error
  }
})

ipcMain.handle('trendradar:getLatest', async () => {
  return runTrendRadarCli('get-latest')
})

ipcMain.handle('trendradar:getTopics', async () => {
  return runTrendRadarCli('get-topics')
})

ipcMain.handle('trendradar:checkUpdate', async () => {
  return runTrendRadarCli('check-update', {}, 60000)
})

ipcMain.handle('trendradar:updateDependency', async (event, options) => {
  return runTrendRadarCli('update-dependency', options || {}, 600000)
})

ipcMain.handle('trendradar:openReport', async (event, reportPath) => {
  if (!reportPath) {
    return { success: false, error: '缺少报告路径' }
  }
  const targetPath = resolveProjectPath(reportPath)
  if (!fs.existsSync(targetPath)) {
    return { success: false, error: `文件不存在：${targetPath}` }
  }
  await shell.openPath(targetPath)
  return { success: true }
})

// Fetch sources management
ipcMain.handle('fetch:getSources', async (event) => {
  return new Promise((resolve, reject) => {
    const proc = spawn(PYTHON_PATH, [
      path.join(__dirname, '..', 'scripts', 'get_fetch_sources.py')
    ], {
      cwd: path.join(__dirname, '..'),
      env: getCleanSpawnEnv(),
      shell: SPAWN_SHELL
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

async function runWorkflow(workflowId, resumeFrom = null, onlyNodes = null) {
  // 6-stage creator workflow: 发现 → 整理 → 构思 → 写作 → 制作 → 发布
  // Each stage groups internal sub-nodes
  const defaultNodes = [
    'fetch', 'manual', 'merge',           // 发现 (discover)
    'preprocess',                          // 整理 (organize)
    'research', 'topic_selection',         // 构思 (ideate) — creation studio
    'script',                              // 写作 (write)
    'tts', 'audio_postprocess', 'assets',  // 制作 (produce)
    'review',                              // 发布 (publish) — pre-publish check
    'publish'                              // 发布 (publish) — store + distribute
  ]

  const nodes = Array.isArray(onlyNodes) && onlyNodes.length > 0 ? onlyNodes : defaultNodes
  let startIndex = resumeFrom ? nodes.indexOf(resumeFrom) : 0
  if (startIndex < 0) startIndex = 0

  for (let i = startIndex; i < nodes.length; i++) {
    const nodeName = nodes[i]
    
    currentWorkflow.currentNode = nodeName
    currentWorkflow.nodeExecutions[nodeName] = {
      status: 'running',
      startedAt: new Date().toISOString()
    }

    broadcastWorkflowUpdate()

    try {
      const nodeConfig = configManager ? configManager.loadNodeConfig(nodeName) : null
      
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

      broadcastWorkflowUpdate()

      if (nodeName === 'script' && !currentWorkflow.approvals?.script) {
        const scriptConfig = configManager ? configManager.loadNodeConfig('script') : null
        console.log('[Approval Check] Script config:', scriptConfig)
        const requireApproval = scriptConfig?.require_approval ?? false
        console.log('[Approval Check] Require approval:', requireApproval)

        if (requireApproval) {
          console.log('[Approval] Pausing workflow for approval')
          currentWorkflow.status = 'waiting_approval'
          currentWorkflow.nodeExecutions[nodeName].status = 'waiting_approval'
          
          if (mainWindow) {
            broadcastWorkflowUpdate()
            // 发送审批请求事件
            console.log('[Approval] Sending needApproval event to frontend')
            mainWindow.webContents.send('workflow:needApproval', {
              workflowId,
              nodeName,
              data: currentWorkflow.state
            })
          }
          return
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
        broadcastWorkflowUpdate()
      }
      return
    }
  }

  currentWorkflow.status = 'completed'
  currentWorkflow.currentNode = null
  broadcastWorkflowUpdate()
}

app.whenReady().then(() => {
  configManager = new ConfigManager()
  currentWorkflow = null
  createWindow()

  radarState = loadRadarCache()
  const fetchConfig = applyRadarDefaults(configManager.loadNodeConfig('fetch') || {})
  radarState.intervalMin = fetchConfig.monitor_interval_min || radarState.intervalMin
  radarState.keepLast = fetchConfig.monitor_keep_last || radarState.keepLast
  
  if (fetchConfig.monitor_enabled) {
    startRadarService(fetchConfig, { runImmediately: false })
  } else {
    radarState.enabled = false
    saveRadarCache()
    broadcastRadarUpdate()
  }

  const trendradarInterval = fetchConfig.trendradar_interval_min || 30
  startTrendRadarDaemon(trendradarInterval)
})

app.on('before-quit', () => {
  stopTrendRadarDaemon()
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
