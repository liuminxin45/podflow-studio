import { SettingOutlined } from '../icons/antdCompat'
import NavigationActionButton from './NavigationActionButton'

interface GlobalSettingsButtonProps {
  onOpen: () => void
  compact?: boolean
}

export default function GlobalSettingsButton({ onOpen, compact = false }: GlobalSettingsButtonProps) {
  return (
    <NavigationActionButton
      label="设置"
      title="设置"
      icon={<SettingOutlined style={{ fontSize: 14 }} />}
      onClick={onOpen}
      compact={compact}
      borderless
    />
  )
}
