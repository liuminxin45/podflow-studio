const { app, BrowserWindow, ipcMain, dialog, Menu, nativeTheme, net, protocol, shell } = require('electron')
const path = require('path')
const fs = require('fs')
const { pathToFileURL } = require('url')
const { randomBytes } = require('crypto')
const { spawn } = require('child_process')
const ConfigManager = require('./configManager')
const { fetchModels, callLLM, stopLLMGateway } = require('./llmService')
const { searchBocha, searchTavily } = require('./searchService')
const { stopLocalAgentProcesses } = require('./localAgentService')
const { detectLocalAgents } = require('./aiTargetManager')
const { listDoubaoVoices } = require('./services/doubaoVoiceService')
const { resolvePythonCommand } = require('../scripts/python313')
const { create: createFileService } = require('./services/fileService')
const {
  capWorkflowLogs,
  createAppendWorkflowLogsHandler,
  createClearWorkflowLogsHandler,
} = require('./services/workflowLogService')
const { create: createWorkflowRunner } = require('./workflowRunner')
const { resolveWorkflowById } = require('./services/workflowLookup')
const { create: createSeriesService } = require('./services/seriesService')
const { create: createSeriesFeedService } = require('./services/seriesFeedService')
const { create: createPlaybackService } = require('./services/playbackService')
const { applyRecoveryPlan, buildRecoveryPlan } = require('./services/workflowRecovery')
const { validateNodeOutput } = require('./nodeValidator')

const SPAWN_SHELL = false
const CDP_DEBUG_ENABLED = process.env.CDP_DEBUG === '1' || process.env.CDP_ACCEPTANCE === '1'
const CDP_PORT = process.env.CDP_PORT || process.env.CDP_ACCEPTANCE_PORT || (CDP_DEBUG_ENABLED ? '9222' : '')
const CDP_HOST = process.env.CDP_HOST || '127.0.0.1'
const ENABLE_FAKE_MEDIA = process.env.CDP_ACCEPTANCE === '1' || process.env.CDP_FAKE_MEDIA === '1'
const ICON_PACK_PATH = path.join(__dirname, 'assets', 'PodFlow_Studio_Icon_Pack')
const DEFAULT_APP_ICON_PATH = path.join(ICON_PACK_PATH, 'app', 'light-theme', 'png', 'podflow-app-1024x1024.png')
const WINDOWS_APP_ICON_PATHS = {
  dark: path.join(ICON_PACK_PATH, 'app', 'dark-theme', 'PodFlow_Studio_dark-theme.ico'),
  light: path.join(ICON_PACK_PATH, 'app', 'light-theme', 'PodFlow_Studio_light-theme.ico'),
}
const PFS_FORMAT = 'podflow-studio/pfs'
const PFS_VERSION = 1
const mediaTokens = new Map()
const MEDIA_TOKEN_TTL_MS = 60 * 60 * 1000
const AUDIO_EXTENSIONS = new Set(['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.opus', '.flac'])

protocol.registerSchemesAsPrivileged([
  { scheme: 'podflow-media', privileges: { secure: true, supportFetchAPI: true, stream: true } },
])

if (CDP_PORT) {
  app.commandLine.appendSwitch('remote-debugging-port', String(CDP_PORT))
  app.commandLine.appendSwitch('remote-debugging-address', String(CDP_HOST))
  console.log(`[CDP] Remote debugging enabled at http://${CDP_HOST}:${CDP_PORT}`)
}

if (ENABLE_FAKE_MEDIA) {
  app.commandLine.appendSwitch('use-fake-device-for-media-stream')
  app.commandLine.appendSwitch('use-fake-ui-for-media-stream')
}

function getPythonSpawnEnv(extra = {}) {
  return {
    ...process.env,
    LANG: process.env.LANG || 'C.UTF-8',
    LC_ALL: process.env.LC_ALL || 'C.UTF-8',
    PYTHONIOENCODING: 'utf-8',
    PYTHONUTF8: '1',
    PYTHONUNBUFFERED: '1',
    ...extra,
  }
}

let pythonCommand = null
const activePythonProcesses = new Set()
const activeLLMRequests = new Map()
const activeSearchRequests = new Map()

function spawnPython(args, options = {}) {
  pythonCommand ??= resolvePythonCommand()
  const [executable, ...prefixArgs] = pythonCommand
  const proc = spawn(executable, [...prefixArgs, ...args], options)
  activePythonProcesses.add(proc)
  const cleanup = () => activePythonProcesses.delete(proc)
  proc.once('close', cleanup)
  proc.once('error', cleanup)
  return proc
}

let mainWindow = null
let splashWindow = null
let configManager = null
let currentWorkflow = null
let currentWorkflowDirty = false
let isQuitting = false
let closeConfirmationInProgress = false
const WORKFLOW_DIR = path.join(__dirname, '..', 'out', 'workflows')
const PROJECT_ROOT = path.join(__dirname, '..')
const EPISODE_SCHEMA_VERSION = 1
const FETCH_SOURCES_DIR = path.join(PROJECT_ROOT, 'nodes', 'fetch', 'sources')
let fetchSourcesCache = null
let fetchSourcesCacheSignature = ''
let fetchSourcesInflight = null

