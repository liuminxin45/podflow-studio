const fs = require('fs')
const path = require('path')
const { shell } = require('electron')

function sanitizePathPart(value, fallback = 'unknown') {
  const safe = String(value || '').replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_')
  return safe || fallback
}

function resolveProjectPath(projectRoot, targetPath) {
  if (!targetPath) return ''
  return path.isAbsolute(targetPath)
    ? path.normalize(targetPath)
    : path.resolve(projectRoot, targetPath)
}

function imageMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase()
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
  if (ext === '.webp') return 'image/webp'
  if (ext === '.gif') return 'image/gif'
  if (ext === '.svg') return 'image/svg+xml'
  return 'image/png'
}

function recordingExtension(mimeType) {
  if (mimeType.includes('wav')) return 'wav'
  if (mimeType.includes('mpeg') || mimeType.includes('mp3')) return 'mp3'
  return 'webm'
}

function create({ projectRoot, getCurrentWorkflow, shellApi = shell }) {
  async function saveRecording(payload) {
    const currentWorkflow = getCurrentWorkflow()
    const episodeId = sanitizePathPart(payload?.episodeId || currentWorkflow?.state?.episode_id)
    const segmentId = sanitizePathPart(payload?.segmentId || `segment_${Date.now()}`)
    const mimeType = String(payload?.mimeType || 'audio/webm')
    const rawData = payload?.data

    if (!rawData) {
      throw new Error('Missing recording data')
    }

    const buffer = Buffer.from(rawData instanceof ArrayBuffer ? new Uint8Array(rawData) : rawData)
    if (buffer.length === 0) {
      throw new Error('Recording data is empty')
    }

    const outDir = path.join(projectRoot, 'out', 'recordings', episodeId)
    fs.mkdirSync(outDir, { recursive: true })
    const filePath = path.join(outDir, `${segmentId}_${Date.now()}.${recordingExtension(mimeType)}`)
    fs.writeFileSync(filePath, buffer)

    return {
      success: true,
      path: filePath,
      size: buffer.length,
      mimeType,
      durationSeconds: Number(payload?.durationSeconds || 0)
    }
  }

  async function openPath(targetPath) {
    const filePath = resolveProjectPath(projectRoot, targetPath)
    if (!filePath || !fs.existsSync(filePath)) {
      return { success: false, error: `Path does not exist: ${filePath || targetPath || ''}` }
    }
    const error = await shellApi.openPath(filePath)
    return error ? { success: false, error } : { success: true }
  }

  async function showItemInFolder(targetPath) {
    const filePath = resolveProjectPath(projectRoot, targetPath)
    if (!filePath || !fs.existsSync(filePath)) {
      return { success: false, error: `Path does not exist: ${filePath || targetPath || ''}` }
    }
    shellApi.showItemInFolder(filePath)
    return { success: true }
  }

  async function readImageAsDataUrl(targetPath) {
    const filePath = resolveProjectPath(projectRoot, targetPath)
    if (!filePath || !fs.existsSync(filePath)) {
      return { success: false, error: 'Path does not exist' }
    }
    const stat = fs.statSync(filePath)
    if (!stat.isFile()) {
      return { success: false, error: 'Path is not a file' }
    }
    if (stat.size > 10 * 1024 * 1024) {
      return { success: false, error: 'Image is larger than 10MB' }
    }
    const mimeType = imageMimeType(filePath)
    const data = fs.readFileSync(filePath).toString('base64')
    return {
      success: true,
      path: filePath,
      size: stat.size,
      mimeType,
      dataUrl: `data:${mimeType};base64,${data}`
    }
  }

  return {
    saveRecording,
    openPath,
    showItemInFolder,
    readImageAsDataUrl
  }
}

module.exports = { create }
