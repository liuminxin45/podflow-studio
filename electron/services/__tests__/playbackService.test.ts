import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, it } from 'vitest'

const { create } = require('../playbackService') as { create: (input: { projectRoot: string }) => any }
const created: string[] = []

afterEach(() => {
  for (const target of created.splice(0)) fs.rmSync(target, { recursive: true, force: true })
})

describe('playbackService', () => {
  it('persists playback independently by workflow id', () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'podflow-playback-'))
    created.push(projectRoot)
    const service = create({ projectRoot })
    const saved = service.set('episode-a', { positionSeconds: 12, durationSeconds: 60, speed: 1.25, playCount: 1 })

    expect(saved.positionSeconds).toBe(12)
    expect(service.get('episode-a').speed).toBe(1.25)
    expect(fs.existsSync(path.join(projectRoot, 'out', 'playback.json'))).toBe(true)
    expect(service.remove('episode-a')).toBe(true)
    expect(service.get('episode-a')).toBeNull()
  })

  it('rejects non-finite and out-of-range values', () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'podflow-playback-'))
    created.push(projectRoot)
    const service = create({ projectRoot })

    expect(() => service.set('episode-a', { positionSeconds: Number.NaN })).toThrow('finite number')
    expect(() => service.set('episode-a', { speed: 4 })).toThrow('finite number')
  })
})
