import { Input, Button, Space, Card, Typography, Divider } from 'antd'
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons'
import { useState } from 'react'

const { TextArea } = Input
const { Text } = Typography

interface NewsItem {
  title: string
  content: string
  url?: string
}

interface Props {
  value?: NewsItem[]
  onChange?: (value: NewsItem[]) => void
}

/**
 * Manual节点新闻列表配置组件
 * 提供友好的UI来添加、编辑、删除手动输入的新闻
 */
export default function ManualNewsConfig({ value = [], onChange }: Props) {
  const [newsItems, setNewsItems] = useState<NewsItem[]>(value.length > 0 ? value : [])

  const handleAdd = () => {
    const newItems = [...newsItems, { title: '', content: '', url: '' }]
    setNewsItems(newItems)
    if (onChange) {
      onChange(newItems)
    }
  }

  const handleRemove = (index: number) => {
    const newItems = newsItems.filter((_, i) => i !== index)
    setNewsItems(newItems)
    if (onChange) {
      onChange(newItems)
    }
  }

  const handleChange = (index: number, field: keyof NewsItem, fieldValue: string) => {
    const newItems = [...newsItems]
    newItems[index] = { ...newItems[index], [field]: fieldValue }
    setNewsItems(newItems)
    if (onChange) {
      onChange(newItems)
    }
  }

  return (
    <div style={{ padding: '8px 0' }}>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text strong style={{ color: 'var(--text-primary)' }}>Manual News List</Text>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={handleAdd}
          size="small"
        >
          Add News
        </Button>
      </div>

      {newsItems.length === 0 && (
        <Card style={{ textAlign: 'center', background: 'var(--bg-elevated)', borderColor: 'var(--border-color)' }}>
          <Text type="secondary">No news items yet. Click "Add News" to start.</Text>
        </Card>
      )}

      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        {newsItems.map((item, index) => (
          <Card
            key={index}
            size="small"
            title={
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text strong style={{ color: 'var(--text-primary)' }}>News Item {index + 1}</Text>
                <Button
                  type="text"
                  danger
                  size="small"
                  icon={<DeleteOutlined />}
                  onClick={() => handleRemove(index)}
                >
                  Remove
                </Button>
              </div>
            }
            style={{ 
              background: 'var(--bg-elevated)', 
              borderColor: 'var(--border-color)',
            }}
            headStyle={{ 
              borderBottom: '1px solid var(--border-color)',
              color: 'var(--text-primary)' 
            }}
          >
            <Space direction="vertical" style={{ width: '100%' }} size="small">
              <div>
                <Text type="secondary" style={{ fontSize: 12 }}>Title *</Text>
                <Input
                  value={item.title}
                  onChange={(e) => handleChange(index, 'title', e.target.value)}
                  placeholder="Enter news title"
                  style={{ marginTop: 4, background: 'var(--bg-primary)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
                />
              </div>

              <div>
                <Text type="secondary" style={{ fontSize: 12 }}>Content *</Text>
                <TextArea
                  value={item.content}
                  onChange={(e) => handleChange(index, 'content', e.target.value)}
                  placeholder="Enter news content"
                  rows={4}
                  style={{ marginTop: 4, background: 'var(--bg-primary)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
                />
              </div>

              <div>
                <Text type="secondary" style={{ fontSize: 12 }}>URL (Optional)</Text>
                <Input
                  value={item.url}
                  onChange={(e) => handleChange(index, 'url', e.target.value)}
                  placeholder="https://..."
                  style={{ marginTop: 4, background: 'var(--bg-primary)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
                />
              </div>
            </Space>
          </Card>
        ))}
      </Space>

      {newsItems.length > 0 && (
        <>
          <Divider style={{ margin: '16px 0', borderColor: 'var(--border-color)' }} />
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              Total: {newsItems.length} items
            </Text>
          </div>
        </>
      )}
    </div>
  )
}
