import { Form, Input, InputNumber, Switch, Space, Button, Row, Col, Card } from 'antd'
import { useEffect, useState } from 'react'
import { SaveOutlined, ReloadOutlined, SettingOutlined } from '@ant-design/icons'
import FetchSourcesConfig from './FetchSourcesConfig'
import LLMConfigFields from './LLMConfigFields'
import ManualNewsConfig from './ManualNewsConfig'

interface FieldSchema {
  type: string
  description?: string
  default?: any
  required?: boolean
  optional?: boolean
  min?: number
  max?: number
  minLength?: number
  maxLength?: number
  items?: FieldSchema
}

interface Props {
  nodeName: string
  initialValues?: Record<string, any>
  onSubmit?: (values: Record<string, any>) => void
  onChange?: (values: Record<string, any>) => void
}

export default function DynamicConfigForm({ nodeName, initialValues, onChange, onSubmit }: Props) {
  const [form] = Form.useForm()
  const [schema, setSchema] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadSchema()
  }, [nodeName])

  const loadSchema = async () => {
    try {
      setLoading(true)
      setError(null)
      const nodeSchema = await window.electronAPI.getNodeSchema(nodeName)
      
      if (nodeSchema.error) {
        setError(nodeSchema.error)
      } else {
        setSchema(nodeSchema)
        
        if (initialValues) {
          form.setFieldsValue(initialValues)
        } else if (nodeSchema.fields) {
          const defaults: Record<string, any> = {}
          Object.entries(nodeSchema.fields).forEach(([key, field]: [string, any]) => {
            if (field.default !== null && field.default !== undefined) {
              defaults[key] = field.default
            }
          })
          form.setFieldsValue(defaults)
        }
      }
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const handleValuesChange = (_: any, allValues: any) => {
    if (onChange) {
      onChange(allValues)
    }
  }

  const handleSubmit = (values: any) => {
    if (onSubmit) {
      onSubmit(values)
    }
  }

  // 检测是否包含LLM配置字段组（llm_model, api_key, api_base）
  const hasLLMFields = () => {
    if (!schema || !schema.fields) return false
    const fields = Object.keys(schema.fields)
    return fields.includes('llm_model') && fields.includes('api_key') && fields.includes('api_base')
  }

  const renderField = (fieldName: string, fieldSchema: FieldSchema) => {
    const label = fieldName.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
    const rules = [
      { required: fieldSchema.required && !fieldSchema.optional, message: `${label} is required` }
    ]

    // 特殊处理：fetch节点的enabled_sources字段使用专门的组件
    if (nodeName === 'fetch' && fieldName === 'enabled_sources') {
      return (
        <Col span={24} key={fieldName}>
          <Form.Item
            name={fieldName}
            label="Data Sources"
            tooltip={fieldSchema.description}
          >
            <FetchSourcesConfig />
          </Form.Item>
        </Col>
      )
    }

    // 特殊处理：manual节点的news_items字段使用专门的组件
    if (nodeName === 'manual' && fieldName === 'news_items') {
      return (
        <Col span={24} key={fieldName}>
          <Form.Item
            name={fieldName}
            label="News List"
            tooltip={fieldSchema.description}
          >
            <ManualNewsConfig />
          </Form.Item>
        </Col>
      )
    }

    // 跳过LLM配置字段，它们会被LLMConfigFields组件统一处理
    if (hasLLMFields() && ['llm_model', 'api_key', 'api_base'].includes(fieldName)) {
      return null
    }

    let inputComponent
    let colSpan = 12

    switch (fieldSchema.type) {
      case 'boolean':
        inputComponent = <Switch />
        return (
          <Col span={12} key={fieldName}>
            <Form.Item
              name={fieldName}
              label={label}
              valuePropName="checked"
              tooltip={fieldSchema.description}
            >
              {inputComponent}
            </Form.Item>
          </Col>
        )

      case 'integer':
      case 'number':
        inputComponent = (
          <InputNumber
            style={{ width: '100%' }}
            min={fieldSchema.min}
            max={fieldSchema.max}
            step={fieldSchema.type === 'integer' ? 1 : 0.1}
          />
        )
        colSpan = 12
        break

      case 'string':
        if (fieldName.toLowerCase().includes('password') || fieldName.toLowerCase().includes('key')) {
          inputComponent = <Input.Password />
          colSpan = 12
        } else if (fieldName.toLowerCase().includes('url') || fieldName.toLowerCase().includes('path')) {
          inputComponent = <Input placeholder={`Enter ${label.toLowerCase()}`} />
          colSpan = 24
        } else if (fieldSchema.maxLength && fieldSchema.maxLength > 100) {
          inputComponent = <Input.TextArea rows={4} maxLength={fieldSchema.maxLength} />
          colSpan = 24
        } else {
          inputComponent = <Input maxLength={fieldSchema.maxLength} />
          colSpan = 12
        }
        break

      case 'array':
        inputComponent = (
          <Input.TextArea 
            rows={3} 
            placeholder="输入 JSON 数组，例如 [1, 2, 3]"
          />
        )
        colSpan = 24
        break

      case 'object':
        inputComponent = (
          <Input.TextArea 
            rows={4} 
            placeholder="输入 JSON 对象，例如 {&quot;key&quot;: &quot;value&quot;}"
          />
        )
        colSpan = 24
        break

      default:
        inputComponent = <Input />
        colSpan = 12
    }

    return (
      <Col span={colSpan} key={fieldName}>
        <Form.Item
          name={fieldName}
          label={label}
          rules={rules}
          tooltip={fieldSchema.description}
        >
          {inputComponent}
        </Form.Item>
      </Col>
    )
  }

  if (loading) {
    return <div style={{ padding: 16, textAlign: 'center' }}>正在加载配置结构…</div>
  }

  if (error) {
    return (
      <div style={{ padding: 16, color: 'var(--error-color)' }}>
        <p>配置结构加载失败：</p>
        <p style={{ fontSize: 12, fontFamily: 'monospace' }}>{error}</p>
      </div>
    )
  }

  if (!schema || !schema.fields) {
    return <div style={{ padding: 16 }}>当前节点没有可配置项。</div>
  }

  return (
    <Form
      form={form}
      layout="vertical"
      onFinish={handleSubmit}
      onValuesChange={handleValuesChange}
      style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
    >
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px', paddingBottom: 24 }}>
        {/* LLM配置字段组 */}
        {hasLLMFields() && (
          <Card 
            size="small"
            title={
              <Space>
                <SettingOutlined style={{ color: 'var(--accent-primary)' }} />
                <span>大模型配置</span>
              </Space>
            }
            style={{ 
              marginBottom: 24, 
              background: 'var(--bg-elevated)', 
              borderColor: 'var(--border-color)' 
            }}
            headStyle={{
              borderBottom: '1px solid var(--border-color)',
              color: 'var(--text-primary)'
            }}
          >
            <LLMConfigFields />
          </Card>
        )}

        {/* 其他字段 */}
        <Row gutter={24}>
          {schema && schema.fields && Object.entries(schema.fields).map(([fieldName, fieldSchema]) => 
            renderField(fieldName, fieldSchema as FieldSchema)
          )}
        </Row>
      </div>
      
      {onSubmit && (
        <div style={{
          flexShrink: 0,
          background: 'var(--bg-secondary)',
          borderTop: '1px solid var(--border-color)',
          padding: '16px 24px',
          display: 'flex',
          justifyContent: 'flex-end',
          zIndex: 10
        }}>
          <Space>
            <Button onClick={() => form.resetFields()} icon={<ReloadOutlined />}>
              Reset
            </Button>
            <Button 
              type="primary" 
              htmlType="submit" 
              icon={<SaveOutlined />}
              style={{
                background: 'var(--success-color)',
                borderColor: 'var(--success-color)',
                boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
              }}
            >
              Save Changes
            </Button>
          </Space>
        </div>
      )}
    </Form>
  )
}
