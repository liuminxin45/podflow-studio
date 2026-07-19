#!/usr/bin/env node

const http = require('http')
const net = require('net')
const fs = require('fs')
const path = require('path')
const { spawn, spawnSync } = require('child_process')

const projectRoot = path.resolve(__dirname, '..')
const vitePort = String(process.env.VITE_PORT || '5174')
const preferredCdpPort = String(process.env.CDP_PORT || process.env.CDP_ACCEPTANCE_PORT || '9222')
const viteUrl = `http://127.0.0.1:${vitePort}`
const reportPath = path.join(projectRoot, 'docs', 'acceptance', 'CDP_ACCEPTANCE_REPORT.md')
const electronBin = path.join(
  projectRoot,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'electron.cmd' : 'electron'
)

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function findListeningPids(port) {
  const pids = new Set()
  if (process.platform === 'win32') {
    const result = spawnSync('netstat', ['-ano', '-p', 'tcp'], { encoding: 'utf8' })
    const output = `${result.stdout || ''}\n${result.stderr || ''}`
    for (const line of output.split(/\r?\n/)) {
      const columns = line.trim().split(/\s+/)
      if (columns.length < 5) continue
      const localAddress = columns[1] || ''
      const state = columns[3] || ''
      const pid = columns[4] || ''
      if (!localAddress.endsWith(`:${port}`)) continue
      if (state.toUpperCase() !== 'LISTENING') continue
      if (pid && pid !== String(process.pid)) pids.add(pid)
    }
    return Array.from(pids)
  }

  const result = spawnSync('sh', ['-lc', `lsof -tiTCP:${port} -sTCP:LISTEN 2>/dev/null || true`], { encoding: 'utf8' })
  for (const pid of String(result.stdout || '').split(/\s+/).filter(Boolean)) {
    if (pid !== String(process.pid)) pids.add(pid)
  }
  return Array.from(pids)
}

function isTcpPortFree(port) {
  return new Promise(resolve => {
    const server = net.createServer()
    server.once('error', () => resolve(false))
    server.once('listening', () => {
      server.close(() => resolve(true))
    })
    server.listen(Number(port), '127.0.0.1')
  })
}

async function findFreeCdpPort(startPort) {
  const start = Number(startPort)
  for (let port = start + 1; port < start + 100; port += 1) {
    if (await isTcpPortFree(port)) return String(port)
  }
  throw new Error(`No free CDP port found after ${startPort}`)
}

async function prepareCdpPort(port) {
  const pids = findListeningPids(port)
  if (pids.length === 0) return port

  const fallbackPort = await findFreeCdpPort(port)
  console.log(
    `[CDP Acceptance] Port ${port} is occupied by PID(s): ${pids.join(', ')}; ` +
      `using isolated CDP port ${fallbackPort}`
  )
  return fallbackPort
}

function isHttpReady(url) {
  return new Promise(resolve => {
    const request = http.get(url, response => {
      response.resume()
      resolve(response.statusCode >= 200 && response.statusCode < 500)
    })
    request.on('error', () => resolve(false))
    request.setTimeout(1000, () => {
      request.destroy()
      resolve(false)
    })
  })
}

async function waitForHttp(url, timeoutMs) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    if (await isHttpReady(url)) return true
    await wait(500)
  }
  return false
}

function killProcessTree(child) {
  if (!child || !child.pid) return
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
    return
  }
  child.kill('SIGTERM')
}

function buildEnv(extra = {}) {
  const env = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (!key || key.startsWith('=') || value === undefined) continue
    env[key] = value
  }
  return { ...env, ...extra }
}

function reportPassed(startedAt = 0) {
  if (!fs.existsSync(reportPath)) return false
  const stat = fs.statSync(reportPath)
  if (stat.mtimeMs + 1000 < startedAt) return false
  const report = fs.readFileSync(reportPath, 'utf8')
  return /- Status:\s*PASS/.test(report)
}

async function main() {
  let viteProcess = null
  const acceptanceStartedAt = Date.now()
  const viteAlreadyRunning = await isHttpReady(viteUrl)

  if (viteAlreadyRunning) {
    console.log(`[CDP Acceptance] Reusing existing Vite server at ${viteUrl}`)
  } else {
    console.log(`[CDP Acceptance] Starting Vite server at ${viteUrl}`)
    const npmBin = process.platform === 'win32' ? 'npm.cmd' : 'npm'
    viteProcess = spawn(npmBin, ['run', 'dev:react'], {
      cwd: projectRoot,
      env: buildEnv(),
      stdio: 'inherit',
      shell: process.platform === 'win32'
    })

    const ready = await waitForHttp(viteUrl, 60000)
    if (!ready) {
      killProcessTree(viteProcess)
      throw new Error(`Vite did not become ready at ${viteUrl}`)
    }
  }

  const cdpPort = await prepareCdpPort(preferredCdpPort)

  console.log(`[CDP Acceptance] Starting Electron with CDP at http://127.0.0.1:${cdpPort}`)
  const electronProcess = spawn(electronBin, ['.'], {
    cwd: projectRoot,
    env: buildEnv({
      NODE_ENV: 'development',
      VITE_DEV_SERVER_URL: viteUrl,
      CDP_ACCEPTANCE: '1',
      CDP_PORT: cdpPort,
      CDP_FAKE_MEDIA: process.env.CDP_FAKE_MEDIA || '1'
    }),
    stdio: 'inherit',
    shell: process.platform === 'win32'
  })

  const exitCode = await new Promise(resolve => {
    electronProcess.on('exit', code => resolve(code ?? 1))
    electronProcess.on('error', error => {
      console.error(`[CDP Acceptance] Failed to start Electron: ${error.message}`)
      resolve(1)
    })
  })

  if (viteProcess) {
    killProcessTree(viteProcess)
  }

  const passed = reportPassed(acceptanceStartedAt)
  process.exit(passed ? 0 : (exitCode || 1))
}

main().catch(error => {
  console.error(`[CDP Acceptance] ${error.stack || error.message}`)
  process.exit(1)
})
