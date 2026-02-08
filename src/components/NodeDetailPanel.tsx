import { Drawer, Descriptions, Tag, Typography, Tabs, message } from 'antd'
import { useState } from 'react'
import DynamicConfigForm from './DynamicConfigForm'

const { Title, Paragraph } = Typography

interface Props {
  nodeName: string
  workflow: any
  onClose: () => void
}

export default function NodeDetailPanel({ nodeName, workflow, onClose }: Props) {
  const execution = workflow?.nodeExecutions?.[nodeName]
  const state = workflow?.state || {}
  const [activeTab, setActiveTab] = useState('status')
  const [config, setConfig] = useState<Record<string, any>>({})

  const getStatusTag = (status: string) => {
    const colors: Record<string, string> = {
      completed: 'success',
      running: 'processing',
      failed: 'error',
      waiting_approval: 'warning',
      pending: 'default'
    }
    return <Tag color={colors[status] || 'default'}>{status}</Tag>
  }

  const handleConfigChange = (values: Record<string, any>) => {
    setConfig(values)
  }

  const handleConfigSave = async (values: Record<string, any>) => {
    try {
      message.success('配置已保存（注意：需要在下次运行时生效）')
      setConfig(values)
    } catch (e: any) {
      message.error(`保存失败: ${e.message}`)
    }
  }

  const tabItems = [
    {
      key: 'status',
      label: '状态',
      children: (
        <>
          {execution && (
            <>
              <Descriptions column={1} bordered size="small">
                <Descriptions.Item label="状态">
                  {getStatusTag(execution.status)}
                </Descriptions.Item>
                <Descriptions.Item label="耗时">
                  {execution.duration ? `${execution.duration.toFixed(2)}s` : '-'}
                </Descriptions.Item>
              </Descriptions>

              {execution.error && (
                <div style={{ marginTop: 16, padding: 12, background: '#fff2f0', border: '1px solid #ffccc7', borderRadius: 4 }}>
                  <Title level={5} style={{ color: '#cf1322' }}>Error</Title>
                  <Paragraph style={{ fontFamily: 'monospace', fontSize: 12 }}>
                    {execution.error}
                  </Paragraph>
                </div>
              )}
            </>
          )}
          {!execution && (
            <div style={{ padding: 16, textAlign: 'center', color: '#999' }}>
              节点尚未执行
            </div>
          )}
        </>
      )
    },
    {
      key: 'logs',
      label: '日志',
      children: (
        <div style={{ 
          background: '#1e1e1e', 
          color: '#d4d4d4', 
          padding: 12, 
          borderRadius: 4,
          maxHeight: 400,
          overflow: 'auto',
          fontFamily: 'monospace',
          fontSize: 12
        }}>
          {state.logs?.filter((log: string) => log.includes(`[${nodeName}]`) || log.includes(nodeName)).map((log: string, i: number) => (
            <div key={i}>{log}</div>
          )) || 'No logs'}
        </div>
      )
    },
    {
      key: 'config',
      label: '配置',
      children: (
        <DynamicConfigForm
          nodeName={nodeName}
          initialValues={config}
          onChange={handleConfigChange}
          onSubmit={handleConfigSave}
        />
      )
    }
  ]

  return (
    <Drawer
      title={`${nodeName} 节点`}
      placement="right"
      onClose={onClose}
      open={true}
      width={600}
    >
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={tabItems}
      />
    </Drawer>
  )
}
