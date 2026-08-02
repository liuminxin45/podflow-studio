import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const { configureCliRuntime, runtimeInfo } = require('../cliLifecycle')

const originalEnvironment = {
  PODFLOW_USER_DATA_DIR: process.env.PODFLOW_USER_DATA_DIR,
  PODFLOW_SESSION_ID: process.env.PODFLOW_SESSION_ID,
  PODFLOW_DATA_DIR: process.env.PODFLOW_DATA_DIR,
  PODFLOW_ARTIFACT_DIR: process.env.PODFLOW_ARTIFACT_DIR,
  PODFLOW_WINDOW_MODE: process.env.PODFLOW_WINDOW_MODE,
  CDP_PORT: process.env.CDP_PORT,
}
const temporaryDirectories: string[] = []

afterEach(() => {
  for (const [key, value] of Object.entries(originalEnvironment)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

describe('Electron CLI lifecycle', () => {
  it('configures isolated Electron user data and reports runtime identity', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'podflow-electron-'))
    temporaryDirectories.push(root)
    const userDataDir = path.join(root, 'profile')
    let configuredPath = ''
    const app = {
      setPath: (name: string, value: string) => {
        expect(name).toBe('userData')
        configuredPath = value
      },
      getPath: () => configuredPath,
      getVersion: () => '0.1.0',
    }
    process.env.PODFLOW_USER_DATA_DIR = userDataDir
    process.env.PODFLOW_SESSION_ID = 'agent-001'
    process.env.PODFLOW_DATA_DIR = path.join(root, 'data')
    process.env.PODFLOW_ARTIFACT_DIR = path.join(root, 'artifacts')
    process.env.PODFLOW_WINDOW_MODE = 'hidden'
    process.env.CDP_PORT = '9333'

    expect(configureCliRuntime(app)).toBe(path.resolve(userDataDir))
    expect(fs.existsSync(userDataDir)).toBe(true)
    expect(runtimeInfo(app)).toMatchObject({
      sessionId: 'agent-001',
      version: '0.1.0',
      dataDir: path.join(root, 'data'),
      artifactDir: path.join(root, 'artifacts'),
      windowMode: 'hidden',
      cdpUrl: 'http://127.0.0.1:9333',
    })
  })
})
