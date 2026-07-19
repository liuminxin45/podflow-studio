import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import WorkflowSaveButton from '../WorkflowSaveButton'

describe('WorkflowSaveButton', () => {
  it('sends one immediate save request for every click, even when already saved or a request is pending', () => {
    const onSave = vi.fn(() => new Promise(() => undefined))
    const view = render(<WorkflowSaveButton hasUnsavedChanges={false} onSave={onSave} />)
    const saveButton = screen.getByRole('button', { name: '保存节目' })

    fireEvent.click(saveButton)
    fireEvent.click(saveButton)
    view.rerender(<WorkflowSaveButton hasUnsavedChanges onSave={onSave} />)
    fireEvent.click(screen.getByRole('button', { name: '保存节目' }))

    expect(onSave).toHaveBeenCalledTimes(3)
  })
})
