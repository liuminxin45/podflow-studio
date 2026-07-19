import { describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Modal } from 'antd'
import DiscoverPanel, { type DiscoverConfig, type DiscoverRunResult, type FetchSourceOption } from '../DiscoverPanel'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

const sourceOptions: FetchSourceOption[] = [
  { id: 'newsnow', name: 'NewsNow', description: 'NewsNow 热榜来源' },
  { id: 'ai_news_daily', name: 'AI News Daily', description: 'AI 新闻来源' },
]

const baseProps = {
  visible: true,
  items: [],
  selectedItems: [],
  meta: {},
  onConfigChange: vi.fn(),
  onRunOnce: vi.fn().mockResolvedValue({ items: [], meta: {} }),
  onClearCollection: vi.fn(),
  onProceedToOrganize: vi.fn(),
}

describe('DiscoverPanel source loading', () => {
  it('prefers the saved workflow source switches over global fetch defaults', async () => {
    render(
      <DiscoverPanel
        {...baseProps}
        initialConfig={{ enabled_sources: ['ai_news_daily'] }}
        onLoadConfig={vi.fn().mockResolvedValue({ enabled_sources: ['newsnow', 'ai_news_daily'] })}
        onListSources={vi.fn().mockResolvedValue(sourceOptions)}
      />,
    )

    expect((await screen.findByRole('switch', { name: '启用 NewsNow' })).getAttribute('aria-checked')).toBe('false')
    expect(screen.getByRole('switch', { name: '启用 AI News Daily' }).getAttribute('aria-checked')).toBe('true')
  })

  it('preserves an explicitly saved all-sources-off state', async () => {
    render(
      <DiscoverPanel
        {...baseProps}
        initialConfig={{ enabled_sources: [] }}
        onLoadConfig={vi.fn().mockResolvedValue({ enabled_sources: ['newsnow', 'ai_news_daily'] })}
        onListSources={vi.fn().mockResolvedValue(sourceOptions)}
      />,
    )

    expect((await screen.findByRole('switch', { name: '启用 NewsNow' })).getAttribute('aria-checked')).toBe('false')
    expect(screen.getByRole('switch', { name: '启用 AI News Daily' }).getAttribute('aria-checked')).toBe('false')
  })

  it('does not leave sources loading when parent callbacks change before initialization resolves', async () => {
    const configRequest = deferred<Partial<DiscoverConfig>>()
    const onLoadConfig = vi.fn(() => configRequest.promise)
    const onListSources = vi.fn().mockResolvedValue(sourceOptions)
    const replacementLoadConfig = vi.fn().mockResolvedValue({ enabled_sources: ['ai_news_daily'] })
    const replacementListSources = vi.fn().mockResolvedValue(sourceOptions.slice(0, 1))

    const { rerender } = render(
      <DiscoverPanel
        {...baseProps}
        onLoadConfig={onLoadConfig}
        onListSources={onListSources}
      />,
    )

    expect(await screen.findByLabelText('正在加载数据源')).toBeTruthy()

    rerender(
      <DiscoverPanel
        {...baseProps}
        onLoadConfig={replacementLoadConfig}
        onListSources={replacementListSources}
      />,
    )

    configRequest.resolve({ enabled_sources: ['newsnow'] })

    await waitFor(() => {
      expect(screen.queryByLabelText('正在加载数据源')).toBeNull()
      expect(screen.getByText('NewsNow')).toBeTruthy()
      expect(screen.getByText('AI News Daily')).toBeTruthy()
    })

    expect(onLoadConfig).toHaveBeenCalledTimes(1)
    expect(onListSources).toHaveBeenCalledTimes(1)
    expect(replacementLoadConfig).not.toHaveBeenCalled()
    expect(replacementListSources).not.toHaveBeenCalled()
  })

  it('clears previous items immediately when rerunning discovery', async () => {
    const useModalSpy = vi.spyOn(Modal, 'useModal').mockReturnValue([
      {
        confirm: (config: any) => {
          config?.onOk?.()
          return { destroy: vi.fn(), update: vi.fn() }
        },
      } as any,
      <></>,
    ])
    try {
      const runRequest = deferred<DiscoverRunResult>()
      const onRunOnce = vi.fn(() => runRequest.promise)
      const oldItems = [
        {
          title: '旧新闻标题',
          content: '上一轮采集留下的内容',
          url: 'https://example.com/old',
          source: 'newsnow',
        },
      ]

      const props = {
        ...baseProps,
        items: oldItems,
        onLoadConfig: vi.fn().mockResolvedValue({ enabled_sources: ['newsnow'] }),
        onListSources: vi.fn().mockResolvedValue(sourceOptions),
        onRunOnce,
      }

      const { rerender } = render(<DiscoverPanel {...props} />)

      await waitFor(() => {
        expect(screen.getAllByText('旧新闻标题').length).toBeGreaterThan(0)
        expect(screen.getByText('NewsNow')).toBeTruthy()
      })

      fireEvent.click(screen.getByRole('button', { name: /运行采集/ }))

      await waitFor(() => {
        expect(onRunOnce).toHaveBeenCalled()
        expect(screen.queryByText('旧新闻标题')).toBeNull()
      })

      rerender(<DiscoverPanel {...props} />)

      expect(screen.queryByText('旧新闻标题')).toBeNull()

      await act(async () => {
        runRequest.resolve({ items: [], meta: {} })
        await runRequest.promise
      })
    } finally {
      useModalSpy.mockRestore()
    }
  }, 10000)

  it('sends the current fetch topic field without the removed core_topic field', async () => {
    const onRunOnce = vi.fn().mockResolvedValue({ items: [], meta: {} })
    render(
      <DiscoverPanel
        {...baseProps}
        initialConfig={{ topic: '人工智能' }}
        onLoadConfig={vi.fn().mockResolvedValue({ enabled_sources: ['newsnow'] })}
        onListSources={vi.fn().mockResolvedValue(sourceOptions)}
        onRunOnce={onRunOnce}
      />,
    )

    await screen.findByText('NewsNow')
    fireEvent.click(screen.getByRole('button', { name: /运行采集/ }))

    await waitFor(() => expect(onRunOnce).toHaveBeenCalled())
    const submitted = onRunOnce.mock.calls[0][0] as Record<string, unknown>
    expect(submitted.topic).toBe('人工智能')
    expect(submitted).not.toHaveProperty('core_topic')
  })

  it('hides unscreened source items and shows the current activity beside progress', async () => {
    const runRequest = deferred<DiscoverRunResult>()
    let progressListener: ((event: any) => void) | undefined
    const originalElectronAPI = window.electronAPI
    ;(window as any).electronAPI = {
      ...originalElectronAPI,
      onDiscoverProgress: vi.fn((listener: (event: any) => void) => {
        progressListener = listener
        return vi.fn()
      }),
    }

    try {
      render(
        <DiscoverPanel
          {...baseProps}
          onLoadConfig={vi.fn().mockResolvedValue({ enabled_sources: ['newsnow'] })}
          onListSources={vi.fn().mockResolvedValue(sourceOptions)}
          onRunOnce={vi.fn(() => runRequest.promise)}
        />,
      )

      await screen.findByText('NewsNow')
      fireEvent.click(screen.getByRole('button', { name: /运行采集/ }))

      await waitFor(() => expect(progressListener).toBeTypeOf('function'))
      act(() => {
        progressListener?.({
          type: 'source_items',
          sourceId: 'newsnow',
          sourceName: 'NewsNow',
          itemCount: 1,
          rawCount: 1,
          items: [{ title: '尚未筛选的新闻', source: 'newsnow', url: 'https://example.com/pending' }],
        })
      })

      expect(screen.queryByText('尚未筛选的新闻')).toBeNull()
      expect(screen.getByText('NewsNow 返回 1 条')).toBeTruthy()
      expect(screen.getByRole('progressbar', { name: '采集进度' })).toBeTruthy()

      await act(async () => {
        runRequest.resolve({ items: [], meta: {} })
        await runRequest.promise
      })
    } finally {
      ;(window as any).electronAPI = originalElectronAPI
    }
  }, 10000)

  it('shows result-aware actions and keeps responsive settings accessible', async () => {
    const items = [
      { title: '新闻一', content: '第一条内容', source: 'newsnow', url: 'https://example.com/one' },
      { title: '新闻二', content: '第二条内容', source: 'ai_news_daily', url: 'https://example.com/two' },
    ]
    render(
      <DiscoverPanel
        {...baseProps}
        items={items}
        selectedItems={[items[0]]}
        onLoadConfig={vi.fn().mockResolvedValue({ enabled_sources: ['newsnow'] })}
        onListSources={vi.fn().mockResolvedValue(sourceOptions)}
      />,
    )

    await screen.findByText('NewsNow')
    expect(screen.getByRole('button', { name: /整理 1 条/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /全\s*选/ })).toBeTruthy()
    expect(screen.queryByText('2 条')).toBeNull()
    expect(screen.queryByText('2 条结果 · 已选 1 条')).toBeNull()
    expect(screen.queryByText(/内置数据源.*2 条素材/)).toBeNull()
    expect(screen.getByRole('button', { name: '更多素材操作' })).toBeTruthy()

    expect(screen.getByRole('button', { name: '打开采集设置' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /全\s*选/ }))
    expect(screen.getByRole('button', { name: /反\s*选/ })).toBeTruthy()
    expect(screen.getAllByRole('checkbox', { name: '取消选择素材' })).toHaveLength(2)

    fireEvent.click(screen.getByRole('button', { name: /反\s*选/ }))
    expect(screen.getByRole('button', { name: /全\s*选/ })).toBeTruthy()
    expect(screen.getAllByRole('checkbox', { name: '选择素材' })).toHaveLength(2)
  })

  it('restores a saved selection by URL when organize AI changed its title', async () => {
    const fetchedItem = {
      title: '实习摸鱼发现被骂',
      content: '原始热榜内容',
      source: 'newsnow:nowcoder',
      url: 'https://example.com/intern',
    }
    const organizedSelection = {
      ...fetchedItem,
      title: '整理后更准确的实习新闻标题',
      source: '牛客',
    }

    render(
      <DiscoverPanel
        {...baseProps}
        items={[fetchedItem]}
        selectedItems={[organizedSelection]}
        onLoadConfig={vi.fn().mockResolvedValue({ enabled_sources: ['newsnow'] })}
        onListSources={vi.fn().mockResolvedValue(sourceOptions)}
      />,
    )

    await screen.findByText('NewsNow')
    expect(screen.getByRole('checkbox', { name: '取消选择素材' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /整理 1 条/ })).toBeTruthy()
  })

  it('opens responsive details from the keyboard and preserves organize-all source metadata', async () => {
    const originalGetComputedStyle = window.getComputedStyle.bind(window)
    const getComputedStyleSpy = vi.spyOn(window, 'getComputedStyle').mockImplementation(element => (
      originalGetComputedStyle(element)
    ))
    const originalMatchMedia = window.matchMedia
    ;(window as any).matchMedia = vi.fn().mockReturnValue({
      matches: true,
      media: '(max-width: 1200px)',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })
    const onProceedToOrganize = vi.fn()
    const items = [
      { title: '新闻一', content: '第一条内容', source: 'newsnow', url: 'https://example.com/one' },
      { title: '新闻二', content: '第二条内容', source: 'ai_news_daily', url: 'https://example.com/two' },
    ]

    try {
      render(
        <DiscoverPanel
          {...baseProps}
          items={items}
          selectedItems={[]}
          onLoadConfig={vi.fn().mockResolvedValue({ enabled_sources: ['newsnow'] })}
          onListSources={vi.fn().mockResolvedValue(sourceOptions)}
          onProceedToOrganize={onProceedToOrganize}
        />,
      )

      await screen.findByText('NewsNow')
      fireEvent.keyDown(screen.getByRole('option', { name: /新闻一/ }), { key: 'Enter' })
      expect(await screen.findByRole('dialog', { name: '新闻详情' })).toBeTruthy()

      fireEvent.change(screen.getByPlaceholderText('搜索标题、内容或来源'), { target: { value: '新闻一' } })
      fireEvent.click(screen.getByRole('button', { name: /整理全部/ }))
      expect(onProceedToOrganize).toHaveBeenCalledWith(
        items,
        expect.objectContaining({ source_counts: { newsnow: 1, ai_news_daily: 1 } }),
        expect.any(Object),
      )
    } finally {
      getComputedStyleSpy.mockRestore()
      ;(window as any).matchMedia = originalMatchMedia
    }
  })

})
