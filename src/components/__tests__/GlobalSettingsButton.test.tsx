import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import GlobalSettingsButton from '../GlobalSettingsButton'

describe('GlobalSettingsButton', () => {
  it.each([
    ['sidebar', false],
    ['episode header', true],
  ])('keeps the shared borderless treatment on the %s surface', (_surface, compact) => {
    render(<GlobalSettingsButton onOpen={vi.fn()} compact={compact} />)

    const button = screen.getByRole('button', { name: '设置' })
    expect(button.classList.contains('ant-btn-text')).toBe(true)
    expect(button.classList.contains('is-floating')).toBe(false)
    expect(button.style.position).toBe('')
    expect(button.style.width).toBe(compact ? '32px' : '100%')
  })
})
