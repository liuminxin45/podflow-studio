import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { llmService } from '../llmService'
import { LLMError } from '../../types/llm'
import { LLM_DEFAULTS } from '../../constants/llm'

async function withMutedConsoleError<T>(task: () => Promise<T>): Promise<T> {
  const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
  try {
    return await task()
  } finally {
    spy.mockRestore()
  }
}

describe('LLMService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'info').mockImplementation(() => undefined)
    llmService.clearCache()
    global.fetch = vi.fn()
    ;(global.window as any) = { electronAPI: null }
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  describe('call', () => {
    it('should throw LLMError when API credentials are missing', async () => {
      await expect(
        llmService.call({
          apiBase: '',
          apiKey: '',
          model: 'gpt-4',
          messages: [{ role: 'user', content: 'test' }],
        })
      ).rejects.toThrow(LLMError)
    })

    it('should call Electron IPC when available', async () => {
      const mockElectronAPI = {
        llmCall: vi.fn().mockResolvedValue({
          id: 'test-id',
          object: 'chat.completion',
          created: Date.now(),
          model: 'gpt-4',
          choices: [
            {
              index: 0,
              message: { role: 'assistant', content: 'Hello' },
              finish_reason: 'stop',
            },
          ],
        }),
      }
      ;(global.window as any).electronAPI = mockElectronAPI

      const result = await llmService.call({
        apiBase: 'https://api.openai.com/v1',
        apiKey: 'test-key',
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Hi' }],
      })

      expect(mockElectronAPI.llmCall).toHaveBeenCalledWith(
        expect.objectContaining({
          apiBase: 'https://api.openai.com/v1',
          apiKey: 'test-key',
          model: 'gpt-4',
          messages: [{ role: 'user', content: 'Hi' }],
          temperature: LLM_DEFAULTS.TEMPERATURE,
          timeout: LLM_DEFAULTS.TIMEOUT,
        })
      )
      expect(result.choices[0].message.content).toBe('Hello')
    })

    it('should call local agent targets without API credentials', async () => {
      const mockElectronAPI = {
        llmCall: vi.fn().mockResolvedValue({
          id: 'local-agent-test',
          object: 'chat.completion',
          created: Date.now(),
          model: 'local-agent:codex',
          choices: [
            {
              index: 0,
              message: { role: 'assistant', content: 'Local response' },
              finish_reason: 'stop',
            },
          ],
        }),
      }
      ;(global.window as any).electronAPI = mockElectronAPI

      const result = await llmService.call({
        apiBase: 'local-agent://codex',
        apiKey: 'local-agent',
        model: 'codex',
        providerKind: 'local_agent',
        localAgentId: 'codex',
        aiTarget: 'agent:codex',
        messages: [{ role: 'user', content: 'Hi' }],
      })

      expect(mockElectronAPI.llmCall).toHaveBeenCalledWith(
        expect.objectContaining({
          apiBase: 'local-agent://codex',
          apiKey: 'local-agent',
          model: 'codex',
          providerKind: 'local_agent',
          localAgentId: 'codex',
          aiTarget: 'agent:codex',
        })
      )
      expect(result.choices[0].message.content).toBe('Local response')
    })

    it('should pass env-backed API configs through Electron IPC without local API key', async () => {
      const mockElectronAPI = {
        llmCall: vi.fn().mockResolvedValue({
          id: 'env-backed-test',
          object: 'chat.completion',
          created: Date.now(),
          model: 'gpt-4',
          choices: [
            {
              index: 0,
              message: { role: 'assistant', content: 'Env response' },
              finish_reason: 'stop',
            },
          ],
        }),
      }
      ;(global.window as any).electronAPI = mockElectronAPI

      const result = await llmService.call({
        apiBase: 'https://api.openai.com/v1',
        apiKey: '',
        apiKeyEnvVar: 'OPENAI_API_KEY',
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Hi' }],
      })

      expect(mockElectronAPI.llmCall).toHaveBeenCalledWith(
        expect.objectContaining({
          apiBase: 'https://api.openai.com/v1',
          apiKey: '',
          apiKeyEnvVar: 'OPENAI_API_KEY',
          model: 'gpt-4',
        })
      )
      expect(result.choices[0].message.content).toBe('Env response')
    })

    it('should require Electron IPC when gateway is unavailable', async () => {
      ;(global.window as any).electronAPI = null

      await withMutedConsoleError(async () => {
        await expect(
          llmService.call({
            apiBase: 'https://api.openai.com/v1',
            apiKey: 'test-key',
            model: 'gpt-4',
            messages: [{ role: 'user', content: 'Hi' }],
          })
        ).rejects.toThrow('LLM Gateway requires Electron IPC')
      })
      expect(global.fetch).not.toHaveBeenCalled()
    })

    it('should handle network errors gracefully', async () => {
      ;(global.window as any).electronAPI = {
        llmCall: vi.fn().mockRejectedValue(new Error('NETWORK: Network error')),
      }

      await withMutedConsoleError(async () => {
        await expect(
          llmService.call({
            apiBase: 'https://api.openai.com/v1',
            apiKey: 'test-key',
            model: 'gpt-4',
            messages: [{ role: 'user', content: 'Hi' }],
          })
        ).rejects.toThrow(LLMError)
      })
    })

    it('should handle timeout errors', async () => {
      vi.useFakeTimers()
      ;(global.window as any).electronAPI = {
        llmCall: vi.fn(() => new Promise(() => {})),
      }

      const assertion = withMutedConsoleError(async () => {
        await expect(
          llmService.call({
            apiBase: 'https://api.openai.com/v1',
            apiKey: 'test-key',
            model: 'gpt-4',
            messages: [{ role: 'user', content: 'Hi' }],
            timeout: 50,
          })
        ).rejects.toThrow('Electron IPC timeout')
      })
      await vi.advanceTimersByTimeAsync(10000)
      await assertion
      vi.useRealTimers()
    })

    it('should forward Azure configs through Electron IPC', async () => {
      const mockElectronAPI = {
        llmCall: vi.fn().mockResolvedValue({
          id: 'test-id',
          object: 'chat.completion',
          created: Date.now(),
          model: 'gpt-4',
          choices: [
            {
              index: 0,
              message: { role: 'assistant', content: 'test' },
              finish_reason: 'stop',
            },
          ],
        }),
      }
      ;(global.window as any).electronAPI = mockElectronAPI

      await llmService.call({
        apiBase: 'https://test.openai.azure.com/v1',
        apiKey: 'azure-key',
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Hi' }],
      })

      expect(mockElectronAPI.llmCall).toHaveBeenCalledWith(
        expect.objectContaining({
          apiBase: 'https://test.openai.azure.com/v1',
          apiKey: 'azure-key',
        })
      )
      expect(global.fetch).not.toHaveBeenCalled()
    })
  })

  describe('fetchModels', () => {
    it('should fetch models via Electron IPC', async () => {
      const mockElectronAPI = {
        llmFetchModels: vi.fn().mockResolvedValue({
          object: 'list',
          data: [
            { id: 'gpt-4', object: 'model' },
            { id: 'gpt-3.5-turbo', object: 'model' },
          ],
        }),
      }
      ;(global.window as any).electronAPI = mockElectronAPI

      const models = await llmService.fetchModels('https://api.openai.com/v1', 'test-key')

      expect(models).toEqual(['gpt-3.5-turbo', 'gpt-4'])
      expect(mockElectronAPI.llmFetchModels).toHaveBeenCalled()
    })

    it('should fetch models with env-backed credentials via Electron IPC', async () => {
      const mockElectronAPI = {
        llmFetchModels: vi.fn().mockResolvedValue({
          object: 'list',
          data: [{ id: 'gpt-4o-mini', object: 'model' }],
        }),
      }
      ;(global.window as any).electronAPI = mockElectronAPI

      const models = await llmService.fetchModels(
        'https://api.openai.com/v1',
        '',
        'openai_compatible',
        'OPENAI_API_KEY',
      )

      expect(models).toEqual(['gpt-4o-mini'])
      expect(mockElectronAPI.llmFetchModels).toHaveBeenCalledWith(
        expect.objectContaining({
          apiBase: 'https://api.openai.com/v1',
          apiKey: '',
          apiKeyEnvVar: 'OPENAI_API_KEY',
          providerKind: 'openai_compatible',
        })
      )
    })

    it('should throw LLMError for invalid response format', async () => {
      const mockElectronAPI = {
        llmFetchModels: vi.fn().mockResolvedValue({ invalid: 'response' }),
      }
      ;(global.window as any).electronAPI = mockElectronAPI

      await expect(llmService.fetchModels('https://api.openai.com/v1', 'test-key')).rejects.toThrow(
        'Invalid models response'
      )
    })
  })

  describe('callStreaming', () => {
    it('streams local agent events and chunks without API credentials', async () => {
      const listeners: Record<string, (...args: any[]) => void> = {}
      const mockElectronAPI = {
        onLLMStreamEvent: vi.fn((callback) => {
          listeners.event = callback
        }),
        onLLMStreamChunk: vi.fn((callback) => {
          listeners.chunk = callback
        }),
        onLLMStreamDone: vi.fn((callback) => {
          listeners.done = callback
        }),
        onLLMStreamError: vi.fn((callback) => {
          listeners.error = callback
        }),
        removeLLMStreamListeners: vi.fn(),
        llmCall: vi.fn().mockImplementation(async () => {
          listeners.event?.({ type: 'init', sessionId: 'codex-test' })
          listeners.chunk?.('Hello')
          listeners.event?.({ type: 'done' })
          listeners.done?.()
          return { choices: [{ message: { content: 'Hello' } }] }
        }),
      }
      ;(global.window as any).electronAPI = mockElectronAPI

      const chunks: string[] = []
      const events: any[] = []

      await llmService.callStreaming(
        {
          apiBase: 'local-agent://codex',
          apiKey: '',
          model: 'codex',
          providerKind: 'local_agent',
          localAgentId: 'codex',
          messages: [{ role: 'user', content: 'Hi' }],
        },
        (chunk) => chunks.push(chunk),
        (event) => events.push(event)
      )

      expect(mockElectronAPI.llmCall).toHaveBeenCalledWith(
        expect.objectContaining({
          providerKind: 'local_agent',
          localAgentId: 'codex',
          stream: true,
        })
      )
      expect(chunks).toEqual(['Hello'])
      expect(events).toEqual([{ type: 'init', sessionId: 'codex-test' }, { type: 'done' }])
      expect(mockElectronAPI.removeLLMStreamListeners).toHaveBeenCalled()
    })

    it('cancels the Electron request when a streaming call is aborted', async () => {
      const controller = new AbortController()
      const mockElectronAPI = {
        onLLMStreamEvent: vi.fn(),
        onLLMStreamChunk: vi.fn(),
        onLLMStreamDone: vi.fn(),
        onLLMStreamError: vi.fn(),
        removeLLMStreamListeners: vi.fn(),
        llmCancel: vi.fn().mockResolvedValue({ success: true }),
        llmCall: vi.fn(() => new Promise(() => undefined)),
      }
      ;(global.window as any).electronAPI = mockElectronAPI

      const pending = llmService.callStreaming({
        apiBase: 'local-agent://codex',
        apiKey: '',
        model: 'codex',
        providerKind: 'local_agent',
        localAgentId: 'codex',
        messages: [{ role: 'user', content: 'Hi' }],
        timeout: 60_000,
        signal: controller.signal,
      }, vi.fn())
      controller.abort(new DOMException('用户停止', 'AbortError'))

      await expect(pending).rejects.toThrow('用户停止')
      expect(mockElectronAPI.llmCancel).toHaveBeenCalledTimes(1)
      expect(mockElectronAPI.removeLLMStreamListeners).toHaveBeenCalled()
    })

    it('enforces the configured streaming timeout when no stream event arrives', async () => {
      vi.useFakeTimers()
      try {
        const mockElectronAPI = {
          onLLMStreamEvent: vi.fn(),
          onLLMStreamChunk: vi.fn(),
          onLLMStreamDone: vi.fn(),
          onLLMStreamError: vi.fn(),
          removeLLMStreamListeners: vi.fn(),
          llmCancel: vi.fn().mockResolvedValue({ success: true }),
          llmCall: vi.fn(() => new Promise(() => undefined)),
        }
        ;(global.window as any).electronAPI = mockElectronAPI

        const pending = llmService.callStreaming({
          apiBase: 'local-agent://codex',
          apiKey: '',
          model: 'codex',
          providerKind: 'local_agent',
          localAgentId: 'codex',
          messages: [{ role: 'user', content: 'Hi' }],
          timeout: 60_000,
        }, vi.fn())
        const assertion = expect(pending).rejects.toThrow('请求超时（60秒）')

        await vi.advanceTimersByTimeAsync(60_000)

        await assertion
        expect(mockElectronAPI.llmCancel).toHaveBeenCalledTimes(1)
        expect(mockElectronAPI.removeLLMStreamListeners).toHaveBeenCalled()
      } finally {
        vi.useRealTimers()
      }
    })
  })

  describe('batchAnalyze', () => {
    it('should process items in batches', async () => {
      const items = Array.from({ length: 25 }, (_, i) => ({ id: i }))
      const batchFn = vi.fn().mockImplementation((batch: any) => Promise.resolve(batch))
      const onProgress = vi.fn()

      const result = await llmService.batchAnalyze(items, batchFn, onProgress)

      expect(result).toHaveLength(25)
      expect(batchFn).toHaveBeenCalledTimes(3)
      expect(onProgress).toHaveBeenCalled()
      expect(onProgress).toHaveBeenLastCalledWith(1)
    })

    it('should handle batch errors gracefully', async () => {
      const items = Array.from({ length: 15 }, (_, i) => ({ id: i }))
      const batchFn = vi.fn().mockImplementation((batch: any) => {
        if (batch[0].id === 10) {
          throw new Error('Batch error')
        }
        return Promise.resolve(batch)
      })

      const result = await withMutedConsoleError(() => llmService.batchAnalyze(items, batchFn))

      expect(result).toHaveLength(15)
      expect(batchFn).toHaveBeenCalledTimes(2)
    })

    it('should call onProgress with correct values', async () => {
      const items = Array.from({ length: 20 }, (_, i) => ({ id: i }))
      const batchFn = vi.fn().mockResolvedValue([])
      const progressValues: number[] = []
      const onProgress = vi.fn((p: number) => progressValues.push(p))

      await llmService.batchAnalyze(items, batchFn, onProgress)

      expect(progressValues.length).toBeGreaterThan(0)
      expect(progressValues[progressValues.length - 1]).toBe(1)
    })
  })
})
