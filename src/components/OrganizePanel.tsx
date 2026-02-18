import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { Input, Button, Tag, Tooltip, message, Modal, Select, Progress } from 'antd'
import {
  SearchOutlined,
  ArrowLeftOutlined,
  CloseOutlined,
  CheckCircleOutlined,
  ArrowRightOutlined,
  LeftOutlined,
  DeleteOutlined,
  HolderOutlined,
  MoreOutlined,
  UndoOutlined,
  ThunderboltOutlined,
  UnorderedListOutlined,
  FilterOutlined,
  ExperimentOutlined,
  EditOutlined,
} from '../icons/antdCompat'
import type { ContentItem } from '../types/workflow'
import { runFullAnalysis, PRIORITY_HINT_CONFIG, type AIAnalysisResult, type ItemAIHints, type TopicCluster } from '../utils/contentAnalysis'
import { PRIORITY_CONFIG, prioritySortKey, type Priority } from '../constants/priorities'
import { CATEGORY_RULES } from '../constants/categories'
import { detectCategory, getQualitySignals } from '../utils'
import { OrganizeAIService, type OrganizeConfig, type OrganizeResult, type OrganizeProgress } from '../services/organizeAI'

type ViewMode = 'quick' | 'detailed'

interface OrganizeItem extends ContentItem {
  _source_channel?: 'auto' | 'manual'
  _id: number
}

interface CandidateItem extends OrganizeItem {
  _priority: Priority
  _order: number
}

interface Props {
  visible: boolean
  onClose: () => void
  onBackToDiscover?: () => void
  contents: ContentItem[]
  userTopic?: string
  initialCandidates?: CandidateItem[]
  initialIgnoredIds?: number[]
  initialMode?: ViewMode
  onProceedToIdeate?: (candidates: CandidateItem[]) => void
  onStateChange?: (state: { candidates: CandidateItem[]; ignoredIds: number[]; mode: ViewMode }) => void
}


function PoolCard({
  item,
  mode,
  qualitySignals,
  category,
  onSelect,
  onIgnore,
  isIgnored,
  batchMode,
  isChecked,
  onToggleCheck,
  aiHints,
  showPriorityHint,
  showDuplicateHint,
  duplicateTitle,
}: {
  item: OrganizeItem
  mode: ViewMode
  qualitySignals: Array<{ icon: string; text: string }>
  category: ReturnType<typeof detectCategory>
  onSelect: () => void
  onIgnore: () => void
  isIgnored: boolean
  batchMode: boolean
  isChecked: boolean
  onToggleCheck: () => void
  aiHints?: ItemAIHints
  showPriorityHint?: boolean
  showDuplicateHint?: boolean
  duplicateTitle?: string
}) {
  if (isIgnored) {
    return null // ignored cards are hidden, shown in collapsed section
  }

  return (
    <div
      className="organize-pool-card"
      style={{
        display: 'flex',
        marginBottom: 6,
        borderRadius: 8,
        border: '1px solid var(--border-color)',
        background: 'var(--bg-secondary)',
        overflow: 'hidden',
        transition: 'all 0.2s cubic-bezier(0.25, 0.8, 0.25, 1)',
        animation: 'organizeCardIn 0.25s ease-out',
      }}
    >
      {/* Batch checkbox area */}
      {batchMode && (
        <div
          onClick={onToggleCheck}
          style={{
            width: 32, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', borderRight: '1px solid var(--border-light)',
            background: isChecked ? 'var(--accent-light)' : 'transparent',
            transition: 'background 0.15s ease',
          }}
        >
          <div style={{
            width: 16, height: 16, borderRadius: 4,
            border: isChecked ? '2px solid var(--accent-primary)' : '2px solid var(--border-color)',
            background: isChecked ? 'var(--accent-primary)' : 'transparent',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.15s ease',
          }}>
            {isChecked && <CheckCircleOutlined style={{ fontSize: 10, color: '#fff' }} />}
          </div>
        </div>
      )}

      {/* Card body */}
      <div style={{ flex: 1, padding: mode === 'quick' ? '8px 10px' : '10px 12px', minWidth: 0 }}>
        {/* Row 1: category dot + title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: mode === 'detailed' ? 4 : 0 }}>
          {category && (
            <span style={{
              width: 6, height: 6, borderRadius: '50%',
              background: category.color, flexShrink: 0,
            }} />
          )}
          {category && (
            <span style={{ fontSize: 10, color: category.color, flexShrink: 0 }}>{category.label}</span>
          )}
          <div style={{
            flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--text-primary)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            lineHeight: 1.4,
          }}>
            {item.title || '无标题'}
          </div>
        </div>

        {/* Row 2: quality signals (detailed mode or always for quick with signals) */}
        {mode === 'detailed' && (
          <>
            {item.content && (
              <div style={{
                fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                marginBottom: 4,
              }}>
                {item.content.slice(0, 120)}
              </div>
            )}
          </>
        )}

        {/* Row 3: quality tags */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
          {qualitySignals.map((sig, i) => (
            <span key={i} style={{ fontSize: 11, color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: 3 }}>
              <span style={{ fontSize: 10 }}>{sig.icon}</span>
              {sig.text}
            </span>
          ))}
        </div>

        {/* AI Hints Row */}
        {aiHints && (showPriorityHint || showDuplicateHint) && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 5, marginTop: 3, flexWrap: 'wrap',
            animation: 'fadeIn 0.2s ease',
          }}>
            {showPriorityHint && aiHints.priorityHint && (
              <Tooltip title={aiHints.priorityReason} placement="top">
                <span style={{
                  fontSize: 10, padding: '1px 6px', borderRadius: 4, lineHeight: '16px',
                  background: PRIORITY_HINT_CONFIG[aiHints.priorityHint].bg,
                  color: PRIORITY_HINT_CONFIG[aiHints.priorityHint].color,
                  cursor: 'default', transition: 'opacity 0.2s ease',
                }}>
                  {PRIORITY_HINT_CONFIG[aiHints.priorityHint].icon} {PRIORITY_HINT_CONFIG[aiHints.priorityHint].label}
                </span>
              </Tooltip>
            )}
            {showDuplicateHint && aiHints.duplicateOf !== undefined && (
              <Tooltip title={`与「${duplicateTitle}」高度相似 (${Math.round((aiHints.duplicateScore || 0) * 100)}%)`}>
                <span style={{
                  fontSize: 10, padding: '1px 6px', borderRadius: 4, lineHeight: '16px',
                  background: '#fef3c7', color: '#92400e', cursor: 'default',
                }}>
                  ⊘ 疑似重复
                </span>
              </Tooltip>
            )}
            {showDuplicateHint && aiHints.isLowDensity && (
              <Tooltip title={aiHints.noiseReason}>
                <span style={{
                  fontSize: 10, padding: '1px 6px', borderRadius: 4, lineHeight: '16px',
                  background: '#f3f4f6', color: '#9ca3af', cursor: 'default',
                }}>
                  △ {aiHints.noiseReason}
                </span>
              </Tooltip>
            )}
          </div>
        )}
      </div>

      {/* Action area */}
      {!batchMode && (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: 2, padding: '4px 8px', flexShrink: 0,
        }}>
          <Tooltip title="选入候选" placement="left">
            <Button
              type="primary" ghost size="small"
              onClick={onSelect}
              style={{ fontSize: 10, height: 24, borderRadius: 5, padding: '0 8px', width: 56 }}
            >
              选入
            </Button>
          </Tooltip>
          <Tooltip title="忽略" placement="left">
            <Button
              type="text" size="small"
              icon={<CloseOutlined style={{ fontSize: 10 }} />}
              onClick={onIgnore}
              style={{ fontSize: 10, height: 20, color: 'var(--text-tertiary)' }}
            />
          </Tooltip>
        </div>
      )}
    </div>
  )
}

