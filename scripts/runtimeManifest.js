const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')

const MANIFEST_VERSION = 1
const TERMINAL_STATUSES = new Set(['exited', 'failed'])
const SESSION_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/

function assertSessionId(sessionId) {
  if (!SESSION_PATTERN.test(String(sessionId || ''))) {
    throw new Error('Session id must be 1-64 characters using letters, numbers, dot, underscore, or hyphen')
  }
  return sessionId
}

function runtimeRoot(projectRoot) {
  return path.join(projectRoot, '.podflow')
}

function sessionPaths(projectRoot, sessionId) {
  assertSessionId(sessionId)
  const sessionDir = path.join(runtimeRoot(projectRoot), 'sessions', sessionId)
  return {
    sessionDir,
    manifestPath: path.join(sessionDir, 'session.json'),
    launchPath: path.join(sessionDir, 'launch.json'),
    stopRequestPath: path.join(sessionDir, 'stop.request.json'),
    logPath: path.join(sessionDir, 'runtime.log'),
    dataDir: path.join(sessionDir, 'data'),
    userDataDir: path.join(sessionDir, 'electron-profile'),
    artifactDir: path.join(sessionDir, 'artifacts'),
  }
}

function atomicWriteJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  const temporaryPath = `${filePath}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  fs.renameSync(temporaryPath, filePath)
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch (error) {
    if (error && error.code === 'ENOENT') return null
    throw error
  }
}

function readManifest(manifestPath) {
  const manifest = readJson(manifestPath)
  if (!manifest) return null
  if (manifest.manifestVersion !== MANIFEST_VERSION) {
    throw new Error(`Unsupported session manifest version: ${manifest.manifestVersion}`)
  }
  return manifest
}

function isPidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return Boolean(error && error.code === 'EPERM')
  }
}

function manifestIsLive(manifest) {
  if (!manifest || TERMINAL_STATUSES.has(manifest.status)) return false
  return isPidAlive(manifest.processes?.supervisorPid) || isPidAlive(manifest.processes?.electronPid)
}

function createManifest({ projectRoot, sessionId, mode, windowMode, cdp, command, artifactDir }) {
  const paths = sessionPaths(projectRoot, sessionId)
  const now = new Date().toISOString()
  return {
    manifestVersion: MANIFEST_VERSION,
    sessionId,
    nonce: crypto.randomBytes(24).toString('hex'),
    command,
    status: 'starting',
    mode,
    windowMode,
    createdAt: now,
    updatedAt: now,
    readyAt: null,
    stoppedAt: null,
    endpoints: {
      rendererUrl: null,
      cdpUrl: cdp === 'off' ? null : 'pending',
    },
    processes: {
      cliPid: process.pid,
      supervisorPid: null,
      vitePid: null,
      electronPid: null,
    },
    paths: {
      sessionDir: paths.sessionDir,
      dataDir: paths.dataDir,
      userDataDir: paths.userDataDir,
      artifactDir: artifactDir || paths.artifactDir,
      logPath: paths.logPath,
      manifestPath: paths.manifestPath,
    },
    acceptance: null,
    exit: null,
  }
}

function updateManifest(manifestPath, patch) {
  const current = readManifest(manifestPath)
  if (!current) throw new Error(`Session manifest not found: ${manifestPath}`)
  const next = {
    ...current,
    ...patch,
    endpoints: patch.endpoints ? { ...current.endpoints, ...patch.endpoints } : current.endpoints,
    processes: patch.processes ? { ...current.processes, ...patch.processes } : current.processes,
    paths: patch.paths ? { ...current.paths, ...patch.paths } : current.paths,
    updatedAt: new Date().toISOString(),
  }
  atomicWriteJson(manifestPath, next)
  return next
}

module.exports = {
  MANIFEST_VERSION,
  TERMINAL_STATUSES,
  assertSessionId,
  atomicWriteJson,
  createManifest,
  isPidAlive,
  manifestIsLive,
  readJson,
  readManifest,
  runtimeRoot,
  sessionPaths,
  updateManifest,
}
