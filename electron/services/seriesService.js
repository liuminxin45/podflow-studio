const fs = require('fs')
const path = require('path')
const { randomUUID } = require('crypto')

const COVER_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png'])

function create({ projectRoot }) {
  const seriesFile = path.join(projectRoot, 'out', 'series.json')

  function load() {
    if (!fs.existsSync(seriesFile)) return []
    const value = JSON.parse(fs.readFileSync(seriesFile, 'utf8'))
    if (!Array.isArray(value)) throw new Error('Series catalog must be an array')
    return value
  }

  function save(series) {
    fs.mkdirSync(path.dirname(seriesFile), { recursive: true })
    fs.writeFileSync(seriesFile, JSON.stringify(series, null, 2), 'utf8')
  }

  function normalize(input, existing = {}) {
    const title = String(input?.title ?? existing.title ?? '').trim()
    if (!title) throw new Error('Series title is required')
    const now = new Date().toISOString()
    const targetDurationMinutes = Number(input?.defaults?.targetDurationMinutes ?? existing.defaults?.targetDurationMinutes ?? 14)
    if (!Number.isInteger(targetDurationMinutes) || targetDurationMinutes < 1 || targetDurationMinutes > 240) {
      throw new Error('Series target duration must be an integer between 1 and 240 minutes')
    }
    const id = String(existing.id || input?.id || `series_${randomUUID()}`)
    const requestedCoverPath = String(input?.coverPath ?? existing.coverPath ?? '').trim()
    let coverPath = String(existing.coverPath || '')
    if (!requestedCoverPath) {
      coverPath = ''
    } else if (!coverPath || path.resolve(requestedCoverPath) !== path.resolve(coverPath)) {
      const source = path.resolve(requestedCoverPath)
      const extension = path.extname(source).toLowerCase()
      if (!COVER_EXTENSIONS.has(extension)) throw new Error('Series cover must be a PNG or JPEG image')
      if (!fs.existsSync(source) || !fs.statSync(source).isFile()) throw new Error('Series cover image is not readable')
      const coverDir = path.join(projectRoot, 'out', 'series', id.replace(/[^a-zA-Z0-9_-]/g, '_'))
      fs.mkdirSync(coverDir, { recursive: true })
      const target = path.join(coverDir, `cover${extension === '.jpeg' ? '.jpg' : extension}`)
      fs.copyFileSync(source, target)
      coverPath = target
    }
    return {
      id,
      title,
      description: String(input?.description ?? existing.description ?? '').trim(),
      coverPath,
      cadence: input?.cadence === 'weekly' ? 'weekly' : 'daily',
      defaults: {
        language: String(input?.defaults?.language ?? existing.defaults?.language ?? 'zh-CN'),
        targetDurationMinutes,
        author: String(input?.defaults?.author ?? existing.defaults?.author ?? 'PodFlow Studio'),
        hostName: String(input?.defaults?.hostName ?? existing.defaults?.hostName ?? ''),
        defaultVoice: String(input?.defaults?.defaultVoice ?? existing.defaults?.defaultVoice ?? ''),
        enabledPlatforms: Array.isArray(input?.defaults?.enabledPlatforms)
          ? input.defaults.enabledPlatforms.map(String).filter(Boolean)
          : Array.isArray(existing.defaults?.enabledPlatforms)
          ? existing.defaults.enabledPlatforms.map(String).filter(Boolean)
          : ['local', 'rss'],
        templateVariant: 'quick_6_plus_deep_1',
      },
      episodeIds: Array.isArray(existing.episodeIds) ? existing.episodeIds.map(String) : [],
      createdAt: existing.createdAt || now,
      updatedAt: now,
    }
  }

  function list() {
    return load().sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
  }

  function upsert(input) {
    const series = load()
    const index = series.findIndex(item => item.id === input?.id)
    const value = normalize(input, index >= 0 ? series[index] : {})
    if (index >= 0) series[index] = value
    else series.push(value)
    save(series)
    return value
  }

  function assign(seriesId, workflowId) {
    const series = load()
    for (const item of series) {
      item.episodeIds = (item.episodeIds || []).filter(id => id !== workflowId)
    }
    const target = series.find(item => item.id === seriesId)
    if (!target) throw new Error('Series not found')
    target.episodeIds.push(workflowId)
    target.updatedAt = new Date().toISOString()
    save(series)
    return target
  }

  function reorder(seriesId, episodeIds) {
    const series = load()
    const target = series.find(item => item.id === seriesId)
    if (!target) throw new Error('Series not found')
    const known = new Set(target.episodeIds || [])
    const ordered = episodeIds.map(String)
    if (ordered.length !== known.size || ordered.some(id => !known.has(id))) {
      throw new Error('Episode order must contain every series episode exactly once')
    }
    target.episodeIds = ordered
    target.updatedAt = new Date().toISOString()
    save(series)
    return target
  }

  function unassign(workflowId) {
    const series = load()
    let changed = false
    for (const item of series) {
      const next = (item.episodeIds || []).filter(id => id !== String(workflowId))
      if (next.length === (item.episodeIds || []).length) continue
      item.episodeIds = next
      item.updatedAt = new Date().toISOString()
      changed = true
    }
    if (changed) save(series)
    return changed
  }

  return { assign, list, reorder, unassign, upsert }
}

module.exports = { create }
