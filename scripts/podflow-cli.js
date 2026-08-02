#!/usr/bin/env node

const fs = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')
const {
  atomicWriteJson,
  createManifest,
  manifestIsLive,
  readManifest,
  sessionPaths,
  updateManifest,
} = require('./runtimeManifest')

const projectRoot = path.resolve(__dirname, '..')
const supervisorPath = path.join(__dirname, 'runtimeSupervisor.js')
const packageJson = require('../package.json')

const EXIT = Object.freeze({
  OK: 0,
  ARGUMENT: 2,
  ENVIRONMENT: 3,
  CONFLICT: 4,
  STARTUP_TIMEOUT: 5,
  CRASH: 6,
  ACCEPTANCE: 7,
  STOP: 8,
  INTERNAL: 9,
})

const COMMANDS = new Set(['doctor', 'start', 'run', 'status', 'stop', 'logs', 'accept', 'version', 'help'])
const VALUE_OPTIONS = new Set([
  'mode', 'session', 'cdp', 'window', 'timeout', 'artifacts-dir', 'suite', 'tail',
])
const BOOLEAN_OPTIONS = new Set(['json', 'follow', 'help'])

class CliError extends Error {
  constructor(message, exitCode) {
    super(message)
    this.name = 'CliError'
    this.exitCode = exitCode
  }
}

function parseArgs(argv) {
  const command = argv[0] && !argv[0].startsWith('-') ? argv[0] : 'help'
  if (!COMMANDS.has(command)) throw new CliError(`Unknown command: ${command}`, EXIT.ARGUMENT)
  const options = {}
  const positionals = []
  for (let index = command === 'help' && argv[0]?.startsWith('-') ? 0 : 1; index < argv.length; index += 1) {
    const token = argv[index]
    if (!token.startsWith('--')) {
      positionals.push(token)
      continue
    }
    const [rawName, inlineValue] = token.slice(2).split(/=(.*)/s, 2)
    if (BOOLEAN_OPTIONS.has(rawName)) {
      if (inlineValue !== undefined) throw new CliError(`--${rawName} does not accept a value`, EXIT.ARGUMENT)
      options[rawName] = true
      continue
    }
    if (!VALUE_OPTIONS.has(rawName)) throw new CliError(`Unknown option: --${rawName}`, EXIT.ARGUMENT)
    const value = inlineValue !== undefined ? inlineValue : argv[++index]
    if (!value || value.startsWith('--')) throw new CliError(`--${rawName} requires a value`, EXIT.ARGUMENT)
    options[rawName] = value
  }
  if (positionals.length) throw new CliError(`Unexpected argument: ${positionals[0]}`, EXIT.ARGUMENT)
  return { command, options }
}

function parsePositiveInteger(value, fallback, name) {
  if (value === undefined) return fallback
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) throw new CliError(`--${name} must be a positive integer`, EXIT.ARGUMENT)
  return parsed
}

function validateEnum(value, allowed, name, fallback) {
  const resolved = value || fallback
  if (!allowed.includes(resolved)) {
    throw new CliError(`--${name} must be one of: ${allowed.join(', ')}`, EXIT.ARGUMENT)
  }
  return resolved
}

function validateCdp(value) {
  const resolved = value || 'off'
  if (resolved === 'off' || resolved === 'auto') return resolved
  const port = Number(resolved)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new CliError('--cdp must be off, auto, or a port from 1 to 65535', EXIT.ARGUMENT)
  }
  return String(port)
}

function output(options, payload, textMessage) {
  if (options.json) process.stdout.write(`${JSON.stringify(payload)}\n`)
  else process.stdout.write(`${textMessage}\n`)
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitForManifest(manifestPath, predicate, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const manifest = readManifest(manifestPath)
    if (manifest && predicate(manifest)) return manifest
    await wait(200)
  }
  return readManifest(manifestPath)
}

