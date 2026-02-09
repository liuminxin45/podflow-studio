import { Tag, Typography, Tabs, message, Button, Space, Card, Tooltip, Row, Col, Statistic } from 'antd'
import { useState, useEffect } from 'react'
import { 
  CheckOutlined, 
  CloseOutlined, 
  CopyOutlined, 
  ReloadOutlined, 
  SettingOutlined,
  InfoCircleOutlined,
  FileTextOutlined,
  CodeOutlined,
  DashboardOutlined,
  ClockCircleOutlined
} from '@ant-design/icons'
import DynamicConfigForm from './DynamicConfigForm'

const { Title, Paragraph, Text } = Typography

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
  const [configLoaded, setConfigLoaded] = useState(false)

  // 自动加载配置
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const savedConfig = await window.electronAPI.loadNodeConfig(nodeName)
        if (savedConfig) {
          setConfig(savedConfig)
        }
        setConfigLoaded(true)
      } catch (e: any) {
        console.error('Failed to load config:', e)
        setConfigLoaded(true)
      }
    }
    loadConfig()
  }, [nodeName])

  const getStatusTag = (status: string) => {
    const colors: Record<string, string> = {
      completed: 'success',
      running: 'processing',
      failed: 'error',
      waiting_approval: 'warning',
      pending: 'default'
    }
    const icons: Record<string, any> = {
      completed: <CheckOutlined />,
      running: <ReloadOutlined spin />,
      failed: <CloseOutlined />,
      waiting_approval: <ClockCircleOutlined />,
      pending: <ClockCircleOutlined />
    }
    
    return (
      <Tag 
        color={colors[status] || 'default'} 
        icon={icons[status]}
        style={{ 
          fontSize: '14px', 
          padding: '4px 12px',
          borderRadius: '4px'
        }}
      >
        {status ? status.toUpperCase() : 'UNKNOWN'}
      </Tag>
    )
  }

  const handleConfigChange = (values: Record<string, any>) => {
    setConfig(values)
  }

  const handleConfigSave = async (values: Record<string, any>) => {
    try {
      const result = await window.electronAPI.saveNodeConfig(nodeName, values)
      if (result.success) {
        message.success('Configuration saved successfully')
        setConfig(values)
      } else {
        message.error(`Save failed: ${result.error}`)
      }
    } catch (e: any) {
      message.error(`Save failed: ${e.message}`)
    }
  }

  const handleApprove = async () => {
    try {
      await window.electronAPI.approveNode(workflow.id, nodeName, true)
      message.success('Node approved, workflow continuing')
    } catch (e: any) {
      message.error(`Approval failed: ${e.message}`)
    }
  }

  const handleReject = async () => {
    try {
      await window.electronAPI.approveNode(workflow.id, nodeName, false)
      message.warning('Node rejected, workflow stopped')
    } catch (e: any) {
      message.error(`Rejection failed: ${e.message}`)
    }
  }

  const handleCopyNodeInfo = async () => {
    try {
      const nodeInfo = {
        nodeName,
        status: execution?.status || 'not_executed',
        duration: execution?.duration || 0,
        config,
        input: getNodeInput(),
        output: getNodeOutput(),
        logs: state.logs?.filter((log: string) => 
          log.includes(`[${nodeName}]`) || log.includes(nodeName)
        ) || [],
        errors: state.errors?.filter((err: any) => err.node === nodeName) || [],
        error: execution?.error || null,
        timestamp: new Date().toISOString()
      }

      const formattedInfo = `# ${nodeName} Node Info\n\n` +
        `## Basic Info\n` +
        `- Node: ${nodeName}\n` +
        `- Status: ${execution?.status || 'Pending'}\n` +
        `- Duration: ${execution?.duration ? execution.duration.toFixed(2) + 's' : '-'}\n` +
        `- Timestamp: ${nodeInfo.timestamp}\n\n` +
        `## Configuration\n\`\`\`json\n${JSON.stringify(config, null, 2)}\n\`\`\`\n\n` +
        `## Input Data\n\`\`\`json\n${JSON.stringify(nodeInfo.input, null, 2)}\n\`\`\`\n\n` +
        `## Output Data\n\`\`\`json\n${JSON.stringify(nodeInfo.output, null, 2)}\n\`\`\`\n\n` +
        `## Logs\n\`\`\`\n${nodeInfo.logs.join('\n')}\n\`\`\`\n\n` +
        (execution?.error ? `## Error Info\n\`\`\`\n${execution.error}\n\`\`\`\n\n` : '') +
        (nodeInfo.errors.length > 0 ? `## Error List\n\`\`\`json\n${JSON.stringify(nodeInfo.errors, null, 2)}\n\`\`\`\n` : '')

      await navigator.clipboard.writeText(formattedInfo)
      message.success('Node info copied to clipboard')
    } catch (e: any) {
      message.error(`Copy failed: ${e.message}`)
    }
  }

  const isWaitingApproval = execution?.status === 'waiting_approval'

  // 获取节点的输入数据
  const getNodeInput = () => {
    // 根据节点类型获取对应的输入数据
    const nodeInputMap: Record<string, string[]> = {
      'fetch': [],
      'preprocess': ['raw_contents'],
      'research': ['cleaned_contents'],
      'topic_selection': ['researched_contents'],
      'script': ['selected_topic', 'selected_materials'],
      'stages': ['script'],
      'tts': ['stages'],
      'audio_postprocess': ['audio_segments'],
      'assets': ['final_audio_path'],
      'store': ['final_audio_path', 'cover_path', 'audio_metadata'],
      'publish': ['storage_info', 'rss_path']
    }
    
    const inputKeys = nodeInputMap[nodeName] || []
    const inputData: Record<string, any> = {}
    
    inputKeys.forEach(key => {
      if (state[key] !== undefined) {
        inputData[key] = state[key]
      }
    })
    
    return inputData
  }

  // 获取节点的输出数据
  const getNodeOutput = () => {
    const nodeOutputMap: Record<string, string[]> = {
      'fetch': ['raw_contents'],
      'preprocess': ['cleaned_contents'],
      'research': ['researched_contents'],
      'topic_selection': ['selected_topic', 'selected_materials'],
      'script': ['script'],
      'stages': ['stages'],
      'tts': ['audio_segments'],
      'audio_postprocess': ['final_audio_path', 'audio_metadata'],
      'assets': ['cover_path', 'intro_outro_paths'],
      'store': ['storage_info'],
      'publish': ['publish_status']
    }
    
    const outputKeys = nodeOutputMap[nodeName] || []
    const outputData: Record<string, any> = {}
    
    outputKeys.forEach(key => {
      if (state[key] !== undefined) {
        outputData[key] = state[key]
      }
    })
    
    return outputData
  }

  // 渲染JSON数据
  const renderJsonData = (data: any, title: string) => {
    if (!data || Object.keys(data).length === 0) {
      return (
        <div style={{ 
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text-tertiary)',
        }}>
          <div style={{ textAlign: 'center' }}>
            <CodeOutlined style={{ fontSize: 48, marginBottom: 16, opacity: 0.2 }} />
            <div>{title === 'Input' ? 'No input data available' : 'No output data produced'}</div>
          </div>
        </div>
      )
    }

    return (
      <div style={{ padding: 24, paddingBottom: 64 }}>
        {Object.entries(data).map(([key, value]) => (
          <div key={key} style={{ marginBottom: 24 }}>
            <div style={{ 
              display: 'flex',
              alignItems: 'center',
              marginBottom: 8,
              padding: '6px 12px',
              background: 'var(--bg-elevated)',
              borderRadius: '6px',
              borderLeft: '3px solid var(--accent-primary)'
            }}>
              <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{key}</span>
            </div>
            <div style={{
              background: 'var(--bg-primary)',
              color: 'var(--text-secondary)',
              padding: 16,
              borderRadius: 8,
              maxHeight: 400,
              overflow: 'auto',
              fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
              fontSize: 13,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              border: '1px solid var(--border-color)'
            }}>
              {typeof value === 'object' 
                ? JSON.stringify(value, null, 2)
                : String(value)
              }
            </div>
          </div>
        ))}
      </div>
    )
  }

  const tabItems = [
    {
      key: 'status',
      label: (
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <DashboardOutlined /> Status
        </span>
      ),
      children: (
        <div style={{ padding: 24, overflow: 'auto', height: '100%' }}>
          {execution ? (
            <Space direction="vertical" style={{ width: '100%' }} size="large">
              
              {/* Header Info Card */}
              <Card size="small" style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-color)' }}>
                <Row gutter={24}>
                  <Col span={12}>
                     <Statistic 
                        title="Execution Status" 
                        value={execution.status} 
                        formatter={() => getStatusTag(execution.status)}
                      />
                  </Col>
                  <Col span={12}>
                    <Statistic 
                      title="Duration" 
                      value={execution.duration ? execution.duration.toFixed(2) : 0} 
                      precision={2}
                      suffix="s"
                      prefix={<ClockCircleOutlined />}
                    />
                  </Col>
                </Row>
              </Card>

              {isWaitingApproval && (
                <div style={{ 
                  padding: 24, 
                  background: 'rgba(250, 173, 20, 0.1)', 
                  border: '1px solid var(--warning-color)', 
                  borderRadius: 8,
                  textAlign: 'center'
                }}>
                  <Title level={4} style={{ color: 'var(--warning-color)', marginTop: 0 }}>
                    <SettingOutlined spin style={{ marginRight: 8 }} />
                    Awaiting Approval
                  </Title>
                  <Paragraph style={{ color: 'var(--text-primary)', maxWidth: 500, margin: '0 auto 24px' }}>
                    This node requires manual approval to proceed. Please review the outputs and logs, then decide whether to continue the workflow.
                  </Paragraph>
                  <Space size="large">
                    <Button 
                      type="primary" 
                      size="large"
                      icon={<CheckOutlined />}
                      onClick={handleApprove}
                      style={{ 
                        background: 'var(--success-color)', 
                        borderColor: 'var(--success-color)',
                        minWidth: 120
                      }}
                    >
                      Approve
                    </Button>
                    <Button 
                      danger 
                      size="large"
                      icon={<CloseOutlined />}
                      onClick={handleReject}
                      style={{ minWidth: 120 }}
                    >
                      Reject
                    </Button>
                  </Space>
                </div>
              )}

              {execution.error && (
                <div style={{ 
                  padding: 16, 
                  background: 'rgba(255, 77, 79, 0.1)', 
                  border: '1px solid var(--error-color)', 
                  borderRadius: 8 
                }}>
                  <Title level={5} style={{ color: 'var(--error-color)', marginTop: 0 }}>Execution Error</Title>
                  <Paragraph style={{ 
                    fontFamily: "'JetBrains Mono', 'Fira Code', monospace", 
                    fontSize: 13,
                    color: 'var(--text-primary)',
                    marginBottom: 0,
                    whiteSpace: 'pre-wrap'
                  }}>
                    {execution.error}
                  </Paragraph>
                </div>
              )}
            </Space>
          ) : (
            <div style={{ 
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-tertiary)',
            }}>
              <div style={{ textAlign: 'center' }}>
                <ClockCircleOutlined style={{ fontSize: 48, marginBottom: 16, opacity: 0.2 }} />
                <div>Node has not been executed yet</div>
              </div>
            </div>
          )}
        </div>
      )
    },
    {
      key: 'config',
      label: (
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <SettingOutlined /> Config
        </span>
      ),
      children: configLoaded ? (
        <div style={{ height: '100%', overflow: 'hidden' }}>
          <DynamicConfigForm
            nodeName={nodeName}
            initialValues={config}
            onChange={handleConfigChange}
            onSubmit={handleConfigSave}
          />
        </div>
      ) : (
        <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Text type="secondary"><ReloadOutlined spin /> Loading configuration...</Text>
        </div>
      )
    },
    {
      key: 'logs',
      label: (
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <FileTextOutlined /> Logs
        </span>
      ),
      children: (
        <div style={{ 
          height: '100%',
          overflow: 'auto',
          background: 'var(--bg-primary)', 
          padding: 16, 
          fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
          fontSize: 13,
          lineHeight: 1.6,
        }}>
          {state.logs?.filter((log: string) => log.includes(`[${nodeName}]`) || log.includes(nodeName)).length > 0 ? (
            state.logs
              .filter((log: string) => log.includes(`[${nodeName}]`) || log.includes(nodeName))
              .map((log: string, i: number) => (
                <div key={i} style={{ 
                  padding: '4px 0',
                  borderBottom: '1px solid var(--bg-elevated)',
                  color: log.includes('Error') ? 'var(--error-color)' : 'var(--text-secondary)'
                }}>{log}</div>
              ))
          ) : (
             <div style={{ 
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-tertiary)',
            }}>
              No specific logs for this node
            </div>
          )}
        </div>
      )
    },
    {
      key: 'input',
      label: (
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <InfoCircleOutlined /> Input
        </span>
      ),
      children: <div style={{ height: '100%', overflow: 'auto' }}>{renderJsonData(getNodeInput(), 'Input')}</div>
    },
    {
      key: 'output',
      label: (
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <CheckOutlined /> Output
        </span>
      ),
      children: <div style={{ height: '100%', overflow: 'auto' }}>{renderJsonData(getNodeOutput(), 'Output')}</div>
    }
  ]

  return (
    <div style={{ 
      height: '100%', 
      display: 'flex', 
      flexDirection: 'column', 
      background: 'var(--bg-secondary)',
      borderLeft: '1px solid var(--border-color)',
      boxShadow: '-4px 0 12px rgba(0,0,0,0.1)'
    }}>
      {/* Header */}
      <div style={{ 
        padding: '16px 24px', 
        borderBottom: '1px solid var(--border-color)',
        background: 'var(--bg-secondary)',
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        flexShrink: 0
      }}>
        <Space size="middle">
          <span style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)' }}>{nodeName}</span>
          <Tag color="blue" bordered={false}>NODE</Tag>
        </Space>
        <Space>
          <Tooltip title="Copy node information">
            <Button 
              type="text"
              icon={<CopyOutlined />}
              onClick={handleCopyNodeInfo}
            />
          </Tooltip>
          <Tooltip title="Close panel">
            <Button 
              type="text"
              icon={<CloseOutlined />}
              onClick={onClose}
            />
          </Tooltip>
        </Space>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={tabItems}
          type="line"
          size="middle"
          style={{ height: '100%' }}
          tabBarStyle={{ 
            padding: '0 24px', 
            margin: 0,
            background: 'var(--bg-elevated)',
            borderBottom: '1px solid var(--border-color)'
          }}
        />
      </div>
    </div>
  )
}
