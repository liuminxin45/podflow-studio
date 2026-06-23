import { useEffect, useRef, useState } from 'react'
import { Tabs, Badge, Empty, Button, Tag, message } from 'antd'
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  CopyOutlined,
  DownOutlined,
  FileTextOutlined,
  SyncOutlined,
  UpOutlined,
  WarningOutlined,
} from '../icons/antdCompat'

interface Props {
  workflow: any
  collapsed?: boolean
  onToggle?: () => void
  showToggle?: boolean
}

export default function LogPanel({ workflow, collapsed = false, onToggle, showToggle = true }: Props) {
  const state = workflow?.state || {}
  const logs = state.logs || []
  const errors = state.errors || []
  const nodeExecutions = workflow?.nodeExecutions || {}
  const logContainerRef = useRef<HTMLDivElement>(null)
  const [autoScroll] = useState(true)

  useEffect(() => {
    if (autoScroll && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight
    }
  }, [logs.length, autoScroll])

  const handleCopyLogs = () => {
    const logsText = logs.join('\n')
    navigator.clipboard.writeText(logsText).then(() => {
      message.success('Logs copied to clipboard')
    }).catch(() => {
      message.error('Failed to copy logs')
    })
  }
  
  const getNodeStatusIcon = (status: string) => {
    switch (status) {
      case 'running': return <SyncOutlined spin style={{ color: '#1890ff' }} />
      case 'completed': return <CheckCircleOutlined style={{ color: '#52c41a' }} />
      case 'failed': return <CloseCircleOutlined style={{ color: '#ff4d4f' }} />
      case 'waiting_approval': return <ClockCircleOutlined style={{ color: '#faad14' }} />
      default: return null
    }
  }
  
  const getNodeStatusColor = (status: string) => {
    switch (status) {
      case 'running': return 'processing'
      case 'completed': return 'success'
      case 'failed': return 'error'
      case 'waiting_approval': return 'warning'
      default: return 'default'
    }
  }

  return (
    <div style={{ height: '100%', background: 'var(--bg-secondary)', display: 'flex', flexDirection: 'column' }}>
      <Tabs
        defaultActiveKey="nodes"
        size="small"
        tabBarExtraContent={showToggle ? (
          <Button 
            type="text" 
            icon={collapsed ? <UpOutlined /> : <DownOutlined />} 
            onClick={onToggle}
            size="small"
            style={{ marginRight: 12, color: 'var(--text-secondary)' }}
          >
            {collapsed ? '展开' : '收起'}
          </Button>
        ) : undefined}
        items={[
          {
            key: 'nodes',
            label: (
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
                <SyncOutlined />
                <span>Node Status</span>
                <Badge count={Object.keys(nodeExecutions).length} overflowCount={99} style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)', boxShadow: 'none' }} />
              </span>
            ),
            children: (
              <div style={{ 
                height: '100%', 
                overflow: 'auto', 
                padding: '12px 16px',
                background: 'var(--bg-primary)',
                margin: '0 12px 12px',
                borderRadius: '6px',
                border: '1px solid var(--border-color)',
                display: collapsed ? 'none' : 'block'
              }}>
                {Object.keys(nodeExecutions).length > 0 ? (
                  Object.entries(nodeExecutions).map(([nodeName, execution]: [string, any]) => (
                    <div key={nodeName} style={{ 
                      padding: '8px 12px', 
                      marginBottom: '8px',
                      background: 'var(--bg-secondary)',
                      borderRadius: '4px',
                      border: '1px solid var(--border-color)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {getNodeStatusIcon(execution.status)}
                        <span style={{ fontWeight: 500, fontSize: '13px' }}>{nodeName}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Tag color={getNodeStatusColor(execution.status)} style={{ margin: 0 }}>
                          {execution.status}
                        </Tag>
                        {execution.duration && (
                          <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                            {execution.duration.toFixed(1)}s
                          </span>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No nodes executed yet" style={{ margin: '20px 0' }} />
                )}
              </div>
            )
          },
          {
            key: 'logs',
            label: (
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
                <FileTextOutlined />
                <span>执行日志</span>
                <Badge count={logs.length} overflowCount={999} style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)', boxShadow: 'none' }} />
                {logs.length > 0 && (
                  <Button 
                    type="text" 
                    size="small" 
                    icon={<CopyOutlined />}
                    onClick={(e) => {
                      e.stopPropagation()
                      handleCopyLogs()
                    }}
                    style={{ marginLeft: '4px', padding: '0 4px', height: '20px' }}
                  />
                )}
              </span>
            ),
            children: (
              <div style={{ 
                height: 'calc(100vh - 280px)',
                maxHeight: '600px',
                overflow: 'auto', 
                padding: '12px 16px',
                fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
                fontSize: '12px',
                color: 'var(--text-secondary)',
                lineHeight: '1.6',
                background: 'var(--bg-primary)',
                margin: '0 12px 12px',
                borderRadius: '6px',
                border: '1px solid var(--border-color)',
                display: collapsed ? 'none' : 'block'
              }}>
                {logs.length > 0 ? (
                  logs.map((log: string, i: number) => (
                    <div key={i} style={{ 
                      padding: '2px 0',
                      borderBottom: '1px solid var(--border-light)',
                      color: log.includes('Error') || log.includes('Failed') || log.includes('错误') || log.includes('失败') ? 'var(--error-color)' : 'inherit',
                      display: 'flex',
                      gap: '12px',
                      wordBreak: 'break-word'
                    }}>
                      <span style={{ opacity: 0.4, minWidth: '24px', textAlign: 'right', userSelect: 'none', flexShrink: 0 }}>{i + 1}</span>
                      <span style={{ flex: 1 }}>{log}</span>
                    </div>
                  ))
                ) : (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无日志" style={{ margin: '20px 0' }} />
                )}
              </div>
            )
          },
          {
            key: 'errors',
            label: (
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
                <WarningOutlined style={{ color: errors.length > 0 ? 'var(--error-color)' : 'inherit' }} />
                <span style={{ color: errors.length > 0 ? 'var(--error-color)' : 'inherit' }}>错误</span>
                {errors.length > 0 && <Badge count={errors.length} style={{ backgroundColor: 'var(--error-color)' }} />}
              </span>
            ),
            children: (
              <div style={{ 
                height: '100%', 
                overflow: 'auto', 
                padding: '12px 16px',
                background: 'var(--bg-primary)',
                margin: '0 12px 12px',
                borderRadius: '6px',
                border: '1px solid var(--border-color)',
                display: collapsed ? 'none' : 'block'
              }}>
                {errors.length > 0 ? (
                  errors.map((err: any, i: number) => (
                    <div key={i} style={{ 
                      padding: '8px 12px', 
                      marginBottom: '8px',
                      background: 'var(--error-bg)',
                      border: '1px solid var(--error-color)',
                      borderRadius: '4px',
                      color: 'var(--text-primary)'
                    }}>
                      <div style={{ fontWeight: '600', color: 'var(--error-color)', marginBottom: '4px', fontSize: '13px' }}>
                        [{err.node}] 错误
                      </div>
                      <div style={{ fontFamily: 'monospace', fontSize: '12px' }}>{err.message}</div>
                    </div>
                  ))
                ) : (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无错误" style={{ margin: '20px 0' }} />
                )}
              </div>
            )
          }
        ]}
        style={{ height: '100%' }}
        tabBarStyle={{ 
          background: 'var(--bg-secondary)', 
          margin: 0, 
          padding: '0 16px',
          borderBottom: collapsed ? 'none' : '1px solid var(--border-color)',
          minHeight: '40px'
        }}
      />
    </div>
  )
}
