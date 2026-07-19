import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button, Empty, Input, Tag, message } from 'antd'
import type { ContentItem, FactCard } from '../types/workflow'
import type { ContentCreationType } from '../types/workflow'
import {
  FileTextOutlined,
  ReloadOutlined,
  WarningOutlined,
} from '../icons/antdCompat'
import StageHeader from './StageHeader'

type MaterialItem = ContentItem & { _source_channel?: 'auto' }

type MorningNewsStructure = {
  contentType?: ContentCreationType
  topic: { title?: string; description?: string }
  materials: MaterialItem[]
  facts: FactCard[]
  selected_topics: Array<{ id?: string; title?: string; fact_id?: string }>
  blocks: Array<{ id: string; type: string; title: string; materials: MaterialItem[]; notes: string }>
}

interface Props {
  visible: boolean
  onClose: () => void
  onBackToOrganize?: () => void
  rawContents: MaterialItem[]
  selectedTopic?: { title?: string; description?: string }
  selectedMaterials?: MaterialItem[]
  initialFacts?: FactCard[]
  initialSelectedTopics?: Array<{ id?: string; title?: string; fact_id?: string }>
  isAutoExecute?: boolean
  onRunNodes?: (nodes: string[]) => Promise<void> | void
  onStateChange?: (structure: MorningNewsStructure) => void
  onConfirm?: (structure: MorningNewsStructure) => void
}

const { Search } = Input
const RECOMMENDED_NEWS_COUNT = 10
const QUICK_NEWS_RECOMMENDED_COUNT = 6

function slotTypeForIndex(index: number, total: number): 'quick_news' | 'deep_dive' {
  if (total <= 1) return 'deep_dive'
  return index === Math.min(QUICK_NEWS_RECOMMENDED_COUNT, total - 1) ? 'deep_dive' : 'quick_news'
}

function slotLabelForIndex(index: number, total: number): string {
  const type = slotTypeForIndex(index, total)
  if (type === 'deep_dive') return '深度解读'
  return `快讯 ${index + 1}`
}

