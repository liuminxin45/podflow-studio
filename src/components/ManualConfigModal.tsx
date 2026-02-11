import { Modal, Input, Tag, message } from 'antd'
import { useState, useEffect, useCallback, useRef } from 'react'
import {
  PlusOutlined,
  LinkOutlined,
  FileTextOutlined,
  BulbOutlined,
  DeleteOutlined,
  EditOutlined,
  CheckCircleFilled,
  CloseOutlined,
  InboxOutlined,
  StarOutlined,
  StarFilled,
  TagOutlined,
  ExpandOutlined,
  CompressOutlined,
  SmileOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons'

const { TextArea } = Input

// ============================================================
// Types
// ============================================================

interface MaterialItem {
  id: string
  title: string
  content: string
  url: string
  type: 'link' | 'text' | 'idea'
  importance: 'normal' | 'important' | 'critical'
  tags: string[]
  status: 'processing' | 'ready'
  createdAt: number
}

interface Props {
  visible: boolean
  onClose: () => void
  initialConfig?: Record<string, any>
  onSave: (config: Record<string, any>) => void
}

// ============================================================
// Helpers
// ============================================================

let _idCounter = 0
const genId = () => `m_${Date.now()}_${++_idCounter}`

const URL_REGEX = /^https?:\/\//i

function detectType(input: string): 'link' | 'text' | 'idea' {
  const trimmed = input.trim()
  if (URL_REGEX.test(trimmed)) return 'link'
  if (trimmed.length < 80 && !trimmed.includes('\n')) return 'idea'
  return 'text'
}

function autoTitle(input: string, type: string): string {
  const trimmed = input.trim()
  if (type === 'link') {
    try {
      const url = new URL(trimmed)
      return url.hostname.replace('www.', '') + ' 的内容'
    } catch {
      return '网页链接'
    }
  }
  if (type === 'idea') {
    return trimmed.length > 40 ? trimmed.substring(0, 40) + '...' : trimmed
  }
  // text: first line or first 40 chars
  const firstLine = trimmed.split('\n')[0]
  return firstLine.length > 50 ? firstLine.substring(0, 50) + '...' : firstLine
}

function autoSummary(input: string, type: string): string {
  if (type === 'link') return input.trim()
  if (type === 'idea') return input.trim()
  const trimmed = input.trim()
  return trimmed.length > 200 ? trimmed.substring(0, 200) + '...' : trimmed
}

const TYPE_META: Record<string, { icon: React.ReactNode; label: string; color: string }> = {
  link: { icon: <LinkOutlined />, label: '链接', color: '#3b82f6' },
  text: { icon: <FileTextOutlined />, label: '文本', color: '#10b981' },
  idea: { icon: <BulbOutlined />, label: '想法', color: '#f59e0b' },
}

const IMPORTANCE_META: Record<string, { label: string; color: string }> = {
  normal: { label: '普通', color: 'var(--text-tertiary)' },
  important: { label: '重要', color: '#f59e0b' },
  critical: { label: '关键', color: '#ef4444' },
}

const PLACEHOLDER_HINTS = [
  '粘贴一条新闻链接...',
  '写下你刚看到的一个观点...',
  '粘贴一段社媒上的爆料...',
  '记录一个灵感想法...',
  '贴一条值得讨论的推文...',
]

// ============================================================
// Component
// ============================================================

export default function ManualConfigModal({ visible, onClose, initialConfig, onSave }: Props) {
  const [materials, setMaterials] = useState<MaterialItem[]>([])
  const [inputValue, setInputValue] = useState('')
  const [expandedCard, setExpandedCard] = useState<string | null>(null)
  const [editingCard, setEditingCard] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [placeholderIndex, setPlaceholderIndex] = useState(0)
  const inputRef = useRef<any>(null)

  // Rotate placeholder hints
  useEffect(() => {
    if (!visible) return
    const timer = setInterval(() => {
      setPlaceholderIndex(prev => (prev + 1) % PLACEHOLDER_HINTS.length)
    }, 4000)
    return () => clearInterval(timer)
  }, [visible])

  // Load initial config
  useEffect(() => {
    if (!visible) return
    if (initialConfig?.materials && Array.isArray(initialConfig.materials)) {
      setMaterials(initialConfig.materials)
    } else if (initialConfig?.news_items && Array.isArray(initialConfig.news_items)) {
      // Migrate from old format
      const migrated: MaterialItem[] = initialConfig.news_items.map((item: any, i: number) => ({
        id: genId(),
        title: item.title || `素材 ${i + 1}`,
        content: item.content || '',
        url: item.url || '',
        type: item.url ? 'link' as const : 'text' as const,
        importance: 'normal' as const,
        tags: [],
        status: 'ready' as const,
        createdAt: Date.now() - (initialConfig.news_items.length - i) * 1000,
      }))
      setMaterials(migrated)
    }
  }, [visible, initialConfig])

  // Focus input on open
  useEffect(() => {
    if (visible) {
      setTimeout(() => inputRef.current?.focus(), 300)
    }
  }, [visible])

  // ============================================================
  // Actions
  // ============================================================

  const addMaterial = useCallback(() => {
    const trimmed = inputValue.trim()
    if (!trimmed) return

    const type = detectType(trimmed)
    const newItem: MaterialItem = {
      id: genId(),
      title: autoTitle(trimmed, type),
      content: type === 'link' ? '' : trimmed,
      url: type === 'link' ? trimmed : '',
      type,
      importance: 'normal',
      tags: [],
      status: 'processing',
      createdAt: Date.now(),
    }

    setMaterials(prev => [newItem, ...prev])
    setInputValue('')

    // Simulate "processing" → "ready" transition
    setTimeout(() => {
      setMaterials(prev => prev.map(m =>
        m.id === newItem.id ? { ...m, status: 'ready' } : m
      ))
    }, 800)
  }, [inputValue])

  const removeMaterial = useCallback((id: string) => {
    setMaterials(prev => prev.filter(m => m.id !== id))
    if (expandedCard === id) setExpandedCard(null)
    if (editingCard === id) setEditingCard(null)
  }, [expandedCard, editingCard])

  const updateMaterial = useCallback((id: string, updates: Partial<MaterialItem>) => {
    setMaterials(prev => prev.map(m =>
      m.id === id ? { ...m, ...updates } : m
    ))
  }, [])

  const toggleImportance = useCallback((id: string) => {
    setMaterials(prev => prev.map(m => {
      if (m.id !== id) return m
      const cycle: Record<string, 'normal' | 'important' | 'critical'> = {
        normal: 'important',
        important: 'critical',
        critical: 'normal',
      }
      return { ...m, importance: cycle[m.importance] }
    }))
  }, [])

  // Save - convert to both new and legacy format for backend compatibility
  const handleSave = async () => {
    setSaving(true)
    try {
      const newsItems = materials.map(m => ({
        title: m.title,
        content: m.content || m.url,
        url: m.url,
      }))
      await onSave({
        news_items: newsItems,
        materials: materials,
      })
      message.success('收集箱已保存')
      onClose()
    } catch (e: any) {
      message.error(`保存失败: ${e.message}`)
    } finally {
      setSaving(false)
    }
  }

  // ============================================================
  // Render: Input Zone
  // ============================================================

  const renderInputZone = () => (
    <div style={{ marginBottom: 20 }}>
      <div style={{
        position: 'relative',
        borderRadius: 14,
        border: '1.5px dashed var(--border-color)',
        background: 'var(--bg-primary)',
        padding: '16px',
        transition: 'all 0.25s ease',
      }}
        className="manual-input-zone"
      >
        <TextArea
          ref={inputRef}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onPressEnter={(e) => {
            if (!e.shiftKey) {
              e.preventDefault()
              addMaterial()
            }
          }}
          placeholder={PLACEHOLDER_HINTS[placeholderIndex]}
          autoSize={{ minRows: 2, maxRows: 6 }}
          style={{
            border: 'none',
            background: 'transparent',
            fontSize: 14,
            lineHeight: 1.7,
            resize: 'none',
            padding: 0,
            color: 'var(--text-primary)',
          }}
        />
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: 10,
          paddingTop: 10,
          borderTop: '1px solid var(--border-light)',
        }}>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
            按 Enter 添加 · Shift+Enter 换行
          </div>
          <button
            onClick={addMaterial}
            disabled={!inputValue.trim()}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 16px',
              borderRadius: 8,
              border: 'none',
              background: inputValue.trim() ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
              color: inputValue.trim() ? '#fff' : 'var(--text-tertiary)',
              cursor: inputValue.trim() ? 'pointer' : 'default',
              fontSize: 12,
              fontWeight: 600,
              transition: 'all 0.2s ease',
            }}
          >
            <PlusOutlined style={{ fontSize: 11 }} />
            收集
          </button>
        </div>
      </div>
    </div>
  )

  // ============================================================
  // Render: Stats Bar
  // ============================================================

  const renderStatsBar = () => {
    if (materials.length === 0) return null

    const linkCount = materials.filter(m => m.type === 'link').length
    const textCount = materials.filter(m => m.type === 'text').length
    const ideaCount = materials.filter(m => m.type === 'idea').length
    const importantCount = materials.filter(m => m.importance !== 'normal').length

    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        padding: '10px 14px',
        background: 'var(--bg-primary)',
        borderRadius: 10,
        marginBottom: 16,
        fontSize: 12,
        color: 'var(--text-tertiary)',
      }}>
        <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>
          {materials.length} 条素材
        </span>
        <span style={{ width: 1, height: 14, background: 'var(--border-color)' }} />
        {linkCount > 0 && <span>🔗 {linkCount}</span>}
        {textCount > 0 && <span>📄 {textCount}</span>}
        {ideaCount > 0 && <span>💡 {ideaCount}</span>}
        {importantCount > 0 && (
          <>
            <span style={{ width: 1, height: 14, background: 'var(--border-color)' }} />
            <span>⭐ {importantCount} 重点</span>
          </>
        )}
      </div>
    )
  }

  // ============================================================
  // Render: Material Card
  // ============================================================

  const renderMaterialCard = (item: MaterialItem) => {
    const isExpanded = expandedCard === item.id
    const isEditing = editingCard === item.id
    const typeMeta = TYPE_META[item.type]
    const impMeta = IMPORTANCE_META[item.importance]
    const isProcessing = item.status === 'processing'

    return (
      <div
        key={item.id}
        className="manual-material-card"
        style={{
          borderRadius: 12,
          border: '1px solid var(--border-color)',
          background: 'var(--bg-secondary)',
          overflow: 'hidden',
          transition: 'all 0.25s cubic-bezier(0.25, 0.8, 0.25, 1)',
          opacity: isProcessing ? 0.7 : 1,
          animation: isProcessing ? 'none' : 'manualCardAppear 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        {/* Card Header */}
        <div style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 12,
          padding: '14px 16px',
        }}>
          {/* Type Icon */}
          <div style={{
            width: 32,
            height: 32,
            borderRadius: 9,
            background: `${typeMeta.color}12`,
            color: typeMeta.color,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 14,
            flexShrink: 0,
            marginTop: 1,
          }}>
            {isProcessing ? (
              <ClockCircleOutlined style={{ animation: 'spin 1s linear infinite' }} />
            ) : (
              typeMeta.icon
            )}
          </div>

          {/* Content */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Title */}
            {isEditing ? (
              <Input
                value={item.title}
                onChange={(e) => updateMaterial(item.id, { title: e.target.value })}
                onPressEnter={() => setEditingCard(null)}
                onBlur={() => setEditingCard(null)}
                autoFocus
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  padding: '2px 6px',
                  borderRadius: 6,
                  marginBottom: 4,
                }}
              />
            ) : (
              <div style={{
                fontSize: 13,
                fontWeight: 600,
                color: 'var(--text-primary)',
                lineHeight: 1.4,
                marginBottom: 4,
                cursor: 'pointer',
              }}
                onClick={() => setEditingCard(item.id)}
                title="点击编辑标题"
              >
                {item.title}
                {isProcessing && (
                  <span style={{
                    fontSize: 11,
                    fontWeight: 400,
                    color: 'var(--text-tertiary)',
                    marginLeft: 8,
                  }}>
                    正在理解...
                  </span>
                )}
              </div>
            )}

            {/* Summary */}
            <div style={{
              fontSize: 12,
              color: 'var(--text-tertiary)',
              lineHeight: 1.5,
              maxHeight: isExpanded ? 'none' : '36px',
              overflow: 'hidden',
              transition: 'max-height 0.3s ease',
            }}>
              {item.url && item.type === 'link' ? (
                <span style={{ wordBreak: 'break-all' }}>{item.url}</span>
              ) : (
                autoSummary(item.content, item.type)
              )}
            </div>

            {/* Tags Row */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              marginTop: 8,
              flexWrap: 'wrap',
            }}>
              <Tag
                bordered={false}
                style={{
                  background: `${typeMeta.color}12`,
                  color: typeMeta.color,
                  fontSize: 11,
                  borderRadius: 5,
                  padding: '0 8px',
                  margin: 0,
                  lineHeight: '20px',
                }}
              >
                {typeMeta.label}
              </Tag>
              {item.importance !== 'normal' && (
                <Tag
                  bordered={false}
                  style={{
                    background: `${impMeta.color}15`,
                    color: impMeta.color,
                    fontSize: 11,
                    borderRadius: 5,
                    padding: '0 8px',
                    margin: 0,
                    lineHeight: '20px',
                  }}
                >
                  {impMeta.label}
                </Tag>
              )}
              {item.tags.map(tag => (
                <Tag
                  key={tag}
                  bordered={false}
                  closable={isExpanded}
                  onClose={() => updateMaterial(item.id, {
                    tags: item.tags.filter(t => t !== tag),
                  })}
                  style={{
                    background: 'var(--bg-tertiary)',
                    color: 'var(--text-secondary)',
                    fontSize: 11,
                    borderRadius: 5,
                    padding: '0 8px',
                    margin: 0,
                    lineHeight: '20px',
                  }}
                >
                  {tag}
                </Tag>
              ))}
              {!isProcessing && (
                <Tag
                  bordered={false}
                  style={{
                    background: 'var(--success-bg)',
                    color: 'var(--success-color)',
                    fontSize: 10,
                    borderRadius: 5,
                    padding: '0 6px',
                    margin: 0,
                    lineHeight: '20px',
                  }}
                >
                  <CheckCircleFilled style={{ marginRight: 3, fontSize: 9 }} />
                  已整理
                </Tag>
              )}
            </div>
          </div>

          {/* Actions */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            flexShrink: 0,
          }}>
            <div
              onClick={() => toggleImportance(item.id)}
              style={{
                width: 26,
                height: 26,
                borderRadius: 7,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                color: item.importance !== 'normal' ? IMPORTANCE_META[item.importance].color : 'var(--text-tertiary)',
                transition: 'all 0.15s ease',
                fontSize: 13,
              }}
              className="manual-card-action"
              title="标记重要程度"
            >
              {item.importance !== 'normal' ? <StarFilled /> : <StarOutlined />}
            </div>
            <div
              onClick={() => setExpandedCard(isExpanded ? null : item.id)}
              style={{
                width: 26,
                height: 26,
                borderRadius: 7,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                color: 'var(--text-tertiary)',
                transition: 'all 0.15s ease',
                fontSize: 12,
              }}
              className="manual-card-action"
              title={isExpanded ? '收起' : '展开更多'}
            >
              {isExpanded ? <CompressOutlined /> : <ExpandOutlined />}
            </div>
            <div
              onClick={() => removeMaterial(item.id)}
              style={{
                width: 26,
                height: 26,
                borderRadius: 7,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                color: 'var(--text-tertiary)',
                transition: 'all 0.15s ease',
                fontSize: 12,
              }}
              className="manual-card-action"
              title="移除"
            >
              <DeleteOutlined />
            </div>
          </div>
        </div>

        {/* Expanded Detail Panel */}
        {isExpanded && (
          <div style={{
            borderTop: '1px solid var(--border-light)',
            padding: '14px 16px',
            background: 'var(--bg-primary)',
            animation: 'manualExpandPanel 0.25s ease',
          }}>
            {/* Editable Content */}
            <div style={{ marginBottom: 14 }}>
              <div style={{
                fontSize: 11,
                fontWeight: 600,
                color: 'var(--text-secondary)',
                marginBottom: 6,
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}>
                <EditOutlined style={{ fontSize: 10 }} />
                内容 / 想法
              </div>
              <TextArea
                value={item.content}
                onChange={(e) => updateMaterial(item.id, { content: e.target.value })}
                autoSize={{ minRows: 2, maxRows: 8 }}
                placeholder="补充更多细节、想法或背景..."
                style={{
                  borderRadius: 8,
                  fontSize: 12,
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border-color)',
                }}
              />
            </div>

            {/* URL */}
            <div style={{ marginBottom: 14 }}>
              <div style={{
                fontSize: 11,
                fontWeight: 600,
                color: 'var(--text-secondary)',
                marginBottom: 6,
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}>
                <LinkOutlined style={{ fontSize: 10 }} />
                来源链接
              </div>
              <Input
                value={item.url}
                onChange={(e) => updateMaterial(item.id, { url: e.target.value })}
                placeholder="https://..."
                style={{
                  borderRadius: 8,
                  fontSize: 12,
                  background: 'var(--bg-secondary)',
                }}
              />
            </div>

            {/* Importance */}
            <div style={{ marginBottom: 14 }}>
              <div style={{
                fontSize: 11,
                fontWeight: 600,
                color: 'var(--text-secondary)',
                marginBottom: 8,
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}>
                <StarOutlined style={{ fontSize: 10 }} />
                重要程度
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {(['normal', 'important', 'critical'] as const).map(level => {
                  const meta = IMPORTANCE_META[level]
                  const isActive = item.importance === level
                  return (
                    <div
                      key={level}
                      onClick={() => updateMaterial(item.id, { importance: level })}
                      style={{
                        flex: 1,
                        textAlign: 'center',
                        padding: '8px 0',
                        borderRadius: 8,
                        border: isActive ? `1.5px solid ${meta.color}` : '1px solid var(--border-color)',
                        background: isActive ? `${meta.color}10` : 'var(--bg-secondary)',
                        color: isActive ? meta.color : 'var(--text-secondary)',
                        fontWeight: isActive ? 600 : 400,
                        fontSize: 12,
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                      }}
                    >
                      {meta.label}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Tags */}
            <div>
              <div style={{
                fontSize: 11,
                fontWeight: 600,
                color: 'var(--text-secondary)',
                marginBottom: 8,
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}>
                <TagOutlined style={{ fontSize: 10 }} />
                标签
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {['AI', '大模型', '开源', '融资', '政策', '产品', '观点', '行业'].map(tag => {
                  const isActive = item.tags.includes(tag)
                  return (
                    <div
                      key={tag}
                      onClick={() => {
                        if (isActive) {
                          updateMaterial(item.id, { tags: item.tags.filter(t => t !== tag) })
                        } else {
                          updateMaterial(item.id, { tags: [...item.tags, tag] })
                        }
                      }}
                      style={{
                        padding: '4px 12px',
                        borderRadius: 6,
                        border: isActive ? '1px solid var(--accent-primary)' : '1px solid var(--border-color)',
                        background: isActive ? 'var(--accent-light)' : 'var(--bg-secondary)',
                        color: isActive ? 'var(--accent-primary)' : 'var(--text-secondary)',
                        fontWeight: isActive ? 600 : 400,
                        fontSize: 11,
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {tag}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ============================================================
  // Render: Empty State
  // ============================================================

  const renderEmptyState = () => (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '48px 24px',
      color: 'var(--text-tertiary)',
    }}>
      <div style={{
        width: 64,
        height: 64,
        borderRadius: 20,
        background: 'var(--bg-primary)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 28,
        marginBottom: 16,
        border: '1px dashed var(--border-color)',
      }}>
        <InboxOutlined style={{ opacity: 0.3 }} />
      </div>
      <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6 }}>
        收集箱是空的
      </div>
      <div style={{ fontSize: 12, textAlign: 'center', lineHeight: 1.6, maxWidth: 260 }}>
        在上方粘贴链接、写下想法，<br />
        或丢入任何你觉得值得聊的内容
      </div>
    </div>
  )

  // ============================================================
  // Render: Footer
  // ============================================================

  const renderFooter = () => (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '16px 24px',
      borderTop: '1px solid var(--border-color)',
      background: 'var(--bg-secondary)',
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        fontSize: 11,
        color: 'var(--text-tertiary)',
      }}>
        <SmileOutlined />
        <span>每一条线索都可能成为好内容</span>
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <button
          onClick={onClose}
          style={{
            padding: '8px 20px',
            borderRadius: 8,
            border: '1px solid var(--border-color)',
            background: 'var(--bg-secondary)',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            fontSize: 13,
            fontWeight: 500,
            transition: 'all 0.2s ease',
          }}
        >
          取消
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            padding: '8px 24px',
            borderRadius: 8,
            border: 'none',
            background: materials.length > 0 ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
            color: materials.length > 0 ? '#fff' : 'var(--text-tertiary)',
            cursor: saving ? 'not-allowed' : materials.length > 0 ? 'pointer' : 'default',
            fontSize: 13,
            fontWeight: 600,
            transition: 'all 0.2s ease',
            boxShadow: materials.length > 0 ? '0 2px 8px rgba(37, 99, 235, 0.3)' : 'none',
            opacity: saving ? 0.7 : 1,
          }}
        >
          {saving ? '保存中...' : `保存收集箱${materials.length > 0 ? ` (${materials.length})` : ''}`}
        </button>
      </div>
    </div>
  )

  // ============================================================
  // Main Render
  // ============================================================

  return (
    <Modal
      open={visible}
      onCancel={onClose}
      footer={null}
      width={580}
      closable={false}
      centered
      destroyOnClose
      styles={{
        body: { padding: 0 },
        content: {
          borderRadius: 16,
          overflow: 'hidden',
          border: '1px solid var(--border-color)',
          boxShadow: '0 20px 60px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.04)',
        },
      }}
      className="manual-config-modal"
    >
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '18px 24px',
        borderBottom: '1px solid var(--border-light)',
        background: 'var(--bg-secondary)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 34,
            height: 34,
            borderRadius: 10,
            background: 'linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontSize: 16,
          }}>
            <InboxOutlined />
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
              灵感收集箱
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
              随手丢入，系统帮你整理
            </div>
          </div>
        </div>
        <div
          onClick={onClose}
          style={{
            width: 28,
            height: 28,
            borderRadius: 8,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            color: 'var(--text-tertiary)',
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--bg-tertiary)'
            e.currentTarget.style.color = 'var(--text-primary)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent'
            e.currentTarget.style.color = 'var(--text-tertiary)'
          }}
        >
          <CloseOutlined style={{ fontSize: 12 }} />
        </div>
      </div>

      {/* Body */}
      <div style={{
        maxHeight: 'calc(80vh - 140px)',
        overflowY: 'auto',
        padding: '20px 24px',
        background: 'var(--bg-secondary)',
      }}>
        {/* Input Zone */}
        {renderInputZone()}

        {/* Stats */}
        {renderStatsBar()}

        {/* Material Cards */}
        {materials.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {materials.map(renderMaterialCard)}
          </div>
        ) : (
          renderEmptyState()
        )}
      </div>

      {/* Footer */}
      {renderFooter()}
    </Modal>
  )
}
