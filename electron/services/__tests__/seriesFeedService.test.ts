import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, it } from 'vitest'

const { create } = require('../seriesFeedService') as { create: (input: { projectRoot: string }) => any }
const created: string[] = []

afterEach(() => {
  for (const target of created.splice(0)) fs.rmSync(target, { recursive: true, force: true })
})

describe('seriesFeedService', () => {
  it('writes one ordered feed containing every playable episode', () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'podflow-feed-'))
    created.push(projectRoot)
    const audioA = path.join(projectRoot, '第一期 音频.mp3')
    const audioB = path.join(projectRoot, 'b.mp3')
    fs.writeFileSync(audioA, 'audio-a')
    fs.writeFileSync(audioB, 'audio-b')
    const workflows = [
      { id: 'a', state: { episode_id: 'ep-a', created_at: '2026-07-19T00:00:00Z', edited_script: { title: '第一期' }, audio_outputs: { final_audio_path: audioA, duration_seconds: 61 } } },
      { id: 'b', state: { episode_id: 'ep-b', created_at: '2026-07-20T00:00:00Z', edited_script: { title: '第二期' }, audio_outputs: { final_audio_path: audioB, duration_seconds: 125 } } },
    ]
    const result = create({ projectRoot }).generate({ id: 'daily', title: '每日科技', description: '科技新闻', defaults: { language: 'zh-CN', author: 'PodFlow' }, episodeIds: ['b', 'a'] }, workflows)
    const rss = fs.readFileSync(result.feedPath, 'utf8')

    expect(result.episodeCount).toBe(2)
    expect(result.localPreviewOnly).toBe(true)
    expect(result.validation.ok).toBe(true)
    expect(result.validation.warnings).toHaveLength(1)
    expect(rss).toContain('<link>https://podflow.local/series/daily</link>')
    expect(rss).toContain('%E7%AC%AC%E4%B8%80%E6%9C%9F%20%E9%9F%B3%E9%A2%91.mp3')
    expect(rss.indexOf('第二期')).toBeLessThan(rss.indexOf('第一期'))
    expect(rss).toContain('<itunes:duration>02:05</itunes:duration>')
    expect(rss.match(/<item>/g)).toHaveLength(2)
    expect(rss.match(/type="audio\/mpeg"/g)).toHaveLength(2)
  })
})