export default function CreationStudio({
  visible,
  onBackToOrganize,
  rawContents = [],
  selectedTopic,
  selectedMaterials = [],
  initialFacts = [],
  initialSelectedTopics = [],
  onRunNodes,
  onStateChange,
  onConfirm,
}: Props) {
  const [query, setQuery] = useState('')
  const [facts, setFacts] = useState<FactCard[]>([])
  const [selectedFactIds, setSelectedFactIds] = useState<string[]>([])
  const [topicTitle, setTopicTitle] = useState(selectedTopic?.title || '通勤早咖啡：今日新闻简报')
  const [topicDesc, setTopicDesc] = useState(selectedTopic?.description || '面向通勤场景的单人新闻早报')
  const lastSyncedStateRef = useRef('')

  const materials = useMemo(() => (
    selectedMaterials.length > 0 ? selectedMaterials : rawContents
  ), [rawContents, selectedMaterials])

  useEffect(() => {
    if (!visible) return
    const nextFacts = initialFacts.length > 0 ? initialFacts : deriveFacts(materials)
    setFacts(nextFacts)
    const initialIds = initialSelectedTopics.map(topic => topic.fact_id).filter(Boolean) as string[]
    setSelectedFactIds(initialIds.length > 0 ? initialIds : nextFacts.slice(0, RECOMMENDED_NEWS_COUNT).map(fact => fact.id))
    setTopicTitle(selectedTopic?.title || '通勤早咖啡：今日新闻简报')
    setTopicDesc(selectedTopic?.description || '面向通勤场景的单人新闻早报')
  }, [initialFacts, initialSelectedTopics, materials, selectedTopic?.description, selectedTopic?.title, visible])

  const filteredMaterials = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return materials
    return materials.filter(item => (
      (item.title || '').toLowerCase().includes(q) ||
      (item.summary || item.content || '').toLowerCase().includes(q)
    ))
  }, [materials, query])

  const selectedFacts = useMemo(() => (
    selectedFactIds
      .map(id => facts.find(fact => fact.id === id))
      .filter(Boolean) as FactCard[]
  ), [facts, selectedFactIds])

  const selectedTopics = useMemo(() => (
    selectedFacts.map((fact, index) => ({
      id: `topic_${index + 1}`,
      title: fact.title,
      fact_id: fact.id,
    }))
  ), [selectedFacts])

  const warnings = useMemo(() => {
    const result: string[] = []
    if (facts.length === 0) result.push('尚未生成事实卡片')
    if (selectedFacts.length === 0) result.push('至少选择 1 条新闻才能生成稿件')
    if (selectedFacts.length > 0 && selectedFacts.length < RECOMMENDED_NEWS_COUNT) result.push('当前少于推荐数量，将按实际条数生成')
    if (selectedFacts.length > RECOMMENDED_NEWS_COUNT) result.push('当前多于推荐数量，成稿时会压缩快讯表达')
    const lowFacts = selectedFacts.filter(fact => fact.confidence === 'low')
    if (lowFacts.length > 0) result.push(`${lowFacts.length} 条事实卡片来源不足`)
    return result
  }, [facts.length, selectedFacts])

  const structure = useMemo<MorningNewsStructure>(() => ({
    contentType: 'news_brief',
    topic: { title: topicTitle, description: topicDesc },
    materials,
    facts,
    selected_topics: selectedTopics,
    blocks: [
      { id: 'opening', type: 'opening', title: '开场导语', materials: [], notes: '' },
      ...selectedFacts.map((fact, index) => ({
        id: `news_${index + 1}`,
        type: slotTypeForIndex(index, selectedFacts.length),
        title: fact.title,
        materials: materials.filter(item => item.title === fact.source_title || item.url === fact.source_url),
        notes: fact.claim,
      })),
      { id: 'closing', type: 'closing', title: '结尾总结', materials: [], notes: '' },
    ],
  }), [facts, materials, selectedFacts, selectedTopics, topicDesc, topicTitle])

  useEffect(() => {
    if (!visible) return
    const serialized = JSON.stringify({
      topic: structure.topic,
      facts: structure.facts,
      selected_topics: structure.selected_topics,
      block_count: structure.blocks.length,
    })
    if (serialized === lastSyncedStateRef.current) return
    lastSyncedStateRef.current = serialized
    onStateChange?.(structure)
  }, [onStateChange, structure, visible])

  const regenerateFacts = useCallback(async () => {
    if (onRunNodes) {
      try {
        await onRunNodes(['facts'])
        message.success({ content: '事实卡片节点已运行', duration: 1.5, style: { marginTop: 60 } })
        return
      } catch (error: any) {
        message.error({ content: `事实卡片节点运行失败：${error?.message || String(error)}`, duration: 2.5, style: { marginTop: 60 } })
      }
    }
    const nextFacts = deriveFacts(materials)
    setFacts(nextFacts)
    setSelectedFactIds(nextFacts.slice(0, RECOMMENDED_NEWS_COUNT).map(fact => fact.id))
  }, [materials, onRunNodes])

  const toggleFact = useCallback((factId: string) => {
    setSelectedFactIds(prev => {
      if (prev.includes(factId)) return prev.filter(id => id !== factId)
      return [...prev, factId]
    })
  }, [])

  if (!visible) return null

  return (
    <div className="stage-workbench creation-page">
      <StageHeader
        title="构思"
        actions={
          <Button icon={<ReloadOutlined />} onClick={regenerateFacts}>生成事实卡片</Button>
        }
        previous={onBackToOrganize ? { onClick: onBackToOrganize } : undefined}
        next={{
          disabled: selectedFacts.length === 0,
          onClick: () => onConfirm?.(structure),
        }}
      />

      <main className="stage-body creation-layout">
        <section className="creation-sidebar">
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>素材池</div>
          <Search placeholder="搜索标题或摘要" value={query} onChange={e => setQuery(e.target.value)} style={{ marginBottom: 12 }} />
          {filteredMaterials.length === 0 ? (
            <Empty description="暂无素材" />
          ) : filteredMaterials.map((item, index) => (
            <div key={`${item.url || item.title}-${index}`} style={{
              padding: 12,
              marginBottom: 8,
              border: '1px solid var(--border-color)',
              borderRadius: 8,
              background: 'var(--bg-secondary)',
            }}>
              <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.4 }}>{item.title || '无标题'}</div>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>
                {item.source || item.source_name || 'unknown source'}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 8, lineHeight: 1.6 }}>
                {(item.summary || item.content || '').slice(0, 120)}
              </div>
            </div>
          ))}
        </section>

        <section className="creation-main">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>事实卡片</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>推荐 9 条快讯 + 1 条深度解读，允许任意数量</div>
            </div>
            <Tag bordered={false} color={selectedFacts.length > 0 ? 'green' : 'orange'}>
              已选 {selectedFacts.length} / 推荐 {RECOMMENDED_NEWS_COUNT}
            </Tag>
          </div>
          {warnings.length > 0 && (
            <div style={{
              marginBottom: 12,
              padding: '10px 12px',
              borderRadius: 8,
              background: 'var(--warning-bg)',
              color: 'var(--warning-color)',
              fontSize: 12,
            }}>
              <WarningOutlined /> {warnings.join('；')}
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
            {facts.map(fact => {
              const selected = selectedFactIds.includes(fact.id)
              return (
                <button
                  key={fact.id}
                  onClick={() => toggleFact(fact.id)}
                  style={{
                    textAlign: 'left',
                    padding: 14,
                    borderRadius: 8,
                    border: `1.5px solid ${selected ? 'var(--accent-primary)' : 'var(--border-color)'}`,
                    background: selected ? 'var(--accent-light)' : 'var(--bg-secondary)',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <strong style={{ fontSize: 13 }}>{fact.title}</strong>
                    <Tag bordered={false} color={fact.confidence === 'high' ? 'green' : fact.confidence === 'medium' ? 'blue' : 'orange'} style={{ margin: 0 }}>
                      {fact.confidence}
                    </Tag>
                  </div>
                  <div style={{ marginTop: 8, color: 'var(--text-secondary)', fontSize: 12, lineHeight: 1.6 }}>{fact.claim || fact.summary}</div>
                    <div title={fact.source_url || '无 URL'} style={{ marginTop: 10, color: 'var(--text-tertiary)', fontSize: 11, wordBreak: 'break-all' }}>
                      <FileTextOutlined /> {fact.source_title || 'unknown source'}
                    </div>
                </button>
              )
            })}
          </div>
        </section>

        <section className="creation-summary">
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>本期结构</div>
          <Input value={topicTitle} onChange={e => setTopicTitle(e.target.value)} style={{ marginBottom: 8 }} />
          <Input.TextArea value={topicDesc} onChange={e => setTopicDesc(e.target.value)} autoSize={{ minRows: 2, maxRows: 4 }} style={{ marginBottom: 12 }} />
          {selectedFacts.map((fact, index) => (
            <div key={fact.id} style={{
              padding: '10px 12px',
              border: '1px solid var(--border-color)',
              borderRadius: 8,
              background: 'var(--bg-secondary)',
              marginBottom: 8,
            }}>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{slotLabelForIndex(index, selectedFacts.length)}</div>
              <div style={{ fontSize: 13, fontWeight: 600, marginTop: 2 }}>{fact.title}</div>
            </div>
          ))}
        </section>
      </main>
    </div>
  )
}

function deriveFacts(materials: MaterialItem[]): FactCard[] {
  const seen = new Set<string>()
  return materials
    .filter(item => {
      const key = item.url || item.title || ''
      if (!key || seen.has(key)) return false
      seen.add(key)
      return Boolean(item.title && (item.summary || item.content))
    })
    .slice(0, 20)
    .map((item, index) => {
      const content = String(item.summary || item.content || '').replace(/\s+/g, ' ').trim()
      return {
        id: `fact_${String(index + 1).padStart(3, '0')}`,
        title: item.title || `事实 ${index + 1}`,
        summary: content.slice(0, 260),
        source_title: item.source_name || item.source || item.title || '',
        source_url: item.url || '',
        published_at: item.published || '',
        claim: firstSentence(content),
        confidence: (item.url && item.published ? 'high' : item.url ? 'medium' : 'low') as FactCard['confidence'],
        used_in_segments: [],
      }
    })
}

function firstSentence(text: string): string {
  const match = text.match(/(.+?[。！？.!?])/)
  return (match?.[1] || text).slice(0, 180)
}
