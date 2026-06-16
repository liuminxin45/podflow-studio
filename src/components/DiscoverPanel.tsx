import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
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
  FireOutlined,
  ThunderboltOutlined,
  BulbOutlined,
  LikeOutlined,
  DislikeOutlined,
  CaretUpOutlined,
  AppstoreOutlined,
  UnorderedListOutlined,
  LoadingOutlined,
  TagOutlined,
  RobotOutlined,
  CaretDownOutlined,
} from '@ant-design/icons'
import FetchConfigModal from './FetchConfigModal'
import type { ContentItem } from '../types/workflow'
import { 
  detectCategory, 
  computeRelevance, 
  getRelevanceTag, 
  getSignalStrength, 
  getSignalColor,
  formatTimeAgo,
  tagUntaggedItems,
  loadLLMConfig,
  groupByCategory,
  getPriorityDisplay,
  getCategoryDisplay,
  countUntagged,
  type ClassifyProgress,
  type LLMConfig,
} from '../utils'

const { TextArea } = Input

// ============================================================
// Types
// ============================================================

type CardStatus = 'new' | 'candidate' | 'later' | 'ignored'
type SensitivityLevel = 'focused' | 'balanced' | 'wide'
type FreshnessFilter = 'realtime' | 'today' | 'recent'
type ViewMode = 'list' | 'grouped'
type SmartRankMode = 'balanced' | 'freshness' | 'topic'

type DiscoverPrefs = {
  sensitivity: SensitivityLevel
  freshness: FreshnessFilter
  viewMode: ViewMode
  llmAutoTagEnabled: boolean
  smartRankMode: SmartRankMode
}

type PersistedDiscoverCandidates = {
  candidateItems?: EnrichedItem[]
  savedToInbox?: EnrichedItem[]
  inboxStatuses?: Array<[number, CardStatus]>
}

const DISCOVER_PREFS_KEY = 'discover.panel.prefs.v1'