// ============================================================
// Candidate Card (right side — decision-focused)
// ============================================================

function CandidateCard({
  item,
  qualitySignals,
  onRemove,
  onChangePriority,
  onDragStart,
  onDragOver,
  onDrop,
}: {
  item: CandidateItem
  qualitySignals: Array<{ icon: string; text: string }>
  onRemove: () => void
  onChangePriority: (p: Priority) => void
  onDragStart: () => void
  onDragOver: (e: React.DragEvent) => void
  onDrop: () => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const cfg = PRIORITY_CONFIG[item._priority]

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen])

  return (
    <div
      className="organize-candidate-card"
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      style={{
        display: 'flex',
        marginBottom: 8,
        borderRadius: 10,
        border: '1px solid var(--border-color)',
        background: cfg.bgColor,
        overflow: 'visible',
        transition: 'all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)',
        animation: 'organizeCandidateIn 0.3s ease-out',
        cursor: 'grab',
      }}
    >
      {/* Priority bar */}
      <div style={{
        width: 3, flexShrink: 0,
        background: cfg.barColor,
        borderRadius: '3px 0 0 3px',
        transition: 'background 0.3s ease',
        borderStyle: item._priority === 'backup' ? 'dashed' : 'solid',
      }} />

      {/* Card body */}
      <div style={{ flex: 1, padding: '12px 14px', minWidth: 0 }}>
        {/* Row 1: Title */}
        <div style={{
          fontSize: 14, fontWeight: 600, color: 'var(--text-primary)',
          lineHeight: 1.4, marginBottom: 4,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {item.title || '无标题'}
        </div>

        {/* Row 2: Content snippet */}
        {item.content && (
          <div style={{
            fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            marginBottom: 8,
          }}>
            {item.content.slice(0, 80)}
          </div>
        )}

        {/* Row 3: Priority tag + quality signals + actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {item._priority !== 'backup' && (
            <Tag bordered={false} style={{
              fontSize: 10, padding: '0 6px', lineHeight: '18px', borderRadius: 4,
              background: cfg.tagBg, color: cfg.tagColor, margin: 0, fontWeight: 600,
            }}>
              {cfg.label}
            </Tag>
          )}
          {qualitySignals.map((sig, i) => (
            <span key={i} style={{ fontSize: 10, color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: 2 }}>
              <span style={{ fontSize: 9 }}>{sig.icon}</span>
              {sig.text}
            </span>
          ))}

          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4, position: 'relative' }}>
            {/* Priority menu */}
            <div ref={menuRef} style={{ position: 'relative' }}>
              <Tooltip title="调整优先级">
                <Button
                  type="text" size="small"
                  icon={<MoreOutlined style={{ fontSize: 12 }} />}
                  onClick={() => setMenuOpen(!menuOpen)}
                  style={{ height: 22, width: 22, color: 'var(--text-tertiary)', borderRadius: 4 }}
                />
              </Tooltip>
              {menuOpen && (
                <div style={{
                  position: 'absolute', right: 0, top: 26, zIndex: 100,
                  background: 'var(--bg-secondary)', borderRadius: 8,
                  border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-soft)',
                  padding: 4, minWidth: 120,
                  animation: 'fadeIn 0.15s ease',
                }}>
                  {(['primary', 'important', 'backup'] as Priority[]).map(p => {
                    const pc = PRIORITY_CONFIG[p]
                    const isActive = item._priority === p
                    return (
                      <div
                        key={p}
                        onClick={() => { onChangePriority(p); setMenuOpen(false) }}
                        style={{
                          padding: '6px 10px', borderRadius: 6, cursor: 'pointer',
                          display: 'flex', alignItems: 'center', gap: 8,
                          background: isActive ? 'var(--bg-tertiary)' : 'transparent',
                          transition: 'background 0.15s ease',
                          fontSize: 12, color: 'var(--text-primary)',
                        }}
                        onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--bg-tertiary)' }}
                        onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent' }}
                      >
                        <span style={{
                          width: 8, height: 8, borderRadius: 2,
                          background: pc.barColor,
                          border: p === 'backup' ? '1px dashed #9ca3af' : 'none',
                        }} />
                        <span style={{ fontWeight: isActive ? 600 : 400 }}>{pc.label}</span>
                        {isActive && <CheckCircleOutlined style={{ fontSize: 10, color: 'var(--accent-primary)', marginLeft: 'auto' }} />}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Drag handle */}
            <Tooltip title="拖拽排序">
              <HolderOutlined style={{ fontSize: 12, color: 'var(--text-tertiary)', cursor: 'grab' }} />
            </Tooltip>
          </div>
        </div>
      </div>

      {/* Remove button */}
      <div style={{
        display: 'flex', alignItems: 'flex-start', padding: '10px 8px 0 0', flexShrink: 0,
      }}>
        <Tooltip title="移回信号池">
          <Button
            type="text" size="small"
            icon={<DeleteOutlined style={{ fontSize: 11 }} />}
            onClick={onRemove}
            style={{ height: 22, width: 22, color: 'var(--text-tertiary)', borderRadius: 4 }}
          />
        </Tooltip>
      </div>
    </div>
  )
}

// ============================================================
// Main Component
// ============================================================

export default function OrganizePanel({
  visible,
  onClose,
  onBackToDiscover,
  contents = [],
  userTopic = '',
  initialCandidates = [],
  initialIgnoredIds = [],
  initialMode = 'quick',
  onProceedToIdeate,
  onStateChange,
}: Props) {
  const mapToOrganizeItem = useCallback((item: ContentItem, index: number): OrganizeItem => {
    const inferredSource = (item as any)._source_channel === 'manual'
      || item.source === 'manual_input'
      || item.type === 'manual'
      ? 'manual'
      : 'auto'
    return {
      ...item,
      _id: index,
      _source_channel: inferredSource,
    }
  }, [])

  // View mode
  const [mode, setMode] = useState<ViewMode>(initialMode)

  // Ignored set
  const [ignoredIds, setIgnoredIds] = useState<Set<number>>(new Set(initialIgnoredIds))

  // Candidates
  const [candidates, setCandidates] = useState<CandidateItem[]>(initialCandidates)

  // Detailed mode extras
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [batchMode, setBatchMode] = useState(false)
  const [checkedIds, setCheckedIds] = useState<Set<number>>(new Set())

  // Drag state
  const [dragIdx, setDragIdx] = useState<number | null>(null)

  // ── AI Assistants ────────────────────────────────────────
  const [aiAssistants, setAiAssistants] = useState({
    clustering: false,
    priority: false,
    duplicates: false,
  })
  const [aiResult, setAiResult] = useState<AIAnalysisResult | null>(null)
  const [clusterExpanded, setClusterExpanded] = useState<Record<string, boolean>>({})
  const [editingClusterId, setEditingClusterId] = useState<string | null>(null)
  const [clusterNames, setClusterNames] = useState<Record<string, string>>({})

  // ── AI Full Organize Mode ────────────────────────────────
  const [aiOrgMode, setAiOrgMode] = useState<'off' | 'configuring' | 'processing' | 'reviewing'>('off')
  const [aiOrgConfig, setAiOrgConfig] = useState<Partial<OrganizeConfig>>({
    strictness: 'medium',
    userInstruction: '',
  })
  const [aiOrgResult, setAiOrgResult] = useState<OrganizeResult | null>(null)
  const [aiProcessedContents, setAiProcessedContents] = useState<ContentItem[]>([])
  const [llmConfig, setLlmConfig] = useState<{ apiBase: string; apiKey: string; model: string } | null>(null)
  const [aiOrgProgress, setAiOrgProgress] = useState<OrganizeProgress | null>(null)

  // Load LLM config from Settings (localStorage)
  useEffect(() => {
    if (!visible) return
    try {
      const settingsStr = localStorage.getItem('auto-podcast.settings.v1')
      if (!settingsStr) return
      
      const settings = JSON.parse(settingsStr)
      const organizeNode = settings?.apiConfig?.nodeOverrides?.organize
      
      // Check if organize node has custom config
      if (organizeNode?.overrideMode === 'custom' && organizeNode.apiKeySet) {
        setLlmConfig({
          apiKey: organizeNode.apiKey,
          apiBase: organizeNode.apiBase || 'https://api.openai.com/v1',
          model: organizeNode.apiModel || 'gpt-4o-mini',
        })
        return
      }
      
      // Otherwise use global text capability config
      const globalText = settings?.apiConfig?.global
      if (globalText?.textApiKeySet && globalText?.textApiKey) {
        setLlmConfig({
          apiKey: globalText.textApiKey,
          apiBase: globalText.textApiBase || 'https://api.openai.com/v1',
          model: globalText.textApiModel || 'gpt-4o-mini',
        })
      }
    } catch (err) {
      console.error('[OrganizePanel] Failed to load LLM config from Settings:', err)
    }
  }, [visible])

  // Timer for overstay nudge
  const [enterTime] = useState(() => Date.now())
  const [nudgeText, setNudgeText] = useState('')

  useEffect(() => {
    if (!visible) return
    const timer = setInterval(() => {
      const elapsed = (Date.now() - enterTime) / 1000
      if (elapsed > 180) {
        setNudgeText('整理不必完美，粗略选择就好。')
      }
    }, 30000)
    return () => clearInterval(timer)
  }, [visible, enterTime])

  // Build pool items (exclude candidates and ignored)
  const candidateIdSet = useMemo(() => new Set(candidates.map(c => c._id)), [candidates])

  const poolItems: OrganizeItem[] = useMemo(() => {
    let items = contents.map((c, i) => mapToOrganizeItem(c, i))

    // Exclude already-selected candidates
    items = items.filter(it => !candidateIdSet.has(it._id))

    // Exclude ignored (they go to collapsed section)
    items = items.filter(it => !ignoredIds.has(it._id))

    // Search filter (detailed mode)
    if (mode === 'detailed' && search.trim()) {
      const q = search.toLowerCase()
      items = items.filter(it =>
        (it.title || '').toLowerCase().includes(q) ||
        (it.content || '').toLowerCase().includes(q)
      )
    }

    // Category filter (detailed mode)
    if (mode === 'detailed' && activeCategory) {
      items = items.filter(it => {
        const cat = detectCategory(it)
        return cat && cat.id === activeCategory
      })
    }

    return items
  }, [contents, mapToOrganizeItem, candidateIdSet, ignoredIds, mode, search, activeCategory])

  // Ignored items for collapsed section
  const ignoredItems = useMemo(() => {
    return contents
      .map((c, i) => mapToOrganizeItem(c, i))
      .filter(it => ignoredIds.has(it._id))
  }, [contents, mapToOrganizeItem, ignoredIds])

  // ── AI Analysis ────────────────────────────────────────
  useEffect(() => {
    const anyEnabled = aiAssistants.clustering || aiAssistants.priority || aiAssistants.duplicates
    if (!anyEnabled || contents.length === 0) {
      setAiResult(null)
      return
    }
    const allItems = contents.map((c, i) => mapToOrganizeItem(c, i))
    const result = runFullAnalysis(allItems, userTopic)
    setAiResult(result)
    // Initialize cluster expanded state
    const expanded: Record<string, boolean> = {}
    result.clusters.forEach(c => { expanded[c.id] = true })
    setClusterExpanded(prev => {
      const next = { ...expanded }
      for (const key in prev) {
        if (key in next) next[key] = prev[key]
      }
      return next
    })
  }, [aiAssistants.clustering, aiAssistants.priority, aiAssistants.duplicates, contents, userTopic, mapToOrganizeItem])

  // Clustered pool items (when topic clustering is on)
  const clusteredPoolItems = useMemo(() => {
    if (!aiAssistants.clustering || !aiResult) return null
    const poolIdSet = new Set(poolItems.map(it => it._id))
    const clustered: Array<{ cluster: TopicCluster; items: OrganizeItem[] }> = []
    const assignedIds = new Set<number>()

    for (const cluster of aiResult.clusters) {
      const clusterItems = cluster.itemIds
        .filter(id => poolIdSet.has(id))
        .map(id => poolItems.find(it => it._id === id)!)
        .filter(Boolean)
      if (clusterItems.length > 0) {
        clustered.push({ cluster, items: clusterItems })
        clusterItems.forEach(it => assignedIds.add(it._id))
      }
    }

    const unclustered = poolItems.filter(it => !assignedIds.has(it._id))
    if (unclustered.length > 0) {
      clustered.push({
        cluster: { id: 'unclustered', name: '\u672a\u5206\u7ec4', color: '#9ca3af', bg: '#f9fafb', itemIds: [] },
        items: unclustered,
      })
    }
    return clustered
  }, [aiAssistants.clustering, aiResult, poolItems])

  // Sorted candidates (by priority then order)
  const sortedCandidates = useMemo(() => {
    return [...candidates].sort((a, b) => {
      const pa = prioritySortKey(a._priority)
      const pb = prioritySortKey(b._priority)
      if (pa !== pb) return pa - pb
      return a._order - b._order
    })
  }, [candidates])

  useEffect(() => {
    if (!visible) return
    onStateChange?.({
      candidates: sortedCandidates,
      ignoredIds: Array.from(ignoredIds),
      mode,
    })
  }, [visible, sortedCandidates, ignoredIds, mode])

  // Stats
  const primaryCount = candidates.filter(c => c._priority === 'primary').length
  const importantCount = candidates.filter(c => c._priority === 'important').length
  const backupCount = candidates.filter(c => c._priority === 'backup').length

  const duplicateStats = useMemo(() => {
    if (!aiAssistants.duplicates || !aiResult) {
      return { duplicateCount: 0, noiseCount: 0, total: 0, actionableIds: [] as number[] }
    }
    const poolIdSet = new Set(poolItems.map(it => it._id))
    let duplicateCount = 0
    let noiseCount = 0
    const actionableIds: number[] = []

    aiResult.hints.forEach((hint, id) => {
      if (!poolIdSet.has(id)) return
      const isDuplicate = hint.duplicateOf !== undefined
      const isNoise = Boolean(hint.isLowDensity)
      if (!isDuplicate && !isNoise) return
      if (isDuplicate) duplicateCount++
      if (isNoise) noiseCount++
      actionableIds.push(id)
    })

    return {
      duplicateCount,
      noiseCount,
      total: actionableIds.length,
      actionableIds,
    }
  }, [aiAssistants.duplicates, aiResult, poolItems])

  // ── Actions ────────────────────────────────────────────

  const selectItem = useCallback((item: OrganizeItem) => {
    setCandidates(prev => [...prev, {
      ...item,
      _priority: 'backup' as Priority,
      _order: prev.length,
    }])

    const count = candidates.length + 1
    if (count === 1) {
      message.success({ content: '好的开始。继续挑选。', duration: 1.5, style: { marginTop: 60 } })
    } else if (count === 5) {
      message.success({ content: '5 条素材已就绪，内容足够丰富了。', duration: 2, style: { marginTop: 60 } })
    } else if (count === 8) {
      message.warning({ content: '素材较多，构思阶段可能需要更多时间取舍。', duration: 2.5, style: { marginTop: 60 } })
    }
  }, [candidates.length])

  const ignoreItem = useCallback((id: number) => {
    setIgnoredIds(prev => new Set(prev).add(id))
  }, [])

  const restoreItem = useCallback((id: number) => {
    setIgnoredIds(prev => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }, [])

  const removeCandidate = useCallback((id: number) => {
    setCandidates(prev => prev.filter(c => c._id !== id))
  }, [])

  const changePriority = useCallback((id: number, priority: Priority) => {
    setCandidates(prev => prev.map(c => c._id === id ? { ...c, _priority: priority } : c))
  }, [])

  const batchSelect = useCallback(() => {
    const items = contents
      .map((c, i) => mapToOrganizeItem(c, i))
      .filter(it => checkedIds.has(it._id) && !candidateIdSet.has(it._id) && !ignoredIds.has(it._id))

    setCandidates(prev => [
      ...prev,
      ...items.map((it, i) => ({
        ...it,
        _priority: 'backup' as Priority,
        _order: prev.length + i,
      })),
    ])
    setCheckedIds(new Set())
    message.success({ content: `已选入 ${items.length} 条`, duration: 1.5, style: { marginTop: 60 } })
  }, [checkedIds, candidateIdSet, ignoredIds, contents, mapToOrganizeItem])

  const batchIgnore = useCallback(() => {
    setIgnoredIds(prev => {
      const next = new Set(prev)
      checkedIds.forEach(id => next.add(id))
      return next
    })
    setCheckedIds(new Set())
  }, [checkedIds])

  const applyDuplicateCleanup = useCallback(() => {
    if (duplicateStats.total === 0) {
      message.info({ content: '当前没有可精简条目', duration: 1.5, style: { marginTop: 60 } })
      return
    }
    setIgnoredIds(prev => {
      const next = new Set(prev)
      duplicateStats.actionableIds.forEach(id => next.add(id))
      return next
    })
    setCheckedIds(new Set())
    message.success({
      content: `已精简 ${duplicateStats.total} 条（重复 ${duplicateStats.duplicateCount}，低密度 ${duplicateStats.noiseCount}）`,
      duration: 2,
      style: { marginTop: 60 },
    })
  }, [duplicateStats])

  // Drag & drop reorder
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
  }, [])

  const handleDrop = useCallback((targetIdx: number) => {
    if (dragIdx === null || dragIdx === targetIdx) return
    setCandidates(prev => {
      const sorted = [...prev].sort((a, b) => {
        const pa = prioritySortKey(a._priority)
        const pb = prioritySortKey(b._priority)
        if (pa !== pb) return pa - pb
        return a._order - b._order
      })
      const item = sorted[dragIdx]
      const newList = sorted.filter((_, i) => i !== dragIdx)
      newList.splice(targetIdx, 0, item)
      return newList.map((c, i) => ({ ...c, _order: i }))
    })
    setDragIdx(null)
  }, [dragIdx])

  const handleProceed = useCallback(() => {
    onProceedToIdeate?.(sortedCandidates)
  }, [sortedCandidates, onProceedToIdeate])

  // ── AI Organize Handlers ──────────────────────────────
  const handleAIOrganizeStart = useCallback(async () => {
    setAiOrgMode('configuring')
  }, [])

  const handleAIOrganizeConfirm = useCallback(async () => {
    if (!llmConfig || !llmConfig.apiKey) {
      message.error({ content: '未配置 LLM，请先在 Settings → AI 能力接口 中配置', duration: 3 })
      return
    }

    setAiOrgMode('processing')

    try {
      const fullConfig: OrganizeConfig = {
        ...llmConfig,
        strictness: aiOrgConfig.strictness || 'medium',
        userInstruction: aiOrgConfig.userInstruction,
      }
      const service = new OrganizeAIService(fullConfig, (progress) => {
        setAiOrgProgress(progress)
      })
      const result = await service.runFullOrganize(contents.map((c, i) => mapToOrganizeItem(c, i)))
      
      setAiOrgResult(result)
      setAiProcessedContents(result.processed)
      setAiOrgMode('reviewing')
      
      message.success({
        content: `AI 整理完成：选入 ${result.stats.selected}，拒绝 ${result.stats.rejected}`,
        duration: 3,
        style: { marginTop: 60 },
      })
    } catch (error) {
      console.error('AI organize failed:', error)
      message.error({ content: `整理失败：${(error as Error).message}`, duration: 3 })
      setAiOrgMode('off')
    }
  }, [aiOrgConfig, llmConfig, contents, mapToOrganizeItem])

  const handleAIOrganizeAccept = useCallback(() => {
    if (!aiOrgResult) return

    const selected = aiProcessedContents.filter(i => i._ai_organize?.status === 'selected')
    const noise = aiProcessedContents.filter(i => i._ai_organize?.status === 'noise')
    const duplicate = aiProcessedContents.filter(i => i._ai_organize?.status === 'duplicate')

    setCandidates(selected.map((item, i) => {
      const orgItem = item as OrganizeItem
      return {
        ...orgItem,
        _priority: 'backup' as Priority,
        _order: i,
      }
    }))

    setIgnoredIds(new Set([
      ...noise.map(i => (i as OrganizeItem)._id),
      ...duplicate.map(i => (i as OrganizeItem)._id),
    ]))

    setAiOrgMode('off')
    message.success({ content: '已应用 AI 整理结果', duration: 2 })
  }, [aiOrgResult, aiProcessedContents])

  const handleAIOrganizeCancel = useCallback(() => {
    setAiOrgMode('off')
    setAiOrgResult(null)
    setAiProcessedContents([])
    setAiOrgProgress(null)
  }, [])

  // ── Ignored collapsed section ──────────────────────────
  const [ignoredExpanded, setIgnoredExpanded] = useState(false)

  if (!visible) return null

  const canProceed = candidates.length >= 1
  const suggestedMin = 3

  return (
    <div style={{
      position: 'fixed', top: 52, right: 0, bottom: 0, left: 148, zIndex: 1000,
      background: 'var(--bg-primary)', display: 'flex', flexDirection: 'column',
      animation: 'slideInRight 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
    }}>

      {/* ==================== TOP STATUS BAR ==================== */}
      <div style={{
        height: 52, borderBottom: '1px solid var(--border-color)',
        background: 'var(--bg-secondary)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 20px', flexShrink: 0,
      }}>
        {/* Left: title + stats */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 30, height: 30, borderRadius: 8,
            background: 'var(--bg-secondary)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontSize: 15,
          }}>
            夹
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.3 }}>
              本期整理
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', lineHeight: 1.2 }}>
              共 {contents.length} 条 · 已选 {candidates.length}{candidates.length < suggestedMin ? ` / 建议 ${suggestedMin}~5` : ''}
              {nudgeText && <span style={{ marginLeft: 8, color: 'var(--text-tertiary)', fontStyle: 'italic' }}>{nudgeText}</span>}
            </div>
          </div>
        </div>

        {/* Center: suggestion */}
        <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
          建议用时 &lt; 2 分钟
        </div>

        {/* Right: AI organize + mode switch + close */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {onBackToDiscover && (
            <Tooltip title="返回发现层">
              <Button
                icon={<LeftOutlined />}
                onClick={onBackToDiscover}
                style={{ borderRadius: 8, fontWeight: 500, fontSize: 12, height: 30 }}
              >
                返回发现
              </Button>
            </Tooltip>
          )}
          {/* AI Organize Button */}
          <Button
            type="primary"
            icon={<RobotOutlined />}
            onClick={handleAIOrganizeStart}
            style={{
              background: 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)',
              borderColor: 'transparent',
              borderRadius: 8,
              fontWeight: 600,
              fontSize: 12,
              height: 30,
              boxShadow: '0 2px 8px rgba(139,92,246,0.25)',
            }}
          >
            AI 智能整理
          </Button>
          {/* Mode switcher */}
          <div style={{ display: 'flex', background: 'var(--bg-tertiary)', borderRadius: 6, padding: 2 }}>
            {([
              { key: 'quick' as ViewMode, label: '快速', icon: <ThunderboltOutlined style={{ fontSize: 11 }} /> },
              { key: 'detailed' as ViewMode, label: '精细', icon: <UnorderedListOutlined style={{ fontSize: 11 }} /> },
            ]).map(m => {
              const isActive = mode === m.key
              return (
                <div
                  key={m.key}
                  onClick={() => {
                    setMode(m.key)
                    if (m.key === 'quick') {
                      setSearch('')
                      setActiveCategory(null)
                      setBatchMode(false)
                      setCheckedIds(new Set())
                    }
                  }}
                  style={{
                    padding: '4px 12px', borderRadius: 5, fontSize: 12,
                    fontWeight: isActive ? 600 : 400,
                    color: isActive ? 'var(--accent-primary)' : 'var(--text-tertiary)',
                    background: isActive ? 'var(--bg-secondary)' : 'transparent',
                    boxShadow: isActive ? 'var(--shadow-sm)' : 'none',
                    cursor: 'pointer', transition: 'all 0.2s ease',
                    display: 'flex', alignItems: 'center', gap: 5,
                  }}
                >
                  {m.icon} {m.label}
                </div>
              )
            })}
          </div>

          <Button
            type="primary"
            icon={<ArrowRightOutlined />}
            onClick={handleProceed}
            disabled={!canProceed}
            style={{
              background: canProceed ? 'var(--accent-primary)' : undefined,
              borderColor: canProceed ? 'var(--accent-primary)' : undefined,
              borderRadius: 8, fontWeight: 600, fontSize: 13, height: 32,
            }}
          >
            进入构思
          </Button>
          <Tooltip title="返回">
            <Button type="text" icon={<ArrowLeftOutlined />} onClick={onClose} style={{ color: 'var(--text-tertiary)' }} />
          </Tooltip>
        </div>
      </div>

      {/* ==================== BODY ==================== */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* ===== LEFT: Signal Pool (45%) ===== */}
        <div style={{
          flex: '0 0 45%', maxWidth: '45%',
          display: 'flex', flexDirection: 'column',
          borderRight: '1px solid var(--border-color)',
          background: 'var(--bg-primary)',
        }}>
          {/* Detailed mode toolbar */}
          {mode === 'detailed' && (
            <div style={{
              padding: '8px 16px', borderBottom: '1px solid var(--border-light)',
              background: 'var(--bg-secondary)',
              display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
              animation: 'organizeToolbarIn 0.2s ease-out',
            }}>
              <Input
                prefix={<SearchOutlined style={{ color: 'var(--text-tertiary)', fontSize: 12 }} />}
                placeholder="搜索..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                allowClear size="small"
                style={{ width: 140, borderRadius: 6, fontSize: 12 }}
              />

              <div style={{ width: 1, height: 16, background: 'var(--border-color)' }} />

              {/* Category tags */}
              <div style={{ display: 'flex', gap: 4, flex: 1, overflow: 'auto' }}>
                <Tag
                  bordered={false}
                  onClick={() => setActiveCategory(null)}
                  style={{
                    fontSize: 10, borderRadius: 5, padding: '2px 8px', cursor: 'pointer', margin: 0,
                    background: !activeCategory ? 'var(--accent-light)' : 'var(--bg-tertiary)',
                    color: !activeCategory ? 'var(--accent-primary)' : 'var(--text-tertiary)',
                    fontWeight: !activeCategory ? 600 : 400, transition: 'all 0.15s ease',
                    flexShrink: 0,
                  }}
                >
                  全部
                </Tag>
                {CATEGORY_RULES.map(cat => (
                  <Tag
                    key={cat.id} bordered={false}
                    onClick={() => setActiveCategory(activeCategory === cat.id ? null : cat.id)}
                    style={{
                      fontSize: 10, borderRadius: 5, padding: '2px 8px', cursor: 'pointer', margin: 0,
                      background: activeCategory === cat.id ? cat.bg : 'var(--bg-tertiary)',
                      color: activeCategory === cat.id ? cat.color : 'var(--text-tertiary)',
                      fontWeight: activeCategory === cat.id ? 600 : 400, transition: 'all 0.15s ease',
                      flexShrink: 0,
                    }}
                  >
                    {cat.label}
                  </Tag>
                ))}
              </div>

              <div style={{ width: 1, height: 16, background: 'var(--border-color)' }} />

              {/* Batch toggle */}
              <Tooltip title="批量选择">
                <Button
                  type={batchMode ? 'primary' : 'text'}
                  ghost={batchMode}
                  size="small"
                  icon={<FilterOutlined style={{ fontSize: 11 }} />}
                  onClick={() => { setBatchMode(!batchMode); setCheckedIds(new Set()) }}
                  style={{ fontSize: 10, height: 24, borderRadius: 5 }}
                />
              </Tooltip>
            </div>
          )}

          {/* Batch actions bar */}
          {batchMode && checkedIds.size > 0 && (
            <div style={{
              padding: '6px 16px', borderBottom: '1px solid var(--border-light)',
              background: 'var(--accent-light)',
              display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
              animation: 'fadeIn 0.15s ease',
            }}>
              <span style={{ fontSize: 11, color: 'var(--accent-primary)', fontWeight: 600 }}>
                已勾选 {checkedIds.size} 条
              </span>
              <Button type="primary" size="small" onClick={batchSelect}
                style={{ fontSize: 10, height: 22, borderRadius: 5, padding: '0 10px' }}>
                全部选入
              </Button>
              <Button size="small" onClick={batchIgnore}
                style={{ fontSize: 10, height: 22, borderRadius: 5, padding: '0 10px' }}>
                全部忽略
              </Button>
            </div>
          )}

          {/* 智能辅助开关 */}
          <div style={{
            padding: '5px 16px', borderBottom: '1px solid var(--border-light)',
            display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0,
            background: 'var(--bg-secondary)',
          }}>
            <ExperimentOutlined style={{ fontSize: 11, color: 'var(--text-tertiary)' }} />
            <span style={{ fontSize: 10, color: 'var(--text-tertiary)', marginRight: 2 }}>智能辅助</span>
            {([
              { key: 'clustering' as const, label: '\u4e3b\u9898\u5206\u7ec4', icon: '\u{1f3f7}' },
              { key: 'priority' as const, label: '\u4f18\u5148\u63d0\u793a', icon: '\u25c6' },
              { key: 'duplicates' as const, label: '\u91cd\u590d\u68c0\u6d4b', icon: '\u2298' },
            ] as const).map(a => {
              const isOn = aiAssistants[a.key]
              return (
                <div
                  key={a.key}
                  onClick={() => setAiAssistants(prev => ({ ...prev, [a.key]: !prev[a.key] }))}
                  style={{
                    padding: '2px 10px', borderRadius: 12, fontSize: 10,
                    cursor: 'pointer', transition: 'all 0.2s ease',
                    border: `1px solid ${isOn ? 'var(--accent-primary)' : 'var(--border-color)'}`,
                    background: isOn ? 'var(--accent-light)' : 'transparent',
                    color: isOn ? 'var(--accent-primary)' : 'var(--text-tertiary)',
                    fontWeight: isOn ? 600 : 400,
                    display: 'flex', alignItems: 'center', gap: 4,
                    userSelect: 'none', lineHeight: '18px',
                  }}
                >
                  <span style={{ fontSize: 10 }}>{a.icon}</span>
                  {a.label}
                </div>
              )
            })}
            {aiAssistants.duplicates && duplicateStats.total > 0 && (
              <>
                <span style={{ fontSize: 10, color: 'var(--text-tertiary)', marginLeft: 2 }}>
                  发现 {duplicateStats.total} 条可精简
                </span>
                <Button
                  size="small"
                  onClick={applyDuplicateCleanup}
                  style={{
                    height: 20,
                    borderRadius: 5,
                    fontSize: 10,
                    padding: '0 8px',
                  }}
                >
                  一键精简
                </Button>
              </>
            )}
          </div>

          {/* Pool list */}
          <div style={{ flex: 1, overflow: 'auto', padding: '12px 16px' }}>
            {poolItems.length === 0 && ignoredItems.length === 0 ? (
              <div style={{ padding: '60px 30px', textAlign: 'center' }}>
                <div style={{
                  width: 56, height: 56, borderRadius: 14,
                  background: 'var(--bg-tertiary)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  margin: '0 auto 16px', fontSize: 24,
                }}>
                  空
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>
                  还没有待整理的内容
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.6 }}>
                  回到「发现」添加你感兴趣的信号源，<br />系统会自动把它们送到这里。
                </div>
              </div>
            ) : poolItems.length === 0 ? (
              <div style={{ padding: '40px 30px', textAlign: 'center' }}>
                <div style={{ fontSize: 13, color: 'var(--text-tertiary)', lineHeight: 1.6 }}>
                  {search || activeCategory ? '当前筛选下没有信号' : '所有信号已处理完毕 好'}
                </div>
              </div>
            ) : (() => {
              const renderSingleCard = (item: OrganizeItem) => {
                const hints = aiResult?.hints.get(item._id)
                const dupTitle = hints?.duplicateOf !== undefined
                  ? (contents[hints.duplicateOf]?.title || '未知')
                  : undefined
                return (
                  <PoolCard
                    key={item._id}
                    item={item}
                    mode={mode}
                    qualitySignals={getQualitySignals(item, contents, userTopic)}
                    category={detectCategory(item)}
                    onSelect={() => selectItem(item)}
                    onIgnore={() => ignoreItem(item._id)}
                    isIgnored={false}
                    batchMode={batchMode}
                    isChecked={checkedIds.has(item._id)}
                    onToggleCheck={() => setCheckedIds(prev => {
                      const next = new Set(prev)
                      next.has(item._id) ? next.delete(item._id) : next.add(item._id)
                      return next
                    })}
                    aiHints={hints}
                    showPriorityHint={aiAssistants.priority}
                    showDuplicateHint={aiAssistants.duplicates}
                    duplicateTitle={dupTitle}
                  />
                )
              }

              if (aiAssistants.clustering && clusteredPoolItems) {
                return clusteredPoolItems.map(({ cluster, items: clusterItems }) => (
                  <div key={cluster.id} style={{ marginBottom: 10, animation: 'fadeIn 0.2s ease' }}>
                    {/* Cluster header */}
                    <div
                      onClick={() => setClusterExpanded(prev => ({ ...prev, [cluster.id]: !prev[cluster.id] }))}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '5px 8px', marginBottom: 4, borderRadius: 6,
                        cursor: 'pointer', userSelect: 'none',
                        background: cluster.bg,
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <span style={{
                        width: 7, height: 7, borderRadius: '50%',
                        background: cluster.color, flexShrink: 0,
                      }} />
                      {editingClusterId === cluster.id ? (
                        <Input
                          size="small"
                          defaultValue={clusterNames[cluster.id] || cluster.name}
                          onPressEnter={e => {
                            setClusterNames(prev => ({ ...prev, [cluster.id]: (e.target as HTMLInputElement).value }))
                            setEditingClusterId(null)
                          }}
                          onBlur={e => {
                            setClusterNames(prev => ({ ...prev, [cluster.id]: e.target.value }))
                            setEditingClusterId(null)
                          }}
                          autoFocus
                          onClick={e => e.stopPropagation()}
                          style={{ width: 120, height: 20, fontSize: 11, borderRadius: 4 }}
                        />
                      ) : (
                        <span style={{ fontSize: 11, fontWeight: 600, color: cluster.color }}>
                          {clusterNames[cluster.id] || cluster.name}
                        </span>
                      )}
                      <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
                        {clusterItems.length}
                      </span>
                      {cluster.id !== 'unclustered' && (
                        <Tooltip title="编辑分组名">
                          <EditOutlined
                            onClick={e => { e.stopPropagation(); setEditingClusterId(cluster.id) }}
                            style={{ fontSize: 10, color: 'var(--text-tertiary)', cursor: 'pointer' }}
                          />
                        </Tooltip>
                      )}
                      <span style={{
                        marginLeft: 'auto', fontSize: 10, color: 'var(--text-tertiary)',
                        transform: clusterExpanded[cluster.id] !== false ? 'rotate(90deg)' : 'rotate(0deg)',
                        transition: 'transform 0.2s ease', display: 'inline-block',
                      }}>▸</span>
                    </div>
                    {/* Cluster items */}
                    {clusterExpanded[cluster.id] !== false && (
                      <div style={{ animation: 'fadeIn 0.15s ease' }}>
                        {clusterItems.map(renderSingleCard)}
                      </div>
                    )}
                  </div>
                ))
              }

              return poolItems.map(renderSingleCard)
            })()}

            {/* Ignored collapsed section */}
            {ignoredItems.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div
                  onClick={() => setIgnoredExpanded(!ignoredExpanded)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '6px 0', cursor: 'pointer',
                    fontSize: 11, color: 'var(--text-tertiary)',
                  }}
                >
                  <span style={{
                    transform: ignoredExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                    transition: 'transform 0.2s ease', display: 'inline-block',
                  }}>
                    ▸
                  </span>
                  已忽略 ({ignoredItems.length})
                </div>
                {ignoredExpanded && (
                  <div style={{ animation: 'fadeIn 0.2s ease' }}>
                    {ignoredItems.map(item => (
                      <div key={item._id} style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '5px 8px', marginBottom: 3, borderRadius: 6,
                        background: 'var(--bg-tertiary)', opacity: 0.6,
                        fontSize: 12, color: 'var(--text-tertiary)',
                      }}>
                        <span style={{
                          flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {item.title || '无标题'}
                        </span>
                        <Tooltip title="恢复">
                          <Button
                            type="text" size="small"
                            icon={<UndoOutlined style={{ fontSize: 10 }} />}
                            onClick={() => restoreItem(item._id)}
                            style={{ height: 18, width: 18, color: 'var(--text-tertiary)' }}
                          />
                        </Tooltip>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ===== RIGHT: Candidate Area (55%) ===== */}
        <div style={{
          flex: '0 0 55%', maxWidth: '55%',
          display: 'flex', flexDirection: 'column',
          background: 'var(--bg-secondary)',
        }}>
          {/* Section header */}
          <div style={{
            padding: '10px 20px', borderBottom: '1px solid var(--border-light)',
            display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
          }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>本期候选</span>
            {primaryCount > 0 && (
              <Tag bordered={false} style={{
                fontSize: 10, padding: '0 6px', lineHeight: '18px', borderRadius: 4,
                background: '#dbeafe', color: '#1d4ed8', margin: 0,
              }}>
                准 主线 {primaryCount}
              </Tag>
            )}
            {importantCount > 0 && (
              <Tag bordered={false} style={{
                fontSize: 10, padding: '0 6px', lineHeight: '18px', borderRadius: 4,
                background: '#cffafe', color: '#0891b2', margin: 0,
              }}>
                重要 {importantCount}
              </Tag>
            )}
            {backupCount > 0 && (
              <Tag bordered={false} style={{
                fontSize: 10, padding: '0 6px', lineHeight: '18px', borderRadius: 4,
                background: '#f3f4f6', color: '#6b7280', margin: 0,
              }}>
                备用 {backupCount}
              </Tag>
            )}
          </div>

          {/* Candidate list */}
          <div style={{ flex: 1, overflow: 'auto', padding: '12px 20px' }}>
            {sortedCandidates.length === 0 ? (
              <div style={{ padding: '80px 40px', textAlign: 'center' }}>
                <div style={{
                  width: 56, height: 56, borderRadius: 14,
                  background: 'var(--bg-tertiary)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  margin: '0 auto 16px', fontSize: 24, color: 'var(--text-tertiary)',
                }}>
                  列
                </div>
                <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6 }}>
                  从左侧选择你认为值得讲的内容
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.6 }}>
                  建议选 3~5 条，太多会分散注意力。
                </div>
              </div>
            ) : (
              sortedCandidates.map((item, idx) => (
                <CandidateCard
                  key={item._id}
                  item={item}
                  qualitySignals={getQualitySignals(item, contents, userTopic)}
                  onRemove={() => removeCandidate(item._id)}
                  onChangePriority={(p) => changePriority(item._id, p)}
                  onDragStart={() => setDragIdx(idx)}
                  onDragOver={handleDragOver}
                  onDrop={() => handleDrop(idx)}
                />
              ))
            )}
          </div>
        </div>
      </div>

      {/* ==================== BOTTOM ACTION BAR ==================== */}
      <div style={{
        height: 52, borderTop: '1px solid var(--border-color)',
        background: 'var(--bg-secondary)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 20px', flexShrink: 0,
      }}>
        {/* Left: stats */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {primaryCount > 0 && (
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              准 主线 {primaryCount}
            </span>
          )}
          {importantCount > 0 && (
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              · 重要 {importantCount}
            </span>
          )}
          {backupCount > 0 && (
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              · 备用 {backupCount}
            </span>
          )}
          {candidates.length === 0 && (
            <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
              还未选择候选内容
            </span>
          )}
          {candidates.length > 0 && candidates.length < suggestedMin && (
            <span style={{ fontSize: 11, color: 'var(--text-tertiary)', fontStyle: 'italic', marginLeft: 8 }}>
              再选 {suggestedMin - candidates.length} 条即可
            </span>
          )}
        </div>

      </div>

      {/* ==================== AI Organize Modals ==================== */}
      
      {/* 1. Configuration Modal */}
      <Modal
        open={aiOrgMode === 'configuring'}
        title={<span style={{ fontSize: 16, fontWeight: 600 }}>🤖 AI 智能整理</span>}
        onCancel={handleAIOrganizeCancel}
        onOk={handleAIOrganizeConfirm}
        okText="开始整理"
        cancelText="取消"
        width={500}
      >
        <div style={{ padding: '12px 0' }}>
          {!llmConfig?.apiKey && (
            <div style={{
              marginBottom: 16,
              padding: 12,
              background: '#fff7e6',
              border: '1px solid #ffd591',
              borderRadius: 8,
              fontSize: 13,
              color: '#d46b08',
            }}>
              ⚠️ 未配置 LLM API，请先在 <strong>Settings → AI 能力接口</strong> 中配置
            </div>
          )}
          {llmConfig?.apiKey && (
            <div style={{
              marginBottom: 16,
              padding: 12,
              background: '#f6ffed',
              border: '1px solid #b7eb8f',
              borderRadius: 8,
              fontSize: 12,
              color: '#52c41a',
            }}>
              ✅ LLM 配置已加载（{llmConfig.model}）
            </div>
          )}
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6, display: 'block' }}>
              严格程度
            </label>
            <Select
              value={aiOrgConfig.strictness || 'medium'}
              onChange={value => setAiOrgConfig(prev => ({ ...prev, strictness: value }))}
              style={{ width: '100%' }}
              options={[
                { label: '宽松 - 尽可能保留素材', value: 'loose' },
                { label: '适中 - 平衡质量与数量', value: 'medium' },
                { label: '严格 - 只留高质量精品', value: 'strict' },
              ]}
            />
          </div>
          <div>
            <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6, display: 'block' }}>
              本期关注方向（可选）
            </label>
            <Input.TextArea
              placeholder="例如：关注 AI 在医疗领域的实际应用，忽略纯理论讨论"
              value={aiOrgConfig.userInstruction || ''}
              onChange={e => setAiOrgConfig(prev => ({ ...prev, userInstruction: e.target.value }))}
              autoSize={{ minRows: 2, maxRows: 4 }}
            />
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>
              AI 将根据您的指令筛选和评分素材
            </div>
          </div>
        </div>
      </Modal>

      {/* 2. Processing Modal */}
      <Modal
        open={aiOrgMode === 'processing'}
        title={<span style={{ fontSize: 16, fontWeight: 600 }}>🤖 AI 正在整理...</span>}
        footer={null}
        closable={false}
        width={600}
      >
        <div style={{ padding: '20px 0' }}>
          {/* Progress Bar */}
          {aiOrgProgress && (
            <div style={{ marginBottom: 24 }}>
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center',
                marginBottom: 8,
              }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                  {aiOrgProgress.stepLabel}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                  {aiOrgProgress.progress}%
                </div>
              </div>
              <Progress 
                percent={aiOrgProgress.progress} 
                status="active"
                strokeColor={{
                  '0%': '#8b5cf6',
                  '100%': '#6366f1',
                }}
                showInfo={false}
              />
              <div style={{ 
                fontSize: 12, 
                color: 'var(--text-secondary)', 
                marginTop: 6,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}>
                <span>{aiOrgProgress.message}</span>
                {aiOrgProgress.currentBatch && aiOrgProgress.totalBatches && (
                  <span style={{ 
                    fontSize: 11, 
                    color: 'var(--text-tertiary)',
                    background: 'var(--bg-tertiary)',
                    padding: '2px 8px',
                    borderRadius: 4,
                  }}>
                    批次 {aiOrgProgress.currentBatch}/{aiOrgProgress.totalBatches}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Step Indicator */}
          <div style={{ 
            display: 'flex', 
            gap: 8, 
            marginBottom: 20,
            justifyContent: 'center',
          }}>
            {(['denoise', 'cluster', 'select'] as const).map((step, idx) => {
              const labels = {
                denoise: '去噪',
                cluster: '聚类',
                select: '筛选',
              }
              const isActive = aiOrgProgress?.step === step
              const isPast = aiOrgProgress && ['denoise', 'cluster', 'select'].indexOf(aiOrgProgress.step) > idx
              
              return (
                <div
                  key={step}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    borderRadius: 8,
                    background: isActive ? 'var(--accent-light)' : isPast ? '#f0fdf4' : 'var(--bg-tertiary)',
                    border: `1.5px solid ${isActive ? 'var(--accent-primary)' : isPast ? '#10b981' : 'var(--border-color)'}`,
                    textAlign: 'center',
                    transition: 'all 0.3s ease',
                  }}
                >
                  <div style={{ 
                    fontSize: 11, 
                    fontWeight: 600,
                    color: isActive ? 'var(--accent-primary)' : isPast ? '#10b981' : 'var(--text-tertiary)',
                  }}>
                    {isPast ? '✓' : isActive ? <LoadingOutlined /> : `${idx + 1}`} {labels[step]}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Logs */}
          <div style={{
            maxHeight: 250,
            overflow: 'auto',
            background: 'var(--bg-tertiary)',
            borderRadius: 8,
            padding: 12,
            fontSize: 12,
            fontFamily: 'monospace',
            color: 'var(--text-secondary)',
            lineHeight: 1.6,
          }}>
            {aiOrgResult?.logs.map((log, i) => (
              <div key={i} style={{ marginBottom: 4 }}>
                <span style={{ color: 'var(--text-tertiary)' }}>[{i + 1}]</span> {log}
              </div>
            ))}
            {(!aiOrgResult || aiOrgResult?.logs.length === 0) && (
              <div style={{ color: 'var(--text-tertiary)', textAlign: 'center' }}>
                正在初始化...
              </div>
            )}
          </div>
        </div>
      </Modal>

      {/* 3. Review Modal */}
      <Modal
        open={aiOrgMode === 'reviewing'}
        title={<span style={{ fontSize: 16, fontWeight: 600 }}>✅ AI 整理完成 - 请审核</span>}
        onCancel={handleAIOrganizeCancel}
        width={700}
        footer={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
              您可以在下方查看结果，确认后应用到整理面板
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button onClick={handleAIOrganizeCancel}>取消</Button>
              <Button type="primary" onClick={handleAIOrganizeAccept}>
                应用结果
              </Button>
            </div>
          </div>
        }
      >
        <div style={{ padding: '12px 0' }}>
          {/* Stats */}
          {aiOrgResult && (
            <div style={{
              display: 'flex',
              gap: 12,
              marginBottom: 16,
              padding: 12,
              background: 'var(--bg-tertiary)',
              borderRadius: 8,
            }}>
              <div style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#10b981' }}>
                  {aiOrgResult.stats.selected}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>选入</div>
              </div>
              <div style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#f59e0b' }}>
                  {aiOrgResult.stats.rejected}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>拒绝</div>
              </div>
              <div style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#6b7280' }}>
                  {aiOrgResult.stats.noise}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>低质</div>
              </div>
              <div style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#ef4444' }}>
                  {aiOrgResult.stats.duplicate}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>重复</div>
              </div>
            </div>
          )}

          {/* Preview */}
          <div style={{ maxHeight: 400, overflow: 'auto' }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
              📋 选入预览 ({aiOrgResult?.stats.selected || 0} 条)
            </div>
            {aiProcessedContents
              .filter(i => i._ai_organize?.status === 'selected')
              .slice(0, 10)
              .map((item, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: '8px 10px',
                    marginBottom: 6,
                    borderRadius: 6,
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border-color)',
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 2 }}>
                    {item.title || '无标题'}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                    {item._ai_organize?.reason}
                  </div>
                </div>
              ))}
            {(aiOrgResult?.stats.selected || 0) > 10 && (
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textAlign: 'center', marginTop: 8 }}>
                还有 {(aiOrgResult?.stats.selected || 0) - 10} 条...
              </div>
            )}
          </div>
        </div>
      </Modal>
    </div>
  )
}
