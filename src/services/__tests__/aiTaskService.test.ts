import { beforeEach, describe, expect, it, vi } from 'vitest'

import { runAITask } from '../aiTaskService'


describe('AI task service', () => {
  beforeEach(() => {
    window.electronAPI = {
      ...window.electronAPI,
      aiRunTask: vi.fn().mockResolvedValue({
        version: 1,
        request_id: 'server-request',
        task_id: 'organize.plan_research',
        output: { researchTasks: [] },
        usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2, requests: 1 },
      }),
      aiCancelTask: vi.fn().mockResolvedValue({ success: true }),
    }
  })

  it('sends only a task id, target id, and typed context to Electron', async () => {
    const output = await runAITask('organize.plan_research', 'agent:codex', { topic: 'AI' })

    expect(output).toEqual({ researchTasks: [] })
    expect(window.electronAPI.aiRunTask).toHaveBeenCalledWith(expect.objectContaining({
      version: 1,
      task_id: 'organize.plan_research',
      target_id: 'agent:codex',
      input: { context: { topic: 'AI' } },
      stream: false,
    }))
    expect(window.electronAPI.aiRunTask).not.toHaveBeenCalledWith(
      expect.objectContaining({ messages: expect.anything() }),
    )
  })

  it('propagates AbortSignal cancellation to the task runtime', async () => {
    let release!: (value: any) => void
    vi.mocked(window.electronAPI.aiRunTask).mockReturnValue(new Promise(resolve => { release = resolve }))
    const controller = new AbortController()
    const pending = runAITask('organize.plan_research', 'agent:codex', {}, controller.signal)

    controller.abort()
    expect(window.electronAPI.aiCancelTask).toHaveBeenCalledWith(expect.stringMatching(/^ai-/))
    release({ version: 1, request_id: 'done', task_id: 'organize.plan_research', output: {}, usage: {} })
    await pending
  })
})

