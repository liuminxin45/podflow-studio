import { describe, expect, it, vi } from 'vitest'

const {
  MAX_WORKFLOW_LOG_ENTRIES,
  capWorkflowLogs,
  createAppendWorkflowLogsHandler,
  createClearWorkflowLogsHandler,
  normalizeLogEntries,
} = require('../workflowLogService')

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

  it('keeps only the newest 10000 workflow logs', async () => {
    const workflow = {
      id: 'current',
      state: { logs: Array.from({ length: MAX_WORKFLOW_LOG_ENTRIES }, (_, index) => `old-${index}`) },
    }
    const handler = createAppendWorkflowLogsHandler({
      getCurrentWorkflow: () => workflow,
      markDirty: vi.fn(),
      broadcastWorkflowUpdate: vi.fn(),
    })

    await handler(null, 'current', ['new-1', 'new-2'])

    expect(workflow.state.logs).toHaveLength(MAX_WORKFLOW_LOG_ENTRIES)
    expect(workflow.state.logs[0]).toBe('old-2')
    expect(workflow.state.logs.at(-1)).toBe('new-2')
  })

  it('caps logs produced outside the append handler', () => {
    const workflow = { state: { logs: Array.from({ length: 10_005 }, (_, index) => `log-${index}`) } }

    capWorkflowLogs(workflow)

    expect(workflow.state.logs).toHaveLength(MAX_WORKFLOW_LOG_ENTRIES)
    expect(workflow.state.logs[0]).toBe('log-5')
  })

  it('clears logs, marks dirty, and broadcasts once', async () => {
    const workflow = { id: 'current', state: { logs: ['existing'] } }
    const markDirty = vi.fn()
    const broadcastWorkflowUpdate = vi.fn()
    const handler = createClearWorkflowLogsHandler({
      getCurrentWorkflow: () => workflow,
      markDirty,
      broadcastWorkflowUpdate,
    })

    await expect(handler(null, 'current')).resolves.toBe(workflow)
    expect(workflow.state.logs).toEqual([])
    expect(markDirty).toHaveBeenCalledTimes(1)
    expect(broadcastWorkflowUpdate).toHaveBeenCalledTimes(1)
  })
})
