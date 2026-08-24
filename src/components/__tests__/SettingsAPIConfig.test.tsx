import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import SettingsAPIConfig from '../SettingsAPIConfig'
import { DEFAULT_SETTINGS, type AppSettings } from '../../types/settings'


function renderSettings(settings: AppSettings = structuredClone(DEFAULT_SETTINGS)) {
  const updateSettings = vi.fn()
  render(<SettingsAPIConfig settings={settings} updateSettings={updateSettings} />)
  return updateSettings
}


describe('SettingsAPIConfig current AI provider contract', () => {
  it('shows only named Pydantic AI providers', () => {
    renderSettings()
    fireEvent.click(screen.getByRole('button', { name: /^API 模型/ }))

    expect(screen.getByRole('button', { name: /^OpenAI 待配置$/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /^Anthropic/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /^Gemini/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /^OpenRouter/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /^DeepSeek/ })).toBeTruthy()
    // Audio keeps a separate OpenAI-compatible TTS choice; this assertion covers text AI only.
    expect(screen.queryByRole('button', { name: /^LM Studio/ })).toBeNull()
  })

  it('keeps model IDs editable with built-in suggestions', () => {
    renderSettings()
    fireEvent.click(screen.getByRole('button', { name: /^API 模型/ }))
    const modelInput = screen.getByTestId('provider-model-row').querySelector('input') as HTMLInputElement
    expect(modelInput.value).toBe('gpt-4o-mini')
  })
})
