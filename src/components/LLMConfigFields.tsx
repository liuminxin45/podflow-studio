import { Form, Input, AutoComplete, Button, message } from 'antd'
import { useState } from 'react'
import { ApiOutlined, CheckCircleOutlined } from '@ant-design/icons'
import { fetchModels } from '../utils/modelFetcher'

/**
 * LLM Configuration Fields Component
 * Encapsulates API Base, API Key, and LLM Model fields with interaction logic
 * Note: Uses Form.useFormInstance() directly
 */
export default function LLMConfigFields() {
  const form = Form.useFormInstance()
  const [availableModels, setAvailableModels] = useState<string[]>([])
  const [loadingModels, setLoadingModels] = useState(false)
  const [testingConnection, setTestingConnection] = useState(false)

  // Fetch model list
  const handleFetchModels = async () => {
    const apiBase = form.getFieldValue('api_base')?.trim()
    const apiKey = form.getFieldValue('api_key')?.trim()

    if (!apiBase || !apiKey) {
      message.warning('Please fill in API Base and API Key first')
      return
    }

    setLoadingModels(true)
    try {
      const models = await fetchModels(apiBase, apiKey)
      setAvailableModels(models)
      message.success(`Successfully fetched ${models.length} models`)
    } catch (e: any) {
      message.error(`Failed to fetch models: ${e.message}`)
      setAvailableModels([])
    } finally {
      setLoadingModels(false)
    }
  }

  // Test connection
  const handleTestConnection = async () => {
    const apiBase = form.getFieldValue('api_base')?.trim()
    const apiKey = form.getFieldValue('api_key')?.trim()
    const llmModel = form.getFieldValue('llm_model')?.trim()

    if (!apiBase || !apiKey || !llmModel) {
      message.warning('Please fill in complete LLM config (API Base, API Key, LLM Model)')
      return
    }

    setTestingConnection(true)
    try {
      // Call test API
      const testUrl = `${apiBase.replace(/\/$/, '')}/chat/completions`
      const response = await fetch(testUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: llmModel,
          messages: [{ role: 'user', content: 'test' }],
          max_tokens: 5
        })
      })

      if (response.ok) {
        message.success('✅ LLM Connection Successful')
      } else {
        const errorData = await response.json().catch(() => ({}))
        message.error(`❌ Connection Failed: ${response.status} ${errorData.error?.message || response.statusText}`)
      }
    } catch (e: any) {
      message.error(`❌ Connection Test Failed: ${e.message}`)
    } finally {
      setTestingConnection(false)
    }
  }

  return (
    <>
      <Form.Item
        name="api_base"
        label="API Base"
        tooltip="API Base URL, e.g., https://api.openai.com/v1"
      >
        <Input placeholder="https://api.openai.com/v1" />
      </Form.Item>

      <Form.Item
        label="API Key"
        tooltip="API Key (leave empty to use OPENAI_API_KEY env var)"
        style={{ marginBottom: 0 }}
      >
        <Form.Item
          name="api_key"
          style={{ display: 'inline-block', width: 'calc(100% - 110px)', marginBottom: 0 }}
        >
          <Input.Password placeholder="sk-..." />
        </Form.Item>
        <Button
          icon={<ApiOutlined />}
          onClick={handleFetchModels}
          loading={loadingModels}
          style={{ marginLeft: 8, width: '102px' }}
        >
          Fetch
        </Button>
      </Form.Item>

      <Form.Item
        name="llm_model"
        label="LLM Model"
        tooltip="Select or enter model name. Click 'Fetch' to get available models."
      >
        <AutoComplete
          options={availableModels.map(model => ({ value: model, label: model }))}
          placeholder={availableModels.length > 0 ? 'Select or enter model name' : 'Fetch models or enter manually'}
          filterOption={(inputValue, option) =>
            option?.value.toLowerCase().includes(inputValue.toLowerCase()) || false
          }
          notFoundContent="No matching models"
        />
      </Form.Item>

      <Form.Item>
        <Button
          type="dashed"
          icon={<CheckCircleOutlined />}
          onClick={handleTestConnection}
          loading={testingConnection}
          block
          style={{ borderColor: 'var(--success-color)', color: 'var(--success-color)' }}
        >
          Test LLM Connection
        </Button>
      </Form.Item>
    </>
  )
}
