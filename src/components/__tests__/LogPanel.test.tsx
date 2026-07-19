import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
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
})
