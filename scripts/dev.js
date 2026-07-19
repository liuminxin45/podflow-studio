#!/usr/bin/env node

const http = require('node:http')
const net = require('node:net')
const path = require('node:path')
const { spawn, spawnSync } = require('node:child_process')

const projectRoot = path.resolve(__dirname, '..')
const args = process.argv.slice(2)
const withCdp = args.includes('--cdp')
const preferredPort = Number(
  readArgValue('--port') || process.env.VITE_PORT || process.env.PORT || 5174
)
const cdpPort = String(readArgValue('--cdp-port') || process.env.CDP_PORT || 9222)

let shuttingDown = false
let viteProcess = null
let electronProcess = null

function readArgValue(name) {
  const index = args.indexOf(name)
  if (index === -1) return null
  return args[index + 1] || null
}

function resolveDevExecutables(root = projectRoot) {
  const viteCli = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js')
  const electronBinary = require('electron')
  return {
    vite: {
      command: process.execPath,
      argsPrefix: [viteCli],
    },
    electron: {
      command: electronBinary,
      argsPrefix: [],
    },
  }
}

function buildEnv(extra = {}) {
  return { ...process.env, ...extra }
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

  const result = spawnSync('sh', ['-lc', `lsof -tiTCP:${port} -sTCP:LISTEN 2>/dev/null || true`], {
    encoding: 'utf8',
  })
  for (const pid of String(result.stdout || '').split(/\s+/).filter(Boolean)) {
    if (pid !== String(process.pid)) pids.add(pid)
  }
  return Array.from(pids)
}

function isTcpPortFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer()
    server.once('error', () => resolve(false))
    server.once('listening', () => {
      server.close(() => resolve(true))
    })
    server.listen(port, '127.0.0.1')
  })
}

async function chooseVitePort(startPort) {
  for (let port = startPort; port < startPort + 50; port += 1) {
    if (await isTcpPortFree(port)) {
      if (port !== startPort) {
        const pids = findListeningPids(startPort)
        const owner = pids.length > 0 ? `, owner PID: ${pids.join(', ')}` : ''
        console.log(`[dev] Port ${startPort} is in use${owner}; using ${port}`)
      }
      return port
    }
  }
  throw new Error(`No available Vite port found after trying ${startPort}-${startPort + 49}`)
}

async function chooseCdpPort(startPort) {
  const start = Number(startPort)
  for (let port = start; port < start + 50; port += 1) {
    if (await isTcpPortFree(port)) {
      if (port !== start) {
        const pids = findListeningPids(start)
        const owner = pids.length > 0 ? `, owner PID: ${pids.join(', ')}` : ''
        console.log(`[dev] CDP port ${start} is in use${owner}; using ${port}`)
      }
      return String(port)
    }
  }
  throw new Error(`No available CDP port found after trying ${start}-${start + 49}`)
}

function isHttpReady(url) {
  return new Promise((resolve) => {
    const request = http.get(url, (response) => {
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
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    if (await isHttpReady(url)) return true
    await new Promise((resolve) => setTimeout(resolve, 300))
  }
  return false
}

function killProcessTree(child) {
  if (!child || !child.pid) return
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
    return
  }
  spawnSync('sh', ['-lc', `kill -TERM -${child.pid} 2>/dev/null || kill -TERM ${child.pid} 2>/dev/null || true`], {
    stdio: 'ignore',
  })
}

function shutdown(code = 0) {
  if (shuttingDown) return
  shuttingDown = true
  killProcessTree(electronProcess)
  killProcessTree(viteProcess)
  process.exit(code)
}

async function main() {
  const executables = resolveDevExecutables()
  const vitePort = await chooseVitePort(preferredPort)
  const viteUrl = `http://127.0.0.1:${vitePort}`
  const resolvedCdpPort = withCdp ? await chooseCdpPort(cdpPort) : ''

  console.log(`[dev] Starting Vite: ${viteUrl}`)
  viteProcess = spawn(executables.vite.command, [
    ...executables.vite.argsPrefix,
    '--host', '127.0.0.1', '--port', String(vitePort), '--strictPort',
  ], {
    cwd: projectRoot,
    env: buildEnv({ VITE_PORT: String(vitePort) }),
    stdio: 'inherit',
    shell: false,
  })

  viteProcess.on('exit', (code) => {
    if (!shuttingDown) {
      console.error(`[dev] Vite exited, code=${code ?? 1}`)
      shutdown(code ?? 1)
    }
  })

  const ready = await waitForHttp(viteUrl, 60000)
  if (!ready) {
    console.error(`[dev] Vite was not ready within 60 seconds: ${viteUrl}`)
    shutdown(1)
  }

  console.log(`[dev] Starting Electron, page URL: ${viteUrl}`)
  electronProcess = spawn(executables.electron.command, [...executables.electron.argsPrefix, '.'], {
    cwd: projectRoot,
    env: buildEnv({
      NODE_ENV: 'development',
      VITE_DEV_SERVER_URL: viteUrl,
      ...(withCdp
        ? {
            CDP_DEBUG: '1',
            CDP_PORT: resolvedCdpPort,
            CDP_FAKE_MEDIA: process.env.CDP_FAKE_MEDIA || '1',
          }
        : {}),
    }),
    stdio: 'inherit',
    shell: false,
  })

  electronProcess.on('exit', (code) => {
    if (!shuttingDown) shutdown(code ?? 0)
  })
  electronProcess.on('error', (error) => {
    console.error(`[dev] Electron failed to start: ${error.message}`)
    shutdown(1)
  })
}

if (require.main === module) {
  process.on('SIGINT', () => shutdown(0))
  process.on('SIGTERM', () => shutdown(0))

  main().catch((error) => {
    console.error(`[dev] ${error.stack || error.message}`)
    shutdown(1)
  })
}

module.exports = {
  resolveDevExecutables,
}
