import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useAutoTopic } from '../useAutoTopic'
import { llmService } from '../../services/llmService'
import type { ContentItem } from '../../types/workflow'

vi.mock('../../services/llmService')

describe('useAutoTopic', () => {
  const mockFetchContents: ContentItem[] = [
    {
      title: 'Test Article 1',
      url: 'https://test.com/1',
      content: 'This is a test article about AI',
      source: 'Test Source',
      published: new Date(Date.now() - 2 * 3600000).toISOString(),
    },
    {
      title: 'Test Article 2',
      url: 'https://test.com/2',
      content: 'Another article about machine learning',
      source: 'Test Source',
      published: new Date(Date.now() - 5 * 3600000).toISOString(),
    },
    {
      title: 'Old Article',
      url: 'https://test.com/3',
      content: 'This is an old article',
      source: 'Test Source',
      published: new Date(Date.now() - 48 * 3600000).toISOString(),
    },
  ]

  const mockLLMConfig = {
    apiKey: 'test-key',
    apiBase: 'https://api.openai.com/v1',
    model: 'gpt-4',
  }

  const mockOnRunFetch = vi.fn().mockResolvedValue(undefined)

  beforeEach(() => {
    vi.clearAllMocks()
    ;(llmService.call as any).mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify([
              { index: 1, score: 85, decision: 'keep', reason: 'Relevant', angle: 'Technical' },
              { index: 2, score: 45, decision: 'drop', reason: 'Low relevance', angle: '' },
            ]),
          },
        },
      ],
    })
    ;(llmService.batchAnalyze as any).mockImplementation(async (items, batchFn) => {
      return await batchFn(items)
    })
  })

  it('should initialize with default state', () => {
    const { result } = renderHook(() => useAutoTopic(mockFetchContents, mockLLMConfig, mockOnRunFetch))

    expect(result.current.state.stage).toBe('fetch')
    expect(result.current.state.progress).toBe(0)
    expect(result.current.state.selectedItems).toEqual([])
    expect(result.current.state.rejectedItems).toEqual([])
    expect(result.current.isProcessing).toBe(false)
  })

  it('should filter items by time range', async () => {
    const { result } = renderHook(() => useAutoTopic(mockFetchContents, mockLLMConfig, mockOnRunFetch))

    const config = {
      target_topic: 'AI Technology',
      time_range_hours: 24,
      focus_instruction: '',
      max_items: 10,
    }

    result.current.execute(config)

    await waitFor(() => {
      expect(result.current.state.stage).toBe('done')
    })

    expect(result.current.state.logs.some((log) => log.includes('保留 2 条'))).toBe(true)
  })

  it('should handle missing LLM config', async () => {
    const { result } = renderHook(() => useAutoTopic(mockFetchContents, null, mockOnRunFetch))

    const config = {
      target_topic: 'AI Technology',
      time_range_hours: 24,
      focus_instruction: '',
      max_items: 10,
    }

    result.current.execute(config)

    await waitFor(() => {
      expect(result.current.state.error).toBeDefined()
    })

    expect(result.current.state.error).toContain('未配置大模型')
  })

  it('should handle empty target topic', async () => {
    const { result } = renderHook(() => useAutoTopic(mockFetchContents, mockLLMConfig, mockOnRunFetch))

    const config = {
      target_topic: '',
      time_range_hours: 24,
      focus_instruction: '',
      max_items: 10,
    }

    result.current.execute(config)

    await waitFor(() => {
      expect(result.current.isProcessing).toBe(false)
    })

    expect(result.current.state.selectedItems).toEqual([])
  })

  it('should call onRunFetch during execution', async () => {
    const { result } = renderHook(() => useAutoTopic(mockFetchContents, mockLLMConfig, mockOnRunFetch))

    const config = {
      target_topic: 'AI Technology',
      time_range_hours: 24,
      focus_instruction: '',
      max_items: 10,
    }

    result.current.execute(config)

    await waitFor(() => {
      expect(mockOnRunFetch).toHaveBeenCalled()
    })
  })

  it('should handle LLM API errors', async () => {
    ;(llmService.call as any).mockRejectedValue(new Error('API Error'))

    const { result } = renderHook(() => useAutoTopic(mockFetchContents, mockLLMConfig, mockOnRunFetch))

    const config = {
      target_topic: 'AI Technology',
      time_range_hours: 24,
      focus_instruction: '',
      max_items: 10,
    }

    result.current.execute(config)

    await waitFor(() => {
      expect(result.current.state.error).toBeDefined()
    })

    expect(result.current.state.error).toContain('API Error')
  })

  it('should add logs during execution', async () => {
    const { result } = renderHook(() => useAutoTopic(mockFetchContents, mockLLMConfig, mockOnRunFetch))

    const config = {
      target_topic: 'AI Technology',
      time_range_hours: 24,
      focus_instruction: '',
      max_items: 10,
    }

    result.current.execute(config)

    await waitFor(() => {
      expect(result.current.state.logs.length).toBeGreaterThan(0)
    })

    expect(result.current.state.logs.some((log) => log.includes('开始采集'))).toBe(true)
  })

  it('should handle no time-filtered items', async () => {
    const oldContents: ContentItem[] = [
      {
        title: 'Very Old Article',
        url: 'https://test.com/old',
        content: 'Old content',
        source: 'Test',
        published: new Date(Date.now() - 100 * 24 * 3600000).toISOString(),
      },
    ]

    const { result } = renderHook(() => useAutoTopic(oldContents, mockLLMConfig, mockOnRunFetch))

    const config = {
      target_topic: 'AI Technology',
      time_range_hours: 24,
      focus_instruction: '',
      max_items: 10,
    }

    result.current.execute(config)

    await waitFor(() => {
      expect(result.current.state.error).toBeDefined()
    })

    expect(result.current.state.error).toContain('没有满足时效性要求')
  })
})