function buildLaunch(command, options) {
  const acceptance = command === 'accept'
  const defaultSession = acceptance
    ? `accept-${new Date().toISOString().replace(/[:.]/g, '-').toLowerCase()}`
    : 'default'
  const sessionId = options.session || defaultSession
  const paths = sessionPaths(projectRoot, sessionId)
  const existing = readManifest(paths.manifestPath)
  if (manifestIsLive(existing)) {
    throw new CliError(`Session is already active: ${sessionId}`, EXIT.CONFLICT)
  }

  const mode = validateEnum(options.mode, ['dev', 'built'], 'mode', 'dev')
  const windowMode = validateEnum(options.window, ['show', 'hidden'], 'window', acceptance ? 'hidden' : 'show')
  const suite = acceptance
    ? validateEnum(options.suite, ['startup', 'ui', 'e2e-offline'], 'suite', 'e2e-offline')
    : null
  const cdp = acceptance ? validateCdp(options.cdp || 'auto') : validateCdp(options.cdp)
  if (acceptance && cdp === 'off') throw new CliError('Acceptance requires CDP; use --cdp auto or a loopback port', EXIT.ARGUMENT)
  const startupTimeoutMs = parsePositiveInteger(options.timeout, 60, 'timeout') * 1000
  const requestedArtifactDir = options['artifacts-dir']
    ? path.resolve(projectRoot, options['artifacts-dir'])
    : paths.artifactDir
  const manifest = createManifest({
    projectRoot,
    sessionId,
    mode,
    windowMode,
    cdp,
    command,
    artifactDir: requestedArtifactDir,
  })
  fs.mkdirSync(paths.sessionDir, { recursive: true })
  try { fs.unlinkSync(paths.stopRequestPath) } catch (error) { if (error.code !== 'ENOENT') throw error }
  atomicWriteJson(paths.manifestPath, manifest)

  const launch = {
    projectRoot,
    sessionId,
    nonce: manifest.nonce,
    mode,
    windowMode,
    cdp,
    acceptanceSuite: suite,
    startupTimeoutMs,
    vitePort: Number(process.env.VITE_PORT || 5174),
    sessionDir: paths.sessionDir,
    manifestPath: paths.manifestPath,
    stopRequestPath: paths.stopRequestPath,
    logPath: paths.logPath,
    dataDir: paths.dataDir,
    userDataDir: paths.userDataDir,
    artifactDir: requestedArtifactDir,
    echo: command === 'run',
    json: Boolean(options.json),
  }
  atomicWriteJson(paths.launchPath, launch)
  return { launch, paths }
}

function spawnSupervisor(paths, { detached, stdio }) {
  const child = spawn(process.execPath, [supervisorPath, '--config', paths.launchPath], {
    cwd: projectRoot,
    detached,
    stdio,
    windowsHide: true,
    shell: false,
  })
  return child
}

async function startCommand(options) {
  const { launch, paths } = buildLaunch('start', options)
  const child = spawnSupervisor(paths, { detached: true, stdio: 'ignore' })
  child.unref()
  updateManifest(paths.manifestPath, { processes: { supervisorPid: child.pid } })
  const manifest = await waitForManifest(
    paths.manifestPath,
    (value) => ['ready', 'failed', 'exited'].includes(value.status),
    launch.startupTimeoutMs,
  )
  if (manifest?.status === 'ready') {
    output(options, { ok: true, command: 'start', session: manifest }, `PodFlow session ${manifest.sessionId} is ready`)
    return EXIT.OK
  }
  atomicWriteJson(paths.stopRequestPath, { nonce: launch.nonce, reason: 'startup-timeout', requestedAt: new Date().toISOString() })
  const reason = manifest?.exit?.reason || `Startup timed out after ${launch.startupTimeoutMs}ms`
  throw new CliError(reason, manifest?.status === 'failed' ? EXIT.CRASH : EXIT.STARTUP_TIMEOUT)
}

async function runCommand(options) {
  const { paths } = buildLaunch('run', options)
  const child = spawnSupervisor(paths, { detached: false, stdio: 'inherit' })
  updateManifest(paths.manifestPath, { processes: { supervisorPid: child.pid } })
  const exitCode = await new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('exit', (code) => resolve(code ?? 1))
  })
  return exitCode === 0 ? EXIT.OK : EXIT.CRASH
}

function requireSession(options) {
  const sessionId = options.session || 'default'
  const paths = sessionPaths(projectRoot, sessionId)
  const manifest = readManifest(paths.manifestPath)
  if (!manifest) throw new CliError(`Session not found: ${sessionId}`, EXIT.CONFLICT)
  return { sessionId, paths, manifest }
}

