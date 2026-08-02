const fs = require('node:fs')
const path = require('node:path')

function sendToSupervisor(message) {
  if (typeof process.send !== 'function') return false
  try {
    process.send({
      ...message,
      nonce: process.env.PODFLOW_SESSION_NONCE || null,
      sessionId: process.env.PODFLOW_SESSION_ID || null,
    })
    return true
  } catch {
    return false
  }
}

function configureCliRuntime(app) {
  const userDataDir = process.env.PODFLOW_USER_DATA_DIR
  if (!userDataDir) return null
  const resolved = path.resolve(userDataDir)
  fs.mkdirSync(resolved, { recursive: true })
  app.setPath('userData', resolved)
  return resolved
}

function installParentLifecycle(app, onShutdown) {
  if (process.env.PODFLOW_RUNTIME_CHILD !== '1') return () => {}
  const listener = (message) => {
    if (!message || message.type !== 'podflow:shutdown') return
    if (message.nonce !== process.env.PODFLOW_SESSION_NONCE) return
    onShutdown?.()
    app.quit()
  }
  process.on('message', listener)
  const heartbeat = setInterval(() => {
    sendToSupervisor({ type: 'podflow:heartbeat', pid: process.pid })
  }, 2_000)
  heartbeat.unref()
  return () => {
    clearInterval(heartbeat)
    process.removeListener('message', listener)
  }
}

function runtimeInfo(app) {
  return {
    sessionId: process.env.PODFLOW_SESSION_ID || null,
    pid: process.pid,
    version: app.getVersion(),
    userDataDir: app.getPath('userData'),
    dataDir: process.env.PODFLOW_DATA_DIR || null,
    artifactDir: process.env.PODFLOW_ARTIFACT_DIR || null,
    windowMode: process.env.PODFLOW_WINDOW_MODE || 'show',
    cdpUrl: process.env.CDP_PORT ? `http://127.0.0.1:${process.env.CDP_PORT}` : null,
  }
}

function notifyRendererReady(app, payload = {}) {
  const renderer = {
    ...runtimeInfo(app),
    title: typeof payload.title === 'string' ? payload.title : '',
    href: typeof payload.href === 'string' ? payload.href : '',
    readyState: typeof payload.readyState === 'string' ? payload.readyState : '',
  }
  sendToSupervisor({ type: 'podflow:ready', renderer })
  return renderer
}

function notifyAcceptanceResult(result) {
  sendToSupervisor({ type: 'podflow:acceptance-result', result })
}

module.exports = {
  configureCliRuntime,
  installParentLifecycle,
  notifyAcceptanceResult,
  notifyRendererReady,
  runtimeInfo,
  sendToSupervisor,
}
