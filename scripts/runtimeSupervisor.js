#!/usr/bin/env node

const fs = require('node:fs')
const http = require('node:http')
const net = require('node:net')
const path = require('node:path')
const { spawn, spawnSync } = require('node:child_process')
const {
  readJson,
  readManifest,
  updateManifest,
} = require('./runtimeManifest')

const projectRoot = path.resolve(__dirname, '..')
const STOP_POLL_MS = 300
const STOP_GRACE_MS = 8_000

function resolveDevExecutables(root = projectRoot) {
  return {
    vite: {
      command: process.execPath,
      argsPrefix: [path.join(root, 'node_modules', 'vite', 'bin', 'vite.js')],
    },
    electron: {
      command: require('electron'),
      argsPrefix: [],
    },
  }
}

function sanitizedEnv(extra = {}) {
  const env = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (!key || key.startsWith('=') || value === undefined) continue
    env[key] = value
  }
  return { ...env, ...extra }
}

function isTcpPortFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer()
    server.once('error', () => resolve(false))
    server.once('listening', () => server.close(() => resolve(true)))
    server.listen(port, '127.0.0.1')
  })
}

async function choosePort(preferred, range = 100) {
  const start = Number(preferred)
  if (!Number.isInteger(start) || start < 1 || start > 65535) {
    throw new Error(`Invalid port: ${preferred}`)
  }
  for (let port = start; port < Math.min(start + range, 65536); port += 1) {
    if (await isTcpPortFree(port)) return port
  }
  throw new Error(`No loopback port available in range ${start}-${Math.min(start + range - 1, 65535)}`)
}

function isHttpReady(url) {
  return new Promise((resolve) => {
    const request = http.get(url, (response) => {
      response.resume()
      resolve(response.statusCode >= 200 && response.statusCode < 500)
    })
    request.on('error', () => resolve(false))
    request.setTimeout(1_000, () => {
      request.destroy()
      resolve(false)
    })
  })
}

async function waitForHttp(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await isHttpReady(url)) return true
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  return false
}

function killProcessTree(child) {
  if (!child?.pid) return
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
    return
  }
  try {
    process.kill(-child.pid, 'SIGKILL')
  } catch {
    try { child.kill('SIGKILL') } catch { /* process already exited */ }
  }
}

function appendLog(logPath, source, chunk) {
  const lines = String(chunk).replace(/\r\n/g, '\n').split('\n')
  const stamp = new Date().toISOString()
  const text = lines.filter((line, index) => line || index < lines.length - 1)
    .map((line) => `${stamp} [${source}] ${line}\n`).join('')
  if (text) fs.appendFileSync(logPath, text, 'utf8')
}

function attachOutput(child, source, config) {
  for (const [streamName, stream] of [['stdout', child.stdout], ['stderr', child.stderr]]) {
    stream?.on('data', (chunk) => {
      appendLog(config.logPath, `${source}:${streamName}`, chunk)
      if (config.echo && !config.json) {
        const target = streamName === 'stderr' ? process.stderr : process.stdout
        target.write(chunk)
      }
    })
  }
}

function emitEvent(config, type, details = {}) {
  const event = { type, sessionId: config.sessionId, timestamp: new Date().toISOString(), ...details }
  appendLog(config.logPath, 'supervisor', JSON.stringify(event))
  if (!config.echo) return
  if (config.json) process.stdout.write(`${JSON.stringify(event)}\n`)
  else process.stdout.write(`[podflow] ${type}${details.message ? `: ${details.message}` : ''}\n`)
}