async function statusCommand(options) {
  const { manifest } = requireSession(options)
  const live = manifestIsLive(manifest)
  const effectiveStatus = !live && !['exited', 'failed'].includes(manifest.status) ? 'stale' : manifest.status
  const result = { ...manifest, status: effectiveStatus, live }
  output(options, { ok: true, command: 'status', session: result }, `${manifest.sessionId}: ${effectiveStatus}`)
  return EXIT.OK
}

async function stopCommand(options) {
  const { paths, manifest } = requireSession(options)
  if (!manifestIsLive(manifest)) {
    output(options, { ok: true, command: 'stop', session: manifest, alreadyStopped: true }, `${manifest.sessionId} is already stopped`)
    return EXIT.OK
  }
  atomicWriteJson(paths.stopRequestPath, {
    nonce: manifest.nonce,
    reason: 'cli',
    requestedAt: new Date().toISOString(),
  })
  const timeoutMs = parsePositiveInteger(options.timeout, 15, 'timeout') * 1000
  const stopped = await waitForManifest(paths.manifestPath, (value) => ['exited', 'failed'].includes(value.status), timeoutMs)
  if (!stopped || !['exited', 'failed'].includes(stopped.status)) {
    throw new CliError(`Session did not stop within ${timeoutMs}ms: ${manifest.sessionId}`, EXIT.STOP)
  }
  output(options, { ok: true, command: 'stop', session: stopped }, `PodFlow session ${manifest.sessionId} stopped`)
  return EXIT.OK
}

function tailLines(filePath, count) {
  if (!fs.existsSync(filePath)) return []
  return fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n').split('\n').filter(Boolean).slice(-count)
}

async function logsCommand(options) {
  const { paths, manifest } = requireSession(options)
  const count = parsePositiveInteger(options.tail, 100, 'tail')
  const initial = tailLines(paths.logPath, count)
  const printLines = (lines) => {
    if (options.json) lines.forEach((line) => process.stdout.write(`${JSON.stringify({ type: 'log', sessionId: manifest.sessionId, line })}\n`))
    else lines.forEach((line) => process.stdout.write(`${line}\n`))
  }
  printLines(initial)
  if (!options.follow) return EXIT.OK
  let offset = fs.existsSync(paths.logPath) ? fs.statSync(paths.logPath).size : 0
  while (manifestIsLive(readManifest(paths.manifestPath))) {
    await wait(500)
    if (!fs.existsSync(paths.logPath)) continue
    const size = fs.statSync(paths.logPath).size
    if (size <= offset) continue
    const descriptor = fs.openSync(paths.logPath, 'r')
    const buffer = Buffer.alloc(size - offset)
    fs.readSync(descriptor, buffer, 0, buffer.length, offset)
    fs.closeSync(descriptor)
    offset = size
    printLines(buffer.toString('utf8').replace(/\r\n/g, '\n').split('\n').filter(Boolean))
  }
  return EXIT.OK
}

async function acceptCommand(options) {
  const { launch, paths } = buildLaunch('accept', options)
  const child = spawnSupervisor(paths, { detached: false, stdio: 'ignore' })
  updateManifest(paths.manifestPath, { processes: { supervisorPid: child.pid } })
  const acceptanceTimeoutMs = Math.max(launch.startupTimeoutMs, launch.acceptanceSuite === 'e2e-offline' ? 12 * 60_000 : 3 * 60_000)
  const manifest = await waitForManifest(
    paths.manifestPath,
    (value) => ['exited', 'failed'].includes(value.status),
    acceptanceTimeoutMs,
  )
  if (!manifest || !['exited', 'failed'].includes(manifest.status)) {
    atomicWriteJson(paths.stopRequestPath, { nonce: launch.nonce, reason: 'acceptance-timeout', requestedAt: new Date().toISOString() })
    throw new CliError(`Acceptance timed out after ${acceptanceTimeoutMs}ms`, EXIT.ACCEPTANCE)
  }
  const passed = manifest.acceptance?.status === 'PASS'
  output(
    options,
    { ok: passed, command: 'accept', session: manifest, acceptance: manifest.acceptance },
    `${launch.acceptanceSuite} acceptance ${passed ? 'PASS' : 'FAIL'}: ${manifest.acceptance?.reportPath || paths.logPath}`,
  )
  return passed ? EXIT.OK : EXIT.ACCEPTANCE
}

