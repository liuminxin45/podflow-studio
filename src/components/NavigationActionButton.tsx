import { Button } from 'antd'
import type { ReactNode } from 'react'

interface NavigationActionButtonProps {
  label: string
  icon: ReactNode
  onClick: () => void
  title?: string
  compact?: boolean
  borderless?: boolean
}

export default function NavigationActionButton({
  label,
  icon,
  onClick,
  title = label,
  compact = false,
  borderless = false,
}: NavigationActionButtonProps) {
  return (
    <Button
      className="navigation-action-button"
      type={borderless ? 'text' : 'default'}
      title={title}
      icon={icon}
      onClick={onClick}
      aria-label={label}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: compact ? 'center' : 'flex-start',
        gap: 8,
        height: borderless ? 36 : 32,
        width: compact ? 32 : '100%',
        padding: compact ? 0 : '0 10px',
        fontSize: 13,
      }}
    >
      {compact ? null : label}
    </Button>
  )
}