async function supervise(config) {
  const executables = resolveDevExecutables(config.projectRoot)
  let viteProcess = null
  let electronProcess = null
  let stopping = false
  let ready = false
  let expectedStop = false
  let startupFailure = null
  let stopTimer = null
  let stopPoll = null
  let rendererReadyTimer = null

  fs.mkdirSync(path.dirname(config.logPath), { recursive: true })
  fs.mkdirSync(config.dataDir, { recursive: true })
  fs.mkdirSync(config.userDataDir, { recursive: true })
  fs.mkdirSync(config.artifactDir, { recursive: true })
  fs.writeFileSync(config.logPath, '', { flag: 'a' })

  updateManifest(config.manifestPath, {
    status: 'starting',
    processes: { supervisorPid: process.pid },
  })
  emitEvent(config, 'starting', { mode: config.mode })

  function finishManifest(status, exitCode, reason) {
    const current = readManifest(config.manifestPath)
    if (!current || current.nonce !== config.nonce) return
    updateManifest(config.manifestPath, {
      status,
      stoppedAt: new Date().toISOString(),
      processes: { vitePid: null, electronPid: null },
      exit: { code: exitCode, reason },
    })
  }

  function cleanupChildren(force = false) {
    if (electronProcess?.pid) {
      if (force) killProcessTree(electronProcess)
      else {
        try { electronProcess.send({ type: 'podflow:shutdown', nonce: config.nonce }) } catch { killProcessTree(electronProcess) }
      }
    }
    if (force && viteProcess?.pid) killProcessTree(viteProcess)
  }

  function requestStop(reason = 'requested') {
    if (stopping) return
    stopping = true
    expectedStop = true
    emitEvent(config, 'stopping', { reason })
    updateManifest(config.manifestPath, { status: 'stopping' })
    cleanupChildren(false)
    stopTimer = setTimeout(() => cleanupChildren(true), STOP_GRACE_MS)
  }

  process.on('SIGINT', () => requestStop('SIGINT'))
  process.on('SIGTERM', () => requestStop('SIGTERM'))

  try {
    let rendererUrl = null
    if (config.mode === 'dev') {
      const vitePort = await choosePort(config.vitePort)
      rendererUrl = `http://127.0.0.1:${vitePort}`
      viteProcess = spawn(executables.vite.command, [
        ...executables.vite.argsPrefix,
        '--host', '127.0.0.1', '--port', String(vitePort), '--strictPort',
      ], {
        cwd: config.projectRoot,
        env: sanitizedEnv({ VITE_PORT: String(vitePort) }),
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: process.platform !== 'win32',
        shell: false,
      })
      attachOutput(viteProcess, 'vite', config)
      updateManifest(config.manifestPath, {
        endpoints: { rendererUrl },
        processes: { vitePid: viteProcess.pid },
      })
      const viteReady = await waitForHttp(rendererUrl, config.startupTimeoutMs)
      if (!viteReady) throw new Error(`Vite did not become ready within ${config.startupTimeoutMs}ms: ${rendererUrl}`)
    } else {
      const indexPath = path.join(config.projectRoot, 'dist', 'index.html')
      if (!fs.existsSync(indexPath)) throw new Error(`Built renderer not found: ${indexPath}; run npm run build first`)
    }

    let cdpPort = null
    if (config.cdp !== 'off') {
      cdpPort = await choosePort(config.cdp === 'auto' ? 9222 : Number(config.cdp))
    }
    const cdpUrl = cdpPort ? `http://127.0.0.1:${cdpPort}` : null

    electronProcess = spawn(executables.electron.command, [...executables.electron.argsPrefix, '.'], {
      cwd: config.projectRoot,
      env: sanitizedEnv({
        NODE_ENV: config.mode === 'dev' ? 'development' : 'production',
        ...(rendererUrl ? { VITE_DEV_SERVER_URL: rendererUrl } : {}),
        PODFLOW_SESSION_ID: config.sessionId,
        PODFLOW_SESSION_NONCE: config.nonce,
        PODFLOW_SESSION_DIR: config.sessionDir,
        PODFLOW_DATA_DIR: config.dataDir,
        PODFLOW_USER_DATA_DIR: config.userDataDir,
        PODFLOW_ARTIFACT_DIR: config.artifactDir,
        PODFLOW_WINDOW_MODE: config.windowMode,
        PODFLOW_RUNTIME_CHILD: '1',
        ...(cdpPort ? { CDP_DEBUG: '1', CDP_PORT: String(cdpPort), CDP_HOST: '127.0.0.1' } : {}),
        ...(config.acceptanceSuite ? {
          CDP_ACCEPTANCE: '1',
          CDP_ACCEPTANCE_SUITE: config.acceptanceSuite,
          CDP_FAKE_MEDIA: '1',
        } : {}),
      }),
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      detached: process.platform !== 'win32',
      shell: false,
    })
    attachOutput(electronProcess, 'electron', config)
    updateManifest(config.manifestPath, {
      endpoints: { rendererUrl, cdpUrl },
      processes: { electronPid: electronProcess.pid },
    })
    rendererReadyTimer = setTimeout(() => {
      if (ready) return
      startupFailure = `Renderer did not report readiness within ${config.startupTimeoutMs}ms after Electron started`
      requestStop('renderer-timeout')
    }, config.startupTimeoutMs)

    stopPoll = setInterval(() => {
      const request = readJson(config.stopRequestPath)
      if (request?.nonce === config.nonce) requestStop(request.reason || 'cli')
    }, STOP_POLL_MS)

    electronProcess.on('message', (message) => {
      if (!message || message.nonce !== config.nonce) return
      if (message.type === 'podflow:ready' && !ready) {
        ready = true
        if (rendererReadyTimer) clearTimeout(rendererReadyTimer)
        updateManifest(config.manifestPath, {
          status: config.acceptanceSuite ? 'accepting' : 'ready',
          readyAt: new Date().toISOString(),
          renderer: message.renderer,
        })
        emitEvent(config, 'ready', { cdpUrl, rendererUrl })
      }
      if (message.type === 'podflow:acceptance-result') {
        updateManifest(config.manifestPath, { acceptance: message.result })
        emitEvent(config, 'acceptance-result', message.result)
      }
    })

    const exit = await new Promise((resolve, reject) => {
      electronProcess.once('error', reject)
      electronProcess.once('exit', (code, signal) => resolve({ code: code ?? 1, signal }))
      viteProcess?.once('exit', (code) => {
        if (!stopping) reject(new Error(`Vite exited unexpectedly with code ${code ?? 1}`))
      })
    })

    if (stopTimer) clearTimeout(stopTimer)
    if (stopPoll) clearInterval(stopPoll)
    if (rendererReadyTimer) clearTimeout(rendererReadyTimer)
    if (viteProcess?.pid) killProcessTree(viteProcess)
    const exitCode = startupFailure ? 1 : Number(exit.code || 0)
    const status = startupFailure ? 'failed' : (exitCode === 0 || expectedStop ? 'exited' : 'failed')
    const reason = startupFailure || (expectedStop ? 'stopped' : (ready ? 'electron-exited' : 'startup-crash'))
    finishManifest(status, exitCode, reason)
    emitEvent(config, status, { exitCode, reason })
    return exitCode
  } catch (error) {
    if (stopTimer) clearTimeout(stopTimer)
    if (stopPoll) clearInterval(stopPoll)
    if (rendererReadyTimer) clearTimeout(rendererReadyTimer)
    cleanupChildren(true)
    finishManifest('failed', 1, error.message)
    emitEvent(config, 'failed', { message: error.message })
    return 1
  }
}

async function main(argv = process.argv.slice(2)) {
  const configIndex = argv.indexOf('--config')
  const configPath = configIndex >= 0 ? argv[configIndex + 1] : null
  if (!configPath) throw new Error('runtimeSupervisor requires --config <path>')
  const config = readJson(path.resolve(configPath))
  if (!config) throw new Error(`Launch config not found: ${configPath}`)
  const manifest = readManifest(config.manifestPath)
  if (!manifest || manifest.nonce !== config.nonce) throw new Error('Launch config does not own this session manifest')
  const code = await supervise(config)
  process.exitCode = code
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`[podflow supervisor] ${error.stack || error.message}\n`)
    process.exitCode = 1
  })
}

module.exports = {
  choosePort,
  isTcpPortFree,
  resolveDevExecutables,
  supervise,
  waitForHttp,
}