function doctorCommand(options) {
  const checks = [
    { name: 'node', ok: Number(process.versions.node.split('.')[0]) >= 20, detail: process.version },
    { name: 'electron', ok: fs.existsSync(require('electron')), detail: require('electron') },
    { name: 'vite', ok: fs.existsSync(path.join(projectRoot, 'node_modules', 'vite', 'bin', 'vite.js')), detail: 'node_modules/vite/bin/vite.js' },
    { name: 'renderer-source', ok: fs.existsSync(path.join(projectRoot, 'src', 'main.tsx')), detail: 'src/main.tsx' },
    { name: 'built-renderer', ok: fs.existsSync(path.join(projectRoot, 'dist', 'index.html')), detail: 'dist/index.html (required only for --mode built)' },
  ]
  const requiredPassed = checks.filter((check) => check.name !== 'built-renderer').every((check) => check.ok)
  output(options, { ok: requiredPassed, command: 'doctor', checks }, requiredPassed ? 'PodFlow CLI environment is ready' : 'PodFlow CLI environment has blocking failures')
  return requiredPassed ? EXIT.OK : EXIT.ENVIRONMENT
}

function helpCommand() {
  process.stdout.write(`PodFlow Studio CLI ${packageJson.version}\n\n`)
  process.stdout.write('Usage: podflow <command> [options]\n\n')
  process.stdout.write('Commands:\n')
  process.stdout.write('  doctor                 Check local runtime prerequisites\n')
  process.stdout.write('  start                  Start an isolated background session\n')
  process.stdout.write('  run                    Run a session in the foreground\n')
  process.stdout.write('  status                 Read session state and endpoints\n')
  process.stdout.write('  stop                   Gracefully stop a session owned by its nonce\n')
  process.stdout.write('  logs                   Print or follow the session log\n')
  process.stdout.write('  accept                 Run startup, ui, or e2e-offline acceptance\n')
  process.stdout.write('  version                Print the application and CLI version\n\n')
  process.stdout.write('Common options: --session <id> --mode <dev|built> --window <show|hidden> --cdp <off|auto|port> --json\n')
  process.stdout.write('Acceptance:    --suite <startup|ui|e2e-offline> --artifacts-dir <path> --timeout <seconds>\n')
  process.stdout.write('Logs:          --tail <lines> --follow\n')
  return EXIT.OK
}

async function main(argv = process.argv.slice(2)) {
  let parsed
  const wantsJson = argv.includes('--json')
  try {
    parsed = parseArgs(argv)
    if (parsed.options.help || parsed.command === 'help') return helpCommand()
    if (parsed.command === 'version') {
      output(parsed.options, { ok: true, command: 'version', version: packageJson.version }, packageJson.version)
      return EXIT.OK
    }
    if (parsed.command === 'doctor') return doctorCommand(parsed.options)
    if (parsed.command === 'start') return await startCommand(parsed.options)
    if (parsed.command === 'run') return await runCommand(parsed.options)
    if (parsed.command === 'status') return await statusCommand(parsed.options)
    if (parsed.command === 'stop') return await stopCommand(parsed.options)
    if (parsed.command === 'logs') return await logsCommand(parsed.options)
    if (parsed.command === 'accept') return await acceptCommand(parsed.options)
    throw new CliError(`Unsupported command: ${parsed.command}`, EXIT.ARGUMENT)
  } catch (error) {
    const exitCode = error instanceof CliError ? error.exitCode : EXIT.INTERNAL
    const payload = { ok: false, error: { message: error.message, exitCode } }
    if (parsed?.options?.json || wantsJson) process.stdout.write(`${JSON.stringify(payload)}\n`)
    else process.stderr.write(`[podflow] ${error.message}\n`)
    return exitCode
  }
}

if (require.main === module) {
  main().then((code) => { process.exitCode = code }).catch((error) => {
    process.stderr.write(`[podflow] ${error.stack || error.message}\n`)
    process.exitCode = EXIT.INTERNAL
  })
}

module.exports = {
  EXIT,
  CliError,
  buildLaunch,
  main,
  parseArgs,
  validateCdp,
}
