const fs = require('fs')
const path = require('path')

function finiteNumber(value, field, { min, max }) {
  const number = Number(value)
  if (!Number.isFinite(number) || number < min || number > max) {
    throw new Error(`${field} must be a finite number between ${min} and ${max}`)
  }
  return number
}

function create({ projectRoot }) {
  const playbackFile = path.join(projectRoot, 'out', 'playback.json')

  function load() {
    if (!fs.existsSync(playbackFile)) return {}
    const value = JSON.parse(fs.readFileSync(playbackFile, 'utf8'))
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('Playback catalog must be an object')
    }
    return value
  }

  function get(workflowId) {
    return load()[String(workflowId)] || null
  }

  function set(workflowId, patch, previous = {}) {
    const id = String(workflowId || '')
    if (!id) throw new Error('workflowId is required')
    const catalog = load()
    const value = {
      positionSeconds: finiteNumber(patch?.positionSeconds ?? previous.positionSeconds ?? 0, 'positionSeconds', { min: 0, max: Number.MAX_SAFE_INTEGER }),
      durationSeconds: finiteNumber(patch?.durationSeconds ?? previous.durationSeconds ?? 0, 'durationSeconds', { min: 0, max: Number.MAX_SAFE_INTEGER }),
      completed: Boolean(patch?.completed ?? previous.completed ?? false),
      speed: finiteNumber(patch?.speed ?? previous.speed ?? 1, 'speed', { min: 0.5, max: 3 }),
      playCount: Math.trunc(finiteNumber(patch?.playCount ?? previous.playCount ?? 0, 'playCount', { min: 0, max: Number.MAX_SAFE_INTEGER })),
      updatedAt: new Date().toISOString(),
    }
    catalog[id] = value
    fs.mkdirSync(path.dirname(playbackFile), { recursive: true })
    fs.writeFileSync(playbackFile, JSON.stringify(catalog, null, 2), 'utf8')
    return value
  }

  function remove(workflowId) {
    const catalog = load()
    const id = String(workflowId)
    if (!(id in catalog)) return false
    delete catalog[id]
    fs.writeFileSync(playbackFile, JSON.stringify(catalog, null, 2), 'utf8')
    return true
  }

  return { get, remove, set }
}

module.exports = { create, finiteNumber }
