import { SaveOutlined } from '../icons/antdCompat'
import NavigationActionButton from './NavigationActionButton'

interface WorkflowSaveButtonProps {
  hasUnsavedChanges: boolean
  onSave: () => Promise<unknown> | unknown
  fullWidth?: boolean
}

export default function WorkflowSaveButton({ hasUnsavedChanges, onSave, fullWidth = false }: WorkflowSaveButtonProps) {
  return (
    <NavigationActionButton
      label="保存节目"
      title={hasUnsavedChanges ? '保存节目' : '再次保存节目'}
      icon={<SaveOutlined />}
      onClick={onSave}
      compact={!fullWidth}
      borderless={fullWidth}
    />
  )
}