function loadDiscoverPrefs(): Partial<DiscoverPrefs> {
  try {
    if (typeof window === 'undefined') return {}
    const raw = window.localStorage.getItem(DISCOVER_PREFS_KEY)
    if (!raw) return {}
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

function saveDiscoverPrefs(prefs: Partial<DiscoverPrefs>) {
  try {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(DISCOVER_PREFS_KEY, JSON.stringify(prefs))
  } catch {
    // ignore localStorage failures
  }
}

function getContentIdentity(item: ContentItem): string {
  return `${item.url || ''}|${item.title || ''}|${item.source || ''}|${item.published || ''}`
}

interface EnrichedItem extends ContentItem {
  _source_channel?: 'auto' | 'manual'
  _status?: CardStatus
  _starred?: boolean
  _note?: string
}

interface HighlightItem extends ContentItem {
  _itemKey: string
  _score: number
  _reasons: string[]
  _category?: { id: string; label: string; color: string; bg: string }
}

interface AnomalyTrend {
  categoryId: string
  label: string
  color: string
  count: number
  message: string
}

type FeedbackType = 'more' | 'less'

interface Props {
  visible: boolean
  onClose: () => void
  fetchContents: ContentItem[]
  manualContents: ContentItem[]
  initialCandidateItems?: EnrichedItem[]
  initialSavedToInbox?: EnrichedItem[]
  initialInboxStatuses?: Array<[number, CardStatus]>
  onProceedToOrganize?: (candidates: EnrichedItem[]) => void
  onStateChange?: (state: PersistedDiscoverCandidates & { candidates: EnrichedItem[] }) => void
  fetchSources?: Array<{ id: string; name: string; description: string }>
  fetchConfig?: Record<string, any>
  onFetchConfigSave?: (config: Record<string, any>) => Promise<void>
  radarState?: {
    enabled: boolean
    intervalMin: number
    keepLast: number
    lastRunAt: string | null
    lastError: string | null
    running: boolean
  } | null
  onRadarRunOnce?: (config: Record<string, any>) => Promise<any>
  onClearContents?: () => Promise<void>
  onUpdateContents?: (contents: ContentItem[]) => Promise<void>
}

function detectAnomalyTrends(items: ContentItem[]): AnomalyTrend[] {
  if (items.length < 5) return []
  const categoryCounts = new Map<string, { count: number; label: string; color: string }>()
  for (const item of items) {
    const cat = detectCategory(item)
    if (cat) {
      const existing = categoryCounts.get(cat.id) || { count: 0, label: cat.label, color: cat.color }
      existing.count++
      categoryCounts.set(cat.id, existing)
    }
  }
  const avgCount = items.length / Math.max(categoryCounts.size, 1)
  const anomalies: AnomalyTrend[] = []
  categoryCounts.forEach((val, key) => {
    if (val.count >= 3 && val.count >= avgCount * 1.5) {
      anomalies.push({
        categoryId: key,
        label: val.label,
        color: val.color,
        count: val.count,
        message: `「${val.label}」方向出现 ${val.count} 条密集信号`,
      })
    }
  })
  return anomalies.slice(0, 2)
}

// ============================================================
// Today's Highlight Card
// ============================================================

function TodayHighlightCard({
  item,
  onAddCandidate,
  onSaveToInbox,
  onFeedback,
  isCandidate,
  feedbackGiven,
}: {
  item: HighlightItem
  onAddCandidate: () => void
  onSaveToInbox: () => void
  onFeedback: (type: FeedbackType) => void
  isCandidate: boolean
  feedbackGiven?: FeedbackType
}) {
  const category = item._category
  const timeAgo = formatTimeAgo(item.published)

  return (
    <div
      className="highlight-card"
      style={{
        position: 'relative',
        borderRadius: 12,
        border: isCandidate ? '1.5px solid var(--success-color)' : '1px solid var(--border-color)',
        background: isCandidate ? 'rgba(16,185,129,0.02)' : 'var(--bg-secondary)',
        overflow: 'hidden',
        transition: 'all 0.25s cubic-bezier(0.25, 0.8, 0.25, 1)',
      }}
    >
      {/* Gradient left accent */}
      <div style={{
        position: 'absolute', left: 0, top: 0, bottom: 0, width: 3,
        background: isCandidate
          ? 'var(--success-color)'
          : 'linear-gradient(180deg, #2563eb 0%, #7c3aed 100%)',
      }} />

      <div style={{ padding: '14px 16px 12px 16px' }}>
        {/* Title row */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
          <div style={{
            flex: 1, fontSize: 13.5, fontWeight: 600, color: 'var(--text-primary)',
            lineHeight: 1.45,
            display: '-webkit-box', WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical' as const, overflow: 'hidden',
          }}>
            {item.title || '无标题'}
          </div>
          {timeAgo && (
            <span style={{
              fontSize: 10, color: 'var(--text-tertiary)', flexShrink: 0,
              display: 'flex', alignItems: 'center', gap: 3, marginTop: 2,
            }}>
              <FieldTimeOutlined style={{ fontSize: 9 }} />
              {timeAgo}
            </span>
          )}
        </div>

        {/* Content snippet */}
        {item.content && (
          <div style={{
            fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.55,
            display: '-webkit-box', WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical' as const, overflow: 'hidden',
            marginBottom: 10,
          }}>
            {item.content.slice(0, 200)}
          </div>
        )}

        {/* Recommendation reasons — transparent */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '5px 10px', borderRadius: 6,
          background: 'var(--accent-light)',
          marginBottom: 10,
        }}>
          <BulbOutlined style={{ fontSize: 11, color: 'var(--accent-primary)', flexShrink: 0 }} />
          <span style={{ fontSize: 11, color: 'var(--accent-primary)', lineHeight: 1.4 }}>
            {item._reasons.join(' · ')}
          </span>
        </div>

        {/* Meta tags + Actions */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
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
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
            {/* Feedback buttons */}
            <Tooltip title="多一点这种">
              <button
                onClick={() => onFeedback('more')}
                className="highlight-feedback-btn"
                style={{
                  background: feedbackGiven === 'more' ? 'var(--accent-light)' : 'transparent',
                  border: feedbackGiven === 'more' ? '1px solid var(--accent-primary)' : '1px solid var(--border-color)',
                  borderRadius: 5, padding: '2px 6px', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 3,
                  color: feedbackGiven === 'more' ? 'var(--accent-primary)' : 'var(--text-tertiary)',
                  fontSize: 10, transition: 'all 0.15s ease',
                }}
              >
                <LikeOutlined style={{ fontSize: 10 }} />
              </button>
            </Tooltip>
            <Tooltip title="少一点这种">
              <button
                onClick={() => onFeedback('less')}
                className="highlight-feedback-btn"
                style={{
                  background: feedbackGiven === 'less' ? '#fef2f2' : 'transparent',
                  border: feedbackGiven === 'less' ? '1px solid #fca5a5' : '1px solid var(--border-color)',
                  borderRadius: 5, padding: '2px 6px', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 3,
                  color: feedbackGiven === 'less' ? '#ef4444' : 'var(--text-tertiary)',
                  fontSize: 10, transition: 'all 0.15s ease',
                }}
              >
                <DislikeOutlined style={{ fontSize: 10 }} />
              </button>
            </Tooltip>

            {/* Divider */}
            <div style={{ width: 1, height: 14, background: 'var(--border-color)', margin: '0 2px' }} />

            {/* Actions */}
            {isCandidate ? (
              <Tag color="success" bordered={false} style={{
                fontSize: 10, borderRadius: 4, margin: 0, lineHeight: '18px', padding: '0 6px',
              }}>
                <CheckCircleOutlined /> 已入选
              </Tag>
            ) : (
              <>
                <Button
                  size="small" type="primary"
                  onClick={onAddCandidate}
                  style={{ fontSize: 10, height: 22, borderRadius: 5, padding: '0 10px' }}
                >
                  <PlusOutlined /> 加入整理
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
// Trend Alert Banner
// ============================================================

function TrendAlertBanner({ trend, delay = 0 }: { trend: AnomalyTrend; delay?: number }) {
  return (
    <div
      className="trend-alert-banner"
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 12px', marginBottom: 8, borderRadius: 8,
        background: `${trend.color}08`,
        border: `1px solid ${trend.color}20`,
        animation: `trendAlertIn 0.3s ease ${delay}s both`,
      }}
    >
      <CaretUpOutlined style={{ fontSize: 11, color: trend.color }} />
      <span style={{ fontSize: 11, color: trend.color, fontWeight: 500 }}>
        {trend.message}
      </span>
      <FireOutlined style={{ fontSize: 10, color: trend.color, opacity: 0.5, marginLeft: 'auto' }} />
    </div>
  )
}

// ============================================================
// Trend Radar Intelligence
// ============================================================

function generateHighlightReasons(
  item: ContentItem,
  relevance: 'high' | 'medium' | 'low',
  category: ReturnType<typeof detectCategory>,
  topic: string,
): string[] {
  const reasons: string[] = []
  if (relevance === 'high' && topic) {
    const firstTopic = topic.split(/[,，]/)[0]?.trim()
    if (firstTopic) reasons.push(`与「${firstTopic}」高度相关`)
  } else if (relevance === 'medium' && topic) {
    reasons.push('可能与你的关注方向有关')
  }
  if (category) reasons.push(`${category.label}领域`)
  if (item.published) {
    try {
      const hours = (Date.now() - new Date(item.published).getTime()) / 3600000
      if (hours < 6) reasons.push('近期热度上升')
      else if (hours < 12) reasons.push('今日新动态')
    } catch { /* ignore */ }
  }
  if (item.source) reasons.push('多来源报道')
  if (reasons.length === 0) reasons.push('综合信号强度较高')
  return reasons
}

function selectTodayHighlights(
  items: ContentItem[],
  topic: string,
  maxCount = 3,
  feedbackMap?: Map<string, FeedbackType>,
  allItems?: ContentItem[],
): HighlightItem[] {
  if (items.length === 0) return []

  // Build feedback category preferences from user feedback
  const categoryBoost = new Map<string, number>()
  if (feedbackMap && allItems) {
    const sourceByKey = new Map<string, ContentItem>()
    for (const sourceItem of allItems) {
      sourceByKey.set(getContentIdentity(sourceItem), sourceItem)
    }
    feedbackMap.forEach((type, itemKey) => {
      const feedbackItem = sourceByKey.get(itemKey)
      if (!feedbackItem) return
      const cat = detectCategory(feedbackItem)
      const catId = cat?.id || '_general'
      const current = categoryBoost.get(catId) || 0
      categoryBoost.set(catId, current + (type === 'more' ? 15 : -20))
    })
  }

  const scored = items.map((item, index) => {
    let score = 0
    const relevance = computeRelevance(item, topic)
    if (relevance === 'high') score += 30
    else if (relevance === 'medium') score += 15

    if (item.published) {
      try {
        const hours = (Date.now() - new Date(item.published).getTime()) / 3600000
        if (hours < 6) score += 20
        else if (hours < 12) score += 15
        else if (hours < 24) score += 10
      } catch { /* ignore */ }
    }

    const category = detectCategory(item)
    if (category) score += 10

    const strength = getSignalStrength(index, items.length)
    if (strength === 'hot') score += 15
    else if (strength === 'warm') score += 5

    // Apply user feedback: boost/demote by category preference
    const catId = category?.id || '_general'
    score += (categoryBoost.get(catId) || 0)

    return { item, index, score, relevance, category }
  })

  scored.sort((a, b) => b.score - a.score)
  const selected: typeof scored = []
  const usedCategories = new Set<string>()

  for (const s of scored) {
    if (selected.length >= maxCount) break
    const catId = s.category?.id || '_general'
    if (
      usedCategories.has(catId) &&
      scored.some(x => !selected.includes(x) && !usedCategories.has(x.category?.id || '_general'))
    ) continue
    selected.push(s)
    usedCategories.add(catId)
  }

  while (selected.length < maxCount && selected.length < scored.length) {
    const next = scored.find(s => !selected.includes(s))
    if (next) selected.push(next)
    else break
  }

  return selected.map(s => ({
    ...s.item,
    _itemKey: getContentIdentity(s.item),
    _score: s.score,
    _reasons: generateHighlightReasons(s.item, s.relevance, s.category, topic),
    _category: s.category || undefined,
  }))
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
          {/* AI classification tag — pure LLM, no keyword fallback */}
          {item._tagged && item._classification ? (() => {
            const cls = item._classification
            const display = getCategoryDisplay(cls.categoryId)
            return (
              <Tag bordered={false} style={{
                fontSize: 10, padding: '0 6px', lineHeight: '18px', borderRadius: 4,
                background: display.bg, color: display.color, margin: 0,
              }}>
                <TagOutlined style={{ fontSize: 8, marginRight: 2 }} />
                {cls.categoryLabel}
              </Tag>
            )
          })() : (
            <Tag bordered={false} style={{
              fontSize: 10, padding: '0 6px', lineHeight: '18px', borderRadius: 4,
              background: '#f3f4f6', color: '#9ca3af', margin: 0,
            }}>
              未分类
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
  initialCandidateItems = [],
  initialSavedToInbox = [],
  initialInboxStatuses = [],
  onProceedToOrganize,
  onStateChange,
  fetchSources = [],
  fetchConfig = {},
  onFetchConfigSave,
  radarState,
  onRadarRunOnce,
  onClearContents,
  onUpdateContents,
}: Props) {
  const initialPrefs = loadDiscoverPrefs()
  const initialCandidateState: PersistedDiscoverCandidates = {
    candidateItems: initialCandidateItems,
    savedToInbox: initialSavedToInbox,
    inboxStatuses: initialInboxStatuses,
  }

  // Config modal
  const [fetchModalVisible, setFetchModalVisible] = useState(false)

  // Inline controls
  const [sensitivity, setSensitivity] = useState<SensitivityLevel>(
    (initialPrefs.sensitivity as SensitivityLevel) || 'balanced',
  )
  const [freshness, setFreshness] = useState<FreshnessFilter>(
    (initialPrefs.freshness as FreshnessFilter) || 'recent',
  )
  const [search, setSearch] = useState('')

  // Radar state
  const [starredSet, setStarredSet] = useState<Set<string>>(new Set())
  const [candidateItems, setCandidateItems] = useState<EnrichedItem[]>(initialCandidateState.candidateItems || [])
  const [candidateSet, setCandidateSet] = useState<Set<string>>(
    new Set((initialCandidateState.candidateItems || []).map(getContentIdentity)),
  )

  // Inbox state
  const [inboxExpanded, setInboxExpanded] = useState(false)
  const [inboxStatuses, setInboxStatuses] = useState<Map<number, CardStatus>>(
    new Map(initialCandidateState.inboxStatuses || []),
  )
  const [savedToInbox, setSavedToInbox] = useState<EnrichedItem[]>(initialCandidateState.savedToInbox || [])
  const [quickPasteText, setQuickPasteText] = useState('')
  const [quickPasteVisible, setQuickPasteVisible] = useState(false)
  const [runningRadarOnce, setRunningRadarOnce] = useState(false)

  // Trend Radar feedback
  const [feedbackMap, setFeedbackMap] = useState<Map<string, FeedbackType>>(new Map())

  // LLM Classification state
  const [viewMode, setViewMode] = useState<ViewMode>((initialPrefs.viewMode as ViewMode) || 'list')
  const [smartRankMode, setSmartRankMode] = useState<SmartRankMode>(
    (initialPrefs.smartRankMode as SmartRankMode) || 'balanced',
  )
  const [classifyProgress, setClassifyProgress] = useState<ClassifyProgress>({ total: 0, tagged: 0, untagged: 0, status: 'idle' })
  const [llmConfig, setLlmConfig] = useState<LLMConfig | null>(null)
  const [llmConfigReady, setLlmConfigReady] = useState(false) // true after config load attempt completes
  const llmConfigLoaded = useRef(false)
  const taggingInProgress = useRef(false)
  const fetchContentsRef = useRef(fetchContents)
  const abortControllerRef = useRef<AbortController | null>(null)
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const [tagVersion, setTagVersion] = useState(0) // bump to force re-render after tagging
  const [llmAutoTagEnabled, setLlmAutoTagEnabled] = useState(Boolean(initialPrefs.llmAutoTagEnabled))
  const [retryTrigger, setRetryTrigger] = useState(0) // bump to force auto-tag re-trigger on retry
  const [taggingCycle, setTaggingCycle] = useState(0) // bump when a tagging run fully settles

  // User's configured topic
  const userTopic = (fetchConfig?.topic as string) || ''

  // Derived: count untagged items
  const untaggedCount = useMemo(() => countUntagged(fetchContents), [fetchContents, tagVersion])

  useEffect(() => {
    fetchContentsRef.current = fetchContents
  }, [fetchContents])

  // ── Load LLM config on mount ──────────────────────────────
  useEffect(() => {
    if (llmConfigLoaded.current || !visible) return
    llmConfigLoaded.current = true
    loadLLMConfig().then(config => {
      if (config) {
        console.log('[DiscoverPanel] LLM config loaded:', config.model)
        setLlmConfig(config)
      } else {
        console.log('[DiscoverPanel] No LLM config found')
      }
    }).catch(err => {
      console.warn('[DiscoverPanel] Failed to load LLM config:', err)
    }).finally(() => {
      setLlmConfigReady(true)
    })
  }, [visible])

  // Persist discover panel interaction preferences
  useEffect(() => {
    saveDiscoverPrefs({ sensitivity, freshness, viewMode, llmAutoTagEnabled, smartRankMode })
  }, [sensitivity, freshness, viewMode, llmAutoTagEnabled, smartRankMode])

  // ── Auto-tag: ONLY when toggle is ON + LLM config ready ───
  useEffect(() => {
    if (!visible || !llmAutoTagEnabled || !llmConfigReady || fetchContentsRef.current.length === 0) return
    if (taggingInProgress.current) return

    // Must have LLM config to auto-tag (no silent keyword fallback)
    if (!llmConfig) {
      console.log('[DiscoverPanel] LLM auto-tag enabled but no LLM config available')
      return
    }

    const items = fetchContentsRef.current
    const currentUntagged = countUntagged(items)
    if (currentUntagged === 0) {
      setClassifyProgress({ total: items.length, tagged: items.length, untagged: 0, status: 'done', detail: '无需分类' })
      return
    }

    console.log(`[DiscoverPanel] Auto-tag: ${currentUntagged} untagged items, starting LLM classification...`)
    taggingInProgress.current = true
    const ac = new AbortController()
    abortControllerRef.current = ac

    const doTag = async () => {
      try {
        const itemsToTag = fetchContentsRef.current
        const newlyTagged = await tagUntaggedItems(itemsToTag, llmConfig, (progress) => {
          setClassifyProgress(progress)
        }, ac.signal)
        console.log(`[DiscoverPanel] Auto-tag complete: ${newlyTagged} items tagged`)
        setTagVersion(v => v + 1)
        // Save tagged state back to backend
        if (onUpdateContents && newlyTagged > 0) {
          onUpdateContents(itemsToTag).catch(err =>
            console.warn('[DiscoverPanel] Failed to save tagged state:', err)
          )
        }
      } catch (err: any) {
        if (err?.name === 'AbortError' || ac.signal.aborted) {
          console.log('[DiscoverPanel] Tagging stopped by user')
        } else {
          console.warn('[DiscoverPanel] Auto-tag failed:', err)
          setClassifyProgress(prev => ({ ...prev, status: 'error', error: String(err) }))
        }
      } finally {
        taggingInProgress.current = false
        abortControllerRef.current = null
        setTaggingCycle(v => v + 1)
      }
    }

    const timer = setTimeout(doTag, 500)
    return () => clearTimeout(timer)
  }, [visible, llmAutoTagEnabled, llmConfigReady, llmConfig, untaggedCount, onUpdateContents, retryTrigger, taggingCycle])

  // Abort active tagging only when auto-tag is turned off or panel is hidden
  useEffect(() => {
    if (visible && llmAutoTagEnabled) return
    if (!abortControllerRef.current) return
    abortControllerRef.current.abort()
    abortControllerRef.current = null
    setClassifyProgress(prev =>
      prev.status === 'running'
        ? { ...prev, status: 'stopped', detail: '已暂停（关闭了智能标签）' }
        : prev,
    )
  }, [visible, llmAutoTagEnabled])

  // ── Stop tagging handler ──────────────────────────────────
  const handleStopTagging = useCallback(() => {
    setLlmAutoTagEnabled(false) // Turn off toggle to prevent re-trigger
    setClassifyProgress(prev => ({ ...prev, status: 'stopped', detail: '已手动暂停，可点击继续' }))
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
      console.log('[DiscoverPanel] User requested stop tagging')
    }
  }, [])

  // ── Update progress display when items change ─────────────
  useEffect(() => {
    if (fetchContents.length === 0) {
      setClassifyProgress({ total: 0, tagged: 0, untagged: 0, status: 'idle' })
      return
    }
    const tagged = fetchContents.length - countUntagged(fetchContents)
    const untagged = fetchContents.length - tagged
    if (!taggingInProgress.current) {
      setClassifyProgress(prev => ({
        ...prev,
        total: fetchContents.length,
        tagged,
        untagged,
        status: tagged > 0 && untagged === 0
          ? 'done'
          : (prev.status === 'running' || prev.status === 'stopped' || prev.status === 'error')
            ? prev.status
            : 'idle',
      }))
    }
  }, [fetchContents, tagVersion])

  // Prune stale keyed state when feed changes
  useEffect(() => {
    const validKeys = new Set(fetchContents.map(getContentIdentity))

    setStarredSet(prev => {
      let changed = false
      const next = new Set<string>()
      prev.forEach(k => {
        if (validKeys.has(k)) next.add(k)
        else changed = true
      })
      return changed ? next : prev
    })

    setFeedbackMap(prev => {
      let changed = false
      const next = new Map<string, FeedbackType>()
      prev.forEach((v, k) => {
        if (validKeys.has(k)) next.set(k, v)
        else changed = true
      })
      return changed ? next : prev
    })
  }, [fetchContents])

  // ── Handlers ──────────────────────────────────────────────
  const handleClearAllContents = useCallback(async () => {
    if (!onClearContents) return
    try {
      await onClearContents()
      setTagVersion(v => v + 1)
      setClassifyProgress({ total: 0, tagged: 0, untagged: 0, status: 'idle' })
      message.success('已清空所有新闻')
    } catch (err) {
      message.error('清空失败')
    }
  }, [onClearContents])

  const handleClearTags = useCallback(async () => {
    // Clear all tags so items can be re-classified
    for (const item of fetchContents) {
      item._tagged = undefined
      item._classification = undefined
    }
    setTagVersion(v => v + 1)
    setClassifyProgress({ total: fetchContents.length, tagged: 0, untagged: fetchContents.length, status: 'idle' })
    if (onUpdateContents) {
      onUpdateContents(fetchContents).catch(() => {})
    }
    message.success('已清除所有标签，可重新分类')
  }, [fetchContents, onUpdateContents])

  const handleQuickRunRadar = useCallback(async () => {
    if (!onRadarRunOnce || runningRadarOnce) return
    setRunningRadarOnce(true)
    try {
      const result = await onRadarRunOnce(fetchConfig)
      const newCount = result?.lastNewCount ?? 0
      const fetchedCount = result?.lastFetchedCount ?? 0
      if (result?.lastError) {
        message.error(`采集失败：${result.lastError}`)
      } else if (newCount > 0) {
        message.success(`采集完成：新增 ${newCount} 条（共抓取 ${fetchedCount} 条）`)
      } else {
        message.info(`采集完成：抓取 ${fetchedCount} 条，无新增`)
      }
    } catch (err: any) {
      message.error(`采集失败：${err?.message || String(err)}`)
    } finally {
      setRunningRadarOnce(false)
    }
  }, [onRadarRunOnce, runningRadarOnce, fetchConfig])

  // ── Filtered signals ──────────────────────────────────────
  const filteredSignals = useMemo(() => {
    let items = [...fetchContents]
    console.log(`[DiscoverPanel] fetchContents: ${fetchContents.length}, sensitivity: ${sensitivity}, freshness: ${freshness}`)

    // Text search
    if (search.trim()) {
      const q = search.toLowerCase()
      items = items.filter(m =>
        (m.title || '').toLowerCase().includes(q) ||
        (m.content || '').toLowerCase().includes(q)
      )
    }

    // Sensitivity filter
    if (sensitivity !== 'wide') {
      if (userTopic) {
        items = items.filter(item => {
          const rel = computeRelevance(item, userTopic)
          if (sensitivity === 'focused') return rel === 'high'
          return rel !== 'low'
        })
      } else {
        // Without a topic, use content richness as sensitivity proxy
        if (sensitivity === 'focused') {
          items = items.filter(item => {
            const hasContent = (item.content || '').length > 80
            const hasCat = !!detectCategory(item)
            return hasContent || hasCat
          })
        }
      }
    }

    // Freshness filter (client-side best-effort)
    if (freshness !== 'recent') {
      const now = new Date()
      items = items.filter(item => {
        if (!item.published) return freshness !== 'realtime'
        try {
          const h = (now.getTime() - new Date(item.published).getTime()) / 3600000
          if (freshness === 'realtime') return h < 6
          if (freshness === 'today') return h < 24
          return true
        } catch { return true }
      })
    }

    // Intelligent ranking (phase 2): relevance + freshness + feedback + signal strength
    const catBoost = new Map<string, number>()
    if (feedbackMap.size > 0) {
      const sourceByKey = new Map<string, ContentItem>()
      for (const sourceItem of fetchContents) {
        sourceByKey.set(getContentIdentity(sourceItem), sourceItem)
      }
      feedbackMap.forEach((type, itemKey) => {
        const fi = sourceByKey.get(itemKey)
        if (!fi) return
        const cat = detectCategory(fi)
        const catId = cat?.id || '_general'
        const cur = catBoost.get(catId) || 0
        catBoost.set(catId, cur + (type === 'more' ? 1 : -1))
      })
    }

    const now = Date.now()
    const scoreItem = (item: ContentItem, idx: number) => {
      let score = 0

      const relevance = userTopic ? computeRelevance(item, userTopic) : 'low'
      if (relevance === 'high') score += smartRankMode === 'topic' ? 50 : 36
      else if (relevance === 'medium') score += smartRankMode === 'topic' ? 24 : 16

      if (item.published) {
        try {
          const h = (now - new Date(item.published).getTime()) / 3600000
          if (h < 6) score += smartRankMode === 'freshness' ? 40 : 26
          else if (h < 24) score += smartRankMode === 'freshness' ? 24 : 16
          else if (h < 72) score += 8
        } catch {
          // ignore time parse error
        }
      }

      const cat = detectCategory(item)
      if (cat) score += 6
      score += (catBoost.get(cat?.id || '_general') || 0) * 12

      const signalStrength = getSignalStrength(idx, Math.max(items.length, 1))
      if (signalStrength === 'hot') score += 12
      else if (signalStrength === 'warm') score += 5

      if (item._tagged) score += 5

      return score
    }

    const scoreByKey = new Map<string, number>()
    items.forEach((item, idx) => {
      scoreByKey.set(getContentIdentity(item), scoreItem(item, idx))
    })

    items.sort((a, b) => {
      const sa = scoreByKey.get(getContentIdentity(a)) || 0
      const sb = scoreByKey.get(getContentIdentity(b)) || 0
      return sb - sa
    })

    return items
  }, [fetchContents, search, sensitivity, freshness, userTopic, feedbackMap, tagVersion, smartRankMode])

  // ── Stats ─────────────────────────────────────────────────
  const stats = useMemo(() => {
    const total = filteredSignals.length
    const highRelevance = userTopic
      ? filteredSignals.filter(i => computeRelevance(i, userTopic) === 'high').length
      : 0
    return { total, highRelevance }
  }, [filteredSignals, userTopic])

  // ── Observability metrics (phase 2) ───────────────────────
  const sourceStats = useMemo(() => {
    const counts = new Map<string, number>()
    let recent6h = 0
    const now = Date.now()
    for (const item of filteredSignals) {
      const src = item.source || 'unknown'
      counts.set(src, (counts.get(src) || 0) + 1)
      if (item.published) {
        try {
          const h = (now - new Date(item.published).getTime()) / 3600000
          if (h < 6) recent6h++
        } catch {
          // ignore date parse errors
        }
      }
    }
    let topSource = ''
    let topSourceCount = 0
    counts.forEach((count, src) => {
      if (count > topSourceCount) {
        topSource = src
        topSourceCount = count
      }
    })
    const tagged = filteredSignals.filter(i => i._tagged).length
    return {
      sourceCount: counts.size,
      topSource,
      topSourceCount,
      recent6h,
      tagged,
      total: filteredSignals.length,
    }
  }, [filteredSignals])

  // ── Today's Highlights ──────────────────────────────────────
  const todayHighlights = useMemo(() => {
    return selectTodayHighlights(filteredSignals, userTopic, 3, feedbackMap, fetchContents)
  }, [filteredSignals, userTopic, feedbackMap, fetchContents])

  // ── Anomaly Trends ─────────────────────────────────────────
  const anomalyTrends = useMemo(() => {
    return detectAnomalyTrends(filteredSignals)
  }, [filteredSignals])

  // ── Inbox items ───────────────────────────────────────────
  const allInbox = useMemo(() => {
    const manual: EnrichedItem[] = manualContents.map(m => ({ ...m, _source_channel: 'manual' as const }))
    return [...manual, ...savedToInbox]
  }, [manualContents, savedToInbox])

  useEffect(() => {
    if (!visible) return
    const candidates: EnrichedItem[] = []
    const seen = new Set<string>()
    for (const item of candidateItems) {
      const key = getContentIdentity(item)
      if (!seen.has(key)) {
        seen.add(key)
        candidates.push(item)
      }
    }
    for (const item of fetchContents) {
      const key = getContentIdentity(item)
      if (candidateSet.has(key) && !seen.has(key)) {
        seen.add(key)
        candidates.push({ ...item, _source_channel: 'auto' })
      }
    }
    inboxStatuses.forEach((status, idx) => {
      if (status === 'candidate' && allInbox[idx]) {
        const key = getContentIdentity(allInbox[idx])
        if (!seen.has(key)) {
          seen.add(key)
          candidates.push(allInbox[idx])
        }
      }
    })
    onStateChange?.({
      candidateItems,
      savedToInbox,
      inboxStatuses: Array.from(inboxStatuses.entries()),
      candidates,
    })
  }, [visible, candidateItems, savedToInbox, inboxStatuses, candidateSet, fetchContents, allInbox])

  // ── Counts ────────────────────────────────────────────────
  const radarCandidateCount = candidateSet.size
  const inboxCandidateCount = Array.from(inboxStatuses.values()).filter(s => s === 'candidate').length
  const totalCandidates = radarCandidateCount + inboxCandidateCount
  const unprocessedInbox = allInbox.filter((_, i) => !inboxStatuses.has(i)).length

  // ── Actions ───────────────────────────────────────────────
  const toggleStar = useCallback((itemKey: string) => {
    setStarredSet(prev => {
      const next = new Set(prev)
      next.has(itemKey) ? next.delete(itemKey) : next.add(itemKey)
      return next
    })
  }, [])

  const addCandidate = useCallback((itemKey: string) => {
    setCandidateSet(prev => new Set(prev).add(itemKey))
    const sourceItem = fetchContents.find(item => getContentIdentity(item) === itemKey)
    if (sourceItem) {
      setCandidateItems(prev => {
        if (prev.some(item => getContentIdentity(item) === itemKey)) return prev
        return [...prev, { ...sourceItem, _source_channel: 'auto' }]
      })
    }
    message.success({ content: '已加入本期候选', duration: 1.5, style: { marginTop: 60 } })
  }, [fetchContents])

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

  const handleFeedback = useCallback((itemKey: string, type: FeedbackType) => {
    setFeedbackMap(prev => {
      const next = new Map(prev)
      if (next.get(itemKey) === type) {
        next.delete(itemKey)
      } else {
        next.set(itemKey, type)
      }
      return next
    })
    message.info({
      content: type === 'more' ? '收到，会推荐更多类似内容' : '收到，会减少类似推荐',
      duration: 1.5,
      style: { marginTop: 60 },
    })
  }, [])

  const handleProceed = useCallback(() => {
    const candidates: EnrichedItem[] = []
    const seen = new Set<string>()
    for (const item of candidateItems) {
      const key = getContentIdentity(item)
      if (!seen.has(key)) {
        seen.add(key)
        candidates.push(item)
      }
    }
    for (const item of fetchContents) {
      const key = getContentIdentity(item)
      if (candidateSet.has(key) && !seen.has(key)) {
        seen.add(key)
        candidates.push({ ...item, _source_channel: 'auto' })
      }
    }
    inboxStatuses.forEach((status, idx) => {
      if (status === 'candidate' && allInbox[idx]) {
        const key = getContentIdentity(allInbox[idx])
        if (!seen.has(key)) {
          seen.add(key)
          candidates.push(allInbox[idx])
        }
      }
    })
    onProceedToOrganize?.(candidates)
  }, [candidateItems, candidateSet, inboxStatuses, fetchContents, allInbox, onProceedToOrganize])

  const handleAddHighlightsToCandidates = useCallback(() => {
    if (todayHighlights.length === 0) return
    let added = 0
    setCandidateSet(prev => {
      const next = new Set(prev)
      const before = next.size
      for (const h of todayHighlights) next.add(h._itemKey)
      added = next.size - before
      return next
    })
    if (added > 0) message.success(`已加入 ${added} 条重点到候选`)
    else message.info('今日重点已全部在候选中')
  }, [todayHighlights])

  const handleClearCandidates = useCallback(() => {
    setCandidateSet(new Set())
    setCandidateItems([])
    setInboxStatuses(prev => {
      const next = new Map(prev)
      let changed = false
      prev.forEach((status, idx) => {
        if (status === 'candidate') {
          next.delete(idx)
          changed = true
        }
      })
      return changed ? next : prev
    })
    message.info('已清空本期候选')
  }, [])

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
      position: 'fixed', top: 52, right: 0, bottom: 0, left: 148, zIndex: 1000,
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
              趋势雷达
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', lineHeight: 1.2 }}>
              {stats.total > 0
                ? `${stats.total} 条信号${todayHighlights.length > 0 ? ` · 已精选 ${todayHighlights.length} 条重点` : stats.highRelevance > 0 ? ` · ${stats.highRelevance} 条高度相关` : ''}`
                : '等待信号中…'}
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
          <Tooltip title="立即采集">
            <Button
              type="text"
              loading={runningRadarOnce}
              icon={<LoadingOutlined spin={runningRadarOnce} />}
              onClick={handleQuickRunRadar}
              disabled={!onRadarRunOnce}
              style={{ color: 'var(--text-secondary)', borderRadius: 8 }}
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

            {/* Smart rank mode (phase 2) */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 11, color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>排序</span>
              <div style={{ display: 'flex', gap: 4 }}>
                {([
                  ['balanced', '均衡'],
                  ['topic', '话题'],
                  ['freshness', '时效'],
                ] as Array<[SmartRankMode, string]>).map(([mode, label]) => {
                  const active = smartRankMode === mode
                  return (
                    <Tag
                      key={mode}
                      bordered={false}
                      onClick={() => setSmartRankMode(mode)}
                      style={{
                        fontSize: 10, borderRadius: 5, padding: '2px 8px', cursor: 'pointer', margin: 0,
                        background: active ? 'var(--accent-light)' : 'var(--bg-tertiary)',
                        color: active ? 'var(--accent-primary)' : 'var(--text-tertiary)',
                        fontWeight: active ? 600 : 400,
                      }}
                    >
                      {label}
                    </Tag>
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

            {/* Divider */}
            <div style={{ width: 1, height: 16, background: 'var(--border-color)' }} />

            {/* View mode toggle */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 11, color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>视图</span>
              <div style={{ display: 'flex', background: 'var(--bg-tertiary)', borderRadius: 6, padding: 2 }}>
                <Tooltip title="时间线">
                  <div
                    onClick={() => setViewMode('list')}
                    style={{
                      padding: '3px 8px', borderRadius: 5, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: 4,
                      background: viewMode === 'list' ? 'var(--bg-secondary)' : 'transparent',
                      boxShadow: viewMode === 'list' ? 'var(--shadow-sm)' : 'none',
                      color: viewMode === 'list' ? 'var(--accent-primary)' : 'var(--text-tertiary)',
                      fontSize: 12, transition: 'all 0.2s ease',
                    }}
                  >
                    <UnorderedListOutlined style={{ fontSize: 11 }} />
                  </div>
                </Tooltip>
                <Tooltip title="分组查看">
                  <div
                    onClick={() => setViewMode('grouped')}
                    style={{
                      padding: '3px 8px', borderRadius: 5, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: 4,
                      background: viewMode === 'grouped' ? 'var(--bg-secondary)' : 'transparent',
                      boxShadow: viewMode === 'grouped' ? 'var(--shadow-sm)' : 'none',
                      color: viewMode === 'grouped' ? 'var(--accent-primary)' : 'var(--text-tertiary)',
                      fontSize: 12, transition: 'all 0.2s ease',
                    }}
                  >
                    <AppstoreOutlined style={{ fontSize: 11 }} />
                  </div>
                </Tooltip>
              </div>
            </div>

            {/* Divider */}
            <div style={{ width: 1, height: 16, background: 'var(--border-color)' }} />

            {/* LLM Auto-Tag Toggle */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <Tooltip title={llmAutoTagEnabled
                ? `智能标签已开启${llmConfig ? `（${llmConfig.model}）` : '（无大模型配置）'}`
                : '开启后，新采集的新闻将自动用大模型分类打标签'
              }>
                <div
                  onClick={() => {
                    if (llmAutoTagEnabled) {
                      handleStopTagging()
                    } else {
                      setLlmAutoTagEnabled(true)
                      setClassifyProgress(prev => ({ ...prev, status: 'idle', detail: '准备恢复自动分类...' }))
                      setRetryTrigger(n => n + 1)
                    }
                  }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 4,
                    padding: '3px 8px', borderRadius: 5, cursor: 'pointer',
                    background: llmAutoTagEnabled ? 'var(--accent-light)' : 'var(--bg-tertiary)',
                    border: llmAutoTagEnabled ? '1px solid var(--accent-primary)' : '1px solid transparent',
                    transition: 'all 0.2s ease',
                  }}
                >
                  <RobotOutlined style={{
                    fontSize: 11,
                    color: llmAutoTagEnabled ? 'var(--accent-primary)' : 'var(--text-tertiary)',
                  }} />
                  <span style={{
                    fontSize: 10, fontWeight: llmAutoTagEnabled ? 600 : 400, whiteSpace: 'nowrap',
                    color: llmAutoTagEnabled ? 'var(--accent-primary)' : 'var(--text-tertiary)',
                  }}>
                    智能标签
                  </span>
                  {llmAutoTagEnabled && classifyProgress.status === 'running' && (
                    <LoadingOutlined style={{ fontSize: 9, color: 'var(--accent-primary)' }} />
                  )}
                </div>
              </Tooltip>
              {/* Untagged count badge */}
              {untaggedCount > 0 && (
                <span style={{
                  fontSize: 9, color: '#f59e0b', fontWeight: 600,
                  display: 'flex', alignItems: 'center', gap: 2,
                }}>
                  {untaggedCount} 未标
                </span>
              )}
              {/* Clear tags */}
              {classifyProgress.tagged > 0 && (
                <Tooltip title="清除所有标签，可重新分类">
                  <span
                    onClick={handleClearTags}
                    style={{
                      fontSize: 9, color: 'var(--text-tertiary)', cursor: 'pointer',
                      textDecoration: 'underline', whiteSpace: 'nowrap',
                    }}
                  >
                    清除标签
                  </span>
                </Tooltip>
              )}
            </div>

            {/* Spacer */}
            <div style={{ flex: 1 }} />

            {/* Filter count badge + bulk delete */}
            {fetchContents.length > 0 && (
              <div style={{
                fontSize: 11, color: 'var(--text-tertiary)',
                display: 'flex', alignItems: 'center', gap: 4,
                whiteSpace: 'nowrap',
              }}>
                <span style={{
                  fontWeight: 600,
                  color: filteredSignals.length < fetchContents.length ? 'var(--accent-primary)' : 'var(--text-secondary)',
                }}>
                  {filteredSignals.length}
                </span>
                <span>/</span>
                <span>{fetchContents.length}</span>
                <span>条</span>
                <span style={{ marginLeft: 6, color: 'var(--text-tertiary)' }}>
                  源{sourceStats.sourceCount}
                </span>
                <span style={{ color: 'var(--text-tertiary)' }}>
                  6h内{sourceStats.recent6h}
                </span>
                <span style={{ color: 'var(--text-tertiary)' }}>
                  标签{sourceStats.total > 0 ? Math.round((sourceStats.tagged / sourceStats.total) * 100) : 0}%
                </span>
                {filteredSignals.length < fetchContents.length && sensitivity !== 'wide' && (
                  <span
                    onClick={() => setSensitivity('wide')}
                    style={{
                      color: 'var(--accent-primary)', cursor: 'pointer',
                      textDecoration: 'underline', marginLeft: 2,
                    }}
                  >
                    显示全部
                  </span>
                )}
                {onClearContents && (
                  <Tooltip title="清空所有新闻">
                    <span
                      onClick={() => {
                        if (window.confirm(`确定要清空全部 ${fetchContents.length} 条新闻吗？此操作不可撤销。`)) {
                          handleClearAllContents()
                        }
                      }}
                      style={{
                        color: '#dc2626', cursor: 'pointer', marginLeft: 4,
                        fontSize: 10, textDecoration: 'underline',
                      }}
                    >
                      清空
                    </span>
                  </Tooltip>
                )}
                {radarState?.running && (
                  <span style={{ color: 'var(--accent-primary)', marginLeft: 4 }}>
                    · 采集中
                  </span>
                )}
              </div>
            )}

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

          {/* ── Persistent Classification Banner ── */}
          {fetchContents.length > 0 && (classifyProgress.status === 'running' || classifyProgress.status === 'stopped' || classifyProgress.status === 'error' || (classifyProgress.status === 'done' && classifyProgress.tagged > 0) || (!llmAutoTagEnabled && untaggedCount > 0)) && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '6px 20px',
              background: classifyProgress.status === 'running'
                ? 'linear-gradient(90deg, #2563eb08 0%, #7c3aed08 100%)'
                : classifyProgress.status === 'error'
                  ? '#fef2f2'
                  : classifyProgress.status === 'stopped'
                    ? '#fffbeb'
                    : !llmAutoTagEnabled && untaggedCount > 0
                      ? '#fffbeb'
                      : '#f0fdf4',
              borderBottom: '1px solid var(--border-light)',
              fontSize: 11, minHeight: 32, flexShrink: 0,
            }}>
              {classifyProgress.status === 'running' ? (
                <>
                  <LoadingOutlined style={{ fontSize: 12, color: 'var(--accent-primary)' }} spin />
                  <span style={{ color: 'var(--accent-primary)', fontWeight: 500 }}>
                    正在批量打标签...
                  </span>
                  <span style={{ color: 'var(--text-tertiary)' }}>
                    {classifyProgress.tagged}/{classifyProgress.total}
                  </span>
                  {classifyProgress.detail && (
                    <span style={{ color: 'var(--text-tertiary)', fontSize: 10 }}>
                      {classifyProgress.detail}
                    </span>
                  )}
                  <div style={{
                    flex: 1, maxWidth: 120, height: 3, borderRadius: 2,
                    background: 'var(--border-color)', overflow: 'hidden', marginLeft: 4,
                  }}>
                    <div style={{
                      height: '100%', borderRadius: 2,
                      background: 'var(--accent-primary)',
                      width: `${classifyProgress.total > 0 ? (classifyProgress.tagged / classifyProgress.total * 100) : 0}%`,
                      transition: 'width 0.3s ease',
                    }} />
                  </div>
                  <span style={{ color: 'var(--text-tertiary)', fontSize: 10 }}>
                    每批20条 · {llmConfig?.model || '...'}
                  </span>
                  <span
                    onClick={handleStopTagging}
                    style={{
                      color: '#dc2626', cursor: 'pointer', marginLeft: 'auto',
                      fontWeight: 500, fontSize: 11,
                      padding: '2px 8px', borderRadius: 4,
                      background: '#fef2f2', border: '1px solid #fecaca',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    停止
                  </span>
                </>
              ) : classifyProgress.status === 'stopped' ? (
                <>
                  <TagOutlined style={{ fontSize: 11, color: '#f59e0b' }} />
                  <span style={{ color: '#92400e', fontWeight: 500 }}>
                    已暂停
                  </span>
                  <span style={{ color: 'var(--text-tertiary)' }}>
                    {classifyProgress.tagged} 条已标签，{classifyProgress.untagged} 条待处理
                  </span>
                  {classifyProgress.detail && (
                    <span style={{ color: 'var(--text-tertiary)', fontSize: 10 }}>
                      {classifyProgress.detail}
                    </span>
                  )}
                  <span
                    onClick={() => {
                      setLlmAutoTagEnabled(true)
                      setClassifyProgress(prev => ({ ...prev, status: 'idle', detail: '正在恢复自动分类...' }))
                      setRetryTrigger(n => n + 1)
                    }}
                    style={{
                      color: 'var(--accent-primary)', cursor: 'pointer',
                      textDecoration: 'underline', fontWeight: 500, marginLeft: 'auto',
                    }}
                  >
                    继续
                  </span>
                </>
              ) : classifyProgress.status === 'error' ? (
                <>
                  <span style={{ color: '#dc2626', fontWeight: 500 }}>⚠ 分类失败</span>
                  <span style={{ color: '#dc2626', fontSize: 10, flex: 1 }}>
                    {classifyProgress.error?.slice(0, 80)}
                  </span>
                  {classifyProgress.tagged > 0 && (
                    <span style={{ color: 'var(--text-tertiary)', fontSize: 10 }}>
                      已完成 {classifyProgress.tagged} 条
                    </span>
                  )}
                  <span
                    onClick={() => { setLlmAutoTagEnabled(true); setClassifyProgress(prev => ({ ...prev, status: 'idle' })); setRetryTrigger(n => n + 1) }}
                    style={{
                      color: 'var(--accent-primary)', cursor: 'pointer',
                      textDecoration: 'underline', fontWeight: 500, marginLeft: 'auto',
                    }}
                  >
                    重试
                  </span>
                </>
              ) : !llmAutoTagEnabled && untaggedCount > 0 ? (
                <>
                  <TagOutlined style={{ fontSize: 11, color: '#f59e0b' }} />
                  <span style={{ color: '#92400e', fontWeight: 500 }}>
                    {untaggedCount} 条新闻未分类
                  </span>
                  <span style={{ color: 'var(--text-tertiary)' }}>
                    开启“智能标签”后自动分类
                  </span>
                  <span
                    onClick={() => { setLlmAutoTagEnabled(true); setRetryTrigger(n => n + 1) }}
                    style={{
                      color: 'var(--accent-primary)', cursor: 'pointer',
                      textDecoration: 'underline', fontWeight: 500, marginLeft: 'auto',
                    }}
                  >
                    立即开启
                  </span>
                </>
              ) : (
                <>
                  <RobotOutlined style={{ fontSize: 11, color: '#10b981' }} />
                  <span style={{ color: '#10b981', fontWeight: 500 }}>
                    智能分类完成
                  </span>
                  <span style={{ color: 'var(--text-tertiary)' }}>
                    {classifyProgress.tagged} 条已分类
                  </span>
                  {classifyProgress.untagged > 0 && (
                    <>
                      <span style={{ color: '#f59e0b' }}>
                        {classifyProgress.untagged} 条未成功
                      </span>
                      <span
                        onClick={() => { setLlmAutoTagEnabled(true); setClassifyProgress(prev => ({ ...prev, status: 'idle' })); setRetryTrigger(n => n + 1) }}
                        style={{
                          color: 'var(--accent-primary)', cursor: 'pointer',
                          textDecoration: 'underline', fontWeight: 500, marginLeft: 'auto', fontSize: 10,
                        }}
                      >
                        重试未分类
                      </span>
                    </>
                  )}
                  {classifyProgress.untagged === 0 && (
                    <span style={{ color: 'var(--text-tertiary)', marginLeft: 'auto', fontSize: 10 }}>
                      纯大模型 · {llmConfig?.model || ''}
                    </span>
                  )}
                </>
              )}
            </div>
          )}

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
                      雷达待命中
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.7, marginBottom: 24 }}>
                      告诉它你关注什么方向，它会帮你持续扫描全网信号。<br />
                      每天为你精选重点，提示异常变化——不需要逐条翻阅。
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
              /* ── Signal List with Trend Radar ── */
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

                {/* ── Today's Highlights ── */}
                {todayHighlights.length > 0 && (
                  <div style={{
                    marginBottom: 20,
                    animation: 'highlightSectionIn 0.4s cubic-bezier(0.25, 0.8, 0.25, 1)',
                  }}>
                    {/* Section header */}
                    <div style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      marginBottom: 4,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{
                          width: 22, height: 22, borderRadius: 6,
                          background: 'linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          color: '#fff', fontSize: 11,
                        }}>
                          <ThunderboltOutlined />
                        </div>
                        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                          今日重点
                        </span>
                      </div>
                      <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
                        {todayHighlights.length} 条精选
                      </span>
                    </div>
                    <div style={{
                      fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 10, lineHeight: 1.5,
                    }}>
                      根据你的关注方向和信号强度，为你挑选了最值得注意的内容
                    </div>

                    {/* Highlight cards */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {todayHighlights.map((h, i) => (
                        <div key={`${h._itemKey}-${i}`} style={{
                          animation: `highlightCardIn 0.3s cubic-bezier(0.25, 0.8, 0.25, 1) ${i * 0.08}s both`,
                        }}>
                          <TodayHighlightCard
                            item={h}
                            onAddCandidate={() => addCandidate(h._itemKey)}
                            onSaveToInbox={() => saveToInbox(h)}
                            onFeedback={(type) => handleFeedback(h._itemKey, type)}
                            isCandidate={candidateSet.has(h._itemKey)}
                            feedbackGiven={feedbackMap.get(h._itemKey)}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* ── Anomaly Trend Alerts ── */}
                {anomalyTrends.length > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    {anomalyTrends.map((t, i) => (
                      <TrendAlertBanner key={t.categoryId} trend={t} delay={i * 0.1} />
                    ))}
                  </div>
                )}

                {/* ── Section divider ── */}
                {todayHighlights.length > 0 && viewMode === 'list' && (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    marginBottom: 12, paddingTop: 4,
                  }}>
                    <div style={{ height: 1, flex: 1, background: 'var(--border-light)' }} />
                    <span style={{ fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 500 }}>
                      全部信号
                    </span>
                    <div style={{ height: 1, flex: 1, background: 'var(--border-light)' }} />
                  </div>
                )}

                {/* ── List View ── */}
                {viewMode === 'list' && filteredSignals.map((item, idx) => {
                  const itemKey = getContentIdentity(item)
                  return (
                    <SignalCard
                      key={`${itemKey}-${idx}`}
                      item={item}
                      index={idx}
                      total={filteredSignals.length}
                      topic={userTopic}
                      onAddCandidate={() => addCandidate(itemKey)}
                      onSaveToInbox={() => saveToInbox(item)}
                      onToggleStar={() => toggleStar(itemKey)}
                      isCandidate={candidateSet.has(itemKey)}
                      isStarred={starredSet.has(itemKey)}
                    />
                  )
                })}

                {/* ── Grouped View ── */}
                {viewMode === 'grouped' && (() => {
                  // groupByCategory now reads _classification directly from items
                  const groups = groupByCategory(filteredSignals)
                  const taggedCount = filteredSignals.filter(i => i._tagged).length

                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                      {/* Classification summary bar */}
                      {taggedCount > 0 && (
                        <div style={{
                          display: 'flex', alignItems: 'center', gap: 6,
                          padding: '8px 12px', borderRadius: 8,
                          background: 'var(--bg-tertiary)',
                          flexWrap: 'wrap',
                        }}>
                          <RobotOutlined style={{ fontSize: 11, color: 'var(--text-tertiary)' }} />
                          <span style={{ fontSize: 11, color: 'var(--text-secondary)', marginRight: 4 }}>
                            纯大模型分类
                          </span>
                          {groups.map(g => (
                            <Tag
                              key={g.categoryId}
                              bordered={false}
                              style={{
                                fontSize: 10, padding: '0 6px', lineHeight: '18px',
                                borderRadius: 4, background: g.bg, color: g.color, margin: 0,
                                cursor: 'pointer',
                              }}
                              onClick={() => {
                                setCollapsedGroups(prev => {
                                  const next = new Set(prev)
                                  if (next.has(g.categoryId)) next.delete(g.categoryId)
                                  else next.add(g.categoryId)
                                  return next
                                })
                              }}
                            >
                              {g.label} {g.items.length}
                            </Tag>
                          ))}
                        </div>
                      )}

                      {/* Category groups */}
                      {groups.map(group => {
                        const isCollapsed = collapsedGroups.has(group.categoryId)
                        return (
                          <div
                            key={group.categoryId}
                            style={{
                              borderRadius: 10,
                              border: '1px solid var(--border-color)',
                              background: 'var(--bg-secondary)',
                              overflow: 'hidden',
                              transition: 'all 0.2s ease',
                            }}
                          >
                            {/* Group header */}
                            <div
                              onClick={() => {
                                setCollapsedGroups(prev => {
                                  const next = new Set(prev)
                                  if (next.has(group.categoryId)) next.delete(group.categoryId)
                                  else next.add(group.categoryId)
                                  return next
                                })
                              }}
                              style={{
                                display: 'flex', alignItems: 'center', gap: 10,
                                padding: '10px 14px',
                                cursor: 'pointer',
                                borderBottom: isCollapsed ? 'none' : '1px solid var(--border-light)',
                                transition: 'background 0.15s ease',
                              }}
                              onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-tertiary)')}
                              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                            >
                              <CaretDownOutlined style={{
                                fontSize: 10, color: 'var(--text-tertiary)',
                                transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
                                transition: 'transform 0.2s ease',
                              }} />
                              <div style={{
                                width: 6, height: 6, borderRadius: '50%',
                                background: group.color, flexShrink: 0,
                              }} />
                              <span style={{
                                fontSize: 13, fontWeight: 600, color: 'var(--text-primary)',
                              }}>
                                {group.label}
                              </span>
                              <Tag bordered={false} style={{
                                fontSize: 10, padding: '0 6px', lineHeight: '18px',
                                borderRadius: 4, background: group.bg, color: group.color, margin: 0,
                              }}>
                                {group.items.length} 条
                              </Tag>
                              {/* Priority breakdown */}
                              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 'auto' }}>
                                {group.highCount > 0 && (
                                  <span style={{
                                    fontSize: 10, color: '#dc2626',
                                    display: 'flex', alignItems: 'center', gap: 2,
                                  }}>
                                    <span style={{
                                      width: 5, height: 5, borderRadius: '50%',
                                      background: '#dc2626', display: 'inline-block',
                                    }} />
                                    {group.highCount} 重要
                                  </span>
                                )}
                                {group.normalCount > 0 && (
                                  <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
                                    {group.normalCount} 一般
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Group items */}
                            {!isCollapsed && (
                              <div style={{ padding: '6px 10px 10px' }}>
                                {group.items.map(({ item, classification }, itemIdx) => {
                                  const itemKey = getContentIdentity(item)
                                  const priorityDisplay = getPriorityDisplay(classification.priority)
                                  return (
                                    <div
                                      key={`${itemKey}-${itemIdx}`}
                                      className="signal-card"
                                      style={{
                                        display: 'flex',
                                        marginBottom: 6,
                                        borderRadius: 8,
                                        border: candidateSet.has(itemKey)
                                          ? '1.5px solid var(--success-color)'
                                          : '1px solid var(--border-light)',
                                        background: candidateSet.has(itemKey)
                                          ? 'rgba(16,185,129,0.02)' : 'var(--bg-primary)',
                                        overflow: 'hidden',
                                        transition: 'all 0.2s ease',
                                      }}
                                    >
                                      {/* Priority bar */}
                                      <div style={{
                                        width: 3, flexShrink: 0,
                                        background: candidateSet.has(itemKey)
                                          ? 'var(--success-color)'
                                          : priorityDisplay.color,
                                      }} />

                                      <div style={{ flex: 1, padding: '10px 12px 8px', minWidth: 0 }}>
                                        {/* Title + priority badge */}
                                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginBottom: 4 }}>
                                          <div style={{
                                            flex: 1, fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)',
                                            lineHeight: 1.4,
                                            display: '-webkit-box', WebkitLineClamp: 2,
                                            WebkitBoxOrient: 'vertical' as const, overflow: 'hidden',
                                          }}>
                                            {item.title || '无标题'}
                                          </div>
                                          {classification.priority === 'high' && (
                                            <Tag bordered={false} style={{
                                              fontSize: 9, padding: '0 5px', lineHeight: '16px',
                                              borderRadius: 3, background: priorityDisplay.bg,
                                              color: priorityDisplay.color, margin: 0, flexShrink: 0,
                                            }}>
                                              {priorityDisplay.label}
                                            </Tag>
                                          )}
                                          <button
                                            onClick={() => toggleStar(itemKey)}
                                            style={{
                                              background: 'none', border: 'none', cursor: 'pointer', padding: 2,
                                              color: starredSet.has(itemKey) ? '#f59e0b' : 'var(--border-color)',
                                              fontSize: 12, flexShrink: 0,
                                              transition: 'color 0.15s ease',
                                            }}
                                          >
                                            {starredSet.has(itemKey) ? <StarFilled /> : <StarOutlined />}
                                          </button>
                                        </div>

                                        {/* Content snippet */}
                                        {item.content && (
                                          <div style={{
                                            fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5,
                                            display: '-webkit-box', WebkitLineClamp: 2,
                                            WebkitBoxOrient: 'vertical' as const, overflow: 'hidden',
                                            marginBottom: 6,
                                          }}>
                                            {item.content.slice(0, 150)}
                                          </div>
                                        )}

                                        {/* Meta + actions */}
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                          <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                                            {item.source && (
                                              <Tag bordered={false} style={{
                                                fontSize: 9, padding: '0 5px', lineHeight: '16px', borderRadius: 3,
                                                background: 'var(--bg-tertiary)', color: 'var(--text-tertiary)', margin: 0,
                                              }}>
                                                <GlobalOutlined style={{ fontSize: 8, marginRight: 2 }} />
                                                {item.source}
                                              </Tag>
                                            )}
                                            {classification.fromLLM && classification.reason && (
                                              <Tooltip title={classification.reason}>
                                                <Tag bordered={false} style={{
                                                  fontSize: 9, padding: '0 5px', lineHeight: '16px', borderRadius: 3,
                                                  background: 'var(--accent-light)', color: 'var(--accent-primary)', margin: 0,
                                                }}>
                                                  <TagOutlined style={{ fontSize: 8, marginRight: 2 }} />
                                                  {classification.reason}
                                                </Tag>
                                              </Tooltip>
                                            )}
                                            {formatTimeAgo(item.published) && (
                                              <span style={{
                                                fontSize: 9, color: 'var(--text-tertiary)',
                                                display: 'flex', alignItems: 'center', gap: 2,
                                              }}>
                                                <FieldTimeOutlined style={{ fontSize: 8 }} />
                                                {formatTimeAgo(item.published)}
                                              </span>
                                            )}
                                          </div>

                                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0, marginLeft: 8 }}>
                                            {candidateSet.has(itemKey) ? (
                                              <Tag color="success" bordered={false} style={{
                                                fontSize: 9, borderRadius: 3, margin: 0, lineHeight: '16px', padding: '0 5px',
                                              }}>
                                                <CheckCircleOutlined /> 已入选
                                              </Tag>
                                            ) : (
                                              <>
                                                <Button
                                                  size="small" type="primary" ghost
                                                  onClick={() => addCandidate(itemKey)}
                                                  style={{ fontSize: 9, height: 20, borderRadius: 4, padding: '0 6px' }}
                                                >
                                                  <PlusOutlined /> 候选
                                                </Button>
                                                <Tooltip title="保存到收集箱">
                                                  <Button
                                                    size="small" type="text"
                                                    icon={<InboxOutlined style={{ fontSize: 10 }} />}
                                                    onClick={() => saveToInbox(item)}
                                                    style={{ fontSize: 9, height: 20, color: 'var(--text-tertiary)' }}
                                                  />
                                                </Tooltip>
                                              </>
                                            )}
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  )
                                })}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )
                })()}
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
          {todayHighlights.length > 0 && (
            <Button
              size="small"
              type="link"
              onClick={handleAddHighlightsToCandidates}
              style={{ fontSize: 10, height: 22, padding: 0 }}
            >
              加入今日重点
            </Button>
          )}
          {totalCandidates > 0 && (
            <Button
              size="small"
              type="link"
              onClick={handleClearCandidates}
              style={{ fontSize: 10, height: 22, padding: 0, color: '#dc2626' }}
            >
              清空候选
            </Button>
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
        radarState={radarState}
        onRunOnce={onRadarRunOnce}
      />
    </div>
  )
}
