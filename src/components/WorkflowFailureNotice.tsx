import { useMemo, useState } from 'react'
import { Button, Drawer, Empty, message } from 'antd'
import {
  CopyOutlined,
  FileTextOutlined,
  ReloadOutlined,
  WarningOutlined,
} from '../icons/antdCompat'
import type { ErrorInfo, Workflow } from '../types/workflow'
import type { WorkflowFailure } from '../services/workflowFailure'

interface Props {
  workflow?: Workflow | null
  failure: WorkflowFailure
  title?: string
  compact?: boolean
  onRetry?: () => void
  onDismiss?: () => void
}

function relevantErrors(workflow: Workflow | null | undefined, node?: string): ErrorInfo[] {
  const errors = workflow?.state?.errors || []
  const matched = node ? errors.filter(error => error.node === node) : errors
  return matched.length > 0 ? matched : errors
}

function relevantLogs(workflow: Workflow | null | undefined, node?: string): string[] {
  const logs = workflow?.state?.logs || []
  if (!node) return logs.slice(-120)
  const normalizedNode = node.toLocaleLowerCase()
  const matched = logs.filter(log => log.toLocaleLowerCase().includes(normalizedNode))
  return (matched.length > 0 ? matched : logs).slice(-120)
}

export default function WorkflowFailureNotice({
  workflow,
  failure,
  title = '本次运行未完成',
  compact = false,
  onRetry,
  onDismiss,
}: Props) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const errors = useMemo(
    () => relevantErrors(workflow, failure.node),
    [failure.node, workflow],
  )
  const logs = useMemo(
    () => relevantLogs(workflow, failure.node),
    [failure.node, workflow],
  )

  const copyFailure = async () => {
    const parts = [
      title,
      failure.node ? `节点：${failure.node}` : '',
      `原因：${failure.message}`,
      failure.detail ? `详情：${failure.detail}` : '',
      failure.timestamp ? `时间：${failure.timestamp}` : '',
    ].filter(Boolean)
    try {
      await navigator.clipboard.writeText(parts.join('\n'))
      message.success('失败原因已复制')
    } catch {
      message.error('无法复制失败原因')
    }
  }

  if (compact) {
    return (
      <>
        <button
          type="button"
          className="workflow-failure-compact"
          onClick={() => setDrawerOpen(true)}
          aria-label={`查看失败详情：${failure.message}`}
        >
          <WarningOutlined />
          <span>
            <strong>{failure.node ? `${failure.node} 失败` : title}</strong>
            <small>{failure.message}</small>
          </span>
          <FileTextOutlined />
        </button>
        <FailureLogDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          failure={failure}
          errors={errors}
          logs={logs}
        />
      </>
    )
  }

  return (
    <>
      <section className="workflow-failure-notice" role="alert" aria-live="assertive">
        <WarningOutlined className="workflow-failure-notice-icon" />
        <div className="workflow-failure-notice-copy">
          <strong>{title}</strong>
          <p>{failure.message}</p>
          {failure.node && <small>失败节点：{failure.node}</small>}
        </div>
        <div className="workflow-failure-notice-actions">
          {onRetry && (
            <Button size="small" icon={<ReloadOutlined />} onClick={onRetry}>
              重试
            </Button>
          )}
          <Button size="small" icon={<CopyOutlined />} onClick={() => void copyFailure()}>
            复制原因
          </Button>
          <Button size="small" type="primary" ghost icon={<FileTextOutlined />} onClick={() => setDrawerOpen(true)}>
            查看相关日志
          </Button>
          {onDismiss && <Button size="small" type="text" onClick={onDismiss}>关闭</Button>}
        </div>
      </section>
      <FailureLogDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        failure={failure}
        errors={errors}
        logs={logs}
      />
    </>
  )
}

function FailureLogDrawer({
  open,
  onClose,
  failure,
  errors,
  logs,
}: {
  open: boolean
  onClose: () => void
  failure: WorkflowFailure
  errors: ErrorInfo[]
  logs: string[]
}) {
  return (
    <Drawer
      title={failure.node ? `${failure.node} · 失败详情` : '失败详情'}
      width={560}
      open={open}
      onClose={onClose}
      destroyOnClose
    >
      <div className="workflow-failure-drawer">
        <section className="workflow-failure-drawer-summary">
          <span>最终原因</span>
          <strong>{failure.message}</strong>
          {failure.detail && <pre>{failure.detail}</pre>}
          {failure.timestamp && <small>{failure.timestamp}</small>}
        </section>

        <section>
          <h3>本节点错误</h3>
          {errors.length > 0 ? errors.map((error, index) => (
            <article className="workflow-failure-error-entry" key={`${error.node}-${error.timestamp || index}`}>
              <strong>{error.node}</strong>
              <p>{error.message}</p>
              {error.detail && error.detail !== error.message && <pre>{error.detail}</pre>}
            </article>
          )) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有结构化错误记录" />}
        </section>

        <section>
          <h3>相关执行日志</h3>
          {logs.length > 0 ? (
            <div className="workflow-failure-log-list">
              {logs.map((log, index) => <div key={`${index}-${log}`}>{log}</div>)}
            </div>
          ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有可用日志" />}
        </section>
      </div>
    </Drawer>
  )
}
