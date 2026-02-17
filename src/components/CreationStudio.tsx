import { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import { Input, Tag, Button, Empty, Badge, Tooltip, Dropdown } from 'antd'
import type { ContentCreationType } from '../types/workflow'
import type { EnhancedMaterial, StructureBlock, StructureBlockType } from '../types/ideation'
import { CONTENT_TYPE_META } from '../constants/contentCreation'
import IdeationPanel from './IdeationPanel'
import {
  SearchOutlined,
  PlusOutlined,
  DeleteOutlined,
  StarOutlined,
  StarFilled,
  DragOutlined,
  BulbOutlined,
  ThunderboltOutlined,
  QuestionCircleOutlined,
  SoundOutlined,
  FileTextOutlined,
  ArrowLeftOutlined,
  CloseOutlined,
  ArrowRightOutlined,
  LockOutlined,
  UnlockOutlined,
  CheckCircleOutlined,
  SaveOutlined,
  HistoryOutlined,
} from '../icons/antdCompat'

const { TextArea } = Input

// ============================================================
// Types
// ============================================================

type BlockTemplate = {
  type: StructureBlockType
  title: string
}

const CONTENT_BLOCK_PRESETS: Record<ContentCreationType, BlockTemplate[]> = {
  story: [
    { type: 'mainline', title: '主话题' },
    { type: 'discussion', title: '延伸讨论' },
    { type: 'background', title: '背景补充' },
  ],
  news_brief: [
    { type: 'opening', title: '开场导语' },
    { type: 'news_item', title: '新闻一' },
    { type: 'news_item', title: '新闻二' },
    { type: 'news_item', title: '新闻三' },
    { type: 'closing', title: '结尾总结' },
  ],
}

const BLOCK_META: Record<StructureBlockType, { icon: ReactNode; color: string }> = {
  opening: { icon: <SoundOutlined style={{ color: '#f59e0b' }} />, color: '#f59e0b' },
  mainline: { icon: <ThunderboltOutlined style={{ color: '#f59e0b' }} />, color: '#f59e0b' },
  discussion: { icon: <BulbOutlined style={{ color: '#8b5cf6' }} />, color: '#8b5cf6' },
  background: { icon: <FileTextOutlined style={{ color: '#3b82f6' }} />, color: '#3b82f6' },
  news_item: { icon: <FileTextOutlined style={{ color: '#0ea5e9' }} />, color: '#0ea5e9' },
  closing: { icon: <CheckCircleOutlined style={{ color: '#10b981' }} />, color: '#10b981' },
  custom: { icon: <DragOutlined style={{ color: '#6b7280' }} />, color: '#6b7280' },
}

const createBlocksByContentType = (contentType: ContentCreationType): StructureBlock[] => (
  (CONTENT_BLOCK_PRESETS[contentType] || CONTENT_BLOCK_PRESETS.story).map((tpl, idx) => ({
    id: `${tpl.type}_${idx + 1}`,
    type: tpl.type,
    title: tpl.title,
    materials: [],
    notes: '',
  }))
)

interface Props {
  visible: boolean
  onClose: () => void
  onBackToOrganize?: () => void
  rawContents: EnhancedMaterial[]
  selectedTopic?: { title?: string; description?: string }
  selectedMaterials?: MaterialItem[]
  initialBlocks?: StructureBlock[]
  onStateChange?: (structure: { topic: any; materials: MaterialItem[]; blocks: StructureBlock[] }) => void
  onConfirm?: (structure: { topic: any; materials: MaterialItem[]; blocks: StructureBlock[] }) => void
}

// ============================================================
// Component
// ============================================================

export default function CreationStudio({
  visible,
  onClose,
  onBackToOrganize,
  rawContents = [],
  selectedTopic,
  initialBlocks,
  onStateChange,
  onConfirm,
}: Props) {
  const [contentType, setContentType] = useState<ContentCreationType>('story')

  // Left panel state
  const [searchQuery, setSearchQuery] = useState('')
  const [filterChannel, setFilterChannel] = useState<'all' | 'auto' | 'manual'>('all')
  const [starredIds, setStarredIds] = useState<Set<number>>(new Set())

  // Center panel state
  const [blocks, setBlocks] = useState<StructureBlock[]>(createBlocksByContentType('story'))
  const [topicTitle, setTopicTitle] = useState(selectedTopic?.title || '')
  const [topicDesc, setTopicDesc] = useState(selectedTopic?.description || '')
  const [isLocked, setIsLocked] = useState(false)

  // Right panel state
  const [activeInsightTab, setActiveInsightTab] = useState<'topics' | 'context' | 'questions' | 'mood' | 'rhythm'>('topics')
  const [savedVersions, setSavedVersions] = useState<Array<{ time: string; blockCount: number; materialCount: number }>>([])
  const lastSyncedStateRef = useRef('')

  useEffect(() => {
    if (!visible) return
    if (initialBlocks?.length) {
      setBlocks(initialBlocks)
    }
    setTopicTitle(selectedTopic?.title || '')
    setTopicDesc(selectedTopic?.description || '')
  }, [visible])

  useEffect(() => {
    if (!visible) return
    const structure = {
      topic: { title: topicTitle, description: topicDesc },
      materials: blocks.flatMap(b => b.materials),
      blocks,
    }
    const serialized = JSON.stringify(structure)
    if (serialized === lastSyncedStateRef.current) return
    lastSyncedStateRef.current = serialized
    onStateChange?.(structure)
  }, [visible, topicTitle, topicDesc, blocks])

  // LLM Ideation state
  const [ideationPanelVisible, setIdeationPanelVisible] = useState(false)
  const [isLlmGenerated, setIsLlmGenerated] = useState(false)

  // Filter materials
  const filteredMaterials = useMemo(() => {
    let items = rawContents
    if (filterChannel !== 'all') {
      items = items.filter(m => m._source_channel === filterChannel)
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      items = items.filter(m =>
        (m.title || '').toLowerCase().includes(q) ||
        (m.content || '').toLowerCase().includes(q)
      )
    }
    return items
  }, [rawContents, filterChannel, searchQuery])

  // Count assigned materials
  const assignedCount = blocks.reduce((sum, b) => sum + b.materials.length, 0)
  const totalCount = rawContents.length

  // Toggle star
  const toggleStar = useCallback((idx: number) => {
    setStarredIds(prev => {
      const next = new Set(prev)
      next.has(idx) ? next.delete(idx) : next.add(idx)
      return next
    })
  }, [])

  // Add material to block
  const addToBlock = useCallback((material: EnhancedMaterial, blockId: string) => {
    if (isLocked) return
    setBlocks(prev => prev.map(b => {
      if (b.id === blockId) {
        const already = b.materials.some(m => m.title === material.title)
        if (already) return b
        return { ...b, materials: [...b.materials, material] }
      }
      return b
    }))
  }, [isLocked])

  const applyContentPreset = useCallback((nextType: ContentCreationType) => {
    setContentType(nextType)
    setBlocks(createBlocksByContentType(nextType))
  }, [])

  const addNewsItemBlock = useCallback(() => {
    if (isLocked) return
    const nextIdx = blocks.filter(b => b.type === 'news_item').length + 1
    const id = `news_item_${Date.now()}`
    setBlocks(prev => {
      const next = [...prev]
      const closingIdx = next.findIndex(block => block.type === 'closing')
      const item: StructureBlock = {
        id,
        type: 'news_item',
        title: `新闻${nextIdx}`,
        materials: [],
        notes: '',
      }
      if (closingIdx >= 0) {
        next.splice(closingIdx, 0, item)
      } else {
        next.push(item)
      }
      return next
    })
  }, [blocks, isLocked])

  // Remove material from block
  const removeFromBlock = useCallback((blockId: string, idx: number) => {
    if (isLocked) return
    setBlocks(prev => prev.map(b => {
      if (b.id === blockId) {
        return { ...b, materials: b.materials.filter((_, i) => i !== idx) }
      }
      return b
    }))
  }, [isLocked])

  // Update block notes
  const updateBlockNotes = useCallback((blockId: string, notes: string) => {
    setBlocks(prev => prev.map(b => b.id === blockId ? { ...b, notes } : b))
  }, [])

  // Add custom block
  const addCustomBlock = useCallback(() => {
    if (isLocked) return
    const id = `custom_${Date.now()}`
    setBlocks(prev => [...prev, { id, type: 'custom', title: '自定义段落', materials: [], notes: '' }])
  }, [isLocked])

  // Remove custom block
  const removeBlock = useCallback((blockId: string) => {
    if (isLocked) return
    setBlocks(prev => prev.filter(b => b.id !== blockId))
  }, [isLocked])

  // Save version snapshot
  const handleSaveVersion = useCallback(() => {
    const materialCount = blocks.reduce((sum, b) => sum + b.materials.length, 0)
    const now = new Date()
    const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`
    setSavedVersions(prev => [{ time: timeStr, blockCount: blocks.filter(b => b.materials.length > 0 || b.notes).length, materialCount }, ...prev])
  }, [blocks])

  // Apply LLM result
  const handleApplyLLMResult = useCallback((llmBlocks: StructureBlock[], topic: { title: string; description: string }) => {
    const convertedBlocks = llmBlocks.map(b => ({
      id: b.id,
      type: b.type,
      title: b.title,
      materials: b.materials,
      notes: b.notes || (b.llm_suggestions?.key_points?.join('\n') || ''),
    }))
    
    setBlocks(convertedBlocks)
    setTopicTitle(topic.title)
    setTopicDesc(topic.description)
    setIsLlmGenerated(true)
    setIdeationPanelVisible(false)
  }, [])

  // Handle confirm
  const handleConfirm = () => {
    const allMaterials = blocks.flatMap(b => b.materials)
    onConfirm?.({
      contentType,
      topic: { title: topicTitle, description: topicDesc },
      materials: allMaterials,
      blocks,
    })
  }

  if (!visible) return null

  // ============================================================
  // Render helpers
  // ============================================================

  const channelTag = (channel?: string) => {
    if (channel === 'auto') return <Tag color="blue" bordered={false} style={{ fontSize: 10, padding: '0 4px', lineHeight: '16px', borderRadius: 4 }}>雷达</Tag>
    if (channel === 'manual') return <Tag color="orange" bordered={false} style={{ fontSize: 10, padding: '0 4px', lineHeight: '16px', borderRadius: 4 }}>手动</Tag>
    return null
  }

  const blockTypeIcon = (type: string) => {
    return BLOCK_META[type as StructureBlockType]?.icon || BLOCK_META.custom.icon
  }

  const blockTypeColor = (type: string) => {
    return BLOCK_META[type as StructureBlockType]?.color || BLOCK_META.custom.color
  }

  // Insight data (would come from AI in production)
  const insights = {
    topics: [
      { text: '聚焦一个核心争议点，让讨论更有张力', icon: <ThunderboltOutlined /> },
      { text: '考虑加入听众可能关心的实际影响', icon: <BulbOutlined /> },
      { text: '素材中有多个角度，可以设计正反观点对话', icon: <QuestionCircleOutlined /> },
    ],
    questions: [
      { text: '这件事为什么现在发生？', icon: <QuestionCircleOutlined /> },
      { text: '普通人会受到什么影响？', icon: <QuestionCircleOutlined /> },
      { text: '主流观点之外有没有被忽视的角度？', icon: <QuestionCircleOutlined /> },
      { text: '未来一年可能的走向是什么？', icon: <QuestionCircleOutlined /> },
    ],
    mood: [
      { text: '好奇 → 深入 → 思考', icon: <SoundOutlined />, desc: '适合科技/趋势类话题' },
      { text: '震惊 → 分析 → 启发', icon: <SoundOutlined />, desc: '适合新闻/事件类话题' },
      { text: '平和 → 探索 → 共鸣', icon: <SoundOutlined />, desc: '适合文化/生活类话题' },
    ],
    rhythm: [
      { text: '开场 2min → 主题 8min → 讨论 5min → 总结 2min', icon: <SoundOutlined />, desc: '15分钟标准结构' },
      { text: '快速切入 → 深度展开 → 留白思考', icon: <SoundOutlined />, desc: '节奏感强的叙事' },
    ],
  }

  return (
    <div style={{
      position: 'fixed',
      top: 52,
      right: 0,
      bottom: 0,
      left: 148,
      zIndex: 1000,
      background: 'var(--bg-primary)',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* ============================================================ */}
      {/* Header */}
      {/* ============================================================ */}
      <div style={{
        height: 52,
        borderBottom: '1px solid var(--border-color)',
        background: 'var(--bg-secondary)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 20px',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 20 }}>表</span>
          <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
            创作台
          </span>
          <Tag bordered={false} style={{ background: 'var(--bg-tertiary)', color: 'var(--text-tertiary)', fontSize: 11 }}>
            {assignedCount} / {totalCount} 素材已选用
          </Tag>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {onBackToOrganize && (
            <Tooltip title="返回整理层">
              <Button
                icon={<LeftOutlined />}
                onClick={onBackToOrganize}
                style={{ borderRadius: 8, fontWeight: 500, fontSize: 12, height: 32 }}
              >
                返回整理
              </Button>
            </Tooltip>
          )}
          <Tooltip title="智能构思助手">
            <Button
              type={isLlmGenerated ? 'primary' : 'default'}
              icon={<RobotOutlined />}
              onClick={() => setIdeationPanelVisible(true)}
              style={{ 
                borderRadius: 8, 
                fontWeight: 500, 
                fontSize: 12, 
                height: 32,
                ...(isLlmGenerated ? { background: '#8b5cf6', borderColor: '#8b5cf6' } : {})
              }}
            >
              {isLlmGenerated ? 'AI已生成' : 'AI构思'}
            </Button>
          </Tooltip>
          <Tooltip title={`保存版本${savedVersions.length > 0 ? ` (${savedVersions.length})` : ''}`}>
            <Button
              type="text"
              icon={<SaveOutlined />}
              onClick={handleSaveVersion}
              style={{ color: 'var(--text-tertiary)' }}
            />
          </Tooltip>
          <Tooltip title={isLocked ? '解锁结构' : '锁定结构'}>
            <Button
              type="text"
              icon={isLocked ? <LockOutlined /> : <UnlockOutlined />}
              onClick={() => setIsLocked(!isLocked)}
              style={{ color: isLocked ? 'var(--warning-color)' : 'var(--text-tertiary)' }}
            />
          </Tooltip>
          <Button
            type="primary"
            icon={<CheckCircleOutlined />}
            onClick={handleConfirm}
            style={{
              background: 'var(--accent-primary)',
              borderColor: 'var(--accent-primary)',
              borderRadius: 8,
              fontWeight: 600,
              fontSize: 13,
            }}
          >
            确认结构，进入写作
          </Button>
          <Tooltip title="返回工作流">
            <Button type="text" icon={<ArrowLeftOutlined />} onClick={onClose} style={{ color: 'var(--text-tertiary)' }} />
          </Tooltip>
        </div>
      </div>

      {/* ============================================================ */}
      {/* Three columns */}
      {/* ============================================================ */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* ==================== LEFT: Material Pool ==================== */}
        <div style={{
          width: 320,
          borderRight: '1px solid var(--border-color)',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--bg-secondary)',
        }}>
          {/* Left header */}
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-color)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                察 素材池
              </span>
              <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                {filteredMaterials.length} 条
              </span>
            </div>
            <Input
              prefix={<SearchOutlined style={{ color: 'var(--text-tertiary)' }} />}
              placeholder="搜索素材..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              allowClear
              style={{ borderRadius: 8, marginBottom: 8 }}
              size="small"
            />
            <div style={{ display: 'flex', gap: 4 }}>
              {(['all', 'auto', 'manual'] as const).map(ch => (
                <Button
                  key={ch}
                  size="small"
                  type={filterChannel === ch ? 'primary' : 'default'}
                  onClick={() => setFilterChannel(ch)}
                  style={{
                    borderRadius: 6,
                    fontSize: 11,
                    height: 24,
                    ...(filterChannel === ch ? {} : { background: 'var(--bg-tertiary)', borderColor: 'transparent', color: 'var(--text-secondary)' })
                  }}
                >
                  {ch === 'all' ? '全部' : ch === 'auto' ? '察 雷达' : '入 手动'}
                </Button>
              ))}
            </div>
          </div>

          {/* Left body - material cards */}
          <div style={{ flex: 1, overflow: 'auto', padding: '8px 12px' }}>
            {filteredMaterials.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center' }}>
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={<span style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>暂无素材</span>}
                />
              </div>
            ) : (
              filteredMaterials.map((item, idx) => {
                const isStarred = starredIds.has(idx)
                return (
                  <div
                    key={idx}
                    style={{
                      padding: '10px 12px',
                      marginBottom: 6,
                      borderRadius: 10,
                      border: '1px solid var(--border-color)',
                      background: 'var(--bg-primary)',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                    }}
                    onMouseEnter={e => {
                      (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--accent-primary)'
                      ;(e.currentTarget as HTMLDivElement).style.boxShadow = '0 2px 8px rgba(37,99,235,0.08)'
                    }}
                    onMouseLeave={e => {
                      (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border-color)'
                      ;(e.currentTarget as HTMLDivElement).style.boxShadow = 'none'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize: 12,
                          fontWeight: 600,
                          color: 'var(--text-primary)',
                          marginBottom: 4,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}>
                          {item.title || '无标题'}
                        </div>
                        <div style={{
                          fontSize: 11,
                          color: 'var(--text-tertiary)',
                          lineHeight: 1.5,
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                        }}>
                          {(item.content || '').slice(0, 120)}
                        </div>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleStar(idx) }}
                        style={{
                          background: 'none', border: 'none', cursor: 'pointer', padding: 2,
                          color: isStarred ? '#f59e0b' : 'var(--border-color)',
                          fontSize: 14, flexShrink: 0,
                        }}
                      >
                        {isStarred ? <StarFilled /> : <StarOutlined />}
                      </button>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
                      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                        {channelTag(item._source_channel)}
                        {item.source && (
                          <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{item.source}</span>
                        )}
                      </div>
                      <Dropdown
                        menu={{
                          items: blocks.map(b => ({
                            key: b.id,
                            label: `→ ${b.title}`,
                            icon: blockTypeIcon(b.type),
                            onClick: () => addToBlock(item, b.id),
                          }))
                        }}
                        trigger={['click']}
                      >
                        <Button size="small" type="text" icon={<ArrowRightOutlined />}
                          style={{ fontSize: 10, height: 20, color: 'var(--accent-primary)' }}
                        >
                          选用
                        </Button>
                      </Dropdown>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* ==================== CENTER: Show Structure ==================== */}
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--bg-primary)',
          minWidth: 0,
        }}>
          {/* Topic header */}
          <div style={{
            padding: '16px 24px',
            borderBottom: '1px solid var(--border-color)',
            background: 'var(--bg-secondary)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {(Object.keys(CONTENT_TYPE_META) as ContentCreationType[]).map((type) => {
                  const active = type === contentType
                  const meta = CONTENT_TYPE_META[type]
                  return (
                    <Button
                      key={type}
                      size="small"
                      onClick={() => applyContentPreset(type)}
                      type={active ? 'primary' : 'default'}
                      disabled={isLocked}
                      style={{ borderRadius: 999, fontSize: 11 }}
                    >
                      {meta.icon} {meta.label}
                    </Button>
                  )
                })}
              </div>
              {contentType === 'news_brief' && !isLocked && (
                <Button size="small" type="dashed" onClick={addNewsItemBlock} style={{ borderRadius: 8, fontSize: 11 }}>
                  + 添加新闻条目
                </Button>
              )}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 10 }}>
              {CONTENT_TYPE_META[contentType].desc}
            </div>
            <Input
              value={topicTitle}
              onChange={e => setTopicTitle(e.target.value)}
              placeholder="本期主题..."
              disabled={isLocked}
              style={{
                fontSize: 18,
                fontWeight: 700,
                border: 'none',
                boxShadow: 'none',
                padding: 0,
                background: 'transparent',
                color: 'var(--text-primary)',
              }}
            />
            <Input
              value={topicDesc}
              onChange={e => setTopicDesc(e.target.value)}
              placeholder="一句话描述这期节目的核心..."
              disabled={isLocked}
              style={{
                fontSize: 13,
                border: 'none',
                boxShadow: 'none',
                padding: 0,
                marginTop: 6,
                background: 'transparent',
                color: 'var(--text-secondary)',
              }}
            />
          </div>

          {/* Structure blocks */}
          <div style={{ flex: 1, overflow: 'auto', padding: '16px 24px' }}>
            {blocks.map((block) => (
              <div
                key={block.id}
                style={{
                  marginBottom: 16,
                  borderRadius: 12,
                  border: `1px solid ${blockTypeColor(block.type)}20`,
                  background: 'var(--bg-secondary)',
                  overflow: 'hidden',
                }}
              >
                {/* Block header */}
                <div style={{
                  padding: '10px 16px',
                  borderBottom: `1px solid ${blockTypeColor(block.type)}15`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: `${blockTypeColor(block.type)}06`,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {blockTypeIcon(block.type)}
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                      {block.title}
                    </span>
                    <Badge
                      count={block.materials.length}
                      showZero
                      style={{
                        backgroundColor: block.materials.length > 0 ? blockTypeColor(block.type) : 'var(--border-color)',
                        fontSize: 10,
                        height: 18,
                        minWidth: 18,
                        lineHeight: '18px',
                      }}
                    />
                  </div>
                  {block.type === 'custom' && !isLocked && (
                    <Button
                      type="text"
                      size="small"
                      icon={<DeleteOutlined />}
                      onClick={() => removeBlock(block.id)}
                      style={{ color: 'var(--text-tertiary)', fontSize: 12 }}
                    />
                  )}
                </div>

                {/* Block materials */}
                <div style={{ padding: '8px 12px' }}>
                  {block.materials.length === 0 ? (
                    <div style={{
                      padding: '12px 0',
                      textAlign: 'center',
                      color: 'var(--text-tertiary)',
                      fontSize: 11,
                      borderRadius: 8,
                      border: '1px dashed var(--border-color)',
                      margin: '4px 0',
                    }}>
                      从左侧素材池选用素材到此处
                    </div>
                  ) : (
                    block.materials.map((mat, matIdx) => (
                      <div
                        key={matIdx}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          padding: '6px 8px',
                          marginBottom: 4,
                          borderRadius: 6,
                          background: 'var(--bg-primary)',
                          border: '1px solid var(--border-color)',
                          fontSize: 12,
                        }}
                      >
                        <DragOutlined style={{ color: 'var(--border-color)', cursor: 'grab', flexShrink: 0 }} />
                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-primary)' }}>
                          {mat.title || '无标题'}
                        </span>
                        {channelTag(mat._source_channel)}
                        {!isLocked && (
                          <button
                            onClick={() => removeFromBlock(block.id, matIdx)}
                            style={{
                              background: 'none', border: 'none', cursor: 'pointer', padding: 2,
                              color: 'var(--text-tertiary)', fontSize: 12, flexShrink: 0,
                            }}
                          >
                            <CloseOutlined />
                          </button>
                        )}
                      </div>
                    ))
                  )}
                </div>

                {/* Block notes */}
                <div style={{ padding: '0 12px 10px' }}>
                  <TextArea
                    value={block.notes}
                    onChange={e => updateBlockNotes(block.id, e.target.value)}
                    placeholder="创作笔记...（讨论方向、要点提示）"
                    disabled={isLocked}
                    autoSize={{ minRows: 1, maxRows: 3 }}
                    style={{
                      fontSize: 11,
                      border: 'none',
                      boxShadow: 'none',
                      background: 'var(--bg-tertiary)',
                      borderRadius: 6,
                      color: 'var(--text-secondary)',
                      resize: 'none',
                    }}
                  />
                </div>
              </div>
            ))}

            {/* Add custom block button */}
            {!isLocked && (
              <Button
                type="dashed"
                block
                icon={<PlusOutlined />}
                onClick={addCustomBlock}
                style={{
                  borderRadius: 10,
                  height: 40,
                  color: 'var(--text-tertiary)',
                  borderColor: 'var(--border-color)',
                  fontSize: 12,
                }}
              >
                添加段落
              </Button>
            )}

            {/* Structure preview */}
            <div style={{
              marginTop: 24,
              padding: 16,
              borderRadius: 10,
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--border-color)',
            }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 10 }}>
                构 节目结构预览
              </div>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {blocks.filter(b => b.materials.length > 0 || b.notes).map((b, i) => (
                  <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    {i > 0 && <ArrowRightOutlined style={{ fontSize: 9, color: 'var(--border-color)' }} />}
                    <Tag
                      bordered={false}
                      style={{
                        background: `${blockTypeColor(b.type)}15`,
                        color: blockTypeColor(b.type),
                        fontSize: 11,
                        borderRadius: 6,
                        margin: 0,
                      }}
                    >
                      {b.title} ({b.materials.length})
                    </Tag>
                  </div>
                ))}
                {blocks.every(b => b.materials.length === 0 && !b.notes) && (
                  <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                    还没有内容，从左侧素材池开始选用素材
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ==================== RIGHT: Insights ==================== */}
        <div style={{
          width: 280,
          borderLeft: '1px solid var(--border-color)',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--bg-secondary)',
        }}>
          {/* Right header */}
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-color)' }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
              想 创作洞察
            </span>
          </div>

          {/* Insight tabs */}
          <div style={{
            display: 'flex',
            borderBottom: '1px solid var(--border-color)',
            padding: '0 12px',
          }}>
            {([
              { key: 'topics', label: '主题' },
              { key: 'context', label: '背景' },
              { key: 'questions', label: '问题' },
              { key: 'mood', label: '基调' },
              { key: 'rhythm', label: '节奏' },
            ] as const).map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveInsightTab(tab.key)}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: '8px 10px',
                  fontSize: 12,
                  cursor: 'pointer',
                  color: activeInsightTab === tab.key ? 'var(--accent-primary)' : 'var(--text-tertiary)',
                  fontWeight: activeInsightTab === tab.key ? 600 : 400,
                  borderBottom: activeInsightTab === tab.key ? '2px solid var(--accent-primary)' : '2px solid transparent',
                  transition: 'all 0.2s ease',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Insight content */}
          <div style={{ flex: 1, overflow: 'auto', padding: '12px 16px' }}>
            {activeInsightTab === 'topics' && (
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 12, lineHeight: 1.6 }}>
                  基于素材分析，以下建议可以让节目更有吸引力：
                </div>
                {insights.topics.map((item, i) => (
                  <div key={i} style={{
                    padding: '10px 12px',
                    marginBottom: 8,
                    borderRadius: 8,
                    background: 'var(--bg-primary)',
                    border: '1px solid var(--border-color)',
                    display: 'flex',
                    gap: 10,
                    alignItems: 'flex-start',
                    fontSize: 12,
                    color: 'var(--text-primary)',
                    lineHeight: 1.6,
                  }}>
                    <span style={{ color: 'var(--accent-primary)', flexShrink: 0, marginTop: 2 }}>{item.icon}</span>
                    <span>{item.text}</span>
                  </div>
                ))}
              </div>
            )}

            {activeInsightTab === 'context' && (
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 12, lineHeight: 1.6 }}>
                  可能关联的背景信息，帮助构建更有深度的节目：
                </div>
                {[
                  { text: '相关行业近期的政策变化或监管动态', icon: <FileTextOutlined /> },
                  { text: '历史上类似事件的发展脉络', icon: <HistoryOutlined /> },
                  { text: '不同国家/地区对同一问题的处理方式', icon: <BulbOutlined /> },
                  { text: '可能影响到的上下游产业或人群', icon: <ThunderboltOutlined /> },
                ].map((item, i) => (
                  <div key={i} style={{
                    padding: '10px 12px',
                    marginBottom: 8,
                    borderRadius: 8,
                    background: 'var(--bg-primary)',
                    border: '1px solid var(--border-color)',
                    display: 'flex',
                    gap: 10,
                    alignItems: 'flex-start',
                    fontSize: 12,
                    color: 'var(--text-primary)',
                    lineHeight: 1.6,
                  }}>
                    <span style={{ color: '#06b6d4', flexShrink: 0, marginTop: 2 }}>{item.icon}</span>
                    <span>{item.text}</span>
                  </div>
                ))}
              </div>
            )}

            {activeInsightTab === 'questions' && (
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 12, lineHeight: 1.6 }}>
                  节目中可以探讨的关键问题：
                </div>
                {insights.questions.map((item, i) => (
                  <div key={i} style={{
                    padding: '10px 12px',
                    marginBottom: 8,
                    borderRadius: 8,
                    background: 'var(--bg-primary)',
                    border: '1px solid var(--border-color)',
                    display: 'flex',
                    gap: 10,
                    alignItems: 'center',
                    fontSize: 12,
                    color: 'var(--text-primary)',
                    cursor: 'pointer',
                    transition: 'border-color 0.2s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent-primary)')}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border-color)')}
                  >
                    <span style={{ color: '#8b5cf6', flexShrink: 0 }}>{item.icon}</span>
                    <span>{item.text}</span>
                  </div>
                ))}
              </div>
            )}

            {activeInsightTab === 'mood' && (
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 12, lineHeight: 1.6 }}>
                  推荐的情绪基调路径：
                </div>
                {insights.mood.map((item, i) => (
                  <div key={i} style={{
                    padding: '12px',
                    marginBottom: 8,
                    borderRadius: 8,
                    background: 'var(--bg-primary)',
                    border: '1px solid var(--border-color)',
                  }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
                      <span style={{ color: '#10b981' }}>{item.icon}</span>
                      {item.text}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4, paddingLeft: 22 }}>
                      {item.desc}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {activeInsightTab === 'rhythm' && (
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 12, lineHeight: 1.6 }}>
                  推荐的节目节奏结构：
                </div>
                {insights.rhythm.map((item, i) => (
                  <div key={i} style={{
                    padding: '12px',
                    marginBottom: 8,
                    borderRadius: 8,
                    background: 'var(--bg-primary)',
                    border: '1px solid var(--border-color)',
                  }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
                      <span style={{ color: '#f59e0b' }}>{item.icon}</span>
                      {item.text}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4, paddingLeft: 22 }}>
                      {item.desc}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Summary stats */}
            <div style={{
              marginTop: 20,
              padding: 14,
              borderRadius: 10,
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--border-color)',
            }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 10 }}>
                数 素材概览
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-secondary)' }}>
                  <span>雷达素材</span>
                  <span style={{ fontWeight: 600 }}>{rawContents.filter(m => m._source_channel === 'auto').length}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-secondary)' }}>
                  <span>手动素材</span>
                  <span style={{ fontWeight: 600 }}>{rawContents.filter(m => m._source_channel === 'manual').length}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-secondary)' }}>
                  <span>已选用</span>
                  <span style={{ fontWeight: 600, color: 'var(--accent-primary)' }}>{assignedCount}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-secondary)' }}>
                  <span>已标星</span>
                  <span style={{ fontWeight: 600, color: '#f59e0b' }}>{starredIds.size}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* LLM Ideation Panel */}
      <IdeationPanel
        materials={rawContents.map(m => ({
          ...m,
          _source_channel: (m as any)._source_channel,
        })) as EnhancedMaterial[]}
        contentType={contentType}
        visible={ideationPanelVisible}
        onApply={handleApplyLLMResult}
        onClose={() => setIdeationPanelVisible(false)}
      />
    </div>
  )
}
