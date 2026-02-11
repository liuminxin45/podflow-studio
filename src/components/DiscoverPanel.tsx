import { useState, useMemo, useCallback } from 'react'
import { Input, Button, Tag, Badge, Tooltip, message } from 'antd'
import {
  SearchOutlined,
  PlusOutlined,
  CloseOutlined,
  StarOutlined,
  StarFilled,
  CheckCircleOutlined,
  ClockCircleOutlined,
  EyeInvisibleOutlined,
  RightOutlined,
  LeftOutlined,
  InboxOutlined,
  GlobalOutlined,
  UserOutlined,
  ArrowRightOutlined,
  FieldTimeOutlined,
  RadarChartOutlined,
} from '@ant-design/icons'
import FetchConfigModal from './FetchConfigModal'
import type { ContentItem } from '../types/workflow'

const { TextArea } = Input

// ============================================================
// Types
// ============================================================

type CardStatus = 'new' | 'candidate' | 'later' | 'ignored'
type SensitivityLevel = 'focused' | 'balanced' | 'wide'
type FreshnessFilter = 'realtime' | 'today' | 'recent'

interface EnrichedItem extends ContentItem {
  _source_channel?: 'auto' | 'manual'
  _status?: CardStatus
  _starred?: boolean
  _note?: string
}

interface Props {
  visible: boolean
  onClose: () => void
  fetchContents: ContentItem[]
  manualContents: ContentItem[]
  onProceedToOrganize?: (candidates: EnrichedItem[]) => void
  fetchSources?: Array<{ id: string; name: string; description: string }>
  fetchConfig?: Record<string, any>
  onFetchConfigSave?: (config: Record<string, any>) => Promise<void>
}

// ============================================================
// Signal Intelligence Helpers
// ============================================================

const CATEGORY_RULES: Array<{ id: string; label: string; color: string; bg: string; keywords: string[] }> = [
  { id: 'regulation', label: '监管政策', color: '#ea580c', bg: '#fff7ed', keywords: ['监管', '政策', '法规', '合规', '审查', 'regulation', 'policy', 'compliance', 'ban', 'restrict'] },
  { id: 'breakthrough', label: '技术突破', color: '#2563eb', bg: '#eff6ff', keywords: ['突破', '发布', '开源', '新模型', 'release', 'launch', 'breakthrough', 'open source', 'GPT', 'model'] },
  { id: 'market', label: '市场动向', color: '#16a34a', bg: '#f0fdf4', keywords: ['融资', '估值', '收购', '上市', 'IPO', '营收', 'funding', 'valuation', 'acquisition', 'revenue', 'market'] },
  { id: 'people', label: '人物动态', color: '#7c3aed', bg: '#f5f3ff', keywords: ['CEO', 'CTO', '创始人', '离职', '加入', 'founder', 'hire', 'resign', 'join'] },
  { id: 'trend', label: '行业趋势', color: '#0891b2', bg: '#ecfeff', keywords: ['趋势', '增长', '变化', '转型', 'trend', 'growth', 'shift', 'transform'] },
]

function detectCategory(item: ContentItem) {
  const text = `${item.title || ''} ${item.content || ''}`.toLowerCase()
  for (const rule of CATEGORY_RULES) {
    if (rule.keywords.some(kw => text.includes(kw.toLowerCase()))) return rule
  }
  return null
}

function getSignalStrength(index: number, total: number): 'hot' | 'warm' | 'cool' {
  const ratio = total > 0 ? index / total : 0
  if (ratio < 0.25) return 'hot'
  if (ratio < 0.6) return 'warm'
  return 'cool'
}

function getSignalColor(strength: 'hot' | 'warm' | 'cool') {
  switch (strength) {
    case 'hot': return '#ef4444'
    case 'warm': return '#3b82f6'
    case 'cool': return '#d1d5db'
  }
}

function computeRelevance(item: ContentItem, topic: string): 'high' | 'medium' | 'low' {
  if (!topic) return 'medium'
  const text = `${item.title || ''} ${item.content || ''}`.toLowerCase()
  const words = topic.toLowerCase().split(/[,，、\s]+/).filter(Boolean)
  const hits = words.filter(w => text.includes(w)).length
  const ratio = words.length > 0 ? hits / words.length : 0
  if (ratio > 0.3) return 'high'
  if (ratio > 0.1) return 'medium'
  return 'low'
}

