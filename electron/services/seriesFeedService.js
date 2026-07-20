const fs = require('fs')
const path = require('path')

function xml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function formatRssDate(value) {
  const date = new Date(value || Date.now())
  return Number.isNaN(date.getTime()) ? new Date().toUTCString() : date.toUTCString()
}

function formatDuration(value) {
  const seconds = Math.max(0, Math.trunc(Number(value || 0)))
  const hours = Math.trunc(seconds / 3600)
  const minutes = Math.trunc((seconds % 3600) / 60)
  const rest = seconds % 60
  return hours > 0
    ? [hours, minutes, rest].map(part => String(part).padStart(2, '0')).join(':')
    : [minutes, rest].map(part => String(part).padStart(2, '0')).join(':')
}

function audioMimeType(audioPath) {
  const extension = path.extname(audioPath).toLocaleLowerCase()
  if (extension === '.wav') return 'audio/wav'
  if (extension === '.opus') return 'audio/ogg'
  if (extension === '.m4a') return 'audio/mp4'
  return 'audio/mpeg'
}

function encodeLocalPath(value) {
  return String(value).split('/').map(segment => (
    segment === '..' || segment === '.' ? segment : encodeURIComponent(segment)
  )).join('/')
}

function validateLocalPreview(content, episodes) {
  const warnings = ['This feed contains local relative media paths and is not publicly subscribable.']
  if (!content.includes('<link>https://podflow.local/series/')) throw new Error('Series feed is missing a channel link')
  if ((content.match(/<item>/g) || []).length !== episodes.length) throw new Error('Series feed item count mismatch')
  if ((content.match(/<enclosure url="[^"]+" length="[1-9][0-9]*" type="audio\//g) || []).length !== episodes.length) {
    throw new Error('Series feed contains an invalid enclosure')
  }
  return { ok: true, warnings }
}

function create({ projectRoot }) {
  function generate(series, workflows) {
    const outputDir = path.join(projectRoot, 'out', 'rss', String(series.id).replace(/[^a-zA-Z0-9_-]/g, '_'))
    fs.mkdirSync(outputDir, { recursive: true })
    const byId = new Map(workflows.map(workflow => [String(workflow.id), workflow]))
    const episodes = (series.episodeIds || [])
      .map(id => byId.get(String(id)))
      .filter(Boolean)
      .filter(workflow => {
        const audioPath = workflow.state?.publish_outputs?.audio_path || workflow.state?.audio_outputs?.final_audio_path
        return audioPath && fs.existsSync(audioPath) && fs.statSync(audioPath).isFile()
      })

    if (episodes.length === 0) throw new Error('Series has no episode with readable final audio')

    const items = episodes.map(workflow => {
      const state = workflow.state
      const audioPath = state.publish_outputs?.audio_path || state.audio_outputs?.final_audio_path
      const audioUrl = encodeLocalPath(path.relative(outputDir, audioPath).replace(/\\/g, '/'))
      const stat = fs.statSync(audioPath)
      const title = state.edited_script?.title || state.selected_topic?.title || '未命名节目'
      const description = state.edited_script?.description || state.selected_topic?.description || ''
      return `    <item>
      <guid isPermaLink="false">${xml(state.episode_id)}</guid>
      <title>${xml(title)}</title>
      <description>${xml(description)}</description>
      <pubDate>${xml(formatRssDate(state.publish_outputs?.published_at || state.created_at))}</pubDate>
      <itunes:duration>${xml(formatDuration(state.audio_outputs?.duration_seconds))}</itunes:duration>
      <enclosure url="${xml(audioUrl)}" length="${stat.size}" type="${audioMimeType(audioPath)}"/>
      <podflow:preview>RSS is local-preview only, not publicly subscribable.</podflow:preview>
    </item>`
    }).join('\n')

    const cover = series.coverPath && fs.existsSync(series.coverPath)
      ? `\n    <itunes:image href="${xml(encodeLocalPath(path.relative(outputDir, series.coverPath).replace(/\\/g, '/')))}"/>`
      : ''
    const channelLink = `https://podflow.local/series/${encodeURIComponent(series.id)}`
    const content = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:podflow="https://podflow.local/rss">
  <channel>
    <title>${xml(series.title)}</title>
    <link>${xml(channelLink)}</link>
    <description>${xml(series.description || series.title)}</description>
    <language>${xml(series.defaults?.language || 'zh-CN')}</language>
    <itunes:author>${xml(series.defaults?.author || 'PodFlow Studio')}</itunes:author>${cover}
${items}
  </channel>
</rss>`
    const feedPath = path.join(outputDir, 'feed.xml')
    const validation = validateLocalPreview(content, episodes)
    fs.writeFileSync(feedPath, content, 'utf8')
    return { feedPath, episodeCount: episodes.length, localPreviewOnly: true, validation }
  }

  return { generate }
}

module.exports = { create, encodeLocalPath, formatDuration, validateLocalPreview, xml }
