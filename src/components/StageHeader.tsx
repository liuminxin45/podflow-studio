import type { ReactNode } from 'react'
import { Button } from 'antd'
import { ArrowLeftOutlined, ArrowRightOutlined } from '../icons/antdCompat'

interface StageNavAction {
  label?: string
  disabled?: boolean
  loading?: boolean
  tooltip?: string
  onClick?: () => void
}

interface Props {
  title: string
  center?: ReactNode
  actions?: ReactNode
  previous?: StageNavAction
  next?: StageNavAction
}

function NavButton({
  kind,
  action,
}: {
  kind: 'previous' | 'next'
  action: StageNavAction
}) {
  const button = (
    <Button
      type={kind === 'next' ? 'primary' : 'default'}
      title={action.tooltip}
      icon={kind === 'previous' ? <ArrowLeftOutlined /> : undefined}
      loading={action.loading}
      disabled={action.disabled}
      onClick={action.onClick}
      className={`stage-header-nav-button ${kind}`}
    >
      {action.label || (kind === 'previous' ? '上一步' : '下一步')}
      {kind === 'next' && <ArrowRightOutlined className="stage-header-nav-suffix" />}
    </Button>
  )

  return button
}

export default function StageHeader({
  title,
  center,
  actions,
  previous,
  next,
}: Props) {
  return (
    <header className="stage-topbar stage-header">
      <div className="stage-header-main">
        <div className="stage-header-title">
          <h1>{title}</h1>
        </div>
      </div>
      {center && <div className="stage-header-center">{center}</div>}
      <div className="stage-header-actions">
        {actions}
        {(previous || next) && (
          <div className="stage-header-nav">
            {previous && <NavButton kind="previous" action={previous} />}
            {next && <NavButton kind="next" action={next} />}
          </div>
        )}
      </div>
    </header>
  )
}
