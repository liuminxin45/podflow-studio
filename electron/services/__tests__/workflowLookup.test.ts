import { describe, expect, it, vi } from 'vitest'

const { resolveWorkflowById } = require('../workflowLookup') as {
  resolveWorkflowById: (
    workflowId: string,
    currentWorkflow: { id: string; state: Record<string, unknown> } | null,
    loadSavedWorkflow: (id: string) => unknown,
  ) => unknown
}

describe('resolveWorkflowById', () => {
  it('opens an unsaved workflow that exists only in Electron memory', () => {
    const current = { id: 'draft-1', state: { episode_id: 'ep-1' } }
    const loadSaved = vi.fn().mockReturnValue(null)

    expect(resolveWorkflowById('draft-1', current, loadSaved)).toBe(current)
    expect(loadSaved).not.toHaveBeenCalled()
  })

  it('loads another workflow from disk', () => {
    const saved = { id: 'saved-2', state: {} }
    const loadSaved = vi.fn().mockReturnValue(saved)

    expect(resolveWorkflowById('saved-2', { id: 'draft-1', state: {} }, loadSaved)).toBe(saved)
    expect(loadSaved).toHaveBeenCalledWith('saved-2')
  })
})
