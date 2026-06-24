import { useState, useEffect, useCallback } from 'react'
import { Modal, Steps, Input, Radio, Button, Card, Space, Progress, Alert, Divider, Tag, Typography, Empty, Spin } from 'antd'
import { ThunderboltOutlined, CheckCircleOutlined, CloseCircleOutlined, LoadingOutlined, SwapOutlined } from '@ant-design/icons'
import type { ContentItem } from '../types/workflow'
import { useAutoTopic, type AutoTopicConfig } from '../hooks/useAutoTopic'
import { TOPIC_ANALYSIS } from '../constants/llm'

const { TextArea } = Input
const { Text, Title, Paragraph } = Typography

type EnrichedContentItem = ContentItem & {
  _topic_score?: number
  _topic_decision?: string
  _topic_reason?: string
  _topic_angle?: string
}

interface Props {
  visible: boolean
  onClose: () => void
  onComplete: (selectedItems: ContentItem[]) => void
  fetchContents: ContentItem[]
  llmConfig: { apiKey: string; apiBase: string; model: string } | null
  onRunFetch: () => Promise<void>
}

type StepType = 'config' | 'running' | 'review'

function hasUsableLLMConfig(config: Props['llmConfig']): boolean {
  return Boolean(config?.apiKey && config.apiBase && config.model)
}

