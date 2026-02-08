import { Form, Input, InputNumber, Switch, Space, Button } from 'antd'
import { useEffect, useState } from 'react'

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

interface ConfigSchema {
  type: 'pydantic' | 'dataclass'
  fields: Record<string, FieldSchema>
}

interface Props {
  nodeName: string
  initialValues?: Record<string, any>
  onSubmit?: (values: Record<string, any>) => void
  onChange?: (values: Record<string, any>) => void
}

export default function DynamicConfigForm({ nodeName, initialValues, onSubmit, onChange }: Props) {
  const [form] = Form.useForm()
  const [schema, setSchema] = useState<ConfigSchema | null>(null)
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

  const renderField = (fieldName: string, fieldSchema: FieldSchema) => {
    const label = fieldName.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
    const rules = [
      { required: fieldSchema.required && !fieldSchema.optional, message: `${label} is required` }
    ]

    switch (fieldSchema.type) {
      case 'boolean':
        return (
          <Form.Item
            key={fieldName}
            name={fieldName}
            label={label}
            valuePropName="checked"
            tooltip={fieldSchema.description}
          >
            <Switch />
          </Form.Item>
        )

      case 'integer':
      case 'number':
        return (
          <Form.Item
            key={fieldName}
            name={fieldName}
            label={label}
            rules={rules}
            tooltip={fieldSchema.description}
          >
            <InputNumber
              style={{ width: '100%' }}
              min={fieldSchema.min}
              max={fieldSchema.max}
              step={fieldSchema.type === 'integer' ? 1 : 0.1}
            />
          </Form.Item>
        )

      case 'string':
        if (fieldName.toLowerCase().includes('password') || fieldName.toLowerCase().includes('key')) {
          return (
            <Form.Item
              key={fieldName}
              name={fieldName}
              label={label}
              rules={rules}
              tooltip={fieldSchema.description}
            >
              <Input.Password />
            </Form.Item>
          )
        }
        
        if (fieldName.toLowerCase().includes('url') || fieldName.toLowerCase().includes('path')) {
          return (
            <Form.Item
              key={fieldName}
              name={fieldName}
              label={label}
              rules={rules}
              tooltip={fieldSchema.description}
            >
              <Input placeholder={`Enter ${label.toLowerCase()}`} />
            </Form.Item>
          )
        }

        if (fieldSchema.maxLength && fieldSchema.maxLength > 100) {
          return (
            <Form.Item
              key={fieldName}
              name={fieldName}
              label={label}
              rules={rules}
              tooltip={fieldSchema.description}
            >
              <Input.TextArea rows={4} maxLength={fieldSchema.maxLength} />
            </Form.Item>
          )
        }

        return (
          <Form.Item
            key={fieldName}
            name={fieldName}
            label={label}
            rules={rules}
            tooltip={fieldSchema.description}
          >
            <Input maxLength={fieldSchema.maxLength} />
          </Form.Item>
        )

      case 'array':
        return (
          <Form.Item
            key={fieldName}
            name={fieldName}
            label={label}
            tooltip={fieldSchema.description}
          >
            <Input.TextArea 
              rows={3} 
              placeholder="Enter JSON array, e.g., [1, 2, 3]"
            />
          </Form.Item>
        )

      case 'object':
        return (
          <Form.Item
            key={fieldName}
            name={fieldName}
            label={label}
            tooltip={fieldSchema.description}
          >
            <Input.TextArea 
              rows={4} 
              placeholder="Enter JSON object, e.g., {&quot;key&quot;: &quot;value&quot;}"
            />
          </Form.Item>
        )

      default:
        return (
          <Form.Item
            key={fieldName}
            name={fieldName}
            label={label}
            rules={rules}
            tooltip={fieldSchema.description}
          >
            <Input />
          </Form.Item>
        )
    }
  }

  if (loading) {
    return <div style={{ padding: 16, textAlign: 'center' }}>Loading configuration schema...</div>
  }

  if (error) {
    return (
      <div style={{ padding: 16, color: '#ff4d4f' }}>
        <p>Failed to load configuration schema:</p>
        <p style={{ fontSize: 12, fontFamily: 'monospace' }}>{error}</p>
      </div>
    )
  }

  if (!schema || !schema.fields) {
    return <div style={{ padding: 16 }}>No configuration available for this node.</div>
  }

  return (
    <Form
      form={form}
      layout="vertical"
      onFinish={handleSubmit}
      onValuesChange={handleValuesChange}
      style={{ padding: '16px 0' }}
    >
      {Object.entries(schema.fields).map(([fieldName, fieldSchema]) => 
        renderField(fieldName, fieldSchema)
      )}
      
      {onSubmit && (
        <Form.Item>
          <Space>
            <Button type="primary" htmlType="submit">
              Save Configuration
            </Button>
            <Button onClick={() => form.resetFields()}>
              Reset
            </Button>
          </Space>
        </Form.Item>
      )}
    </Form>
  )
}
