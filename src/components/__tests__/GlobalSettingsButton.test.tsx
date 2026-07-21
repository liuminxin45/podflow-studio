import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import GlobalSettingsButton from '../GlobalSettingsButton'

describe('GlobalSettingsButton', () => {
  it.each([
    ['home', true],
    ['episode', false],
  ])('keeps the shared borderless treatment on the %s surface', (_surface, floating) => {
    render(<GlobalSettingsButton onOpen={vi.fn()} floating={floating} />)

    const button = screen.getByRole('button', { name: '设置' })
    expect(button.classList.contains('ant-btn-text')).toBe(true)
    expect(button.classList.contains('is-floating')).toBe(floating)
    expect(button.style.position).toBe(floating ? 'absolute' : '')
  })
})
