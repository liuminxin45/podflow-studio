import { useState, useEffect } from 'react'
import { Card, Statistic, Row, Col, Button, Progress } from 'antd'
import { ThunderboltOutlined, CheckCircleOutlined, CloseCircleOutlined, ClockCircleOutlined } from '@ant-design/icons'
import { llmService } from '../services/llmService'

export default function LLMMetricsPanel() {
  const [metrics, setMetrics] = useState(llmService.getMetrics())

  useEffect(() => {
    const interval = setInterval(() => {
      setMetrics(llmService.getMetrics())
    }, 1000)

    return () => clearInterval(interval)
  }, [])

  const handleReset = () => {
    llmService.resetMetrics()
    setMetrics(llmService.getMetrics())
  }

  const handleClearCache = () => {
    llmService.clearCache()
  }

  const successRate = metrics.totalCalls > 0 ? ((metrics.successfulCalls / metrics.totalCalls) * 100) : 100

  return (
    <Card
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <ThunderboltOutlined style={{ color: '#155eef' }} />
          <span>LLM 性能监控</span>
        </div>
      }
      extra={
        <div style={{ display: 'flex', gap: 8 }}>
          <Button size="small" onClick={handleClearCache}>
            清空缓存
          </Button>
          <Button size="small" onClick={handleReset}>
            重置统计
          </Button>
        </div>
      }
      style={{ marginBottom: 16 }}
    >
      <Row gutter={16}>
        <Col span={6}>
          <Statistic
            title="总调用次数"
            value={metrics.totalCalls}
            prefix={<ThunderboltOutlined />}
            valueStyle={{ color: '#155eef' }}
          />
        </Col>
        <Col span={6}>
          <Statistic
            title="成功次数"
            value={metrics.successfulCalls}
            prefix={<CheckCircleOutlined />}
            valueStyle={{ color: '#52c41a' }}
          />
        </Col>
        <Col span={6}>
          <Statistic
            title="失败次数"
            value={metrics.failedCalls}
            prefix={<CloseCircleOutlined />}
            valueStyle={{ color: '#ff4d4f' }}
          />
        </Col>
        <Col span={6}>
          <Statistic
            title="平均响应时间"
            value={metrics.averageResponseTime.toFixed(0)}
            suffix="ms"
            prefix={<ClockCircleOutlined />}
          />
        </Col>
      </Row>

      <div style={{ marginTop: 24 }}>
        <div style={{ marginBottom: 8, fontSize: 14, fontWeight: 500 }}>
          成功率: {successRate.toFixed(1)}%
        </div>
        <Progress
          percent={successRate}
          status={successRate >= 95 ? 'success' : successRate >= 80 ? 'normal' : 'exception'}
          strokeColor={successRate >= 95 ? '#52c41a' : successRate >= 80 ? '#1890ff' : '#ff4d4f'}
        />
      </div>

      <div style={{ marginTop: 16, fontSize: 12, color: '#666' }}>
        <div>缓存命中可减少 API 调用成本</div>
        <div>速率限制: 10 请求/秒</div>
        <div>缓存 TTL: 5 分钟</div>
      </div>
    </Card>
  )
}
