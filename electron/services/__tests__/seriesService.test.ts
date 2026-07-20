import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, it } from 'vitest'

const { create } = require('../seriesService') as { create: (input: { projectRoot: string }) => any }
const created: string[] = []

afterEach(() => {
  for (const target of created.splice(0)) fs.rmSync(target, { recursive: true, force: true })
})

describe('seriesService', () => {
  it('persists defaults, membership and explicit order', () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'podflow-series-'))
    created.push(projectRoot)
    const service = create({ projectRoot })
    const series = service.upsert({ title: '每日科技', cadence: 'daily', defaults: { targetDurationMinutes: 18 } })
    service.assign(series.id, 'episode-b')
    service.assign(series.id, 'episode-a')
    const reordered = service.reorder(series.id, ['episode-a', 'episode-b'])

    expect(reordered.episodeIds).toEqual(['episode-a', 'episode-b'])
    expect(reordered.defaults.targetDurationMinutes).toBe(18)
    expect(service.list()[0].title).toBe('每日科技')
    expect(service.unassign('episode-a')).toBe(true)
    expect(service.list()[0].episodeIds).toEqual(['episode-b'])
  })

  it('rejects partial episode orders', () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'podflow-series-'))
    created.push(projectRoot)
    const service = create({ projectRoot })
    const series = service.upsert({ title: '周报' })
    service.assign(series.id, 'episode-a')
    expect(() => service.reorder(series.id, [])).toThrow('every series episode')
  })

  it('rejects invalid target durations', () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'podflow-series-'))
    created.push(projectRoot)
    const service = create({ projectRoot })

    expect(() => service.upsert({ title: '周报', defaults: { targetDurationMinutes: 0 } })).toThrow('between 1 and 240')
    expect(() => service.upsert({ title: '周报', defaults: { targetDurationMinutes: 241 } })).toThrow('between 1 and 240')
    expect(() => service.upsert({ title: '周报', defaults: { targetDurationMinutes: Number.NaN } })).toThrow('between 1 and 240')
  })
})
