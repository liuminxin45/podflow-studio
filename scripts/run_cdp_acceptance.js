#!/usr/bin/env node

const http = require('http')
const fs = require('fs')
const path = require('path')
const { spawn, spawnSync } = require('child_process')

const projectRoot = path.resolve(__dirname, '..')
const vitePort = String(process.env.VITE_PORT || '5173')
const cdpPort = String(process.env.CDP_PORT || process.env.CDP_ACCEPTANCE_PORT || '9222')
const viteUrl = `http://localhost:${vitePort}`
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

function reportPassed() {
  if (!fs.existsSync(reportPath)) return false
  const report = fs.readFileSync(reportPath, 'utf8')
  return /- Status:\s*PASS/.test(report)
}

async function main() {
  let viteProcess = null
  const viteAlreadyRunning = await isHttpReady(viteUrl)

  if (viteAlreadyRunning) {
    console.log(`[CDP Acceptance] Reusing existing Vite server at ${viteUrl}`)
  } else {
    console.log(`[CDP Acceptance] Starting Vite server at ${viteUrl}`)
    const npmBin = process.platform === 'win32' ? 'npm.cmd' : 'npm'
    viteProcess = spawn(npmBin, ['run', 'dev:react'], {
      cwd: projectRoot,
      env: process.env,
      stdio: 'inherit'
    })

    const ready = await waitForHttp(viteUrl, 60000)
    if (!ready) {
      killProcessTree(viteProcess)
      throw new Error(`Vite did not become ready at ${viteUrl}`)
    }
  }

  console.log(`[CDP Acceptance] Starting Electron with CDP at http://127.0.0.1:${cdpPort}`)
  const electronProcess = spawn(electronBin, ['.'], {
    cwd: projectRoot,
    env: {
      ...process.env,
      NODE_ENV: 'development',
      CDP_ACCEPTANCE: '1',
      CDP_PORT: cdpPort,
      CDP_FAKE_MEDIA: process.env.CDP_FAKE_MEDIA || '1'
    },
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

  process.exit(exitCode === 0 || reportPassed() ? 0 : exitCode)
}

main().catch(error => {
  console.error(`[CDP Acceptance] ${error.stack || error.message}`)
  process.exit(1)
})
