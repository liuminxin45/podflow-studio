import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const configRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'podflow-config-'))

// eslint-disable-next-line @typescript-eslint/no-require-imports
const ConfigManager = require('../configManager')

describe('ConfigManager publish config migration', () => {
  afterEach(() => {
    fs.rmSync(path.join(configRoot, 'node-configs'), { recursive: true, force: true })
  })

  it('removes the legacy external-platform selection on save and load', () => {
    const manager = Object.create(ConfigManager.prototype)
    manager.configDir = path.join(configRoot, 'node-configs')
    manager.ensureConfigDir()
    manager.saveNodeConfig('publish', {
      rss_output_dir: 'out/rss',
      enabled_platforms: ['rss', 'apple'],
    })

    expect(manager.loadNodeConfig('publish')).toEqual({ rss_output_dir: 'out/rss' })
    expect(JSON.parse(fs.readFileSync(manager.getConfigPath('publish'), 'utf-8'))).toEqual({
      rss_output_dir: 'out/rss',
    })
  })
})
