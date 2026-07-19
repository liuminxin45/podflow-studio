import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import type { Workflow } from '../types/workflow'

vi.mock('../components/ApprovalModal', () => ({ default: () => null }))
vi.mock('../components/EpisodeDraftStudio', () => ({ default: () => null }))
vi.mock('../components/DiscoverPanel', () => ({ default: () => null }))
vi.mock('../components/OrganizePanel', async () => {
  const { forwardRef } = await import('react')
  return { default: forwardRef(() => null) }
})
vi.mock('../components/SoundStudio', () => ({ default: () => null }))
vi.mock('../components/PublishLayer', () => ({ default: () => null }))
vi.mock('../components/SettingsPage', () => ({ default: () => null }))
vi.mock('../components/GlobalSettingsButton', () => ({ default: () => null }))
vi.mock('../components/EpisodeManager', () => ({
  default: ({ onOpen }: { onOpen: (workflowId: string) => Promise<void> | void }) => (
    <button type="button" onClick={() => void onOpen('workflow-notice-test')}>打开节目</button>
  ),
}))
vi.mock('../components/WorkflowSidebar', () => ({
  default: ({ onSave }: { onSave: () => Promise<unknown> | unknown }) => (
    <button type="button" onClick={() => void onSave()}>保存节目</button>
  ),
}))

const activeWorkflow = {
  id: 'workflow-notice-test',
  status: 'draft',
  currentNode: null,
  nodeExecutions: {},
  state: {
    episode_id: 'episode-notice-test',
    fetch_contents: [],
  },
} as unknown as Workflow

describe('App 关键操作反馈', () => {
  const originalElectronAPI = window.electronAPI
  const saveWorkflow = vi.fn(async () => activeWorkflow)

  beforeEach(() => {
    saveWorkflow.mockClear()
    ;(window as any).electronAPI = {
      appLog: vi.fn(async () => ({ success: true })),
      listWorkflows: vi.fn(async () => []),
      openWorkflow: vi.fn(async () => activeWorkflow),
      saveWorkflow,
    }
  })

  afterEach(() => {
    ;(window as any).electronAPI = originalElectronAPI
  })

  it('opens feedback for opening and saving a program', async () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: '打开节目' }))
    expect(await screen.findByText('已打开节目')).toBeTruthy()

    fireEvent.click(await screen.findByRole('button', { name: '保存节目' }))
    await waitFor(() => expect(saveWorkflow).toHaveBeenCalledWith(activeWorkflow.id))
    expect(await screen.findByText('节目已保存')).toBeTruthy()
  })
})
