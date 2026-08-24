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
    expect(() => parseArgs(['produce', '--skip-approval'])).toThrow(/Unknown option/)
  })

  it('parses explicit preview and final-review confirmations', () => {
    expect(parseArgs([
      'produce', '--stage', 'package', '--workflow', 'episode', '--preview-only',
      '--full-listen-confirmed', '--pronunciation-confirmed', '--editorial-final-confirmed',
    ]).options).toMatchObject({
      'preview-only': true,
      'full-listen-confirmed': true,
      'pronunciation-confirmed': true,
      'editorial-final-confirmed': true,
    })
  })

  it('parses the formal generate and publish contracts', () => {
    expect(parseArgs(['produce', '--stage', 'generate', '--episode-id', '2026-08-17', '--topic', 'AI', '--allow-paid-tts', '--json'])).toEqual({
      command: 'produce',
      options: { stage: 'generate', 'episode-id': '2026-08-17', topic: 'AI', 'allow-paid-tts': true, json: true },
    })
    expect(parseArgs(['produce', '--stage', 'publish', '--workflow', 'workflow.json', '--confirm-publish', '--release-repo', 'liuminxin45/podflow-morning-feed'])).toEqual({
      command: 'produce',
      options: { stage: 'publish', workflow: 'workflow.json', 'confirm-publish': true, 'release-repo': 'liuminxin45/podflow-morning-feed' },
    })
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
