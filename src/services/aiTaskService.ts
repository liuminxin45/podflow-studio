import type { AITaskRequest, AITaskResult } from '../types/llm'

function requestId(): string {
  return `ai-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export async function runAITask<T extends Record<string, unknown>>(
  taskId: string,
  targetId: string,
  context: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<T> {
  const api = window.electronAPI
  if (!api?.aiRunTask) throw new Error('当前环境没有 Python AI Task Runtime')
  const request: AITaskRequest = {
    version: 1,
    request_id: requestId(),
    task_id: taskId,
    target_id: targetId,
    input: { context },
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
    return result.output as T
  } finally {
    signal?.removeEventListener('abort', cancel)
  }
}

