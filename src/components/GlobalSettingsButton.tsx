import { SettingOutlined } from '../icons/antdCompat'
import NavigationActionButton from './NavigationActionButton'

interface GlobalSettingsButtonProps {
  onOpen: () => void
  floating?: boolean
}

export default function GlobalSettingsButton({ onOpen, floating = false }: GlobalSettingsButtonProps) {
  return (
    <NavigationActionButton
      label="设置"
      title="设置"
      icon={<SettingOutlined style={{ fontSize: 14 }} />}
      onClick={onOpen}
      floating={floating}
      borderless
    />
  )
}