function broadcastWorkflowUpdate() {
  capWorkflowLogs(currentWorkflow)
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
  const series = runtimeConfig?.series?.id ? toSeriesSnapshot(runtimeConfig.series) : {}
  const cleanRuntimeConfig = { ...(runtimeConfig || {}) }
  delete cleanRuntimeConfig.series
  const targetDuration = Number(series?.defaults?.targetDurationMinutes || 22)
  const language = String(series?.defaults?.language || 'zh-CN')
  return {
    episode_id: episodeId,
    created_at: new Date().toISOString(),
    schema_version: EPISODE_SCHEMA_VERSION,
    preset: {
      id: 'morning_news_brief',
      content_type: 'news_brief',
      num_hosts: 1,
      target_duration_minutes: targetDuration,
      target_duration_minutes_range: `${Math.max(1, targetDuration - 2)}-${targetDuration + 2}`,
      template_variant: 'quick_9_plus_deep_1',
      recommended_news_item_count: 10,
      quick_news_recommended_count: 9,
      deep_dive_recommended_count: 1,
      allow_custom_news_item_count: true,
      tone: 'clear, concise, commute-friendly',
      language,
      segment_plan: [
        { type: 'opening', count: 1, target_seconds: [75, 110] },
        { type: 'quick_news', recommended_count: 9, target_seconds: [55, 90] },
        { type: 'deep_dive', recommended_count: 1, target_seconds: [480, 625] },
        { type: 'closing', count: 1, target_seconds: [20, 40] }
      ]
    },
    source_inputs: [],
    runtime_config: cleanRuntimeConfig,
    logs: [],
    errors: [],
    fetch_contents: [],
    cleaned_contents: [],
    researched_contents: [],
    facts: [],
    selected_topic: {},
    selected_topics: [],
    selected_materials: [],
    auto_selected_items: [],
    auto_rejected_items: [],
    script: {},
    edited_script: {},
    generation_request: {},
    generation_meta: {},
    script_snapshots: [],
    downstream_stale: {},
    voice_segments: [],
    production_plan: {},
    audio_outputs: {},
    cover_path: series.coverPath || '',
    intro_outro_paths: {},
    review_summary: {},
    publish_outputs: {},
    subtitle_path: '',
    run_report: {},
    discover_meta: {},
    discover_ui: {},
    organize_ui: {},
    episode_brief: {},
    writing_meta: {},
    series,
    playback: {
      positionSeconds: 0,
      durationSeconds: 0,
      completed: false,
      speed: 1,
      playCount: 0,
      updatedAt: ''
    }
  }
}

const CURRENT_STATE_KEYS = new Set([
  'episode_id', 'created_at', 'schema_version', 'preset', 'source_inputs', 'runtime_config',
  'logs', 'errors', 'fetch_contents', 'cleaned_contents', 'researched_contents', 'facts',
  'selected_topic', 'selected_topics', 'selected_materials', 'auto_selected_items',
  'auto_rejected_items', 'script', 'edited_script', 'generation_request', 'generation_meta',
  'script_snapshots', 'downstream_stale', 'voice_segments', 'production_plan', 'audio_outputs', 'cover_path',
  'intro_outro_paths', 'review_summary', 'publish_outputs', 'subtitle_path', 'run_report',
  'discover_meta', 'discover_ui', 'organize_ui', 'episode_brief', 'writing_meta', 'series', 'playback', '_manifest',
])

function ensureWorkflowDir() {
  fs.mkdirSync(WORKFLOW_DIR, { recursive: true })
}

function workflowFilePath(workflowId) {
  return path.join(WORKFLOW_DIR, `${sanitizePathPart(workflowId)}.json`)
}

function normalizeWorkflow(workflow) {
  if (!workflow || typeof workflow !== 'object') {
    throw new Error('Invalid workflow file')
  }
  const state = workflow.state
  if (!state || typeof state !== 'object') throw new Error('Workflow is missing state')
  if (state.schema_version !== EPISODE_SCHEMA_VERSION) {
    throw new Error(`Unsupported episode schema: expected ${EPISODE_SCHEMA_VERSION}, got ${String(state.schema_version)}`)
  }
  const unknownStateKeys = Object.keys(state).filter(key => !CURRENT_STATE_KEYS.has(key))
  if (unknownStateKeys.length > 0) {
    throw new Error(`Unsupported episode state fields: ${unknownStateKeys.sort().join(', ')}`)
  }

  return {
    id: String(workflow.id || Date.now()),
    state: { ...state, production_plan: state.production_plan || {} },
    status: workflow.status || 'draft',
    currentNode: workflow.currentNode || null,
    nodeExecutions: workflow.nodeExecutions || {},
    approvals: workflow.approvals || {}
  }
}

function saveWorkflow(workflow) {
  if (!workflow?.id) return
  capWorkflowLogs(workflow)
  ensureWorkflowDir()
  fs.writeFileSync(workflowFilePath(workflow.id), JSON.stringify(normalizeWorkflow(workflow), null, 2), 'utf8')
}

