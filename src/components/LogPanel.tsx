import { Tabs, Badge, Empty, Button } from 'antd'
import { FileTextOutlined, WarningOutlined, DownOutlined, UpOutlined } from '@ant-design/icons'

interface Props {
  workflow: any
  collapsed: boolean
  onToggle: () => void
}

export default function LogPanel({ workflow, collapsed, onToggle }: Props) {
  const state = workflow?.state || {}
  const logs = state.logs || []
  const errors = state.errors || []

  return (
    <div style={{ height: '100%', background: 'var(--bg-secondary)', display: 'flex', flexDirection: 'column' }}>
      <Tabs
        defaultActiveKey="logs"
        tabBarExtraContent={
          <Button 
            type="text" 
            icon={collapsed ? <UpOutlined /> : <DownOutlined />} 
            onClick={onToggle}
            size="small"
            style={{ marginRight: 16, color: 'var(--text-secondary)' }}
          >
            {collapsed ? 'Expand' : 'Collapse'}
          </Button>
        }
        items={[
          {
            key: 'logs',
            label: (
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <FileTextOutlined />
                <span>Execution Logs</span>
                <Badge count={logs.length} overflowCount={999} style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-secondary)', boxShadow: 'none' }} />
              </span>
            ),
            children: (
              <div style={{ 
                height: '100%', 
                overflow: 'auto', 
                padding: '12px 16px',
                fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
                fontSize: '13px',
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
                      borderBottom: '1px solid var(--bg-elevated)',
                      color: log.includes('Error') || log.includes('Failed') ? 'var(--error-color)' : 'inherit'
                    }}>
                      <span style={{ opacity: 0.5, marginRight: '8px' }}>{i + 1}</span>
                      {log}
                    </div>
                  ))
                ) : (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No logs available" style={{ margin: '40px 0' }} />
                )}
              </div>
            )
          },
          {
            key: 'errors',
            label: (
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <WarningOutlined style={{ color: errors.length > 0 ? 'var(--error-color)' : 'inherit' }} />
                <span style={{ color: errors.length > 0 ? 'var(--error-color)' : 'inherit' }}>Errors</span>
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
                      background: 'rgba(255, 77, 79, 0.1)',
                      border: '1px solid rgba(255, 77, 79, 0.2)',
                      borderRadius: '4px',
                      color: 'var(--text-primary)'
                    }}>
                      <div style={{ fontWeight: 'bold', color: 'var(--error-color)', marginBottom: '4px' }}>
                        [{err.node}] Error
                      </div>
                      <div style={{ fontFamily: 'monospace', fontSize: '13px' }}>{err.message}</div>
                    </div>
                  ))
                ) : (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No errors found" style={{ margin: '40px 0' }} />
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
          borderBottom: collapsed ? 'none' : '1px solid var(--border-color)'
        }}
      />
    </div>
  )
}
