import { describe, expect, it } from 'vitest'

const { applyRecoveryPlan, buildRecoveryPlan, recommendRecoveryNode } = require('../workflowRecovery') as {
  applyRecoveryPlan: (workflow: any, plan: any) => any
  buildRecoveryPlan: (workflow: any, nodeName: string) => any
  recommendRecoveryNode: (workflow: any) => string
}

function workflow() {
  return {
    state: {
      fetch_contents: [{ title: 'source' }],
      cleaned_contents: [{ title: 'cleaned' }],
      facts: [{ id: 'f1' }],
      edited_script: { segments: [{ id: 's1' }] },
      voice_segments: [{ segment_id: 's1' }],
      audio_outputs: { final_audio_path: 'final.mp3' },
      cover_path: 'cover.png',
      review_summary: { ok: true },
      publish_outputs: { status: 'success' },
      downstream_stale: { is_stale: true },
      errors: [{ node: 'tts', message: 'failed' }, { node: 'fetch', message: 'old warning' }],
    },
    nodeExecutions: {
      fetch: { status: 'completed' },
      facts: { status: 'completed' },
      script: { status: 'completed' },
      tts: { status: 'failed', history: [{ status: 'failed', message: 'provider timeout' }] },
      publish: { status: 'completed' },
    },
    approvals: { script: 'approved' },
  }
}

describe('workflowRecovery', () => {
  it('recommends the first failed node', () => {
    expect(recommendRecoveryNode(workflow())).toBe('tts')
  })

  it('previews only the selected node and downstream impact', () => {
    const plan = buildRecoveryPlan(workflow(), 'tts')
    expect(plan.rerunNodes).toEqual(['tts', 'audio_postprocess', 'assets', 'review', 'publish'])
    expect(plan.populatedFields).toEqual(expect.arrayContaining(['voice_segments', 'audio_outputs', 'cover_path', 'publish_outputs']))
    expect(plan.clearFields).not.toContain('facts')
    expect(plan.clearFields).not.toContain('edited_script')
  })

  it('clears impacted output while preserving upstream evidence', () => {
    const value = workflow()
    applyRecoveryPlan(value, buildRecoveryPlan(value, 'tts'))
    expect(value.state.facts).toEqual([{ id: 'f1' }])
    expect(value.state.edited_script).toEqual({ segments: [{ id: 's1' }] })
    expect(value.state.voice_segments).toEqual([])
    expect(value.state.audio_outputs).toEqual({})
    expect(value.state.publish_outputs).toEqual({})
    expect(value.state.errors).toEqual([{ node: 'fetch', message: 'old warning' }])
    expect(value.nodeExecutions.fetch.status).toBe('completed')
    expect(value.nodeExecutions.tts).toEqual({
      status: 'pending',
      history: [{ status: 'failed', message: 'provider timeout' }],
    })
  })
})
