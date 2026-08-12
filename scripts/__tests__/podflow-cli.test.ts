import { describe, expect, it } from 'vitest'

const { EXIT, parseArgs, validateCdp } = require('../podflow-cli')

describe('PodFlow CLI contract', () => {
  it('parses Agent-oriented startup options without shell-specific behavior', () => {
    expect(parseArgs([
      'start', '--mode', 'dev', '--session', 'agent-001', '--cdp', 'auto', '--window', 'hidden', '--json',
    ])).toEqual({
      command: 'start',
      options: {
        mode: 'dev',
        session: 'agent-001',
        cdp: 'auto',
        window: 'hidden',
        json: true,
      },
    })
  })

  it('rejects unknown commands, options, and unsafe CDP ports', () => {
    expect(() => parseArgs(['launch'])).toThrow(/Unknown command/)
    expect(() => parseArgs(['start', '--mystery'])).toThrow(/Unknown option/)
    expect(() => validateCdp('70000')).toThrow(/cdp/i)
  })

  it('publishes stable automation exit codes', () => {
    expect(EXIT).toEqual({
      OK: 0,
      ARGUMENT: 2,
      ENVIRONMENT: 3,
      CONFLICT: 4,
      STARTUP_TIMEOUT: 5,
      CRASH: 6,
      ACCEPTANCE: 7,
      STOP: 8,
      INTERNAL: 9,
      PRODUCTION: 10,
    })
  })
})