async function confirmCloseFromMain() {
  if (!currentWorkflow || !currentWorkflowDirty) return true

  const result = await dialog.showMessageBox(mainWindow, {
    type: 'question',
    title: '保存当前节目？',
    message: '当前节目有未保存更改。',
    detail: '保存后退出，或不保存并丢弃这些更改。',
    buttons: ['保存并退出', '不保存', '取消'],
    defaultId: 0,
    cancelId: 2,
    noLink: true
  })

  if (result.response === 0) {
    currentWorkflow.state.logs = currentWorkflow.state.logs || []
    currentWorkflow.state.logs.push(`[Electron] Workflow saved before quit at ${new Date().toISOString()}`)
    saveWorkflow(currentWorkflow)
    currentWorkflowDirty = false
    return true
  }

  return result.response === 1
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

function toSeriesSnapshot(series) {
  return {
    id: series.id,
    title: series.title,
    description: series.description || '',
    coverPath: series.coverPath || '',
    cadence: series.cadence,
    defaults: { ...series.defaults },
  }
}

function createWorkflowSummary(workflow) {
  const normalized = normalizeWorkflow(workflow)
  const playback = playbackService.get(normalized.id) || normalized.state.playback || undefined
  const filePath = workflowFilePath(normalized.id)
  const isSaved = fs.existsSync(filePath)
  let updatedAt = normalized.state.created_at
  try {
    if (isSaved) {
      updatedAt = fs.statSync(filePath).mtime.toISOString()
    }
  } catch {}
  const topicKeys = (normalized.state.selected_topics || [])
    .map(topic => String(topic?.title || '').trim().toLocaleLowerCase())
    .filter(Boolean)
  const sourceDomains = [...new Set((normalized.state.facts || []).flatMap(fact => (
    Array.isArray(fact?.source_urls) && fact.source_urls.length > 0
      ? fact.source_urls
      : [fact?.source_url]
  )).map(value => {
    try { return new URL(String(value || '')).hostname.replace(/^www\./, '').toLocaleLowerCase() }
    catch { return '' }
  }).filter(Boolean))]

  return {
    id: normalized.id,
    episodeId: normalized.state.episode_id,
    title: getWorkflowTitle(normalized),
    description: getWorkflowDescription(normalized),
    status: normalized.status,
    createdAt: normalized.state.created_at,
    updatedAt,
    previewPath: normalized.state.cover_path || '',
    audioPath: normalized.state.audio_outputs?.final_audio_path || normalized.state.publish_outputs?.audio_path || '',
    durationSeconds: Number(normalized.state.audio_outputs?.duration_seconds || playback?.durationSeconds || 0),
    playback,
    series: normalized.state.series?.id ? normalized.state.series : undefined,
    failedNode: Object.keys(normalized.nodeExecutions || {}).find(node => normalized.nodeExecutions[node]?.status === 'failed'),
    topicKeys,
    sourceDomains,
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

function isReloadShortcut(input) {
  if (input.type !== 'keyDown') return false
  const key = String(input.key || '').toLowerCase()
  const hasReloadModifier = Boolean(input.control || input.meta)
  return key === 'f5' || (hasReloadModifier && key === 'r')
}

function getAppIconPath() {
  if (process.platform !== 'win32') return DEFAULT_APP_ICON_PATH
  return nativeTheme.shouldUseDarkColors
    ? WINDOWS_APP_ICON_PATHS.dark
    : WINDOWS_APP_ICON_PATHS.light
}

function syncWindowIconWithSystemTheme() {
  if (!mainWindow || mainWindow.isDestroyed()) return
  mainWindow.setIcon(getAppIconPath())
}

function createSplashWindow() {
  const splashLogoPath = path.join(ICON_PACK_PATH, 'app', 'dark-theme', 'png', 'podflow-app-128x128.png')
  const splashLogoDataUrl = `data:image/png;base64,${fs.readFileSync(splashLogoPath).toString('base64')}`
  splashWindow = new BrowserWindow({
    width: 460,
    height: 280,
    frame: false,
    transparent: false,
    backgroundColor: '#111310',
    resizable: false,
    show: false,
    center: true,
    skipTaskbar: true,
    icon: getAppIconPath(),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  })

  const splashHtml = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    * { box-sizing: border-box; }
    html, body { width: 100%; height: 100%; margin: 0; }
    body {
      display: grid;
      place-items: center;
      overflow: hidden;
      color: #f2f0e8;
      background: #111310;
      font-family: Inter, "Segoe UI", "Microsoft YaHei", sans-serif;
      user-select: none;
    }
    main { width: 100%; padding: 42px 46px 36px; }
    .brand { display: flex; align-items: center; gap: 15px; }
    .mark {
      display: grid;
      width: 46px;
      height: 46px;
      place-items: center;
      border: 1px solid #6f8f68;
      border-radius: 12px;
      background: #1d241c;
    }
    .mark img { display: block; width: 31px; height: 31px; object-fit: contain; }
    h1 { margin: 0; font-size: 21px; font-weight: 650; letter-spacing: -0.025em; }
    .version { margin-top: 4px; color: #858a80; font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; }
    .progress-shell { height: 3px; margin-top: 54px; overflow: hidden; border-radius: 3px; background: #2b2e29; }
    #progress { width: 12%; height: 100%; border-radius: inherit; background: #91b88a; transition: width 320ms ease; }
    .status-row { display: flex; justify-content: space-between; margin-top: 13px; color: #a8ada4; font-size: 12px; }
    #percent { color: #6f746c; font-variant-numeric: tabular-nums; }
    @media (prefers-reduced-motion: reduce) { #progress { transition: none; } }
  </style>
</head>
<body>
  <main>
    <div class="brand">
      <div class="mark"><img src="${splashLogoDataUrl}" alt="" /></div>
      <div><h1>PodFlow Studio</h1><div class="version">Local podcast workspace</div></div>
    </div>
    <div class="progress-shell"><div id="progress"></div></div>
    <div class="status-row"><span id="status">加载应用内核中…</span><span id="percent">12%</span></div>
  </main>
</body>
</html>`

  splashWindow.loadURL(`data:text/html;charset=UTF-8,${encodeURIComponent(splashHtml)}`)
  splashWindow.once('ready-to-show', () => splashWindow?.show())
  splashWindow.on('closed', () => { splashWindow = null })
}

function updateSplash(progress, status) {
  if (!splashWindow || splashWindow.isDestroyed()) return
  const safeProgress = Math.max(0, Math.min(100, Math.round(progress)))
  const script = `(() => {
    const bar = document.getElementById('progress');
    const label = document.getElementById('status');
    const percent = document.getElementById('percent');
    if (bar) bar.style.width = ${JSON.stringify(`${safeProgress}%`)};
    if (label) label.textContent = ${JSON.stringify(status)};
    if (percent) percent.textContent = ${JSON.stringify(`${safeProgress}%`)};
  })()`
  splashWindow.webContents.executeJavaScript(script).catch(() => undefined)
}

function revealMainWindow() {
  updateSplash(100, '启动完成')
  setTimeout(() => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.show()
    if (splashWindow && !splashWindow.isDestroyed()) splashWindow.close()
  }, 220)
}

function createWindow() {
  createSplashWindow()
  updateSplash(24, '连接界面服务中…')
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    icon: getAppIconPath(),
    show: false,
    backgroundColor: '#111310',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  })

  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (isReloadShortcut(input)) {
      event.preventDefault()
    }
  })

  mainWindow.webContents.on('did-start-loading', () => updateSplash(48, '加载工作台中…'))
  mainWindow.webContents.once('dom-ready', () => updateSplash(78, '初始化本地工作流中…'))
  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, _url, isMainFrame) => {
    if (!isMainFrame) return
    console.error('[Startup] Main window failed to load', { errorCode, errorDescription })
    updateSplash(100, `启动失败：${errorDescription}`)
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
    updateSplash(92, '恢复本地工作流中…')
    broadcastWorkflowUpdate()
    revealMainWindow()
  })

  mainWindow.on('close', (event) => {
    if (isQuitting || process.env.CDP_ACCEPTANCE === '1') return
    event.preventDefault()
    if (closeConfirmationInProgress) return
    closeConfirmationInProgress = true
    confirmCloseFromMain()
      .then((canClose) => {
        if (!canClose) return
        isQuitting = true
        app.quit()
      })
      .catch((error) => {
        console.error('[AppClose] Failed to confirm close:', error)
      })
      .finally(() => {
        closeConfirmationInProgress = false
      })
  })

  mainWindow.on('closed', () => {
    mainWindow = null
    if (splashWindow && !splashWindow.isDestroyed()) splashWindow.close()
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
    const proc = spawnPython(['-m', `nodes.${nodeName}`], {
      cwd: path.join(__dirname, '..'),
      env: getPythonSpawnEnv(),
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

function sendDiscoverProgress(eventSender, runId, payload) {
  if (!eventSender || eventSender.isDestroyed?.()) return
  const { state, ...progress } = payload || {}
  eventSender.send('discover:progress', {
    runId,
    ...progress,
  })
}

function runFetchStream(state, eventSender, runId, timeoutMs = 600000) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(PROJECT_ROOT, 'scripts', 'run_fetch_stream.py')
    const proc = spawnPython([scriptPath], {
      cwd: PROJECT_ROOT,
      env: getPythonSpawnEnv(),
      shell: SPAWN_SHELL
    })

    let stdoutBuffer = ''
    let stderr = ''
    let finalState = null
    let failedMessage = ''
    let killed = false

    const timeout = setTimeout(() => {
      killed = true
      proc.kill('SIGTERM')
      setTimeout(() => proc.kill('SIGKILL'), 5000)
      reject(new Error(`Discover fetch timeout after ${timeoutMs / 1000}s`))
    }, timeoutMs)

    const handleLine = (line) => {
      const text = line.trim()
      if (!text) return
      let payload = null
      try {
        payload = JSON.parse(text)
      } catch (error) {
        stderr += `\n[DiscoverStream] Failed to parse event: ${error.message}; line=${text.slice(0, 300)}`
        return
      }

      if (payload.type === 'completed' && payload.state) {
        finalState = payload.state
      }
      if (payload.type === 'failed') {
        failedMessage = payload.message || 'Discover fetch failed'
      }
      sendDiscoverProgress(eventSender, runId, payload)
    }

    proc.stdout.on('data', (data) => {
      stdoutBuffer += data.toString()
      const lines = stdoutBuffer.split(/\r?\n/)
      stdoutBuffer = lines.pop() || ''
      lines.forEach(handleLine)
    })

    proc.stderr.on('data', (data) => {
      stderr += data.toString()
    })

    proc.on('error', (err) => {
      clearTimeout(timeout)
      if (!killed) {
        reject(new Error(`Failed to spawn discover fetch: ${err.message}`))
      }
    })

    proc.on('close', (code) => {
      clearTimeout(timeout)
      if (killed) return
      if (stdoutBuffer.trim()) {
        handleLine(stdoutBuffer)
      }

      if (code !== 0) {
        reject(new Error(failedMessage || `Discover fetch exited with code ${code}: ${stderr || 'No error output'}`))
        return
      }
      if (!finalState) {
        reject(new Error(`Discover fetch completed without final state${stderr ? `: ${stderr.slice(0, 500)}` : ''}`))
        return
      }
      resolve(finalState)
    })

    try {
      proc.stdin.write(JSON.stringify(state))
      proc.stdin.end()
    } catch (err) {
      clearTimeout(timeout)
      proc.kill()
      reject(new Error(`Failed to write discover fetch input: ${err.message}`))
    }
  })
}

const sharedCtx = {
  getMainWindow: () => mainWindow,
  getConfigManager: () => configManager,
  getCurrentWorkflow: () => currentWorkflow,
  setCurrentWorkflow: (workflow) => {
    currentWorkflow = workflow
    currentWorkflowDirty = Boolean(workflow)
  },
  persistWorkflow: (workflow) => {
    if (!workflow) return
    saveWorkflow(workflow)
    if (currentWorkflow?.id === workflow.id) currentWorkflowDirty = false
  },
  runPythonNode
}
const workflowRunner = createWorkflowRunner(sharedCtx)
const seriesService = createSeriesService({ projectRoot: PROJECT_ROOT })
const seriesFeedService = createSeriesFeedService({ projectRoot: PROJECT_ROOT })
const playbackService = createPlaybackService({ projectRoot: PROJECT_ROOT })
const fileService = createFileService({
  projectRoot: PROJECT_ROOT,
  getCurrentWorkflow: () => currentWorkflow
})

function stopActivePythonProcesses() {
  for (const proc of Array.from(activePythonProcesses)) {
    try {
      if (!proc.killed) proc.kill('SIGTERM')
    } catch {
      // Ignore cleanup errors while the app is quitting.
    }
  }
  activePythonProcesses.clear()
}

function cleanupBeforeQuit() {
  isQuitting = true
  mediaTokens.clear()
  stopLLMGateway()
  stopLocalAgentProcesses()
  stopActivePythonProcesses()
}

function writeAppLog(level, message) {
  const method = level === 'error' ? 'error' : level === 'warning' ? 'warn' : 'log'
  console[method](message)
}

// IPC handlers
ipcMain.handle('app:log', async (_event, payload = {}) => {
  writeAppLog(payload.level, String(payload.message || ''))
  return { success: true }
})

ipcMain.handle('app:setDirtyState', async (_event, dirty) => {
  currentWorkflowDirty = Boolean(dirty)
  return { success: true }
})

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
  currentWorkflowDirty = true

  broadcastWorkflowUpdate()

  if (shouldAutoRun) {
    setImmediate(() => workflowRunner.run(workflowId))
  }

  return { workflowId, episodeId }
})

ipcMain.handle('workflow:get', async (event, workflowId) => {
  if (!workflowId) return currentWorkflow
  if (currentWorkflow?.id === workflowId) return currentWorkflow
  return loadWorkflow(workflowId)
})

ipcMain.handle('workflow:open', async (event, workflowId) => {
  const workflow = resolveWorkflowById(workflowId, currentWorkflow, loadWorkflow)
  if (!workflow) {
    throw new Error('Workflow not found')
  }
  currentWorkflow = workflow
  currentWorkflowDirty = false
  broadcastWorkflowUpdate()
  return currentWorkflow
})

ipcMain.handle('workflow:save', async (event, workflowId) => {
  const workflow = currentWorkflow?.id === workflowId ? currentWorkflow : loadWorkflow(workflowId)
  if (!workflow) {
    throw new Error('Workflow not found')
  }
  workflow.state.logs = workflow.state.logs || []
  workflow.state.logs.push(`[Electron] Workflow saved at ${new Date().toISOString()}`)
  if (currentWorkflow?.id === workflow.id) {
    currentWorkflow = workflow
  }
  saveWorkflow(workflow)
  if (currentWorkflow?.id === workflow.id) {
    currentWorkflowDirty = false
  }
  broadcastWorkflowUpdate()
  return currentWorkflow?.id === workflow.id ? currentWorkflow : workflow
})

ipcMain.handle('workflow:close', async (event, workflowId) => {
  if (currentWorkflow?.id === workflowId) {
    currentWorkflow = null
    currentWorkflowDirty = false
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
  workflow.state.logs.push(`[Electron] Workflow metadata updated at ${new Date().toISOString()}`)

  if (currentWorkflow?.id === workflow.id) {
    currentWorkflow = workflow
    currentWorkflowDirty = true
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
  copied.state.playback = {
    positionSeconds: 0,
    durationSeconds: Number(copied.state.audio_outputs?.duration_seconds || 0),
    completed: false,
    speed: 1,
    playCount: 0,
  }
  copied.state.selected_topic = copied.state.selected_topic || {}
  copied.state.script = copied.state.script || {}
  const originalTitle = getWorkflowTitle(source)
  copied.state.selected_topic.title = `${originalTitle} Copy`
  copied.state.script.title = copied.state.selected_topic.title
  copied.state.logs = copied.state.logs || []
  copied.state.logs.push(`[Electron] Workflow duplicated from ${source.id} at ${new Date().toISOString()}`)
  saveWorkflow(copied)
  if (copied.state.series?.id) seriesService.assign(copied.state.series.id, copied.id)
  return copied
})

ipcMain.handle('workflow:delete', async (event, workflowId) => {
  if (currentWorkflow?.id === workflowId && currentWorkflow.status === 'running') {
    throw new Error('Cannot delete a running workflow')
  }

  const filePath = workflowFilePath(workflowId)
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath)
  }
  seriesService.unassign(workflowId)
  playbackService.remove(workflowId)
  if (currentWorkflow?.id === workflowId) {
    currentWorkflow = null
    currentWorkflowDirty = false
    broadcastWorkflowUpdate()
  }
  return { success: true }
})

function ensurePfsExtension(filePath) {
  return path.extname(filePath).toLowerCase() === '.pfs' ? filePath : `${filePath}.pfs`
}

function createPfsPayload(workflow) {
  return {
    format: PFS_FORMAT,
    version: PFS_VERSION,
    exportedAt: new Date().toISOString(),
    workflow: normalizeWorkflow(workflow),
  }
}

function extractWorkflowFromPfsPayload(raw) {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid PodFlow Studio workflow file')
  }
  if (raw.format !== PFS_FORMAT || raw.version !== PFS_VERSION) {
    throw new Error(`Unsupported PodFlow Studio package format or version`)
  }
  if (!raw.workflow || typeof raw.workflow !== 'object') {
    throw new Error('PFS file is missing workflow content')
  }
  return raw.workflow
}

ipcMain.handle('workflow:export', async (event, workflowId) => {
  const workflow = currentWorkflow?.id === workflowId ? currentWorkflow : loadWorkflow(workflowId)
  if (!workflow) {
    throw new Error('Workflow not found')
  }

  const defaultName = `${sanitizePathPart(getWorkflowTitle(workflow), workflow.state.episode_id || workflow.id)}.pfs`
  const result = await dialog.showSaveDialog(mainWindow, {
    title: '导出节目',
    defaultPath: defaultName,
    filters: [{ name: 'PodFlow Studio 节目包', extensions: ['pfs'] }]
  })
  if (result.canceled || !result.filePath) {
    return { success: false, canceled: true }
  }
  const exportPath = ensurePfsExtension(result.filePath)
  fs.writeFileSync(exportPath, JSON.stringify(createPfsPayload(workflow), null, 2), 'utf8')
  return { success: true, path: exportPath }
})

ipcMain.handle('workflow:import', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '导入节目',
    properties: ['openFile'],
    filters: [{ name: 'PodFlow Studio 节目包', extensions: ['pfs'] }]
  })
  if (result.canceled || !result.filePaths?.[0]) {
    return { success: false, canceled: true }
  }

  const raw = JSON.parse(fs.readFileSync(result.filePaths[0], 'utf8'))
  const imported = normalizeWorkflow(extractWorkflowFromPfsPayload(raw))
  let workflowId = sanitizePathPart(imported.id || Date.now())
  while (fs.existsSync(workflowFilePath(workflowId))) {
    workflowId = `${sanitizePathPart(imported.id || 'imported')}_${Date.now()}`
  }
  imported.id = workflowId
  imported.state.logs = imported.state.logs || []
  imported.state.logs.push(`[Electron] Workflow imported from ${result.filePaths[0]} at ${new Date().toISOString()}`)
  if (imported.state.series?.id) {
    const importedSeries = seriesService.upsert(imported.state.series)
    imported.state.series = toSeriesSnapshot(importedSeries)
    seriesService.assign(importedSeries.id, imported.id)
  }
  currentWorkflow = imported
  currentWorkflowDirty = true
  broadcastWorkflowUpdate()
  return { success: true, workflow: currentWorkflow, summary: createWorkflowSummary(currentWorkflow) }
})

ipcMain.handle('workflow:approve', async (event, workflowId, nodeName, approved, modifiedOutput) => {
  if (approved && modifiedOutput) {
    Object.assign(currentWorkflow.state, modifiedOutput)
    currentWorkflowDirty = true
  }
  currentWorkflow.approvals = currentWorkflow.approvals || {}
  currentWorkflow.approvals[nodeName] = approved ? 'approved' : 'rejected'
  
  if (approved) {
    setImmediate(() => workflowRunner.run(workflowId, nodeName))
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
  currentWorkflowDirty = true
  broadcastWorkflowUpdate()
  return currentWorkflow
})

ipcMain.handle('workflow:appendLogs', createAppendWorkflowLogsHandler({
  getCurrentWorkflow: () => currentWorkflow,
  markDirty: () => { currentWorkflowDirty = true },
  broadcastWorkflowUpdate,
}))

ipcMain.handle('workflow:clearLogs', createClearWorkflowLogsHandler({
  getCurrentWorkflow: () => currentWorkflow,
  markDirty: () => { currentWorkflowDirty = true },
  broadcastWorkflowUpdate,
}))

ipcMain.handle('discover:run', async (event, workflowId, config = {}) => {
  if (!currentWorkflow || currentWorkflow.id !== workflowId) {
    throw new Error('Workflow not found')
  }
  if (currentWorkflow.status === 'running') {
    throw new Error('Workflow is already running')
  }

  const runId = `discover_${Date.now()}`
  const startedAt = Date.now()
  currentWorkflow.status = 'running'
  currentWorkflow.currentNode = 'fetch'
  currentWorkflow.nodeExecutions.fetch = {
    status: 'running',
    startedAt: new Date().toISOString()
  }
  currentWorkflow.state.runtime_config = currentWorkflow.state.runtime_config || {}
  currentWorkflow.state.runtime_config.fetch = config || {}
  currentWorkflow.state.logs = currentWorkflow.state.logs || []
  currentWorkflow.state.logs.push(`[Electron] Discover streaming fetch started ${new Date().toISOString()}`)
  currentWorkflowDirty = true
  broadcastWorkflowUpdate()

  try {
    const result = await runFetchStream(currentWorkflow.state, event.sender, runId)
    validateNodeOutput('fetch', result)
    const duration = (Date.now() - startedAt) / 1000
    result.logs = result.logs || []
    result.logs.push(`[Electron] Discover streaming fetch completed | duration=${duration.toFixed(2)}s`)

    currentWorkflow.state = result
    currentWorkflow.nodeExecutions.fetch = {
      status: 'completed',
      startedAt: currentWorkflow.nodeExecutions.fetch.startedAt,
      completedAt: new Date().toISOString(),
      duration,
      attempts: 1,
    }
    currentWorkflow.status = 'completed'
    currentWorkflow.currentNode = null
    currentWorkflowDirty = true
    broadcastWorkflowUpdate()
    return currentWorkflow
  } catch (error) {
    currentWorkflow.nodeExecutions.fetch = {
      status: 'failed',
      startedAt: currentWorkflow.nodeExecutions.fetch.startedAt,
      completedAt: new Date().toISOString(),
      error: error.message,
      errorStack: error.stack
    }
    currentWorkflow.status = 'failed'
    currentWorkflow.currentNode = null
    currentWorkflow.state.errors = currentWorkflow.state.errors || []
    currentWorkflow.state.errors.push({
      node: 'fetch',
      message: error.message,
      timestamp: new Date().toISOString()
    })
    currentWorkflow.state.logs = currentWorkflow.state.logs || []
    currentWorkflow.state.logs.push(`[Electron] Discover streaming fetch failed: ${error.message}`)
    currentWorkflowDirty = true
    sendDiscoverProgress(event.sender, runId, {
      type: 'failed',
      message: error.message,
      timestamp: new Date().toISOString(),
    })
    broadcastWorkflowUpdate()
    throw error
  }
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
  currentWorkflowDirty = true
  broadcastWorkflowUpdate()
  await workflowRunner.run(workflowId, null, requested)
  return currentWorkflow
})

ipcMain.handle('workflow:previewRerun', async (_event, workflowId, nodeName) => {
  const workflow = resolveWorkflowById(workflowId, currentWorkflow, loadWorkflow)
  if (!workflow) throw new Error('Workflow not found')
  return buildRecoveryPlan(workflow, nodeName)
})

ipcMain.handle('workflow:rerunStage', async (_event, workflowId, nodeName) => {
  if (!currentWorkflow || currentWorkflow.id !== workflowId) {
    throw new Error('Open the episode before rerunning a stage')
  }
  if (currentWorkflow.status === 'running') throw new Error('Workflow is already running')
  const plan = buildRecoveryPlan(currentWorkflow, nodeName)
  applyRecoveryPlan(currentWorkflow, plan)
  currentWorkflow.status = 'running'
  currentWorkflow.currentNode = null
  currentWorkflow.state.logs = currentWorkflow.state.logs || []
  currentWorkflow.state.logs.push(`[Recovery] Rerun confirmed from ${nodeName}; cleared=${plan.clearFields.join(',')}`)
  currentWorkflowDirty = true
  saveWorkflow(currentWorkflow)
  broadcastWorkflowUpdate()
  await workflowRunner.run(workflowId, null, plan.rerunNodes)
  saveWorkflow(currentWorkflow)
  currentWorkflowDirty = false
  return currentWorkflow
})

ipcMain.handle('workflow:updatePlayback', async (_event, workflowId, patch) => {
  const workflow = resolveWorkflowById(workflowId, currentWorkflow, loadWorkflow)
  if (!workflow) throw new Error('Workflow not found')
  const previous = playbackService.get(workflow.id) || workflow.state.playback || {}
  const playback = playbackService.set(workflow.id, patch, previous)
  if (currentWorkflow?.id === workflow.id) {
    currentWorkflow.state.playback = playback
    broadcastWorkflowUpdate()
  }
  return playback
})

function isPathInside(rootPath, targetPath) {
  const relative = path.relative(path.resolve(rootPath), path.resolve(targetPath))
  return relative !== '' && !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative)
}

function authorizeAudioPath(audioPath) {
  const resolved = path.resolve(String(audioPath || ''))
  const ownedRoots = [
    path.join(PROJECT_ROOT, 'out'),
    path.join(PROJECT_ROOT, 'dist'),
    path.join(PROJECT_ROOT, 'examples', 'demo-news'),
  ]
  if (!AUDIO_EXTENSIONS.has(path.extname(resolved).toLocaleLowerCase())) {
    throw new Error('Unsupported episode audio format')
  }
  if (!ownedRoots.some(root => isPathInside(root, resolved))) {
    throw new Error('Episode audio is outside PodFlow Studio managed storage')
  }
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    throw new Error('Episode has no readable final audio')
  }
  return resolved
}

ipcMain.handle('media:getUrl', async (_event, workflowId) => {
  const workflow = resolveWorkflowById(workflowId, currentWorkflow, loadWorkflow)
  if (!workflow) throw new Error('Workflow not found')
  const audioPath = String(workflow.state.audio_outputs?.final_audio_path || workflow.state.publish_outputs?.audio_path || '')
  const resolvedAudioPath = authorizeAudioPath(audioPath)
  const now = Date.now()
  for (const [key, record] of mediaTokens) {
    if (record.expiresAt <= now) mediaTokens.delete(key)
  }
  const token = randomBytes(24).toString('hex')
  mediaTokens.set(token, { path: resolvedAudioPath, expiresAt: now + MEDIA_TOKEN_TTL_MS })
  return { url: `podflow-media://audio/${encodeURIComponent(token)}` }
})

ipcMain.handle('series:list', async () => seriesService.list())

ipcMain.handle('series:upsert', async (_event, input) => {
  const value = seriesService.upsert(input)
  for (const summary of listSavedWorkflows()) {
    const workflow = resolveWorkflowById(summary.id, currentWorkflow, loadWorkflow)
    if (!workflow || workflow.state.series?.id !== value.id) continue
    workflow.state.series = toSeriesSnapshot(value)
    if (currentWorkflow?.id === workflow.id) {
      currentWorkflow = workflow
      currentWorkflowDirty = true
    } else {
      saveWorkflow(workflow)
    }
  }
  broadcastWorkflowUpdate()
  return value
})

ipcMain.handle('series:assignEpisode', async (_event, seriesId, workflowId) => {
  const value = seriesService.assign(String(seriesId), String(workflowId))
  const workflow = resolveWorkflowById(workflowId, currentWorkflow, loadWorkflow)
  if (!workflow) throw new Error('Workflow not found')
  workflow.state.series = toSeriesSnapshot(value)
  if (currentWorkflow?.id === workflow.id) {
    currentWorkflow = workflow
    currentWorkflowDirty = true
  } else {
    saveWorkflow(workflow)
  }
  broadcastWorkflowUpdate()
  return { series: value, workflow }
})

ipcMain.handle('series:reorderEpisodes', async (_event, seriesId, episodeIds) => {
  return seriesService.reorder(String(seriesId), Array.isArray(episodeIds) ? episodeIds : [])
})

ipcMain.handle('series:generateFeed', async (_event, seriesId) => {
  const series = seriesService.list().find(item => item.id === String(seriesId))
  if (!series) throw new Error('Series not found')
  const workflows = series.episodeIds
    .map(id => resolveWorkflowById(id, currentWorkflow, loadWorkflow))
    .filter(Boolean)
  return seriesFeedService.generate(series, workflows)
})

ipcMain.handle('recording:save', async (event, payload) => {
  return fileService.saveRecording(payload)
})

ipcMain.handle('file:openPath', async (event, targetPath) => {
  return fileService.openPath(targetPath)
})

ipcMain.handle('file:showItemInFolder', async (event, targetPath) => {
  return fileService.showItemInFolder(targetPath)
})

ipcMain.handle('file:openExternal', async (_event, targetUrl) => {
  const url = new URL(String(targetUrl || ''))
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only HTTP and HTTPS links are supported')
  await shell.openExternal(url.toString())
  return { success: true }
})

ipcMain.handle('file:readImageAsDataUrl', async (event, targetPath) => {
  return fileService.readImageAsDataUrl(targetPath)
})

ipcMain.handle('file:selectAudio', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '选择音频文件',
    properties: ['openFile'],
    filters: [{
      name: '音频文件',
      extensions: ['mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg', 'opus', 'webm'],
    }],
  })
  if (result.canceled || !result.filePaths?.[0]) {
    return { success: false, canceled: true }
  }
  return { success: true, path: result.filePaths[0] }
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

ipcMain.handle('llm:fetchModels', async (event, { apiBase, apiKey, apiKeyEnvVar, providerKind }) => {
  try {
    return await fetchModels({ apiBase, apiKey, apiKeyEnvVar, providerKind })
  } catch (error) {
    throw new Error(`Failed to fetch models: ${error.message}`)
  }
})

ipcMain.handle('doubao:listVoices', async (_event, params) => {
  return listDoubaoVoices(params)
})

async function runCancellableSearch(params, search) {
  const controller = new globalThis.AbortController()
  if (params.requestId) activeSearchRequests.set(params.requestId, controller)
  try {
    return await search({ ...params, signal: controller.signal })
  } finally {
    if (params.requestId && activeSearchRequests.get(params.requestId) === controller) {
      activeSearchRequests.delete(params.requestId)
    }
  }
}

ipcMain.handle('search:tavily', async (_event, params) => runCancellableSearch(params, searchTavily))
ipcMain.handle('search:bocha', async (_event, params) => runCancellableSearch(params, searchBocha))
ipcMain.handle('search:cancel', async (_event, requestId) => {
  const controller = activeSearchRequests.get(requestId)
  if (!controller) return { success: false }
  controller.abort()
  return { success: true }
})

ipcMain.handle('llm:call', async (event, { requestId, apiBase, apiKey, apiKeyEnvVar, model, messages, temperature, maxTokens, timeout, stream, providerKind, localAgentId, localAgentCommand, localAgentArgs, localAgentOutputMode, aiTarget }) => {
  const controller = new globalThis.AbortController()
  if (requestId) activeLLMRequests.set(requestId, controller)
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
      apiKeyEnvVar,
      model,
      providerKind,
      messages,
      temperature,
      maxTokens,
      timeout,
      stream,
      localAgentId,
      localAgentCommand,
      localAgentArgs,
      localAgentOutputMode,
      aiTarget,
      signal: controller.signal,
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
    if (requestId && activeLLMRequests.get(requestId) === controller) {
      activeLLMRequests.delete(requestId)
    }
    console.log('[LLM][IPC] call end', { model, stream: !!stream })
  }
})

ipcMain.handle('llm:cancel', async (_event, requestId) => {
  const controller = activeLLMRequests.get(requestId)
  if (!controller) return { success: false }
  controller.abort()
  return { success: true }
})

ipcMain.handle('aiTargets:detectLocalAgents', async () => {
  return detectLocalAgents()
})

function getFetchSourcesSignature() {
  try {
    const files = fs.readdirSync(FETCH_SOURCES_DIR)
      .filter(file => file.endsWith('.py') && !file.startsWith('_'))
      .sort()
    return files.map((file) => {
      const fullPath = path.join(FETCH_SOURCES_DIR, file)
      const stat = fs.statSync(fullPath)
      return `${file}:${stat.size}:${stat.mtimeMs}`
    }).join('|')
  } catch (error) {
    console.error('[FetchSources] signature failed', { message: error.message })
    return ''
  }
}

function discoverFetchSourcesViaPython() {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(__dirname, '..', 'scripts', 'get_fetch_sources.py')
    const cwd = path.join(__dirname, '..')
    const startedAt = Date.now()
    console.log('[FetchSources] discovery start', { scriptPath, cwd })
    const proc = spawnPython([
      scriptPath
    ], {
      cwd,
      env: getPythonSpawnEnv(),
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
      console.log('[FetchSources] discovery closed', {
        code,
        durationMs: Date.now() - startedAt,
        stdoutLength: stdout.length,
        stderr: stderr.trim().slice(0, 500),
      })
      if (code !== 0) {
        reject(new Error(`Failed to get fetch sources: ${stderr}`))
      } else {
        try {
          const sources = JSON.parse(stdout)
          console.log('[FetchSources] discovery parsed', {
            isArray: Array.isArray(sources),
            count: Array.isArray(sources) ? sources.length : null,
            ids: Array.isArray(sources) ? sources.map(source => source?.id).filter(Boolean) : [],
          })
          resolve(sources)
        } catch (e) {
          console.error('[FetchSources] parse failed', {
            message: e.message,
            stdoutPreview: stdout.slice(0, 500),
          })
          reject(new Error(`Failed to parse sources JSON: ${e.message}`))
        }
      }
    })
  })
}

function getFetchSourcesCached() {
  const signature = getFetchSourcesSignature()
  if (fetchSourcesCache && fetchSourcesCacheSignature === signature) {
    console.log('[FetchSources] cache hit', { count: fetchSourcesCache.length })
    return Promise.resolve(fetchSourcesCache)
  }
  if (fetchSourcesInflight) {
    console.log('[FetchSources] reuse inflight discovery')
    return fetchSourcesInflight
  }

  fetchSourcesInflight = discoverFetchSourcesViaPython()
    .then((sources) => {
      fetchSourcesCache = sources
      fetchSourcesCacheSignature = signature
      return sources
    })
    .finally(() => {
      fetchSourcesInflight = null
    })
  return fetchSourcesInflight
}

// Fetch sources management
ipcMain.handle('fetch:getSources', async (event) => {
  return getFetchSourcesCached()
})

app.whenReady().then(() => {
  protocol.handle('podflow-media', (request) => {
    const token = decodeURIComponent(new URL(request.url).pathname.replace(/^\//, ''))
    const record = mediaTokens.get(token)
    if (!record || record.expiresAt <= Date.now()) {
      mediaTokens.delete(token)
      throw new Error('Media token not found or expired')
    }
    return net.fetch(pathToFileURL(record.path).toString(), { headers: request.headers })
  })
  if (process.platform !== 'darwin') {
    Menu.setApplicationMenu(null)
  }
  configManager = new ConfigManager()
  currentWorkflow = null
  currentWorkflowDirty = false
  createWindow()
  nativeTheme.on('updated', syncWindowIconWithSystemTheme)
  getFetchSourcesCached().catch((error) => {
    console.error('[FetchSources] warmup failed', { message: error.message })
  })

})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  nativeTheme.removeListener('updated', syncWindowIconWithSystemTheme)
  cleanupBeforeQuit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})
