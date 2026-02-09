import { Modal, Typography, Divider, Space, Button } from 'antd'
import { CheckOutlined, CloseOutlined, FileTextOutlined } from '@ant-design/icons'
import { useState } from 'react'

const { Paragraph, Text } = Typography

interface ApprovalData {
  workflowId: string
  nodeName: string
  data: any
}

interface Props {
  visible: boolean
  approvalData: ApprovalData | null
  onApprove: () => void
  onReject: () => void
}

export default function ApprovalModal({ visible, approvalData, onApprove, onReject }: Props) {
  const [loading, setLoading] = useState(false)

  if (!approvalData) return null

  const handleApprove = async () => {
    setLoading(true)
    try {
      await onApprove()
    } finally {
      setLoading(false)
    }
  }

  const handleReject = async () => {
    setLoading(true)
    try {
      await onReject()
    } finally {
      setLoading(false)
    }
  }

  // 渲染脚本内容
  const renderScriptContent = () => {
    const script = approvalData.data.script
    
    if (!script) {
      return <Text type="secondary">Script data unavailable</Text>
    }

    return (
      <div style={{ maxHeight: 400, overflow: 'auto' }}>
        {/* 脚本元数据 */}
        {script.metadata && (
          <div style={{ 
            marginBottom: 16, 
            padding: 12, 
            background: 'var(--bg-elevated)', 
            borderRadius: 6,
            border: '1px solid var(--border-color)'
          }}>
            <Text strong style={{ color: 'var(--text-primary)' }}>Script Metadata</Text>
            <div style={{ marginTop: 8, display: 'grid', gap: '4px' }}>
              {script.metadata.title && <div><Text type="secondary">Title: </Text><Text style={{ color: 'var(--text-primary)' }}>{script.metadata.title}</Text></div>}
              {script.metadata.duration && <div><Text type="secondary">Duration: </Text><Text style={{ color: 'var(--text-primary)' }}>{script.metadata.duration} min</Text></div>}
              {script.metadata.hosts && <div><Text type="secondary">Hosts: </Text><Text style={{ color: 'var(--text-primary)' }}>{script.metadata.hosts.join(', ')}</Text></div>}
            </div>
          </div>
        )}

        {/* 脚本内容 */}
        <div style={{
          background: 'var(--bg-primary)',
          color: 'var(--text-secondary)',
          padding: 16,
          borderRadius: 6,
          fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
          fontSize: 13,
          lineHeight: 1.6,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          border: '1px solid var(--border-color)'
        }}>
          {typeof script === 'string' 
            ? script 
            : JSON.stringify(script, null, 2)
          }
        </div>
      </div>
    )
  }

  // 渲染主题和素材
  const renderTopicAndMaterials = () => {
    const { selected_topic, selected_materials } = approvalData.data

    return (
      <div style={{ marginBottom: 16 }}>
        {selected_topic && (
          <div style={{ marginBottom: 16 }}>
            <Text strong style={{ color: 'var(--text-primary)' }}>Selected Topic:</Text>
            <div style={{ 
              marginTop: 8, 
              padding: 12, 
              background: 'rgba(24, 144, 255, 0.1)', 
              borderRadius: 6,
              border: '1px solid var(--info-color)'
            }}>
              <div><Text strong style={{ color: 'var(--text-primary)' }}>{selected_topic.title || 'Untitled'}</Text></div>
              {selected_topic.description && (
                <div style={{ marginTop: 4 }}>
                  <Text type="secondary">{selected_topic.description}</Text>
                </div>
              )}
            </div>
          </div>
        )}

        {selected_materials && selected_materials.length > 0 && (
          <div>
            <Text strong style={{ color: 'var(--text-primary)' }}>Selected Materials ({selected_materials.length}):</Text>
            <div style={{ marginTop: 8, maxHeight: 200, overflow: 'auto', paddingRight: 4 }}>
              {selected_materials.slice(0, 5).map((material: any, index: number) => (
                <div 
                  key={index}
                  style={{ 
                    marginBottom: 8, 
                    padding: 10, 
                    background: 'var(--bg-elevated)', 
                    borderRadius: 6,
                    border: '1px solid var(--border-color)',
                    fontSize: 12
                  }}
                >
                  <Text strong style={{ color: 'var(--text-primary)' }}>{material.title || `Material ${index + 1}`}</Text>
                  {material.content && (
                    <div style={{ marginTop: 4 }}>
                      <Text type="secondary" style={{ fontSize: 11 }}>
                        {material.content.substring(0, 100)}...
                      </Text>
                    </div>
                  )}
                </div>
              ))}
              {selected_materials.length > 5 && (
                <Text type="secondary" style={{ fontSize: 12 }}>
                  And {selected_materials.length - 5} more materials...
                </Text>
              )}
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <Modal
      title={
        <Space>
          <FileTextOutlined style={{ color: 'var(--accent-primary)' }} />
          <span style={{ fontSize: 18 }}>Approval Request</span>
        </Space>
      }
      open={visible}
      width={800}
      footer={null}
      closable={false}
      maskClosable={false}
      styles={{
        header: {
          background: 'var(--bg-elevated)',
          borderBottom: '1px solid var(--border-color)',
          padding: '16px 24px',
          borderRadius: '8px 8px 0 0',
        },
        body: {
          background: 'var(--bg-secondary)',
          padding: '24px',
          color: 'var(--text-primary)'
        },
        content: {
          background: 'var(--bg-secondary)',
          borderRadius: '8px',
          border: '1px solid var(--border-color)',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)'
        }
      }}
    >
      <div style={{ marginBottom: 20 }}>
        <Paragraph style={{ color: 'var(--text-primary)' }}>
          The AI has completed a step that requires your approval. Please review the content below. 
          Approve to continue or reject to stop the workflow.
        </Paragraph>
      </div>

      {renderTopicAndMaterials()}
      
      <Divider orientation="left" style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}>
        Generated Content
      </Divider>
      
      {renderScriptContent()}

      <Divider style={{ margin: '24px 0', borderColor: 'var(--border-color)' }} />

      <div style={{ textAlign: 'right' }}>
        <Space>
          <Button
            size="large"
            danger
            icon={<CloseOutlined />}
            onClick={handleReject}
            loading={loading}
          >
            Reject
          </Button>
          <Button
            size="large"
            type="primary"
            icon={<CheckOutlined />}
            onClick={handleApprove}
            loading={loading}
            style={{ 
              background: 'var(--success-color)', 
              borderColor: 'var(--success-color)',
              boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
            }}
          >
            Approve & Continue
          </Button>
        </Space>
      </div>
    </Modal>
  )
}
