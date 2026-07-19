import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import WorkflowSidebar from '../WorkflowSidebar'

describe('WorkflowSidebar navigation treatment', () => {
  it('uses the shared wider rail and borderless episode actions', () => {
    render(
      <WorkflowSidebar
        workflow={null}
        activeStageId="discover"
        onStageClick={vi.fn()}
        onOpenSettings={vi.fn()}
        hasUnsavedChanges={false}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    expect(screen.getByRole('complementary').style.width).toBe('var(--stage-nav-width)')
    for (const label of ['保存节目', '关闭节目', '设置']) {
      expect(screen.getByRole('button', { name: label }).classList.contains('ant-btn-text')).toBe(true)
    }
  })
})