function getRelevanceTag(level: 'high' | 'medium' | 'low') {
  switch (level) {
    case 'high': return { label: '高度相关', color: '#16a34a', bg: '#f0fdf4' }
    case 'medium': return { label: '可能感兴趣', color: '#d97706', bg: '#fffbeb' }
    case 'low': return { label: '扩展发现', color: '#9ca3af', bg: '#f9fafb' }
  }
}

function formatTimeAgo(published?: string): string {
  if (!published) return ''
  try {
    const d = new Date(published)
    const now = new Date()
    const h = Math.floor((now.getTime() - d.getTime()) / 3600000)
    if (h < 1) return '刚刚'
    if (h < 24) return `${h}小时前`
    const days = Math.floor(h / 24)
    if (days < 7) return `${days}天前`
    return published
  } catch { return published }
}

// ============================================================
// Signal Card — event signal, the core unit of the radar
// ============================================================

function SignalCard({
  item,
  index,
  total,
  topic,
  onAddCandidate,
  onSaveToInbox,
  onToggleStar,
  isCandidate,
  isStarred,
}: {
  item: ContentItem
  index: number
  total: number
  topic: string
  onAddCandidate: () => void
  onSaveToInbox: () => void
  onToggleStar: () => void
  isCandidate: boolean
  isStarred: boolean
}) {
  const strength = getSignalStrength(index, total)
  const barColor = getSignalColor(strength)
  const category = detectCategory(item)
  const relevance = computeRelevance(item, topic)
  const relTag = getRelevanceTag(relevance)
  const timeAgo = formatTimeAgo(item.published)

  const reasons: string[] = []
  if (item.source) reasons.push(`来自 ${item.source}`)
  if (relevance === 'high' && topic) {
    const firstTopic = topic.split(/[,，]/)[0]?.trim()
    if (firstTopic) reasons.push(`与「${firstTopic}」高度相关`)
  } else if (relevance === 'medium' && topic) {
    reasons.push('可能与你的关注方向有关')
  }

  return (
    <div
      className="signal-card"
      style={{
        display: 'flex',
        marginBottom: 6,
        borderRadius: 10,
        border: isCandidate ? '1.5px solid var(--success-color)' : '1px solid var(--border-color)',
        background: isCandidate ? 'rgba(16,185,129,0.02)' : 'var(--bg-secondary)',
        overflow: 'hidden',
        transition: 'all 0.2s cubic-bezier(0.25, 0.8, 0.25, 1)',
      }}
    >
      {/* Signal strength bar */}
      <div style={{
        width: 3,
        flexShrink: 0,
        background: isCandidate ? 'var(--success-color)' : barColor,
        transition: 'background 0.3s ease',
      }} />

      {/* Card body */}
      <div style={{ flex: 1, padding: '12px 14px 10px 12px', minWidth: 0 }}>

        {/* Row 1: Title + Star */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 4 }}>
          <div style={{
            flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--text-primary)',
            lineHeight: 1.45,
            display: '-webkit-box', WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical' as const, overflow: 'hidden',
          }}>
            {item.title || '无标题'}
          </div>
          <button
            onClick={onToggleStar}
            style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: 2,
              color: isStarred ? '#f59e0b' : 'var(--border-color)',
              fontSize: 13, flexShrink: 0, marginTop: 1,
              transition: 'color 0.15s ease',
            }}
          >
            {isStarred ? <StarFilled /> : <StarOutlined />}
          </button>
        </div>

        {/* Row 2: Content snippet */}
        {item.content && (
          <div style={{
            fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5,
            display: '-webkit-box', WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical' as const, overflow: 'hidden',
            marginBottom: 8,
          }}>
            {item.content.slice(0, 200)}
          </div>
        )}

        {/* Row 3: Meta tags */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
          {item.source && (
            <Tag bordered={false} style={{
              fontSize: 10, padding: '0 6px', lineHeight: '18px', borderRadius: 4,
              background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', margin: 0,
            }}>
              <GlobalOutlined style={{ fontSize: 9, marginRight: 3 }} />
              {item.source}
            </Tag>
          )}
          {category && (
            <Tag bordered={false} style={{
              fontSize: 10, padding: '0 6px', lineHeight: '18px', borderRadius: 4,
              background: category.bg, color: category.color, margin: 0,
            }}>
              {category.label}
            </Tag>
          )}
          {relevance !== 'low' && (
            <Tag bordered={false} style={{
              fontSize: 10, padding: '0 6px', lineHeight: '18px', borderRadius: 4,
              background: relTag.bg, color: relTag.color, margin: 0,
            }}>
              {relTag.label}
            </Tag>
          )}
          {timeAgo && (
            <span style={{
              fontSize: 10, color: 'var(--text-tertiary)', marginLeft: 'auto',
              display: 'flex', alignItems: 'center', gap: 3,
            }}>
              <FieldTimeOutlined style={{ fontSize: 9 }} />
              {timeAgo}
            </span>
          )}
        </div>

        {/* Row 4: Reason line + actions */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {reasons.length > 0 && (
            <div style={{
              fontSize: 10, color: 'var(--text-tertiary)', fontStyle: 'italic',
              flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {reasons.join(' · ')}
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0, marginLeft: 8 }}>
            {isCandidate ? (
              <Tag color="success" bordered={false} style={{
                fontSize: 10, borderRadius: 4, margin: 0, lineHeight: '18px', padding: '0 6px',
              }}>
                <CheckCircleOutlined /> 已入选
              </Tag>
            ) : (
              <>
                <Button
                  size="small" type="primary" ghost
                  onClick={onAddCandidate}
                  style={{ fontSize: 10, height: 22, borderRadius: 5, padding: '0 8px' }}
                >
                  <PlusOutlined /> 加入候选
                </Button>
                <Tooltip title="保存到收集箱">
                  <Button
                    size="small" type="text"
                    icon={<InboxOutlined style={{ fontSize: 11 }} />}
                    onClick={onSaveToInbox}
                    style={{ fontSize: 10, height: 22, color: 'var(--text-tertiary)' }}
                  />
                </Tooltip>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================================
// Inbox Mini Card
// ============================================================

function InboxMiniCard({
  item,
  index,
  onAddCandidate,
  onMarkLater,
  onIgnore,
  status,
}: {
  item: EnrichedItem
  index: number
  onAddCandidate: (idx: number) => void
  onMarkLater: (idx: number) => void
  onIgnore: (idx: number) => void
  status: CardStatus
}) {
  return (
    <div style={{
      padding: '10px 12px', marginBottom: 6, borderRadius: 8,
      border: status === 'candidate' ? '1.5px solid var(--success-color)'
        : status === 'ignored' ? '1px solid var(--border-color)'
        : '1px solid #f59e0b40',
      background: status === 'candidate' ? 'rgba(16,185,129,0.03)'
        : status === 'ignored' ? 'var(--bg-tertiary)' : 'var(--bg-primary)',
      opacity: status === 'ignored' ? 0.5 : 1,
      transition: 'all 0.2s ease',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <UserOutlined style={{ fontSize: 10, color: '#f59e0b' }} />
        <Tag bordered={false} style={{
          fontSize: 10, padding: '0 5px', lineHeight: '16px', borderRadius: 4,
          background: '#f59e0b20', color: '#f59e0b', margin: 0,
        }}>
          我的
        </Tag>
        {item._note && (
          <span style={{ fontSize: 10, color: 'var(--text-tertiary)', fontStyle: 'italic' }}>{item._note}</span>
        )}
      </div>
      <div style={{
        fontSize: 12, fontWeight: 600,
        color: status === 'ignored' ? 'var(--text-tertiary)' : 'var(--text-primary)',
        marginBottom: 4, lineHeight: 1.4,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {item.title || item.url || '无标题'}
      </div>
      {item.content && (
        <div style={{
          fontSize: 11, color: 'var(--text-tertiary)', lineHeight: 1.4,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 6,
        }}>
          {item.content.slice(0, 80)}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        {status === 'candidate' ? (
          <Tag color="success" bordered={false} style={{ fontSize: 10, borderRadius: 4, margin: 0, lineHeight: '16px', padding: '0 5px' }}>
            <CheckCircleOutlined /> 已入选
          </Tag>
        ) : status === 'ignored' ? (
          <Tag bordered={false} style={{ fontSize: 10, borderRadius: 4, margin: 0, lineHeight: '16px', padding: '0 5px', color: 'var(--text-tertiary)' }}>
            已忽略
          </Tag>
        ) : (
          <>
            <Button size="small" type="primary" ghost onClick={() => onAddCandidate(index)} style={{ fontSize: 10, height: 20, borderRadius: 4, padding: '0 6px' }}>
              加入候选
            </Button>
            <Tooltip title="稍后处理">
              <Button size="small" type="text" icon={<ClockCircleOutlined />} onClick={() => onMarkLater(index)} style={{ fontSize: 10, height: 20, color: 'var(--text-tertiary)' }} />
            </Tooltip>
            <Tooltip title="忽略">
              <Button size="small" type="text" icon={<EyeInvisibleOutlined />} onClick={() => onIgnore(index)} style={{ fontSize: 10, height: 20, color: 'var(--text-tertiary)' }} />
            </Tooltip>
          </>
        )}
      </div>
    </div>
  )
}

// ============================================================
// Main Component
// ============================================================

export default function DiscoverPanel({
  visible,
  onClose,
  fetchContents = [],
  manualContents = [],
  onProceedToOrganize,
  fetchSources = [],
  fetchConfig = {},
  onFetchConfigSave,
}: Props) {
  // Config modal
  const [fetchModalVisible, setFetchModalVisible] = useState(false)

  // Inline controls
  const [sensitivity, setSensitivity] = useState<SensitivityLevel>('balanced')
  const [freshness, setFreshness] = useState<FreshnessFilter>('today')
  const [search, setSearch] = useState('')

  // Radar state
  const [starredSet, setStarredSet] = useState<Set<number>>(new Set())
  const [candidateSet, setCandidateSet] = useState<Set<number>>(new Set())

  // Inbox state
  const [inboxExpanded, setInboxExpanded] = useState(false)
  const [inboxStatuses, setInboxStatuses] = useState<Map<number, CardStatus>>(new Map())
  const [savedToInbox, setSavedToInbox] = useState<EnrichedItem[]>([])
  const [quickPasteText, setQuickPasteText] = useState('')
  const [quickPasteVisible, setQuickPasteVisible] = useState(false)

  // User's configured topic
  const userTopic = (fetchConfig?.topic as string) || ''

  // ── Filtered signals ──────────────────────────────────────
  const filteredSignals = useMemo(() => {
    let items = [...fetchContents]

    // Text search
    if (search.trim()) {
      const q = search.toLowerCase()
      items = items.filter(m =>
        (m.title || '').toLowerCase().includes(q) ||
        (m.content || '').toLowerCase().includes(q)
      )
    }

    // Sensitivity filter (only when user has a topic configured)
    if (userTopic && sensitivity !== 'wide') {
      items = items.filter(item => {
        const rel = computeRelevance(item, userTopic)
        if (sensitivity === 'focused') return rel === 'high'
        return rel !== 'low'
      })
    }

    // Freshness filter (client-side best-effort)
    if (freshness !== 'recent') {
      const now = new Date()
      items = items.filter(item => {
        if (!item.published) return true
        try {
          const h = (now.getTime() - new Date(item.published).getTime()) / 3600000
          if (freshness === 'realtime') return h < 6
          if (freshness === 'today') return h < 24
          return true
        } catch { return true }
      })
    }

    return items
  }, [fetchContents, search, sensitivity, freshness, userTopic])

  // ── Stats ─────────────────────────────────────────────────
  const stats = useMemo(() => {
    const total = filteredSignals.length
    const highRelevance = userTopic
      ? filteredSignals.filter(i => computeRelevance(i, userTopic) === 'high').length
      : 0
    return { total, highRelevance }
  }, [filteredSignals, userTopic])

  // ── Inbox items ───────────────────────────────────────────
  const allInbox = useMemo(() => {
    const manual: EnrichedItem[] = manualContents.map(m => ({ ...m, _source_channel: 'manual' as const }))
    return [...manual, ...savedToInbox]
  }, [manualContents, savedToInbox])

  // ── Counts ────────────────────────────────────────────────
  const radarCandidateCount = candidateSet.size
  const inboxCandidateCount = Array.from(inboxStatuses.values()).filter(s => s === 'candidate').length
  const totalCandidates = radarCandidateCount + inboxCandidateCount
  const unprocessedInbox = allInbox.filter((_, i) => !inboxStatuses.has(i)).length

  // ── Actions ───────────────────────────────────────────────
  const toggleStar = useCallback((idx: number) => {
    setStarredSet(prev => { const n = new Set(prev); n.has(idx) ? n.delete(idx) : n.add(idx); return n })
  }, [])

  const addCandidate = useCallback((idx: number) => {
    setCandidateSet(prev => new Set(prev).add(idx))
    message.success({ content: '已加入本期候选', duration: 1.5, style: { marginTop: 60 } })
  }, [])

  const saveToInbox = useCallback((item: ContentItem) => {
    setSavedToInbox(prev => [...prev, { ...item, _source_channel: 'manual' as const, _note: '来自信号保存' }])
    message.info({ content: '已保存到收集箱', duration: 1.5, style: { marginTop: 60 } })
  }, [])

  const setInboxStatus = useCallback((idx: number, status: CardStatus) => {
    setInboxStatuses(prev => { const n = new Map(prev); n.set(idx, status); return n })
    if (status === 'candidate') message.success({ content: '已加入本期候选', duration: 1.5, style: { marginTop: 60 } })
  }, [])

  const handleQuickPaste = useCallback(() => {
    if (!quickPasteText.trim()) return
    const isUrl = /^https?:\/\//.test(quickPasteText.trim())
    setSavedToInbox(prev => [...prev, {
      title: isUrl ? quickPasteText.trim() : quickPasteText.trim().slice(0, 60),
      content: quickPasteText.trim(),
      url: isUrl ? quickPasteText.trim() : undefined,
      _source_channel: 'manual' as const,
      _note: '快速添加',
    }])
    setQuickPasteText('')
    setQuickPasteVisible(false)
    message.success({ content: '已添加到收集箱', duration: 1.5, style: { marginTop: 60 } })
  }, [quickPasteText])

  const handleProceed = useCallback(() => {
    const candidates: EnrichedItem[] = []
    candidateSet.forEach(idx => {
      if (fetchContents[idx]) candidates.push({ ...fetchContents[idx], _source_channel: 'auto' })
    })
    inboxStatuses.forEach((status, idx) => {
      if (status === 'candidate' && allInbox[idx]) candidates.push(allInbox[idx])
    })
    onProceedToOrganize?.(candidates)
    onClose()
  }, [candidateSet, inboxStatuses, fetchContents, allInbox, onProceedToOrganize, onClose])

  const handleFetchConfigSave = async (values: Record<string, any>) => {
    if (onFetchConfigSave) await onFetchConfigSave(values)
  }

  if (!visible) return null

  const inboxWidth = inboxExpanded ? 300 : 44

  // ── Sensitivity labels ────────────────────────────────────
  const sensitivityLabels: Record<SensitivityLevel, string> = { focused: '精准', balanced: '均衡', wide: '广泛' }
  const freshnessLabels: Record<FreshnessFilter, string> = { realtime: '实时', today: '今天', recent: '近三天' }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'var(--bg-primary)', display: 'flex', flexDirection: 'column',
    }}>

      {/* ==================== HEADER ==================== */}
      <div style={{
        height: 52, borderBottom: '1px solid var(--border-color)',
        background: 'var(--bg-secondary)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 20px', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 30, height: 30, borderRadius: 8,
            background: 'linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontSize: 14,
          }}>
            <RadarChartOutlined />
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.3 }}>
              今日信号
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', lineHeight: 1.2 }}>
              {stats.total > 0
                ? `${stats.total} 条信号${stats.highRelevance > 0 ? ` · ${stats.highRelevance} 条高度相关` : ''}`
                : '雷达待命中'}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Tooltip title="雷达设置">
            <Button
              type="text" icon={<RadarChartOutlined />}
              onClick={() => setFetchModalVisible(true)}
              style={{ color: 'var(--accent-primary)', borderRadius: 8 }}
            />
          </Tooltip>
          <Tooltip title="返回">
            <Button type="text" icon={<CloseOutlined />} onClick={onClose} style={{ color: 'var(--text-tertiary)' }} />
          </Tooltip>
        </div>
      </div>

      {/* ==================== BODY ==================== */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* ===== LEFT: Signal feed ===== */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>

          {/* ── Control Strip ── */}
          <div style={{
            padding: '8px 20px', borderBottom: '1px solid var(--border-light)',
            background: 'var(--bg-secondary)',
            display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0,
          }}>
            {/* Sensitivity toggle */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 11, color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>灵敏度</span>
              <div style={{ display: 'flex', background: 'var(--bg-tertiary)', borderRadius: 6, padding: 2 }}>
                {(['focused', 'balanced', 'wide'] as SensitivityLevel[]).map(level => {
                  const isActive = sensitivity === level
                  return (
                    <div
                      key={level}
                      onClick={() => setSensitivity(level)}
                      style={{
                        padding: '3px 10px', borderRadius: 5, fontSize: 11,
                        fontWeight: isActive ? 600 : 400,
                        color: isActive ? 'var(--accent-primary)' : 'var(--text-tertiary)',
                        background: isActive ? 'var(--bg-secondary)' : 'transparent',
                        boxShadow: isActive ? 'var(--shadow-sm)' : 'none',
                        cursor: 'pointer', transition: 'all 0.2s ease', whiteSpace: 'nowrap',
                      }}
                    >
                      {sensitivityLabels[level]}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Divider */}
            <div style={{ width: 1, height: 16, background: 'var(--border-color)' }} />

            {/* Freshness toggle */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 11, color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>时间</span>
              <div style={{ display: 'flex', gap: 4 }}>
                {(['realtime', 'today', 'recent'] as FreshnessFilter[]).map(f => {
                  const isActive = freshness === f
                  return (
                    <Tag
                      key={f} bordered={false}
                      onClick={() => setFreshness(f)}
                      style={{
                        fontSize: 11, borderRadius: 5, padding: '2px 8px', cursor: 'pointer', margin: 0,
                        background: isActive ? 'var(--accent-light)' : 'var(--bg-tertiary)',
                        color: isActive ? 'var(--accent-primary)' : 'var(--text-tertiary)',
                        fontWeight: isActive ? 600 : 400, transition: 'all 0.15s ease',
                      }}
                    >
                      {freshnessLabels[f]}
                    </Tag>
                  )
                })}
              </div>
            </div>

            {/* Spacer */}
            <div style={{ flex: 1 }} />

            {/* Search */}
            <div style={{ width: 180 }}>
              <Input
                prefix={<SearchOutlined style={{ color: 'var(--text-tertiary)', fontSize: 12 }} />}
                placeholder="搜索信号..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                allowClear size="small"
                style={{ borderRadius: 6, fontSize: 12 }}
              />
            </div>
          </div>

          {/* ── Signal Feed ── */}
          <div style={{ flex: 1, overflow: 'auto', padding: '12px 20px' }}>
            {filteredSignals.length === 0 ? (
              /* ── Empty State ── */
              <div style={{ padding: '80px 40px', textAlign: 'center', maxWidth: 400, margin: '0 auto' }}>
                <div style={{
                  width: 64, height: 64, borderRadius: 16,
                  background: 'linear-gradient(135deg, #2563eb10 0%, #7c3aed10 100%)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  margin: '0 auto 20px', color: 'var(--accent-primary)', fontSize: 28,
                }}>
                  <RadarChartOutlined />
                </div>
                {fetchContents.length === 0 ? (
                  <>
                    <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>
                      雷达正在待命
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.7, marginBottom: 24 }}>
                      告诉它你关注什么方向，它会帮你持续扫描全网信号。<br />
                      不需要逐个翻阅——有动静的时候，它会告诉你。
                    </div>
                    <Button
                      type="primary" icon={<RadarChartOutlined />}
                      onClick={() => setFetchModalVisible(true)}
                      style={{
                        borderRadius: 8, height: 36, fontSize: 13, fontWeight: 600,
                        background: 'var(--accent-primary)', borderColor: 'var(--accent-primary)',
                      }}
                    >
                      设定关注方向
                    </Button>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>
                      当前筛选下没有信号
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.7 }}>
                      试试调整灵敏度为「广泛」，或扩大时间范围
                    </div>
                  </>
                )}
              </div>
            ) : (
              /* ── Signal List ── */
              <>
                {/* Topic context hint */}
                {userTopic && (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '8px 12px', marginBottom: 10,
                    borderRadius: 8, background: 'var(--accent-light)',
                    fontSize: 11, color: 'var(--accent-primary)',
                  }}>
                    <RadarChartOutlined style={{ fontSize: 12 }} />
                    <span>围绕「{userTopic}」为你扫描</span>
                    <Button
                      type="link" size="small"
                      onClick={() => setFetchModalVisible(true)}
                      style={{ fontSize: 11, height: 'auto', padding: 0, color: 'var(--accent-primary)' }}
                    >
                      调整
                    </Button>
                  </div>
                )}

                {filteredSignals.map((item, idx) => {
                  const originalIdx = fetchContents.indexOf(item)
                  return (
                    <SignalCard
                      key={originalIdx}
                      item={item}
                      index={idx}
                      total={filteredSignals.length}
                      topic={userTopic}
                      onAddCandidate={() => addCandidate(originalIdx)}
                      onSaveToInbox={() => saveToInbox(item)}
                      onToggleStar={() => toggleStar(originalIdx)}
                      isCandidate={candidateSet.has(originalIdx)}
                      isStarred={starredSet.has(originalIdx)}
                    />
                  )
                })}
              </>
            )}
          </div>
        </div>

        {/* ===== RIGHT: Inbox sidebar ===== */}
        <div style={{
          width: inboxWidth, borderLeft: '1px solid var(--border-color)',
          background: 'var(--bg-secondary)',
          display: 'flex', flexDirection: 'column',
          transition: 'width 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)',
          overflow: 'hidden', flexShrink: 0,
        }}>
          {!inboxExpanded ? (
            /* Collapsed sidebar */
            <div
              onClick={() => setInboxExpanded(true)}
              style={{
                flex: 1, display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', gap: 10, padding: '20px 0', transition: 'background 0.2s',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-tertiary)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <LeftOutlined style={{ fontSize: 10, color: 'var(--text-tertiary)' }} />
              <div style={{
                writingMode: 'vertical-rl', fontSize: 11, fontWeight: 600,
                color: 'var(--text-secondary)', letterSpacing: 2,
              }}>
                收集箱
              </div>
              {unprocessedInbox > 0 && (
                <Badge count={unprocessedInbox} size="small" style={{ backgroundColor: '#f59e0b' }} />
              )}
              <InboxOutlined style={{ fontSize: 14, color: '#f59e0b' }} />
            </div>
          ) : (
            /* Expanded sidebar */
            <>
              <div style={{
                padding: '10px 12px', borderBottom: '1px solid var(--border-color)',
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <InboxOutlined style={{ color: '#f59e0b', fontSize: 13 }} />
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>收集箱</span>
                {unprocessedInbox > 0 && <Badge count={unprocessedInbox} size="small" style={{ backgroundColor: '#f59e0b' }} />}
                <Button type="text" size="small" icon={<RightOutlined />} onClick={() => setInboxExpanded(false)} style={{ marginLeft: 'auto', color: 'var(--text-tertiary)', fontSize: 10 }} />
              </div>

              <div style={{ flex: 1, overflow: 'auto', padding: '8px 10px' }}>
                {allInbox.length === 0 ? (
                  <div style={{ padding: 24, textAlign: 'center' }}>
                    <InboxOutlined style={{ fontSize: 24, color: 'var(--border-color)', marginBottom: 8 }} />
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)', lineHeight: 1.6 }}>
                      收集箱空空的<br />粘贴链接或文字，<br />或从信号中保存感兴趣的内容
                    </div>
                  </div>
                ) : (
                  allInbox.map((item, idx) => (
                    <InboxMiniCard
                      key={idx} item={item} index={idx}
                      onAddCandidate={(i: number) => setInboxStatus(i, 'candidate')}
                      onMarkLater={(i: number) => setInboxStatus(i, 'later')}
                      onIgnore={(i: number) => setInboxStatus(i, 'ignored')}
                      status={inboxStatuses.get(idx) || 'new'}
                    />
                  ))
                )}
              </div>

              {/* Quick paste */}
              <div style={{ padding: '8px 10px', borderTop: '1px solid var(--border-color)', background: 'var(--bg-primary)' }}>
                {quickPasteVisible ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <TextArea
                      value={quickPasteText}
                      onChange={e => setQuickPasteText(e.target.value)}
                      placeholder="粘贴链接、文字、笔记..."
                      autoSize={{ minRows: 2, maxRows: 4 }} autoFocus
                      style={{ fontSize: 11, borderRadius: 6, resize: 'none' }}
                      onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleQuickPaste() }}
                    />
                    <div style={{ display: 'flex', gap: 4 }}>
                      <Button size="small" type="primary" onClick={handleQuickPaste} disabled={!quickPasteText.trim()} style={{ fontSize: 10, height: 22, borderRadius: 5, flex: 1 }}>
                        添加
                      </Button>
                      <Button size="small" onClick={() => { setQuickPasteVisible(false); setQuickPasteText('') }} style={{ fontSize: 10, height: 22, borderRadius: 5 }}>
                        取消
                      </Button>
                    </div>
                    <div style={{ fontSize: 9, color: 'var(--text-tertiary)', textAlign: 'center' }}>Ctrl+Enter 快速添加</div>
                  </div>
                ) : (
                  <Button
                    type="dashed" block icon={<PlusOutlined />}
                    onClick={() => setQuickPasteVisible(true)}
                    style={{ borderRadius: 6, height: 28, fontSize: 10, color: 'var(--text-tertiary)', borderColor: 'var(--border-color)' }}
                  >
                    粘贴链接 / 文字
                  </Button>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ==================== BOTTOM BAR ==================== */}
      <div style={{
        height: 52, borderTop: '1px solid var(--border-color)',
        background: 'var(--bg-secondary)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 20px', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>本期候选</span>
          <Tag
            color={totalCandidates > 0 ? 'success' : undefined} bordered={false}
            style={{ fontSize: 12, fontWeight: 700, borderRadius: 6, margin: 0 }}
          >
            {totalCandidates} 条
          </Tag>
          {radarCandidateCount > 0 && (
            <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>({radarCandidateCount} 信号)</span>
          )}
          {inboxCandidateCount > 0 && (
            <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>({inboxCandidateCount} 收集箱)</span>
          )}

          {unprocessedInbox > 0 && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '3px 10px', borderRadius: 6,
              background: '#f59e0b10', border: '1px solid #f59e0b30', marginLeft: 8,
            }}>
              <InboxOutlined style={{ fontSize: 10, color: '#f59e0b' }} />
              <span style={{ fontSize: 10, color: '#f59e0b' }}>
                收集箱有 {unprocessedInbox} 条未处理
              </span>
              {!inboxExpanded && (
                <Button type="link" size="small" onClick={() => setInboxExpanded(true)} style={{ fontSize: 10, height: 'auto', padding: 0, color: '#f59e0b' }}>
                  查看
                </Button>
              )}
            </div>
          )}
        </div>

        <Button
          type="primary" size="large" icon={<ArrowRightOutlined />}
          onClick={handleProceed} disabled={totalCandidates === 0}
          style={{
            background: totalCandidates > 0 ? 'var(--accent-primary)' : undefined,
            borderColor: totalCandidates > 0 ? 'var(--accent-primary)' : undefined,
            borderRadius: 10, fontWeight: 600, fontSize: 13, height: 36, paddingInline: 20,
          }}
        >
          进入整理
        </Button>
      </div>

      {/* Fetch Config Modal */}
      <FetchConfigModal
        visible={fetchModalVisible}
        onClose={() => setFetchModalVisible(false)}
        initialConfig={fetchConfig}
        onSave={handleFetchConfigSave}
        sources={fetchSources}
      />
    </div>
  )
}
