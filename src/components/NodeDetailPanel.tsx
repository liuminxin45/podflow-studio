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
import FetchConfigModal from './FetchConfigModal'
import ManualConfigModal from './ManualConfigModal'
import { RadarChartOutlined, InboxOutlined } from '@ant-design/icons'

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
  const [fetchModalVisible, setFetchModalVisible] = useState(false)
  const [fetchSources, setFetchSources] = useState<Array<{ id: string; name: string; description: string }>>([])
  const [manualModalVisible, setManualModalVisible] = useState(false)
  const [radarState, setRadarState] = useState<{
    enabled: boolean
    intervalMin: number
    keepLast: number
    lastRunAt: string | null
    lastError: string | null
    running: boolean
  } | null>(null)

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

  // 加载 fetch sources 和 radar state（仅 fetch 节点）
  useEffect(() => {
    if (nodeName === 'fetch') {
      window.electronAPI.getFetchSources()
        .then(sources => setFetchSources(sources))
        .catch(e => console.error('Failed to load fetch sources:', e))
      window.electronAPI.radarGetState()
        .then(state => setRadarState(state))
        .catch(e => console.error('Failed to load radar state:', e))
      const handler = (state: any) => setRadarState(state)
      window.electronAPI.onRadarUpdate(handler)
    }
  }, [nodeName])

  const handleNodeConfigSave = async (values: Record<string, any>) => {
    const result = await window.electronAPI.saveNodeConfig(nodeName, values)
    if (result.success) {
      setConfig(values)
      // 如果是 fetch 节点，根据 monitor_enabled 启停雷达服务
      if (nodeName === 'fetch') {
        if (values.monitor_enabled) {
          await window.electronAPI.radarStart(values)
        } else {
          await window.electronAPI.radarStop()
        }
      }
    } else {
      throw new Error(result.error)
    }
  }

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
    const labels: Record<string, string> = {
      completed: '已完成',
      running: '运行中',
      failed: '失败',
      waiting_approval: '待确认',
      pending: '待开始'
    }
    
    return (
      <Tag 
        color={colors[status] || 'default'} 
        icon={icons[status]}
        style={{ 
          fontSize: '13px', 
          padding: '2px 10px',
          borderRadius: '4px',
          border: 'none',
          fontWeight: 500
        }}
      >
        {status ? (labels[status] || status) : '未知'}
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
        message.success('配置已保存')
        setConfig(values)
      } else {
        message.error(`保存失败：${result.error}`)
      }
    } catch (e: any) {
      message.error(`保存失败：${e.message}`)
    }
  }

  const handleApprove = async () => {
    try {
      await window.electronAPI.approveNode(workflow.id, nodeName, true)
      message.success('节点已通过，工作流继续执行')
    } catch (e: any) {
      message.error(`审批失败：${e.message}`)
    }
  }

  const handleReject = async () => {
    try {
      await window.electronAPI.approveNode(workflow.id, nodeName, false)
      message.warning('节点已拒绝，工作流已停止')
    } catch (e: any) {
      message.error(`拒绝失败：${e.message}`)
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

      const formattedInfo = `# ${nodeName} 节点信息\n\n` +
        `## 基础信息\n` +
        `- 节点：${nodeName}\n` +
        `- 状态：${execution?.status || '待开始'}\n` +
        `- 时长：${execution?.duration ? execution.duration.toFixed(2) + 's' : '-'}\n` +
        `- 时间：${nodeInfo.timestamp}\n\n` +
        `## 配置\n\`\`\`json\n${JSON.stringify(config, null, 2)}\n\`\`\`\n\n` +
        `## 输入数据\n\`\`\`json\n${JSON.stringify(nodeInfo.input, null, 2)}\n\`\`\`\n\n` +
        `## 输出数据\n\`\`\`json\n${JSON.stringify(nodeInfo.output, null, 2)}\n\`\`\`\n\n` +
        `## 日志\n\`\`\`\n${nodeInfo.logs.join('\n')}\n\`\`\`\n\n` +
        (execution?.error ? `## 错误信息\n\`\`\`\n${execution.error}\n\`\`\`\n\n` : '') +
        (nodeInfo.errors.length > 0 ? `## 错误列表\n\`\`\`json\n${JSON.stringify(nodeInfo.errors, null, 2)}\n\`\`\`\n` : '')

      await navigator.clipboard.writeText(formattedInfo)
      message.success('节点信息已复制到剪贴板')
    } catch (e: any) {
      message.error(`复制失败：${e.message}`)
    }
  }

  const isWaitingApproval = execution?.status === 'waiting_approval'

  // 获取节点的输入数据
  const getNodeInput = () => {
    // 根据节点类型获取对应的输入数据
    const nodeInputMap: Record<string, string[]> = {
      'fetch': [],
      'manual': [],
      'merge': ['fetch_contents', 'manual_contents'],
      'preprocess': ['raw_contents'],
      'research': ['cleaned_contents'],
      'topic_selection': ['researched_contents'],
      'script': ['selected_topic', 'selected_materials'],
      'tts': ['stages'],
      'audio_postprocess': ['audio_segments'],
      'assets': ['final_audio_path'],
      'review': ['final_audio_path', 'cover_path', 'script', 'stages'],
      'publish': ['final_audio_path', 'cover_path', 'audio_metadata', 'review_summary']
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
      'fetch': ['fetch_contents'],
      'manual': ['manual_contents'],
      'merge': ['raw_contents'],
      'preprocess': ['cleaned_contents'],
      'research': ['researched_contents'],
      'topic_selection': ['selected_topic', 'selected_materials'],
      'script': ['script', 'stages'],
      'tts': ['audio_segments'],
      'audio_postprocess': ['final_audio_path', 'audio_metadata'],
      'assets': ['cover_path', 'intro_outro_paths'],
      'review': ['review_summary'],
      'publish': ['storage_info', 'publish_status']
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
            <CodeOutlined style={{ fontSize: 48, marginBottom: 16, opacity: 0.1 }} />
            <div>{title === '输入' ? '暂无输入数据' : '暂无输出数据'}</div>
          </div>
        </div>
      )
    }

    return (
      <div style={{ padding: 20, paddingBottom: 64 }}>
        {Object.entries(data).map(([key, value]) => (
          <div key={key} style={{ marginBottom: 24 }}>
            <div style={{ 
              display: 'flex',
              alignItems: 'center',
              marginBottom: 8,
              padding: '6px 0',
            }}>
              <span style={{ 
                fontWeight: 600, 
                color: 'var(--text-primary)',
                fontSize: '13px',
                background: 'var(--bg-tertiary)',
                padding: '4px 8px',
                borderRadius: '4px',
                border: '1px solid var(--border-color)'
              }}>{key}</span>
            </div>
            <div style={{
              background: 'var(--bg-tertiary)',
              color: 'var(--text-secondary)',
              padding: 16,
              borderRadius: 8,
              maxHeight: 400,
              overflow: 'auto',
              fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
              fontSize: 12,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              border: '1px solid var(--border-color)',
              lineHeight: 1.5
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
          <DashboardOutlined /> 状态
        </span>
      ),
      children: (
        <div style={{ padding: 20, overflow: 'auto', height: '100%' }}>
          {execution ? (
            <Space direction="vertical" style={{ width: '100%' }} size="large">
              
              {/* Header Info Card */}
              <Card 
                size="small" 
                bordered={false} 
                style={{ 
                  background: 'var(--bg-tertiary)', 
                  boxShadow: 'none'
                }}
              >
                <Row gutter={24}>
                  <Col span={12}>
                     <Statistic 
                        title={<span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>状态</span>}
                        value={execution.status} 
                        formatter={() => getStatusTag(execution.status)}
                      />
                  </Col>
                  <Col span={12}>
                    <Statistic 
                      title={<span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>时长</span>}
                      value={execution.duration ? execution.duration.toFixed(2) : 0} 
                      precision={2}
                      suffix="s"
                      valueStyle={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)' }}
                    />
                  </Col>
                </Row>
              </Card>

              {isWaitingApproval && (
                <div style={{ 
                  padding: 20, 
                  background: 'var(--warning-bg)', 
                  border: '1px solid var(--warning-color)', 
                  borderRadius: 8,
                  textAlign: 'center'
                }}>
                  <Title level={5} style={{ color: 'var(--warning-color)', marginTop: 0 }}>
                    <SettingOutlined spin style={{ marginRight: 8 }} />
                    等待审批
                  </Title>
                  <Paragraph style={{ color: 'var(--text-primary)', maxWidth: 400, margin: '0 auto 20px', fontSize: 13 }}>
                    当前节点需要人工审批才能继续。请检查输出和日志。
                  </Paragraph>
                  <Space size="middle">
                    <Button 
                      type="primary" 
                      size="large"
                      icon={<CheckOutlined />}
                      onClick={handleApprove}
                      style={{ 
                        background: 'var(--success-color)', 
                        borderColor: 'var(--success-color)',
                        minWidth: 100
                      }}
                    >
                      通过
                    </Button>
                    <Button 
                      danger 
                      size="large"
                      icon={<CloseOutlined />}
                      onClick={handleReject}
                      style={{ minWidth: 100 }}
                    >
                      拒绝
                    </Button>
                  </Space>
                </div>
              )}

              {execution.error && (
                <div style={{ 
                  padding: 16, 
                  background: 'var(--error-bg)', 
                  border: '1px solid var(--error-color)', 
                  borderRadius: 8 
                }}>
                  <Title level={5} style={{ color: 'var(--error-color)', marginTop: 0 }}>执行错误</Title>
                  <Paragraph style={{ 
                    fontFamily: "'JetBrains Mono', 'Fira Code', monospace", 
                    fontSize: 12,
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
                <ClockCircleOutlined style={{ fontSize: 40, marginBottom: 12, opacity: 0.2 }} />
                <div>节点尚未执行</div>
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
          <SettingOutlined /> 配置
        </span>
      ),
      children: configLoaded ? (
        nodeName === 'fetch' ? (
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
            <div style={{
              width: 56,
              height: 56,
              borderRadius: 16,
              background: 'linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              fontSize: 24,
              marginBottom: 16,
              boxShadow: '0 8px 24px rgba(37, 99, 235, 0.25)',
            }}>
              <RadarChartOutlined />
            </div>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>
              信息雷达配置
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 20, textAlign: 'center', lineHeight: 1.6 }}>
              定义信息采集的范围、质量和风格
            </div>
            <Button
              type="primary"
              size="large"
              icon={<RadarChartOutlined />}
              onClick={() => setFetchModalVisible(true)}
              style={{
                background: 'var(--accent-primary)',
                borderColor: 'var(--accent-primary)',
                borderRadius: 10,
                height: 42,
                fontSize: 14,
                fontWeight: 600,
                paddingInline: 28,
                boxShadow: '0 4px 12px rgba(37, 99, 235, 0.25)',
              }}
            >
              打开配置面板
            </Button>
            {config.activePreset && (
              <div style={{
                marginTop: 16,
                fontSize: 12,
                color: 'var(--text-tertiary)',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}>
                <span>当前风格：</span>
                <Tag bordered={false} style={{
                  background: 'var(--accent-light)',
                  color: 'var(--accent-primary)',
                  fontWeight: 600,
                  fontSize: 12,
                  borderRadius: 6,
                  margin: 0,
                }}>
                  {config.activePreset === 'commute' ? '通勤速听' :
                   config.activePreset === 'daily' ? '每日综述' :
                   config.activePreset === 'deep_radar' ? '深度雷达' :
                   config.activePreset === 'risk_alert' ? '风险预警' :
                   config.activePreset === 'pulse' ? '行业脉搏' :
                   config.activePreset}
                </Tag>
              </div>
            )}
            <FetchConfigModal
              visible={fetchModalVisible}
              onClose={() => setFetchModalVisible(false)}
              initialConfig={config}
              onSave={handleNodeConfigSave}
              sources={fetchSources}
              radarState={radarState}
              onRunOnce={async (values) => {
                return await window.electronAPI.radarRunOnce(values)
              }}
            />
          </div>
        ) : nodeName === 'manual' ? (
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
            <div style={{
              width: 56,
              height: 56,
              borderRadius: 16,
              background: 'linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              fontSize: 24,
              marginBottom: 16,
              boxShadow: '0 8px 24px rgba(245, 158, 11, 0.25)',
            }}>
              <InboxOutlined />
            </div>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>
              灵感收集箱
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 20, textAlign: 'center', lineHeight: 1.6 }}>
              随手丢入链接、文本、想法，系统帮你整理成素材
            </div>
            <Button
              type="primary"
              size="large"
              icon={<InboxOutlined />}
              onClick={() => setManualModalVisible(true)}
              style={{
                background: 'linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)',
                borderColor: 'transparent',
                borderRadius: 10,
                height: 42,
                fontSize: 14,
                fontWeight: 600,
                paddingInline: 28,
                boxShadow: '0 4px 12px rgba(245, 158, 11, 0.25)',
              }}
            >
              打开收集箱
            </Button>
            {config.news_items && config.news_items.length > 0 && (
              <div style={{
                marginTop: 16,
                fontSize: 12,
                color: 'var(--text-tertiary)',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}>
                <span>已收集：</span>
                <Tag bordered={false} style={{
                  background: '#fef3c7',
                  color: '#d97706',
                  fontWeight: 600,
                  fontSize: 12,
                  borderRadius: 6,
                  margin: 0,
                }}>
                  {config.news_items.length} 条素材
                </Tag>
              </div>
            )}
            <ManualConfigModal
              visible={manualModalVisible}
              onClose={() => setManualModalVisible(false)}
              initialConfig={config}
              onSave={handleNodeConfigSave}
            />
          </div>
        ) : (
          <div style={{ height: '100%', overflow: 'hidden' }}>
            <DynamicConfigForm
              nodeName={nodeName}
              initialValues={config}
              onChange={handleConfigChange}
              onSubmit={handleConfigSave}
            />
          </div>
        )
      ) : (
        <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Text type="secondary"><ReloadOutlined spin /> 正在加载配置…</Text>
        </div>
      )
    },
    {
      key: 'logs',
      label: (
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <FileTextOutlined /> 日志
        </span>
      ),
      children: (
        <div style={{ 
          height: '100%',
          overflow: 'auto',
          background: 'var(--bg-tertiary)', 
          padding: 16, 
          fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
          fontSize: 12,
          lineHeight: 1.6,
        }}>
          {state.logs?.filter((log: string) => log.includes(`[${nodeName}]`) || log.includes(nodeName)).length > 0 ? (
            state.logs
              .filter((log: string) => log.includes(`[${nodeName}]`) || log.includes(nodeName))
              .map((log: string, i: number) => (
                <div key={i} style={{ 
                  padding: '4px 0',
                  borderBottom: '1px solid var(--border-color)',
                  color: log.includes('Error') || log.includes('错误') ? 'var(--error-color)' : 'var(--text-secondary)'
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
              当前节点暂无专属日志
            </div>
          )}
        </div>
      )
    },
    {
      key: 'input',
      label: (
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <InfoCircleOutlined /> 输入
        </span>
      ),
      children: <div style={{ height: '100%', overflow: 'auto' }}>{renderJsonData(getNodeInput(), '输入')}</div>
    },
    {
      key: 'output',
      label: (
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <CheckOutlined /> 输出
        </span>
      ),
      children: <div style={{ height: '100%', overflow: 'auto' }}>{renderJsonData(getNodeOutput(), '输出')}</div>
    }
  ]

  return (
    <div style={{ 
      height: '100%', 
      display: 'flex', 
      flexDirection: 'column', 
      background: 'var(--bg-secondary)',
      borderLeft: '1px solid var(--border-color)',
    }}>
      {/* Header */}
      <div style={{ 
        padding: '12px 20px', 
        borderBottom: '1px solid var(--border-color)',
        background: 'var(--bg-secondary)',
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        flexShrink: 0
      }}>
        <Space size="small">
          <span style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>{nodeName}</span>
          <Tag bordered={false} style={{ color: 'var(--text-secondary)', background: 'var(--bg-tertiary)' }}>节点</Tag>
        </Space>
        <Space>
          <Tooltip title="复制节点信息">
            <Button 
              type="text"
              icon={<CopyOutlined />}
              onClick={handleCopyNodeInfo}
              style={{ color: 'var(--text-secondary)' }}
            />
          </Tooltip>
          <Tooltip title="关闭面板">
            <Button 
              type="text"
              icon={<CloseOutlined />}
              onClick={onClose}
              style={{ color: 'var(--text-secondary)' }}
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
          size="small"
          style={{ height: '100%' }}
          tabBarStyle={{ 
            padding: '0 20px', 
            margin: 0,
            background: 'var(--bg-secondary)',
            borderBottom: '1px solid var(--border-color)'
          }}
        />
      </div>
    </div>
  )
}
