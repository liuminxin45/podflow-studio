import { Form, Input, AutoComplete, Button, message } from 'antd'
import { useState } from 'react'
import { ApiOutlined, CheckCircleOutlined } from '../icons/antdCompat'
import { fetchModelsWithCache } from '../utils/modelFetcher'
import { llmService } from '../services/llmService'

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
      message.warning('请先填写 API Base 和 API Key')
      return
    }

    setLoadingModels(true)
    try {
      const models = await fetchModelsWithCache(apiBase, apiKey)
      setAvailableModels(models)
      message.success(`已获取 ${models.length} 个模型`)
    } catch (e: any) {
      message.error(`获取模型失败：${e.message}`)
      setAvailableModels([])
    } finally {
      setLoadingModels(false)
    }
  }

  const handleTestConnection = async () => {
    const apiBase = form.getFieldValue('api_base')?.trim()
    const apiKey = form.getFieldValue('api_key')?.trim()
    const llmModel = form.getFieldValue('llm_model')?.trim()

    if (!apiBase || !apiKey || !llmModel) {
      message.warning('请填写完整的大模型配置（API Base、API Key、模型）')
      return
    }

    setTestingConnection(true)
    try {
      await llmService.call({
        apiBase,
        apiKey,
        model: llmModel,
        messages: [{ role: 'user', content: 'test' }],
        maxTokens: 5,
      })
      message.success('大模型连接成功')
    } catch (e: any) {
      message.error(`连接测试失败：${e.message}`)
    } finally {
      setTestingConnection(false)
    }
  }

  return (
    <>
      <Form.Item
        name="api_base"
        label="API Base"
        tooltip="API Base 地址，例如 https://api.openai.com/v1"
      >
        <Input placeholder="https://api.openai.com/v1" />
      </Form.Item>

      <Form.Item
        label="API Key"
        tooltip="API Key，留空时使用 OPENAI_API_KEY 环境变量"
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
          获取
        </Button>
      </Form.Item>

      <Form.Item
        name="llm_model"
        label="大模型"
        tooltip="选择或输入模型名称。点击“获取”读取可用模型。"
      >
        <AutoComplete
          options={availableModels.map(model => ({ value: model, label: model }))}
          placeholder={availableModels.length > 0 ? '选择或输入模型名称' : '获取模型或手动输入'}
          filterOption={(inputValue, option) =>
            option?.value.toLowerCase().includes(inputValue.toLowerCase()) || false
          }
          notFoundContent="没有匹配模型"
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
          测试大模型连接
        </Button>
      </Form.Item>
    </>
  )
}
