import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import WorkflowSidebar from '../WorkflowSidebar'

describe('WorkflowSidebar navigation treatment', () => {
  it('uses one unified sidebar for product navigation when no episode is open', () => {
    render(
      <WorkflowSidebar
        workflow={null}
        activeStageId={null}
        onStageClick={vi.fn()}
        onOpenSettings={vi.fn()}
        hasUnsavedChanges={false}
        onSave={vi.fn()}
        onClose={vi.fn()}
        homeActive
        hasElectronBackend
        onHome={vi.fn()}
        onCreate={vi.fn()}
      />,
    )

    expect(screen.getAllByRole('complementary')).toHaveLength(1)
    expect(screen.getByRole('navigation', { name: '主导航' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '节目库' }).getAttribute('aria-current')).toBe('page')
    expect((screen.getByRole('button', { name: '新建节目' }) as HTMLButtonElement).disabled).toBe(false)
    expect(screen.getAllByRole('button', { name: '新建节目' })).toHaveLength(1)
    expect((screen.getByRole('button', { name: '设置' }) as HTMLButtonElement).disabled).toBe(false)
    expect(screen.queryByRole('button', { name: '保存节目' })).toBeNull()
    expect(screen.queryByRole('button', { name: '关闭节目' })).toBeNull()
  })
})
