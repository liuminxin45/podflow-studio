import { describe, expect, it } from 'vitest'

const { requireSuccessfulAgentContent } = require('../localAgentService')

describe('local agent process result contract', () => {
  it.each([
    { label: 'Codex', content: 'last message from failed Codex process' },
    { label: 'custom-agent', content: 'stdout from failed generic process' },
  ])('rejects non-zero $label results even when output exists', ({ label, content }) => {
    expect(() => requireSuccessfulAgentContent({
      ok: false,
      diagnostic: `${label} exited with code 1`,
    }, content, label)).toThrow(`${label} exited with code 1`)
  })

  it('uses streamed content only after a successful process exit', () => {
    expect(requireSuccessfulAgentContent({ ok: true, diagnostic: '' }, ' streamed answer ', 'custom-agent'))
      .toBe('streamed answer')
  })

  it('rejects an empty successful response', () => {
    expect(() => requireSuccessfulAgentContent({ ok: true, diagnostic: '' }, '', 'Codex'))
      .toThrow('Codex CLI returned an empty response')
  })
})
