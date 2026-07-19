import path from 'node:path'
import { describe, expect, it } from 'vitest'

const { resolveDevExecutables } = require('../dev') as {
  resolveDevExecutables: (root?: string) => {
    vite: { command: string; argsPrefix: string[] }
    electron: { command: string; argsPrefix: string[] }
  }
}

describe('development process launcher', () => {
  it('launches real executables instead of Windows .cmd wrappers', () => {
    const root = path.resolve(process.cwd())
    const executables = resolveDevExecutables(root)

    expect(executables.vite.command).toBe(process.execPath)
    expect(executables.vite.argsPrefix[0]).toBe(path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'))
    expect(executables.electron.command.toLowerCase()).toMatch(/electron(?:\.exe)?$/)
    expect(executables.vite.command.toLowerCase()).not.toMatch(/\.cmd$/)
    expect(executables.electron.command.toLowerCase()).not.toMatch(/\.cmd$/)
  })
})
