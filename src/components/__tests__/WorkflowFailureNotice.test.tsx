import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { latestWorkflowFailure } from '../../services/workflowFailure'
import WorkflowFailureNotice from '../WorkflowFailureNotice'
import type { Workflow } from '../../types/workflow'

const workflow = {
  status: 'failed',
  currentNode: 'script',
  state: {
    errors: [{
      node: 'script',
      message: '模型请求超时',
      detail: 'provider timeout after 120s',
      timestamp: '2026-07-27T12:00:00Z',
    }],
    logs: [
      '[FactsNode] completed',
      '[Orchestrator] FAILED node: script',
      '[Orchestrator] script error: provider timeout',
    ],
  },
  nodeExecutions: {
    facts: { status: 'completed' },
    script: { status: 'failed', error: 'provider timeout' },
  },
} as unknown as Workflow

describe('WorkflowFailureNotice', () => {
  it('derives only a currently failed workflow error', () => {
    expect(latestWorkflowFailure(workflow)).toEqual(expect.objectContaining({
      node: 'script',
      message: '模型请求超时',
    }))
    expect(latestWorkflowFailure({ ...workflow, status: 'completed' })).toBeNull()
  })

  it('keeps the reason visible and opens node-related logs', () => {
    render(
      <WorkflowFailureNotice
        workflow={workflow}
        failure={{ node: 'script', message: '模型请求超时' }}
        title="初稿生成失败"
      />,
    )

    expect(screen.getByRole('alert').textContent).toContain('模型请求超时')
    fireEvent.click(screen.getByRole('button', { name: '查看相关日志' }))
    expect(screen.getByText('script · 失败详情')).toBeTruthy()
    expect(screen.getByText('[Orchestrator] FAILED node: script')).toBeTruthy()
    expect(screen.queryByText('[FactsNode] completed')).toBeNull()
  })

  it('offers the compact global failure entry', () => {
    render(
      <WorkflowFailureNotice
        compact
        workflow={workflow}
        failure={{ node: 'script', message: '模型请求超时' }}
      />,
    )
    expect(screen.getByRole('button', { name: '查看失败详情：模型请求超时' })).toBeTruthy()
  })
})
