import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const {
  assertSessionId,
  atomicWriteJson,
  createManifest,
  manifestIsLive,
  readManifest,
  sessionPaths,
  updateManifest,
} = require('../runtimeManifest')

const temporaryDirectories: string[] = []

function temporaryRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'podflow-manifest-'))
  temporaryDirectories.push(root)
  return root
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

describe('runtime session manifest', () => {
  it('keeps every session below its own runtime boundary', () => {
    const root = temporaryRoot()
    const paths = sessionPaths(root, 'agent-001')

    expect(paths.sessionDir).toBe(path.join(root, '.podflow', 'sessions', 'agent-001'))
    expect(paths.dataDir).toBe(path.join(paths.sessionDir, 'data'))
    expect(paths.userDataDir).toBe(path.join(paths.sessionDir, 'electron-profile'))
    expect(paths.artifactDir).toBe(path.join(paths.sessionDir, 'artifacts'))
  })

  it('rejects session ids that could escape the session directory', () => {
    expect(() => assertSessionId('../other')).toThrow(/Session id/)
    expect(() => assertSessionId('space is invalid')).toThrow(/Session id/)
    expect(assertSessionId('agent_01.test')).toBe('agent_01.test')
  })

  it('writes and updates a versioned manifest atomically', () => {
    const root = temporaryRoot()
    const paths = sessionPaths(root, 'test-session')
    const manifest = createManifest({
      projectRoot: root,
      sessionId: 'test-session',
      mode: 'dev',
      windowMode: 'hidden',
      cdp: 'auto',
      command: 'start',
    })
    atomicWriteJson(paths.manifestPath, manifest)
    const updated = updateManifest(paths.manifestPath, {
      status: 'ready',
      processes: { supervisorPid: process.pid },
      endpoints: { cdpUrl: 'http://127.0.0.1:9222' },
    })

    expect(readManifest(paths.manifestPath)).toEqual(updated)
    expect(updated.manifestVersion).toBe(1)
    expect(updated.paths.dataDir).toBe(paths.dataDir)
    expect(updated.processes.supervisorPid).toBe(process.pid)
    expect(updated.endpoints.cdpUrl).toBe('http://127.0.0.1:9222')
    expect(manifestIsLive(updated)).toBe(true)
  })
})
