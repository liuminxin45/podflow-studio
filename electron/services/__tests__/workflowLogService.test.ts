import { describe, expect, it, vi } from 'vitest'

const { createAppendWorkflowLogsHandler, normalizeLogEntries } = require('../workflowLogService')

describe('workflow log service', () => {
  it('normalizes entries and caps each append request at 50 records', () => {
    const entries = Array.from({ length: 55 }, (_, index) => `  log ${index}  `)
    expect(normalizeLogEntries(['', null, ...entries])).toEqual(entries.slice(0, 50).map(entry => entry.trim()))
  })

  it('rejects a workflow mismatch without mutating or broadcasting', async () => {
    const markDirty = vi.fn()
    const broadcastWorkflowUpdate = vi.fn()
    const handler = createAppendWorkflowLogsHandler({
      getCurrentWorkflow: () => ({ id: 'current', state: { logs: [] } }),
      markDirty,
      broadcastWorkflowUpdate,
    })

    await expect(handler(null, 'wrong', ['entry'])).rejects.toThrow('Workflow not found')
    expect(markDirty).not.toHaveBeenCalled()
    expect(broadcastWorkflowUpdate).not.toHaveBeenCalled()
  })

  it('appends sanitized entries, marks dirty, and broadcasts once', async () => {
    const workflow = { id: 'current', state: { logs: ['existing'] } }
    const markDirty = vi.fn()
    const broadcastWorkflowUpdate = vi.fn()
    const handler = createAppendWorkflowLogsHandler({
      getCurrentWorkflow: () => workflow,
      markDirty,
      broadcastWorkflowUpdate,
    })

    await expect(handler(null, 'current', ['  phase start  ', '', 'phase done'])).resolves.toBe(workflow)
    expect(workflow.state.logs).toEqual(['existing', 'phase start', 'phase done'])
    expect(markDirty).toHaveBeenCalledTimes(1)
    expect(broadcastWorkflowUpdate).toHaveBeenCalledTimes(1)
  })
})