export default function AutoTopicModal({
  visible,
  onClose,
  onComplete,
  fetchContents,
  llmConfig,
  onRunFetch,
}: Props) {
  const [currentStep, setCurrentStep] = useState<StepType>('config')
  const [config, setConfig] = useState<AutoTopicConfig>({
    target_topic: '',
    time_range_hours: TOPIC_ANALYSIS.TIME_RANGE_HOURS,
    focus_instruction: '',
    max_items: TOPIC_ANALYSIS.MAX_ITEMS,
  })
  const llmReady = hasUsableLLMConfig(llmConfig)

  const { state: autoTopicState, isProcessing, execute } = useAutoTopic(fetchContents, llmConfig, onRunFetch)

  useEffect(() => {
    if (!visible) {
      setCurrentStep('config')
    }
  }, [visible])

  const handleStart = useCallback(async () => {
    setCurrentStep('running')
    await execute(config)
  }, [config, execute])

  const [selectedItems, setSelectedItems] = useState<EnrichedContentItem[]>([])
  const [rejectedItems, setRejectedItems] = useState<EnrichedContentItem[]>([])

  useEffect(() => {
    if (autoTopicState.stage === 'done' && !autoTopicState.error) {
      setSelectedItems(autoTopicState.selectedItems)
      setRejectedItems(autoTopicState.rejectedItems)
    }
  }, [autoTopicState.stage, autoTopicState.error, autoTopicState.selectedItems, autoTopicState.rejectedItems])

  useEffect(() => {
    if (currentStep === 'running' && !isProcessing && autoTopicState.stage === 'done' && !autoTopicState.error) {
      setCurrentStep('review')
    }
  }, [currentStep, isProcessing, autoTopicState.stage, autoTopicState.error])

  const handleMoveToSelected = useCallback((item: ContentItem) => {
    setRejectedItems(prev => prev.filter(i => i !== item))
    setSelectedItems(prev => [...prev, item])
  }, [])

  const handleMoveToRejected = useCallback((item: ContentItem) => {
    setSelectedItems(prev => prev.filter(i => i !== item))
    setRejectedItems(prev => [...prev, item])
  }, [])

  const handleConfirm = useCallback(() => {
    onComplete(selectedItems)
    onClose()
  }, [selectedItems, onComplete, onClose])

  const renderConfigStep = () => (
    <div style={{ padding: '24px 0' }}>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <div>
          <Text strong style={{ display: 'block', marginBottom: 8 }}>核心主题 *</Text>
          <Input
            size="large"
            placeholder="例如：DeepSeek 发布的最新影响"
            value={config.target_topic}
            onChange={e => setConfig(prev => ({ ...prev, target_topic: e.target.value }))}
          />
        </div>

        <div>
          <Text strong style={{ display: 'block', marginBottom: 8 }}>时效性</Text>
          <Radio.Group
            value={config.time_range_hours}
            onChange={e => setConfig(prev => ({ ...prev, time_range_hours: e.target.value }))}
          >
            <Radio.Button value={24}>最近 24h</Radio.Button>
            <Radio.Button value={72}>最近 3 天</Radio.Button>
            <Radio.Button value={168}>最近 7 天</Radio.Button>
            <Radio.Button value={0}>不限</Radio.Button>
          </Radio.Group>
        </div>

        <div>
          <Text strong style={{ display: 'block', marginBottom: 8 }}>补充指令（可选）</Text>
          <TextArea
            rows={3}
            placeholder="例如：侧重技术分析，忽略股价波动；优先保留有代码示例的文章..."
            value={config.focus_instruction}
            onChange={e => setConfig(prev => ({ ...prev, focus_instruction: e.target.value }))}
          />
        </div>

        <div>
          <Text strong style={{ display: 'block', marginBottom: 8 }}>期望数量</Text>
          <Radio.Group
            value={config.max_items}
            onChange={e => setConfig(prev => ({ ...prev, max_items: e.target.value }))}
          >
            <Radio.Button value={5}>5 条</Radio.Button>
            <Radio.Button value={10}>10 条</Radio.Button>
            <Radio.Button value={15}>15 条</Radio.Button>
            <Radio.Button value={20}>20 条</Radio.Button>
          </Radio.Group>
        </div>

        {!llmReady && (
          <Alert
            type="warning"
            message="未配置大模型 API"
            description="自动选题需要 LLM 支持，请先在 Settings → AI 能力接口中配置发现/搜索或文本模型 API Key。"
            showIcon
          />
        )}
      </Space>
    </div>
  )

  const renderRunningStep = () => {
    const stageLabels = {
      fetch: '采集数据',
      filter: '初步过滤',
      analyze: 'AI 分析',
      done: '完成',
    }

    return (
      <div style={{ padding: '24px 0' }}>
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <div style={{ textAlign: 'center' }}>
            <Title level={4} style={{ marginBottom: 8 }}>
              {autoTopicState.error ? '处理失败' : isProcessing ? stageLabels[autoTopicState.stage] : '处理完成'}
            </Title>
            <Progress
              percent={autoTopicState.progress}
              status={autoTopicState.error ? 'exception' : isProcessing ? 'active' : 'success'}
              strokeColor={autoTopicState.error ? '#ff4d4f' : '#155eef'}
            />
          </div>

          {autoTopicState.error && (
            <Alert type="error" message={autoTopicState.error} showIcon />
          )}

          <Card
            title="处理日志"
            size="small"
            bodyStyle={{
              maxHeight: 300,
              overflowY: 'auto',
              fontFamily: 'monospace',
              fontSize: 12,
              backgroundColor: '#f9fafb',
            }}
          >
            {autoTopicState.logs.length === 0 ? (
              <Empty description="暂无日志" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            ) : (
              autoTopicState.logs.map((log, idx) => (
                <div key={idx} style={{ marginBottom: 4 }}>
                  {log}
                </div>
              ))
            )}
          </Card>
        </Space>
      </div>
    )
  }

  const renderReviewStep = () => (
    <div style={{ padding: '16px 0' }}>
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <Alert
          type="success"
          message={`AI 推荐了 ${selectedItems.length} 条内容，你可以调整后确认`}
          showIcon
        />

        <div>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
            <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 18, marginRight: 8 }} />
            <Text strong style={{ fontSize: 16 }}>拟入选（{selectedItems.length} 条）</Text>
          </div>
          <div style={{ maxHeight: 300, overflowY: 'auto' }}>
            {selectedItems.length === 0 ? (
              <Empty description="暂无入选内容" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            ) : (
              <Space direction="vertical" size="small" style={{ width: '100%' }}>
                {selectedItems.map((item, idx) => (
                  <Card
                    key={idx}
                    size="small"
                    hoverable
                    style={{ borderColor: '#52c41a' }}
                    extra={
                      <Button
                        size="small"
                        type="text"
                        danger
                        icon={<CloseCircleOutlined />}
                        onClick={() => handleMoveToRejected(item)}
                      >
                        移除
                      </Button>
                    }
                  >
                    <div>
                      <Text strong>{item.title}</Text>
                      <div style={{ marginTop: 4 }}>
                        <Tag color="blue">评分: {(item as any)._topic_score || 0}</Tag>
                        <Tag>{item.source}</Tag>
                      </div>
                      {(item as any)._topic_reason && (
                        <Paragraph
                          style={{ marginTop: 8, marginBottom: 0, fontSize: 12, color: '#666' }}
                          ellipsis={{ rows: 2 }}
                        >
                          💡 {(item as any)._topic_reason}
                        </Paragraph>
                      )}
                    </div>
                  </Card>
                ))}
              </Space>
            )}
          </div>
        </div>

        <Divider style={{ margin: '12px 0' }} />

        <div>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
            <CloseCircleOutlined style={{ color: '#999', fontSize: 18, marginRight: 8 }} />
            <Text strong style={{ fontSize: 16, color: '#999' }}>拟淘汰（{rejectedItems.length} 条）</Text>
          </div>
          <div style={{ maxHeight: 200, overflowY: 'auto' }}>
            {rejectedItems.length === 0 ? (
              <Empty description="暂无淘汰内容" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            ) : (
              <Space direction="vertical" size="small" style={{ width: '100%' }}>
                {rejectedItems.map((item, idx) => (
                  <Card
                    key={idx}
                    size="small"
                    style={{ backgroundColor: '#fafafa' }}
                    extra={
                      <Button
                        size="small"
                        type="text"
                        icon={<SwapOutlined />}
                        onClick={() => handleMoveToSelected(item)}
                      >
                        捞回
                      </Button>
                    }
                  >
                    <div>
                      <Text type="secondary">{item.title}</Text>
                      <div style={{ marginTop: 4 }}>
                        <Tag>评分: {(item as any)._topic_score || 0}</Tag>
                      </div>
                      {(item as any)._topic_reason && (
                        <Text style={{ fontSize: 12, color: '#999' }}>
                          {(item as any)._topic_reason}
                        </Text>
                      )}
                    </div>
                  </Card>
                ))}
              </Space>
            )}
          </div>
        </div>
      </Space>
    </div>
  )

  const getFooterButtons = () => {
    if (currentStep === 'config') {
      return [
        <Button key="cancel" onClick={onClose}>
          取消
        </Button>,
        <Button
          key="start"
          type="primary"
          icon={<ThunderboltOutlined />}
          disabled={!config.target_topic.trim() || !llmReady}
          onClick={handleStart}
        >
          开始选题
        </Button>,
      ]
    }

    if (currentStep === 'running') {
      return [
        <Button key="close" onClick={onClose} disabled={isProcessing}>
          {isProcessing ? '处理中...' : '关闭'}
        </Button>,
      ]
    }

    if (currentStep === 'review') {
      return [
        <Button key="back" onClick={() => setCurrentStep('config')}>
          重新配置
        </Button>,
        <Button
          key="confirm"
          type="primary"
          icon={<CheckCircleOutlined />}
          disabled={selectedItems.length === 0}
          onClick={handleConfirm}
        >
          确认选题（{selectedItems.length} 条）
        </Button>,
      ]
    }

    return []
  }

  return (
    <Modal
      title={
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <ThunderboltOutlined style={{ color: '#155eef', marginRight: 8 }} />
          <span>自动选题助手</span>
        </div>
      }
      open={visible}
      onCancel={onClose}
      width={800}
      footer={getFooterButtons()}
      maskClosable={false}
    >
      <Steps
        current={currentStep === 'config' ? 0 : currentStep === 'running' ? 1 : 2}
        items={[
          { title: '设定标准', icon: currentStep === 'config' ? <LoadingOutlined /> : undefined },
          { title: '智能处理', icon: currentStep === 'running' && isProcessing ? <Spin /> : undefined },
          { title: '选题定稿' },
        ]}
        style={{ marginBottom: 24 }}
      />

      {currentStep === 'config' && renderConfigStep()}
      {currentStep === 'running' && renderRunningStep()}
      {currentStep === 'review' && renderReviewStep()}
    </Modal>
  )
}
