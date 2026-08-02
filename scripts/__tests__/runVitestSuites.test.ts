import { describe, expect, it } from 'vitest'

const { buildSuites } = require('../runVitestSuites') as {
  buildSuites: () => Array<{ name: string; files: string[]; workers: number }>
}

describe('complete Vitest suite runner', () => {
  it('discovers every repository test file exactly once', () => {
    const suites = buildSuites()
    const files = suites.flatMap((suite) => suite.files)

    expect(files.length).toBeGreaterThan(50)
    expect(new Set(files).size).toBe(files.length)
    expect(files).toContain('scripts/__tests__/runVitestSuites.test.ts')
    expect(files).toContain('src/__tests__/App.test.tsx')
    expect(files).toContain('electron/__tests__/workflowRunner.test.ts')
    expect(files.every((file) => /\.(test|spec)\.[cm]?[jt]sx?$/.test(file))).toBe(true)
  })

  it('isolates UI files while batching runtime and pure logic tests', () => {
    const suites = buildSuites()
    const appSuite = suites.find((suite) => suite.files.includes('src/__tests__/App.test.tsx'))
    const runtimeSuite = suites.find((suite) => suite.name === 'Electron and CLI')
    const logicSuite = suites.find((suite) => suite.name === 'Frontend services and utilities')

    expect(appSuite?.files).toEqual(['src/__tests__/App.test.tsx'])
    expect(appSuite?.workers).toBe(1)
    expect(runtimeSuite?.files.length).toBeGreaterThan(10)
    expect(logicSuite?.files.length).toBeGreaterThan(10)
  })
})
