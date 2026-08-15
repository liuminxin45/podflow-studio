import type { Workflow } from '../types/workflow'

export interface WorkflowFailure {
  node?: string
  message: string
  detail?: string
  timestamp?: string
}

export function latestWorkflowFailure(workflow?: Workflow | null): WorkflowFailure | null {
  if (!workflow || workflow.status !== 'failed') return null
  const failedNode = workflow.currentNode
    || Object.entries(workflow.nodeExecutions || {})
      .reverse()
      .find(([, execution]) => execution.status === 'failed')?.[0]
    || ''
  const matchingError = [...(workflow.state?.errors || [])]
    .reverse()
    .find(error => !failedNode || error.node === failedNode)
  const execution = failedNode ? workflow.nodeExecutions?.[failedNode] : undefined
  const fallbackError = [...(workflow.state?.errors || [])].reverse()[0]
  const error = matchingError || fallbackError
  const messageText = error?.message || execution?.error || '工作流执行失败，尚未返回具体原因。'
  return {
    node: error?.node || failedNode || undefined,
    message: messageText,
    detail: error?.detail || execution?.errorStack,
    timestamp: error?.timestamp || execution?.completedAt,
  }
}
