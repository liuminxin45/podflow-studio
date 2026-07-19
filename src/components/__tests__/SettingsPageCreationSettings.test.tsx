import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { DEFAULT_SETTINGS } from '../../types/settings'
import SettingsPage from '../SettingsPage'

vi.mock('../../services/settings/localAgentDetection', () => ({
  applyDetectedLocalAgentsToSettings: (settings: unknown) => settings,
  detectLocalAgentStatuses: vi.fn(async () => []),
}))

describe('SettingsPage creation settings', () => {
  const originalElectronAPI = window.electronAPI

  afterEach(() => {
    ;(window as any).electronAPI = originalElectronAPI
    vi.restoreAllMocks()
  })

  it('combines the useful podcast controls and removes generic capability settings', async () => {
    const saveNodeConfig = vi.fn(async () => ({ success: true }))
    ;(window as any).electronAPI = {
      ...(originalElectronAPI || {}),
      loadNodeConfig: vi.fn(async () => structuredClone(DEFAULT_SETTINGS)),
      saveNodeConfig,
    }

    const { container } = render(<SettingsPage visible workflow={null} onClose={vi.fn()} />)

    await waitFor(() => expect(screen.getAllByText('创作设置').length).toBeGreaterThan(1))
    expect(screen.getByText('播报表达')).toBeTruthy()
    expect(screen.getByText('内容侧重')).toBeTruthy()
    expect(screen.getByText('节目时长')).toBeTruthy()
    expect(screen.getByText('资料补全方式')).toBeTruthy()
    expect(screen.getByText('智能补全')).toBeTruthy()
    expect(screen.getByText('仅联网核验')).toBeTruthy()
    expect(screen.getByText('仅 AI 知识扩展')).toBeTruthy()
    expect(screen.getByText('声音输出')).toBeTruthy()
    expect(screen.getByText('MP3')).toBeTruthy()
    expect(screen.getByText('WAV')).toBeTruthy()
    expect(container.textContent).not.toContain('高品质')
    expect(screen.getByText('短早报')).toBeTruthy()
    expect(screen.getByText('标准早报')).toBeTruthy()

    expect(container.textContent).not.toContain('合规与风险能力')
    expect(container.textContent).not.toContain('能力配置')
    expect(container.textContent).not.toContain('智能行为')
    expect(container.textContent).not.toContain('默认语气风格')
    expect(container.textContent).not.toContain('加长早报')
    expect(container.textContent).not.toContain('范本')
    expect(container.textContent).not.toContain('系统与发布')
    expect(container.textContent).not.toContain('数据与表现')
    expect(container.textContent).not.toContain('创作者成长')

    fireEvent.click(screen.getByText('仅 AI 知识扩展'))
    fireEvent.click(screen.getByRole('button', { name: '保存设置' }))
    await waitFor(() => expect(saveNodeConfig).toHaveBeenCalledWith(
      'app_settings',
      expect.objectContaining({
        creatorPreferences: expect.objectContaining({ organizeCompletionMode: 'ai_knowledge' }),
      }),
    ))
  })
})
