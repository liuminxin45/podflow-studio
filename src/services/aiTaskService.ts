import type { AITaskId, AITaskInputs, AITaskOutputs, AITaskRequest, AITaskResult } from '../types/llm'
import type { AITaskEvent } from '../types/llm'

function requestId(): string {
  return `ai-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function onAITaskEvent(callback: (event: AITaskEvent) => void): () => void {
  return window.electronAPI?.onAITaskEvent?.(callback) || (() => undefined)
}

export async function runAITask<K extends AITaskId>(
  taskId: K,
  targetId: string,
  context: AITaskInputs[K],
  signal?: AbortSignal,
): Promise<AITaskOutputs[K]> {
  const api = window.electronAPI
  if (!api?.aiRunTask) throw new Error('当前环境没有 Python AI Task Runtime')
  const request: AITaskRequest = {
    version: 1,
    request_id: requestId(),
    task_id: taskId,
    target_id: targetId,
    input: context as Record<string, unknown>,
    stream: false,
  }
  const cancel = () => { void api.aiCancelTask(request.request_id).catch(() => undefined) }
  if (signal?.aborted) {
    cancel()
    throw new DOMException('请求已取消', 'AbortError')
  }
  signal?.addEventListener('abort', cancel, { once: true })
  try {
    const result: AITaskResult = await api.aiRunTask(request)
    if (signal?.aborted) throw new DOMException('请求已取消', 'AbortError')
    return result.output as AITaskOutputs[K]
  } finally {
    signal?.removeEventListener('abort', cancel)
  }
}
