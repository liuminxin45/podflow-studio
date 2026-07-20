import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import LogPanel from '../LogPanel'

describe('LogPanel', () => {
  it('scrolls to existing newest entries when the log tab is opened', async () => {
    render(<LogPanel workflow={{ state: { logs: ['first', 'latest'], errors: [] }, nodeExecutions: {} }} />)
    const container = document.querySelector('.log-panel-scroll') as HTMLDivElement
    Object.defineProperty(container, 'scrollHeight', { configurable: true, value: 640 })

    fireEvent.click(screen.getByRole('tab', { name: /执行日志/ }))

    await waitFor(() => expect(container.scrollTop).toBe(640))
    expect(screen.getByText('latest')).toBeTruthy()
  })

  it('lets the user confirm clearing workflow logs', async () => {
    const onClearLogs = vi.fn().mockResolvedValue(undefined)
    render(<LogPanel
      workflow={{ state: { logs: ['existing'], errors: [] }, nodeExecutions: {} }}
      onClearLogs={onClearLogs}
    />)
    fireEvent.click(screen.getByRole('tab', { name: /执行日志/ }))
    fireEvent.click(screen.getByRole('button', { name: '清空执行日志' }))
    fireEvent.click(await screen.findByRole('button', { name: '确认清空执行日志' }))

    await waitFor(() => expect(onClearLogs).toHaveBeenCalledTimes(1))
  })
})
