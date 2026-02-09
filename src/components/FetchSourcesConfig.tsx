import { Checkbox, Space, Spin, Alert, Typography, Divider } from 'antd'
import { useEffect, useState } from 'react'

const { Text } = Typography

interface FetchSource {
  id: string
  name: string
  description: string
}

interface Props {
  value?: string[]
  onChange?: (value: string[]) => void
}

export default function FetchSourcesConfig({ value = [], onChange }: Props) {
  const [sources, setSources] = useState<FetchSource[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedSources, setSelectedSources] = useState<string[]>(value)

  useEffect(() => {
    loadSources()
  }, [])

  useEffect(() => {
    setSelectedSources(value)
  }, [value])

  const loadSources = async () => {
    try {
      setLoading(true)
      setError(null)
      const fetchedSources = await window.electronAPI.getFetchSources()
      setSources(fetchedSources)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const handleCheckboxChange = (sourceId: string, checked: boolean) => {
    let newSelected: string[]
    if (checked) {
      newSelected = [...selectedSources, sourceId]
    } else {
      newSelected = selectedSources.filter(id => id !== sourceId)
    }
    setSelectedSources(newSelected)
    if (onChange) {
      onChange(newSelected)
    }
  }

  if (loading) {
    return (
      <div style={{ padding: 24, textAlign: 'center' }}>
        <Spin tip="Loading sources..." />
      </div>
    )
  }

  if (error) {
    return (
      <Alert
        message="Failed to load sources"
        description={error}
        type="error"
        showIcon
        style={{ margin: 16 }}
      />
    )
  }

  if (sources.length === 0) {
    return (
      <Alert
        message="No sources available"
        description="Please add source files in nodes/fetch/sources/ directory"
        type="warning"
        showIcon
        style={{ margin: 16 }}
      />
    )
  }

  return (
    <div style={{ padding: '8px 0' }}>
      <Text strong style={{ color: 'var(--text-primary)' }}>Select sources to enable:</Text>
      <Divider style={{ margin: '12px 0', borderColor: 'var(--border-color)' }} />
      
      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        {sources.map(source => {
          const isSelected = selectedSources.includes(source.id)
          return (
            <div
              key={source.id}
              style={{
                padding: '12px 16px',
                border: isSelected ? '1px solid var(--accent-primary)' : '1px solid var(--border-color)',
                borderRadius: 6,
                background: isSelected ? 'rgba(24, 144, 255, 0.1)' : 'var(--bg-elevated)',
                transition: 'all 0.3s ease',
                cursor: 'pointer'
              }}
              onClick={() => handleCheckboxChange(source.id, !isSelected)}
            >
              <Checkbox
                checked={isSelected}
                onChange={(e) => handleCheckboxChange(source.id, e.target.checked)}
                style={{ width: '100%' }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', marginLeft: 8 }}>
                  <Text strong style={{ color: 'var(--text-primary)' }}>{source.name}</Text>
                  <Text type="secondary" style={{ fontSize: 12, marginTop: 4 }}>
                    {source.description}
                  </Text>
                </div>
              </Checkbox>
            </div>
          )
        })}
      </Space>

      <Divider style={{ margin: '16px 0', borderColor: 'var(--border-color)' }} />
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Text type="secondary" style={{ fontSize: 12 }}>
          {selectedSources.length} sources selected
        </Text>
      </div>
    </div>
  )
}
