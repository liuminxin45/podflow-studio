import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button, Checkbox, Drawer, Dropdown, Empty, Input, InputNumber, Modal, Select, Switch, Tabs, Tag } from 'antd'
import {
  CheckCircleOutlined,
  DatabaseOutlined,
  ExportSquareOutlined,
  FileTextOutlined,
  FilterOutlined,
  GlobalOutlined,
  InfoCircleOutlined,
  LinkOutlined,
  LoadingOutlined,
  MoreOutlined,
  ReloadOutlined,
  SettingOutlined,
  ToolOutlined,
  WarningOutlined,
} from '../icons/antdCompat'
import type { ContentItem } from '../types/workflow'
import { contentIdentity } from '../utils/contentIdentity'
import { DEFAULT_DISCOVER_FILTER_CONFIG, FETCH_NEUTRAL_CONFIG } from '../constants/fetchConfig'
import type {
  DiscoverAuditEntry,
  DiscoverPostProcessProgress,
  DiscoverPostProcessProgressHandler,
  DiscoverRunAudit,
} from '../services/discoverPostProcess'
import StageHeader from './StageHeader'

type Notice = { type: 'info' | 'success' | 'warning' | 'error'; text: string } | null

export interface FetchSourceOption {
  id: string
  name: string
  description: string
}

export interface DiscoverConfig {
  enabled_sources: string[]
  newsnow_source_ids: string[]
  newsnow_base_url?: string
  topic: string
  recency_hours: number
  result_limit: number
  [key: string]: any
}

export interface DiscoverMeta {
  generated_at?: string
  item_count?: number
  raw_item_count?: number
  recency_count?: number
  topic_matched_count?: number
  topic_rejected_count?: number
  selected_count?: number
  source_counts?: Record<string, number>
  errors?: Array<{ source?: string; message?: string; detail?: string }>
  audit?: DiscoverRunAudit
}

export interface DiscoverRunResult {
  items: ContentItem[]
  meta: DiscoverMeta
}

interface Props {
  visible: boolean
  items: ContentItem[]
  selectedItems: ContentItem[]
  meta?: DiscoverMeta
  initialConfig?: Partial<DiscoverConfig>
  onConfigChange?: (config: DiscoverConfig) => void
  onRunOnce: (config: DiscoverConfig, onPostProcessProgress?: DiscoverPostProcessProgressHandler) => Promise<DiscoverRunResult>
  onLoadConfig: () => Promise<Partial<DiscoverConfig>>
  onListSources: () => Promise<FetchSourceOption[]>
  onClearCollection?: () => Promise<void> | void
  onProceedToOrganize: (items: ContentItem[], meta: DiscoverMeta, config: DiscoverConfig) => void
  hasDownstreamContent?: boolean
}

const DEFAULT_CONFIG: DiscoverConfig = {
  enabled_sources: [],
  newsnow_source_ids: ['weibo', 'zhihu', 'baidu', 'ithome', '36kr-quick', 'github-trending-today', 'hackernews', 'wallstreetcn-quick', 'cls-telegraph', 'zaobao'],
  ...DEFAULT_DISCOVER_FILTER_CONFIG,
}

type NewsNowCategory = 'china' | 'tech' | 'finance' | 'world' | 'sports'

interface NewsNowSourceOption {
  id: string
  name: string
  title?: string
  category: NewsNowCategory
  type?: 'hottest' | 'realtime'
  disabledOnCloudflare?: boolean
}

const NEWSNOW_CATEGORY_LABELS: Record<NewsNowCategory, string> = {
  china: '综合热点',
  tech: '科技',
  finance: '财经',
  world: '国际',
  sports: '体育',
}

const NEWSNOW_SOURCE_OPTIONS: NewsNowSourceOption[] = [
  { id: 'weibo', name: '微博', title: '实时热搜', category: 'china', type: 'hottest' },
  { id: 'zhihu', name: '知乎', category: 'china', type: 'hottest' },
  { id: 'baidu', name: '百度热搜', category: 'china', type: 'hottest' },
  { id: 'toutiao', name: '今日头条', category: 'china', type: 'hottest' },
  { id: 'thepaper', name: '澎湃新闻', title: '热榜', category: 'china', type: 'hottest' },
  { id: 'ifeng', name: '凤凰网', title: '热点资讯', category: 'china', type: 'hottest' },
  { id: 'douyin', name: '抖音', category: 'china', type: 'hottest' },
  { id: 'bilibili-hot-search', name: '哔哩哔哩', title: '热搜', category: 'china', type: 'hottest' },
  { id: 'bilibili-hot-video', name: '哔哩哔哩', title: '热门视频', category: 'china', type: 'hottest', disabledOnCloudflare: true },
  { id: 'bilibili-ranking', name: '哔哩哔哩', title: '排行榜', category: 'china', type: 'hottest', disabledOnCloudflare: true },
  { id: 'tieba', name: '百度贴吧', title: '热议', category: 'china', type: 'hottest' },
  { id: 'kuaishou', name: '快手', category: 'china', type: 'hottest', disabledOnCloudflare: true },
  { id: 'nowcoder', name: '牛客', category: 'china', type: 'hottest' },
  { id: 'chongbuluo-latest', name: '虫部落', title: '最新', category: 'china' },
  { id: 'chongbuluo-hot', name: '虫部落', title: '最热', category: 'china', type: 'hottest' },
  { id: 'douban', name: '豆瓣', title: '热门电影', category: 'china', type: 'hottest' },
  { id: 'tencent-hot', name: '腾讯新闻', title: '综合早报', category: 'china', type: 'hottest' },
  { id: 'freebuf', name: 'FreeBuf', title: '网络安全', category: 'china', type: 'hottest' },
  { id: 'qqvideo-tv-hotsearch', name: '腾讯视频', title: '热搜榜', category: 'china', type: 'hottest' },
  { id: 'iqiyi-hot-ranklist', name: '爱奇艺', title: '热播榜', category: 'china', type: 'hottest' },
  { id: 'ithome', name: 'IT之家', category: 'tech', type: 'realtime' },
  { id: '36kr-quick', name: '36氪', title: '快讯', category: 'tech', type: 'realtime', disabledOnCloudflare: true },
  { id: '36kr-renqi', name: '36氪', title: '人气榜', category: 'tech', type: 'hottest', disabledOnCloudflare: true },
  { id: 'github-trending-today', name: 'GitHub', title: 'Today', category: 'tech', type: 'hottest' },
  { id: 'hackernews', name: 'Hacker News', category: 'tech', type: 'hottest' },
  { id: 'producthunt', name: 'Product Hunt', category: 'tech', type: 'hottest' },
  { id: 'v2ex-share', name: 'V2EX', title: '最新分享', category: 'tech' },
  { id: 'juejin', name: '稀土掘金', category: 'tech', type: 'hottest' },
  { id: 'sspai', name: '少数派', category: 'tech', type: 'hottest' },
  { id: 'coolapk', name: '酷安', title: '今日最热', category: 'tech', type: 'hottest' },
  { id: 'aihot', name: 'AIHOT', category: 'tech', type: 'realtime' },
  { id: 'solidot', name: 'Solidot', category: 'tech' },
  { id: 'pcbeta-windows11', name: '远景论坛', title: 'Win11', category: 'tech', type: 'realtime' },
  { id: 'wallstreetcn-quick', name: '华尔街见闻', title: '快讯', category: 'finance', type: 'realtime' },
  { id: 'wallstreetcn-news', name: '华尔街见闻', title: '最新', category: 'finance' },
  { id: 'wallstreetcn-hot', name: '华尔街见闻', title: '最热', category: 'finance', type: 'hottest' },
  { id: 'cls-telegraph', name: '财联社', title: '电报', category: 'finance', type: 'realtime' },
  { id: 'cls-hot', name: '财联社', title: '热门', category: 'finance', type: 'hottest' },
  { id: 'cls-depth', name: '财联社', title: '深度', category: 'finance' },
  { id: 'jin10', name: '金十数据', category: 'finance', type: 'realtime' },
  { id: 'xueqiu-hotstock', name: '雪球', title: '热门股票', category: 'finance', type: 'hottest' },
  { id: 'mktnews-flash', name: 'MKTNews', title: '快讯', category: 'finance' },
  { id: 'fastbull-express', name: '法布财经', title: '快讯', category: 'finance', type: 'realtime' },
  { id: 'fastbull-news', name: '法布财经', title: '头条', category: 'finance' },
  { id: 'gelonghui', name: '格隆汇', title: '事件', category: 'finance', type: 'realtime' },
  { id: 'zaobao', name: '联合早报', category: 'world', type: 'realtime' },
  { id: 'cankaoxiaoxi', name: '参考消息', category: 'world' },
  { id: 'kaopu', name: '靠谱新闻', category: 'world' },
  { id: 'sputniknewscn', name: '卫星通讯社', category: 'world' },
  { id: 'steam', name: 'Steam', title: '在线人数', category: 'world', type: 'hottest' },
  { id: 'hupu', name: '虎扑', title: '主干道热帖', category: 'sports', type: 'hottest' },
  { id: 'dongqiudi', name: '懂球帝', title: '头条', category: 'sports', type: 'realtime' },
]

function newsNowIdsByCategory(...categories: NewsNowCategory[]): string[] {
  return NEWSNOW_SOURCE_OPTIONS
    .filter(source => categories.includes(source.category))
    .map(source => source.id)
}

const NEWSNOW_PRESETS = [
  { label: '综合热点', ids: newsNowIdsByCategory('china', 'sports') },
  { label: '科技AI', ids: newsNowIdsByCategory('tech') },
  { label: '财经快讯', ids: newsNowIdsByCategory('finance') },
  { label: '国际观察', ids: newsNowIdsByCategory('world') },
]

function identity(item: ContentItem): string {
  return contentIdentity(item)
}

function formatTime(value?: string | null): string {
  if (!value) return '暂无'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN', { hour12: false })
}

function noticeStyle(type: NonNullable<Notice>['type']) {
  if (type === 'error') return { background: 'var(--error-bg)', color: 'var(--error-color)', borderColor: '#f3c4c4' }
  if (type === 'warning') return { background: 'var(--warning-bg)', color: 'var(--warning-color)', borderColor: '#ead9a4' }
  if (type === 'success') return { background: 'var(--success-bg)', color: 'var(--success-color)', borderColor: '#cadfca' }
  return { background: 'var(--info-bg)', color: 'var(--info-color)', borderColor: '#c6dfef' }
}

function mergeConfig(...configs: Array<Partial<DiscoverConfig> | undefined>): DiscoverConfig {
  return configs.reduce<DiscoverConfig>((merged, current) => {
    if (!current) return merged

    return {
      enabled_sources: Array.isArray(current.enabled_sources) ? current.enabled_sources : merged.enabled_sources,
      newsnow_source_ids: Array.isArray(current.newsnow_source_ids)
        ? current.newsnow_source_ids
        : merged.newsnow_source_ids,
      newsnow_base_url: typeof current.newsnow_base_url === 'string'
        ? current.newsnow_base_url
        : merged.newsnow_base_url,
      topic: typeof current.topic === 'string' ? current.topic : merged.topic,
      recency_hours: normalizeRecencyHours(
        current.recency_hours ?? current.time_range_hours,
        merged.recency_hours,
      ),
      result_limit: normalizeResultLimit(
        current.result_limit ?? current.max_items,
        merged.result_limit,
      ),
    }
  }, { ...DEFAULT_CONFIG })
}

function buildFetchConfig(config: DiscoverConfig): DiscoverConfig {
  return {
    ...FETCH_NEUTRAL_CONFIG,
    enabled_sources: config.enabled_sources,
    newsnow_source_ids: config.newsnow_source_ids,
    newsnow_base_url: config.newsnow_base_url,
    topic: config.topic,
    recency_hours: config.recency_hours,
    result_limit: config.result_limit,
  }
}

function normalizeRecencyHours(value: unknown, fallback: number): number {
  const numeric = Number(value)
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : fallback
}

function normalizeResultLimit(value: unknown, fallback: number): number {
  const numeric = Number(value)
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback
}

function normalizeEditableResultLimit(value: unknown): number {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return DEFAULT_DISCOVER_FILTER_CONFIG.result_limit
  }
  return Math.min(100, Math.max(1, Math.round(numeric)))
}

function sourceLabel(item: ContentItem): string {
  return item.source_name || item.source || '未知来源'
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
}

function cleanDisplayText(value?: string): string {
  if (!value) return ''
  return decodeHtmlEntities(value)
    .replace(/<a\b[^>]*>(.*?)<\/a>/gi, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\b(?:Article|Comments?)\s+URL\s*:\s*/gi, ' ')
    .replace(/\bPoints\s*:\s*\d+/gi, ' ')
    .replace(/#\s*Comments\s*:\s*\d+/gi, ' ')
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function itemDigest(item: ContentItem): string {
  const title = cleanDisplayText(item.title).toLowerCase()
  const candidates = [item.summary, item.content]
    .map(cleanDisplayText)
    .filter(Boolean)
    .filter(text => text.toLowerCase() !== title)
  return candidates[0] || ''
}

function auditStageLabel(stageId: DiscoverAuditEntry['stageId']): string {
  switch (stageId) {
    case 'raw': return '原始采集'
    case 'recency': return '时效筛选'
    case 'topic': return '主题筛选'
    case 'limit': return '每源条数'
  }
}

function AuditEntryCard({ entry }: { entry: DiscoverAuditEntry }) {
  const item = entry.item
  const digest = itemDigest(item)
  const failed = entry.outcome === 'failed'

  return (
    <article className={`discover-audit-entry ${failed ? 'failed' : 'passed'}`}>
      <div className="discover-audit-entry-head">
        <div>
          <h4>{item.title || '未命名素材'}</h4>
          <div className="discover-audit-entry-meta">
            <span>{sourceLabel(item)}</span>
            <span>{formatTime(item.published)}</span>
            <span>{auditStageLabel(entry.stageId)}</span>
          </div>
        </div>
        <div className="discover-audit-entry-tags">
          <Tag color={failed ? 'error' : 'success'}>{failed ? '未通过' : '通过'}</Tag>
          {typeof entry.topicScore === 'number' && <Tag>主题 {entry.topicScore}</Tag>}
        </div>
      </div>
      {digest && <p>{digest}</p>}
      <div className="discover-audit-entry-reason">
        <b>{failed ? '剔除原因' : '通过原因'}</b>
        <span>{entry.reason || (failed ? '未满足该阶段条件' : '满足该阶段条件')}</span>
      </div>
      {item.url && (
        <a className="discover-audit-entry-link" href={item.url} target="_blank" rel="noreferrer">
          <LinkOutlined />
          <span>打开原文</span>
        </a>
      )}
    </article>
  )
}

function AuditEntryList({ entries, emptyText }: { entries: DiscoverAuditEntry[]; emptyText: string }) {
  if (entries.length === 0) {
    return <Empty description={emptyText} image={Empty.PRESENTED_IMAGE_SIMPLE} />
  }
  return (
    <div className="discover-audit-entry-list">
      {entries.map((entry, index) => (
        <AuditEntryCard key={`${entry.stageId}-${entry.id}-${index}`} entry={entry} />
      ))}
    </div>
  )
}

function DiscoverRunAuditModal({
  open,
  audit,
  meta,
  onClose,
}: {
  open: boolean
  audit?: DiscoverRunAudit
  meta: DiscoverMeta
  onClose: () => void
}) {
  if (!audit) {
    return (
      <Modal title="采集复盘" open={open} onCancel={onClose} footer={null} width={860}>
        <Empty description="还没有可查看的采集复盘" />
      </Modal>
    )
  }

  const stageItems = audit.stages.map(stage => ({
    key: stage.id,
    label: stage.label,
    children: (
      <div className="discover-audit-stage-view">
        <div className="discover-audit-stage-summary">
          <div><span>输入</span><strong>{stage.inputCount}</strong></div>
          <div><span>通过</span><strong>{stage.passedCount}</strong></div>
          <div><span>未通过</span><strong>{stage.failedCount}</strong></div>
          {stage.skipped && <Tag>已跳过</Tag>}
        </div>
        <AuditEntryList entries={stage.entries} emptyText="该阶段没有素材记录" />
      </div>
    ),
  }))

  const tabItems = [
    {
      key: 'overview',
      label: '流程总览',
      children: (
        <div className="discover-audit-overview">
          <div className="discover-audit-metrics">
            <div><span>原始素材</span><strong>{audit.rawItems.length}</strong></div>
            <div><span>主题匹配</span><strong>{meta.topic_matched_count ?? audit.stages.find(stage => stage.id === 'topic')?.passedCount ?? 0}</strong></div>
            <div><span>保留素材</span><strong>{audit.finalItems.length}</strong></div>
            <div><span>剔除条目</span><strong>{audit.rejectedItems.length}</strong></div>
          </div>
          <div className="discover-audit-flow">
            {audit.stages.map(stage => (
              <section key={stage.id} className="discover-audit-stage-card">
                <div>
                  <h3>{stage.label}</h3>
                  {stage.skipped && <Tag>跳过</Tag>}
                </div>
                <p>输入 {stage.inputCount} 条，通过 {stage.passedCount} 条，未通过 {stage.failedCount} 条</p>
              </section>
            ))}
          </div>
        </div>
      ),
    },
    {
      key: 'raw',
      label: `全部素材 ${audit.rawItems.length}`,
      children: <AuditEntryList entries={audit.rawItems} emptyText="没有采集到素材" />,
    },
    {
      key: 'passed',
      label: `AI 后保留 ${audit.passedItems.length}`,
      children: <AuditEntryList entries={audit.passedItems} emptyText="没有通过筛选的素材" />,
    },
    {
      key: 'failed',
      label: `剔除失败 ${audit.rejectedItems.length}`,
      children: <AuditEntryList entries={audit.rejectedItems} emptyText="没有被剔除的素材" />,
    },
    {
      key: 'stages',
      label: '逐步筛选',
      children: <Tabs className="discover-audit-stage-tabs" tabPosition="left" items={stageItems} />,
    },
  ]

  return (
    <Modal
      title="采集复盘"
      open={open}
      onCancel={onClose}
      footer={null}
      width={1080}
      className="discover-audit-modal"
    >
      <div className="discover-audit-subtitle">
        <span>生成时间：{formatTime(audit.generatedAt)}</span>
        <span>核心主题：{audit.coreTopic || '未设置'}</span>
      </div>
      <Tabs items={tabItems} />
    </Modal>
  )
}

function ExternalDetailLink({ href, label }: { href?: string; label: string }) {
  if (!href) return null
  return (
    <a className="discover-detail-link" href={href} target="_blank" rel="noreferrer">
      <LinkOutlined />
      <span>{label}</span>
      <ExportSquareOutlined />
    </a>
  )
}

function DiscoverItemDetail({
  item,
}: {
  item: ContentItem
}) {
  const detailSummary = itemDigest(item)
  const translated = isTranslatedItem(item)

  return (
    <div className="discover-detail-page">
      <article className="discover-detail-article">
        <div className="discover-detail-kicker">
          <span>{item.type || '素材'}</span>
          <span>{sourceLabel(item)}</span>
          <span>{formatTime(item.published)}</span>
          {translated && <Tag className="discover-translation-tag" icon={<GlobalOutlined />}>已翻译</Tag>}
        </div>
        <h2>{item.title || '未命名素材'}</h2>
        {detailSummary && <p className="discover-detail-summary">{detailSummary}</p>}
      </article>

      <section className="discover-detail-section">
        <div className="discover-detail-section-title">
          <FileTextOutlined />
          <h3>原始素材</h3>
        </div>
        <div className="discover-chain-origin">
          <div>
            <strong>{sourceLabel(item)}</strong>
            <span>{formatTime(item.published)}</span>
          </div>
          <ExternalDetailLink href={item.url} label="打开原文" />
          {!item.url && <span>当前条目没有原始链接</span>}
        </div>
      </section>
    </div>
  )
}

function isTranslatedItem(item: ContentItem): boolean {
  return (item as any).translation_status === 'translated' || Boolean((item as any).translated_at)
}

type DiscoverStreamPhase = 'idle' | 'fetching' | 'postprocessing' | 'completed' | 'failed'
type DiscoverStreamSourceStatus = 'pending' | 'running' | 'completed' | 'failed'

interface DiscoverStreamSourceState {
  id: string
  name: string
  status: DiscoverStreamSourceStatus
  count: number
  error?: string
}

interface DiscoverStreamState {
  phase: DiscoverStreamPhase
  detail: string
  totalSources: number
  rawCount: number
  itemCount: number
  recencyCount: number
  topicTotal: number
  topicProcessed: number
  topicMatched: number
  topicRejected: number
  finalCount: number
  sources: Record<string, DiscoverStreamSourceState>
}

const EMPTY_DISCOVER_STREAM: DiscoverStreamState = {
  phase: 'idle',
  detail: '',
  totalSources: 0,
  rawCount: 0,
  itemCount: 0,
  recencyCount: 0,
  topicTotal: 0,
  topicProcessed: 0,
  topicMatched: 0,
  topicRejected: 0,
  finalCount: 0,
  sources: {},
}

function sourceOptionName(sourceId: string, sources: FetchSourceOption[]): string {
  return sources.find(source => source.id === sourceId)?.name || sourceId
}

function createInitialStreamState(config: DiscoverConfig, sources: FetchSourceOption[]): DiscoverStreamState {
  const sourceEntries = config.enabled_sources.map(sourceId => [
    sourceId,
    {
      id: sourceId,
      name: sourceOptionName(sourceId, sources),
      status: 'pending' as DiscoverStreamSourceStatus,
      count: 0,
    },
  ])
  return {
    phase: 'fetching',
    detail: '正在连接数据源',
    totalSources: config.enabled_sources.length,
    rawCount: 0,
    itemCount: 0,
    recencyCount: 0,
    topicTotal: 0,
    topicProcessed: 0,
    topicMatched: 0,
    topicRejected: 0,
    finalCount: 0,
    sources: Object.fromEntries(sourceEntries),
  }
}

function mergeStreamSource(
  current: Record<string, DiscoverStreamSourceState>,
  sourceId: string,
  patch: Partial<DiscoverStreamSourceState>,
): Record<string, DiscoverStreamSourceState> {
  const previous = current[sourceId] || {
    id: sourceId,
    name: sourceId,
    status: 'pending' as DiscoverStreamSourceStatus,
    count: 0,
  }
  return {
    ...current,
    [sourceId]: {
      ...previous,
      ...patch,
      id: sourceId,
      name: patch.name || previous.name || sourceId,
    },
  }
}

function streamSourceDoneCount(sources: Record<string, DiscoverStreamSourceState>): number {
  return Object.values(sources).filter(source => source.status === 'completed' || source.status === 'failed').length
}

function streamSourceRunningCount(sources: Record<string, DiscoverStreamSourceState>): number {
  return Object.values(sources).filter(source => source.status === 'running').length
}

function mergeStreamItems(
  currentItems: ContentItem[],
  updates: ContentItem[],
  status: string,
): ContentItem[] {
  if (updates.length === 0) return currentItems
  const byKey = new Map(currentItems.map(item => [identity(item), item]))
  updates.forEach(item => {
    const key = identity(item)
    const previous = byKey.get(key)
    byKey.set(key, {
      ...(previous || {}),
      ...item,
      _stream_status: status,
    } as ContentItem)
  })
  return Array.from(byKey.values())
}

function calculateStreamProgressPercent(
  streamState: DiscoverStreamState,
  completedSources: number,
): number {
  if (streamState.phase === 'completed') return 100
  if (streamState.phase === 'failed') return 100

  if (streamState.phase === 'postprocessing') {
    if (streamState.finalCount > 0) {
      return 94
    }
    if (streamState.topicTotal > 0) {
      return Math.min(88, 62 + Math.round((streamState.topicProcessed / streamState.topicTotal) * 26))
    }
    if (streamState.recencyCount > 0) return 62
    return 58
  }

  if (streamState.totalSources > 0) {
    const runningSources = streamSourceRunningCount(streamState.sources)
    const sourceProgress = Math.round((completedSources / streamState.totalSources) * 46)
    const activityBoost = runningSources > 0 || streamState.rawCount > 0 ? 12 : 0
    return Math.min(56, 8 + sourceProgress + activityBoost)
  }

  return 8
}

export default function DiscoverPanel({
  visible,
  items,
  selectedItems,
  meta,
  initialConfig,
  onConfigChange,
  onRunOnce,
  onLoadConfig,
  onListSources,
  onClearCollection,
  onProceedToOrganize,
  hasDownstreamContent = false,
}: Props) {
  const [modal, modalContextHolder] = Modal.useModal()
  const [config, setConfig] = useState<DiscoverConfig>(DEFAULT_CONFIG)
  const [sources, setSources] = useState<FetchSourceOption[]>([])
  const [sourcesLoading, setSourcesLoading] = useState(false)
  const [sourcesLoadError, setSourcesLoadError] = useState('')
  const [currentItems, setCurrentItems] = useState<ContentItem[]>(items)
  const [currentMeta, setCurrentMeta] = useState<DiscoverMeta>(meta || {})
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set(selectedItems.map(identity)))
  const [query, setQuery] = useState('')
  const [sourceFilter, setSourceFilter] = useState<string>('all')
  const [newsNowOpen, setNewsNowOpen] = useState(false)
  const [newsNowQuery, setNewsNowQuery] = useState('')
  const [newsNowCategory, setNewsNowCategory] = useState<NewsNowCategory | 'all'>('all')
  const [running, setRunning] = useState(false)
  const [streamState, setStreamState] = useState<DiscoverStreamState>(EMPTY_DISCOVER_STREAM)
  const [streamStartedAt, setStreamStartedAt] = useState<number | null>(null)
  const [displayProgress, setDisplayProgress] = useState(0)
  const [settingsDrawerOpen, setSettingsDrawerOpen] = useState(false)
  const [detailDrawerOpen, setDetailDrawerOpen] = useState(false)
  const [notice, setNotice] = useState<Notice>(null)
  const [resultLimitInput, setResultLimitInput] = useState<number | null>(DEFAULT_CONFIG.result_limit)
  const [activeDetailKey, setActiveDetailKey] = useState<string | null>(null)
  const [auditOpen, setAuditOpen] = useState(false)
  const hasLoadedConfigRef = useRef(false)
  const initialConfigRef = useRef(initialConfig)
  const onLoadConfigRef = useRef(onLoadConfig)
  const onListSourcesRef = useRef(onListSources)
  const itemsSignatureRef = useRef('')
  const selectedItemsSignatureRef = useRef('')
  const itemsSignature = useMemo(() => items.map(identity).join('\u001f'), [items])
  const selectedItemsSignature = useMemo(() => selectedItems.map(identity).join('\u001f'), [selectedItems])

  useEffect(() => {
    initialConfigRef.current = initialConfig
    onLoadConfigRef.current = onLoadConfig
    onListSourcesRef.current = onListSources
  }, [initialConfig, onLoadConfig, onListSources])

  useEffect(() => {
    if (!visible) return
    if (running) return
    const itemsChanged = itemsSignatureRef.current !== itemsSignature
    const selectedItemsChanged = selectedItemsSignatureRef.current !== selectedItemsSignature

    setCurrentItems(items)
    setCurrentMeta(meta || {})
    if (itemsChanged || selectedItemsChanged) {
      setSelectedKeys(new Set(selectedItems.map(identity)))
    }
    setActiveDetailKey(prev => (prev && items.some(item => identity(item) === prev) ? prev : null))
    itemsSignatureRef.current = itemsSignature
    selectedItemsSignatureRef.current = selectedItemsSignature
  }, [visible, running, items, itemsSignature, meta, selectedItems, selectedItemsSignature])

  useEffect(() => {
    if (!visible) {
      hasLoadedConfigRef.current = false
      return
    }
    if (hasLoadedConfigRef.current) return
    hasLoadedConfigRef.current = true
    let cancelled = false
    const loadConfig = onLoadConfigRef.current
    const listSources = onListSourcesRef.current
    setSourcesLoading(true)
    setSourcesLoadError('')
    Promise.all([loadConfig(), listSources()])
      .then(([loadedConfig, loadedSources]) => {
        if (cancelled) return
        const safeSources = Array.isArray(loadedSources) ? loadedSources : []
        const workflowConfig = initialConfigRef.current
        const enabledSources = Array.isArray(workflowConfig?.enabled_sources)
          ? workflowConfig.enabled_sources
          : Array.isArray(loadedConfig.enabled_sources)
            ? loadedConfig.enabled_sources
            : safeSources.map(source => source.id)
        setConfig(mergeConfig(loadedConfig, workflowConfig, { enabled_sources: enabledSources }))
        setSources(safeSources)
        if (safeSources.length === 0) {
          setSourcesLoadError('Electron 未返回任何内置数据源，请查看主进程日志 [FetchSources]。')
        }
      })
      .catch((error) => {
        if (!cancelled) {
          const message = error.message || '未知错误'
          setSourcesLoadError(message)
          setNotice({ type: 'error', text: `采集配置初始化失败：${message}` })
        }
      })
      .finally(() => {
        if (!cancelled) setSourcesLoading(false)
      })
    return () => { cancelled = true }
  }, [visible])

  useEffect(() => {
    if (!visible || !window.electronAPI?.onDiscoverProgress) return
    const unsubscribe = window.electronAPI.onDiscoverProgress((event) => {
      if (!event || typeof event.type !== 'string') return

      if (event.type === 'started') {
        const sourceIds = Array.isArray(event.sources) ? event.sources : []
        setStreamState(prev => {
          const sourcesById = sourceIds.reduce<Record<string, DiscoverStreamSourceState>>((acc, sourceId) => {
            acc[sourceId] = prev.sources[sourceId] || {
              id: sourceId,
              name: sourceOptionName(sourceId, sources),
              status: 'pending',
              count: 0,
            }
            return acc
          }, {})
          return {
            ...prev,
            phase: 'fetching',
            detail: '正在连接数据源',
            totalSources: event.totalSources ?? sourceIds.length,
            sources: Object.keys(sourcesById).length > 0 ? sourcesById : prev.sources,
          }
        })
        return
      }

      if (event.type === 'source_started' && event.sourceId) {
        setStreamState(prev => ({
          ...prev,
          phase: 'fetching',
          detail: `正在采集 ${event.sourceName || event.sourceId}`,
          sources: mergeStreamSource(prev.sources, event.sourceId!, {
            name: event.sourceName || event.sourceId,
            status: 'running',
            error: undefined,
          }),
        }))
        return
      }

      if (event.type === 'source_items' && event.sourceId) {
        const streamItems = (event.items || []).map(item => ({
          ...item,
          _stream_status: 'source_pending',
        })) as ContentItem[]
        setStreamState(prev => ({
          ...prev,
          phase: 'fetching',
          detail: `${event.sourceName || event.sourceId} 返回 ${event.itemCount ?? streamItems.length} 条`,
          rawCount: event.rawCount ?? prev.rawCount,
          sources: mergeStreamSource(prev.sources, event.sourceId!, {
            name: event.sourceName || event.sourceId,
            count: event.itemCount ?? streamItems.length,
          }),
        }))
        return
      }

      if (event.type === 'source_done' && event.sourceId) {
        setStreamState(prev => {
          const nextSources = mergeStreamSource(prev.sources, event.sourceId!, {
            name: event.sourceName || event.sourceId,
            status: 'completed',
            count: event.itemCount ?? prev.sources[event.sourceId!]?.count ?? 0,
          })
          return {
            ...prev,
            phase: 'fetching',
            detail: `${streamSourceDoneCount(nextSources)}/${prev.totalSources || Object.keys(nextSources).length} 个来源已完成`,
            rawCount: event.rawCount ?? prev.rawCount,
            sources: nextSources,
          }
        })
        return
      }

      if (event.type === 'source_error' && event.sourceId) {
        setStreamState(prev => {
          const nextSources = mergeStreamSource(prev.sources, event.sourceId!, {
            name: event.sourceName || event.sourceId,
            status: 'failed',
            error: event.message || '采集失败',
          })
          return {
            ...prev,
            phase: 'fetching',
            detail: `${event.sourceName || event.sourceId} 采集失败`,
            rawCount: event.rawCount ?? prev.rawCount,
            sources: nextSources,
          }
        })
        return
      }

      if (event.type === 'filtering_started') {
        setStreamState(prev => ({
          ...prev,
          phase: 'postprocessing',
          detail: '正在筛选采集结果',
          rawCount: event.rawCount ?? prev.rawCount,
        }))
        return
      }

      if (event.type === 'filtering_done') {
        setStreamState(prev => ({
          ...prev,
          phase: 'postprocessing',
          detail: '正在进行主题筛选',
          rawCount: event.rawCount ?? prev.rawCount,
          itemCount: event.itemCount ?? prev.itemCount,
        }))
        return
      }

      if (event.type === 'completed') {
        setStreamState(prev => ({
          ...prev,
          phase: 'postprocessing',
          detail: '正在进行后处理',
          rawCount: event.rawCount ?? prev.rawCount,
          itemCount: event.itemCount ?? prev.itemCount,
        }))
        return
      }

      if (event.type === 'failed') {
        setStreamState(prev => ({
          ...prev,
          phase: 'failed',
          detail: event.message || '采集失败',
        }))
      }
    })

    return () => {
      if (typeof unsubscribe === 'function') unsubscribe()
    }
  }, [sources, visible])

  useEffect(() => {
    setResultLimitInput(config.result_limit)
  }, [config.result_limit])

  const selectedItemsForProceed = useMemo(() => {
    return currentItems.filter(item => selectedKeys.has(identity(item)))
  }, [currentItems, selectedKeys])

  const availableItemsCount = useMemo(() => {
    return currentItems.length
  }, [currentItems])

  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return currentItems.filter(item => {
      if (running && String((item as any)._stream_status || '') === 'source_pending') return false
      if (sourceFilter !== 'all') {
        const itemSource = item.source || ''
        if (sourceFilter === 'newsnow') {
          if (!itemSource.startsWith('newsnow:')) return false
        } else if (itemSource !== sourceFilter) {
          return false
        }
      }
      if (!normalizedQuery) return true
      const text = `${item.title || ''} ${item.content || ''} ${item.source || ''}`.toLowerCase()
      return text.includes(normalizedQuery)
    })
  }, [currentItems, query, running, sourceFilter])

  const activeDetailItem = useMemo(() => {
    if (!activeDetailKey) return null
    return filteredItems.find(item => identity(item) === activeDetailKey) || null
  }, [activeDetailKey, filteredItems])

  const detailPanelItem = useMemo(() => {
    if (activeDetailItem && filteredItems.some(item => identity(item) === identity(activeDetailItem))) {
      return activeDetailItem
    }
    return filteredItems[0] || null
  }, [activeDetailItem, filteredItems])

  const sourceCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    currentItems.forEach(item => {
      const key = item.source || 'unknown'
      counts[key] = (counts[key] || 0) + 1
    })
    return counts
  }, [currentItems])

  const hasAudit = Boolean(currentMeta.audit)
  const newsNowSelectedIds = config.newsnow_source_ids
  const newsNowSelectedSet = useMemo(() => new Set(newsNowSelectedIds), [newsNowSelectedIds])
  const filteredNewsNowSources = useMemo(() => {
    const normalizedQuery = newsNowQuery.trim().toLowerCase()
    return NEWSNOW_SOURCE_OPTIONS.filter(source => {
      if (newsNowCategory !== 'all' && source.category !== newsNowCategory) return false
      if (!normalizedQuery) return true
      const text = `${source.id} ${source.name} ${source.title || ''}`.toLowerCase()
      return text.includes(normalizedQuery)
    })
  }, [newsNowCategory, newsNowQuery])
  const streamSources = useMemo(() => Object.values(streamState.sources), [streamState.sources])
  const streamCompletedSources = useMemo(() => streamSourceDoneCount(streamState.sources), [streamState.sources])
  const streamProgressPercent = calculateStreamProgressPercent(streamState, streamCompletedSources)
  const showStreamPanel = running || streamState.phase === 'failed'

  useEffect(() => {
    if (!running) {
      setDisplayProgress(streamState.phase === 'completed' ? 100 : streamProgressPercent)
      return
    }

    const timer = window.setInterval(() => {
      setDisplayProgress(previous => {
        const elapsed = streamStartedAt ? Date.now() - streamStartedAt : 0
        const timeTarget = streamState.phase === 'fetching'
          ? Math.min(76, 10 + elapsed / 360)
          : Math.min(streamState.finalCount > 0 ? 98 : 94, 58 + elapsed / 300)
        const cappedTarget = Math.max(streamProgressPercent, timeTarget)
        if (cappedTarget <= previous) return previous
        const next = previous + Math.max(0.35, (cappedTarget - previous) * 0.16)
        return Math.min(cappedTarget, next)
      })
    }, 120)

    return () => window.clearInterval(timer)
  }, [running, streamProgressPercent, streamStartedAt, streamState.finalCount, streamState.phase])

  const updateConfig = useCallback((patch: Partial<DiscoverConfig>) => {
    setConfig(prev => {
      const next = mergeConfig(prev, patch)
      onConfigChange?.(next)
      return next
    })
  }, [onConfigChange])

  const commitResultLimitInput = useCallback(() => {
    const nextLimit = normalizeEditableResultLimit(resultLimitInput)
    setResultLimitInput(nextLimit)
    if (nextLimit !== config.result_limit) {
      updateConfig({ result_limit: nextLimit })
    }
  }, [config.result_limit, resultLimitInput, updateConfig])

  const toggleSource = useCallback((sourceId: string, enabled: boolean) => {
    const next = new Set(config.enabled_sources)
    if (enabled) next.add(sourceId)
    else next.delete(sourceId)
    const patch: Partial<DiscoverConfig> = { enabled_sources: Array.from(next) }
    if (sourceId === 'newsnow' && enabled && config.newsnow_source_ids.length === 0) {
      patch.newsnow_source_ids = DEFAULT_CONFIG.newsnow_source_ids
    }
    updateConfig(patch)
  }, [config.enabled_sources, config.newsnow_source_ids.length, updateConfig])

  const toggleNewsNowSource = useCallback((sourceId: string, enabled: boolean) => {
    const next = new Set(newsNowSelectedIds)
    if (enabled) next.add(sourceId)
    else next.delete(sourceId)
    updateConfig({ newsnow_source_ids: Array.from(next) })
  }, [newsNowSelectedIds, updateConfig])

  const applyNewsNowPreset = useCallback((ids: string[]) => {
    updateConfig({ newsnow_source_ids: ids })
  }, [updateConfig])

  const handlePostProcessProgress = useCallback((event: DiscoverPostProcessProgress) => {
    if (event.type === 'postprocess_started') {
      setStreamState(prev => ({
        ...prev,
        phase: 'postprocessing',
        detail: '正在准备后处理',
        rawCount: event.rawCount,
        itemCount: event.rawCount,
      }))
      return
    }

    if (event.type === 'recency_done') {
      setCurrentItems(mergeStreamItems([], event.items, 'source_pending'))
      setStreamState(prev => ({
        ...prev,
        phase: 'postprocessing',
        detail: `时效筛选完成，保留 ${event.recencyCount} 条`,
        rawCount: event.rawCount,
        recencyCount: event.recencyCount,
        itemCount: event.recencyCount,
      }))
      return
    }

    if (event.type === 'topic_skipped') {
      setCurrentItems(mergeStreamItems([], event.items, ''))
      setStreamState(prev => ({
        ...prev,
        phase: 'postprocessing',
        detail: '未设置核心主题，跳过主题筛选',
        topicTotal: event.total,
        topicProcessed: event.total,
        topicMatched: event.matchedCount,
        topicRejected: 0,
      }))
      return
    }

    if (event.type === 'topic_started') {
      setStreamState(prev => ({
        ...prev,
        phase: 'postprocessing',
        detail: `正在主题筛选 0/${event.total}`,
        topicTotal: event.total,
        topicProcessed: 0,
        topicMatched: 0,
        topicRejected: 0,
      }))
      return
    }

    if (event.type === 'topic_batch_done') {
      const keepItems = event.items.filter(item => item._topic_decision === 'keep')
      const dropItems = event.items.filter(item => item._topic_decision !== 'keep')
      setCurrentItems(prev => mergeStreamItems(
        mergeStreamItems(prev, keepItems, 'topic_keep'),
        dropItems,
        'topic_drop',
      ))
      setStreamState(prev => ({
        ...prev,
        phase: 'postprocessing',
        detail: `主题筛选 ${event.processed}/${event.total}`,
        topicTotal: event.total,
        topicProcessed: event.processed,
        topicMatched: event.matchedCount,
        topicRejected: event.rejectedCount,
      }))
      return
    }

    if (event.type === 'topic_done') {
      const keepItems = event.items.filter(item => item._topic_decision === 'keep')
      setCurrentItems(prev => mergeStreamItems(prev, keepItems, 'topic_keep'))
      setStreamState(prev => ({
        ...prev,
        phase: 'postprocessing',
        detail: `主题筛选完成，匹配 ${event.matchedCount} 条`,
        topicTotal: event.total,
        topicProcessed: event.total,
        topicMatched: event.matchedCount,
        topicRejected: event.rejectedCount,
      }))
      return
    }

    if (event.type === 'limit_done') {
      setCurrentItems(prev => mergeStreamItems(prev, event.items, ''))
      setStreamState(prev => ({
        ...prev,
        phase: 'postprocessing',
        detail: `正在写入采集结果 ${event.finalCount}/${event.inputCount}`,
        finalCount: event.finalCount,
        itemCount: event.finalCount,
      }))
    }
  }, [])

  const confirmRerun = useCallback(async () => {
    if (currentItems.length === 0) return true
    return new Promise<boolean>((resolve) => {
      modal.confirm({
        title: '重新采集？',
        content: hasDownstreamContent
          ? '重新采集会替换当前发现素材，并清空已选择素材、整理结果、事实卡片、稿件、音频和发布结果。是否继续？'
          : '重新采集会替换当前发现素材。是否继续？',
        okText: '继续采集',
        cancelText: '取消',
        okButtonProps: { danger: hasDownstreamContent },
        onOk: () => resolve(true),
        onCancel: () => resolve(false),
      })
    })
  }, [currentItems.length, hasDownstreamContent, modal])

  const handleRunOnce = useCallback(async () => {
    if (sourcesLoading) {
      setNotice({ type: 'info', text: '内置数据源仍在加载，请稍后再运行采集。' })
      return null
    }
    if (sourcesLoadError) {
      setNotice({ type: 'error', text: `内置数据源加载失败：${sourcesLoadError}` })
      return null
    }
    if (config.enabled_sources.length === 0) {
      setNotice({ type: 'warning', text: '请至少启用一个内置数据源。' })
      return null
    }
    const canRerun = await confirmRerun()
    if (!canRerun) return null
    setRunning(true)
    setStreamStartedAt(Date.now())
    setDisplayProgress(6)
    setNotice(null)
    setCurrentItems([])
    setCurrentMeta({})
    setSelectedKeys(new Set())
    setActiveDetailKey(null)
    setAuditOpen(false)
    setStreamState(createInitialStreamState(config, sources))
    try {
      const fetchConfig = buildFetchConfig(config)
      onConfigChange?.(fetchConfig)
      const result = await onRunOnce(fetchConfig, handlePostProcessProgress)
      const nextItems = result.items || []
      setCurrentItems(nextItems)
      setCurrentMeta(result.meta || {})
      setSelectedKeys(new Set())
      setActiveDetailKey(null)
      const rawCount = result.meta?.raw_item_count
      const topicText = config.topic.trim() && typeof result.meta?.topic_matched_count === 'number'
        ? `，主题匹配 ${result.meta.topic_matched_count} 条`
        : ''
      const filterText = typeof rawCount === 'number' && rawCount !== nextItems.length
        ? `，筛选后保留 ${nextItems.length} 条`
        : ''
      setNotice({ type: 'success', text: `采集完成，获得 ${rawCount ?? nextItems.length} 条素材${topicText}${filterText}` })
      setStreamState(prev => ({
        ...prev,
        phase: 'completed',
        detail: '采集完成',
        rawCount: rawCount ?? prev.rawCount,
        itemCount: nextItems.length,
      }))
      return nextItems
    } catch (error: any) {
      setNotice({ type: 'error', text: error.message || '采集失败' })
      setStreamState(prev => ({
        ...prev,
        phase: 'failed',
        detail: error.message || '采集失败',
      }))
      return null
    } finally {
      setRunning(false)
      setStreamStartedAt(null)
    }
  }, [config, confirmRerun, handlePostProcessProgress, onConfigChange, onRunOnce, sources, sourcesLoadError, sourcesLoading])

  const handleClearCollection = useCallback(async () => {
    setCurrentItems([])
    setCurrentMeta({})
    setSelectedKeys(new Set())
    setQuery('')
    setSourceFilter('all')
    setActiveDetailKey(null)
    setAuditOpen(false)
    setStreamState(EMPTY_DISCOVER_STREAM)
    setStreamStartedAt(null)
    setDisplayProgress(0)
    await onClearCollection?.()
    setNotice({ type: 'success', text: '已清空当前采集列表' })
  }, [onClearCollection])

  const toggleSelected = useCallback((item: ContentItem) => {
    const key = identity(item)
    setSelectedKeys(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const openDetail = useCallback((item: ContentItem) => {
    setActiveDetailKey(identity(item))
    if (typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 1200px)').matches) {
      setDetailDrawerOpen(true)
    }
  }, [])

  const selectAllVisible = useCallback(() => {
    setSelectedKeys(prev => {
      const next = new Set(prev)
      const allVisibleSelected = filteredItems.every(item => next.has(identity(item)))
      filteredItems.forEach(item => {
        const key = identity(item)
        if (allVisibleSelected) next.delete(key)
        else next.add(key)
      })
      return next
    })
  }, [filteredItems])

  const allVisibleSelected = filteredItems.length > 0 && filteredItems.every(item => selectedKeys.has(identity(item)))

  const handleProceed = useCallback(() => {
    if (running) {
      setNotice({ type: 'info', text: '采集仍在进行，请等待筛选结果生成后再进入整理。' })
      return
    }
    const selected = selectedItemsForProceed.length > 0
      ? selectedItemsForProceed
      : currentItems
    if (selected.length === 0) {
      setNotice({ type: 'warning', text: '当前没有可进入整理的素材。' })
      return
    }
    onProceedToOrganize(selected, {
      ...currentMeta,
      item_count: currentItems.length,
      selected_count: selected.length,
      source_counts: sourceCounts,
      generated_at: currentMeta.generated_at || new Date().toISOString(),
    }, buildFetchConfig(config))
  }, [config, currentItems, currentMeta, onProceedToOrganize, running, selectedItemsForProceed, sourceCounts])

  const settingsPanel = (
    <>
      <section className="discover-panel-block">
        <div className="discover-block-title"><SettingOutlined /> 采集范围</div>
        <label className="discover-field">
          <span>核心主题</span>
          <Input
            allowClear
            value={config.topic}
            placeholder="可选，填写后 AI 用于素材筛选"
            onChange={event => updateConfig({ topic: event.target.value })}
          />
        </label>
        <label className="discover-field">
          <span>时效性</span>
          <Select
            value={config.recency_hours}
            onChange={value => updateConfig({ recency_hours: Number(value) })}
            options={[
              { value: 24, label: '最近 24 小时' },
              { value: 72, label: '最近 3 天' },
              { value: 168, label: '最近 7 天' },
              { value: 0, label: '不限时间' },
            ]}
          />
        </label>
        <label className="discover-field">
          <span>每源条数</span>
          <InputNumber
            min={1}
            max={100}
            precision={0}
            value={resultLimitInput}
            onChange={value => setResultLimitInput(typeof value === 'number' ? value : null)}
            onBlur={() => commitResultLimitInput()}
            onPressEnter={() => commitResultLimitInput()}
          />
        </label>
      </section>

      <section className="discover-panel-block">
        <div className="discover-block-title"><DatabaseOutlined /> 数据源</div>
        <div className="discover-source-list">
          {sourcesLoading ? (
            <div className="discover-source-loading" aria-label="正在加载数据源">
              <span /><span /><span />
            </div>
          ) : sourcesLoadError ? (
            <Empty description={sourcesLoadError} image={Empty.PRESENTED_IMAGE_SIMPLE} />
          ) : sources.length === 0 ? (
            <Empty description="暂无可用数据源" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          ) : sources.map(source => {
            const isNewsNow = source.id === 'newsnow'
            return (
              <div key={source.id} className={`discover-source-row ${isNewsNow ? 'has-action' : ''}`}>
                <span title={source.description}>{source.name}</span>
                <div className="discover-source-actions">
                  {isNewsNow && (
                      <Button
                        title="管理 NewsNow 子源"
                        size="small"
                        type="text"
                        icon={<ToolOutlined />}
                        aria-label="管理 NewsNow 子源"
                        onClick={() => setNewsNowOpen(true)}
                      />
                  )}
                  <Switch
                    size="small"
                    aria-label={`启用 ${source.name}`}
                    checked={config.enabled_sources.includes(source.id)}
                    onChange={checked => toggleSource(source.id, checked)}
                  />
                </div>
              </div>
            )
          })}
        </div>
        <Button
          className="discover-run-collection"
          type="primary"
          icon={running ? <LoadingOutlined spin /> : <ReloadOutlined />}
          loading={running}
          onClick={handleRunOnce}
        >
          运行采集
        </Button>
      </section>
    </>
  )

  const detailPanel = detailPanelItem ? (
    <DiscoverItemDetail item={detailPanelItem} />
  ) : (
    <div className="discover-detail-empty">
      <Empty description="选择一条新闻查看详情" image={Empty.PRESENTED_IMAGE_SIMPLE} />
    </div>
  )

  if (!visible) return null

  return (
    <div className="discover-page">
      {modalContextHolder}
      <StageHeader
        title="素材发现"
        next={{
          disabled: running || availableItemsCount === 0,
          label: selectedItemsForProceed.length > 0 ? `整理 ${selectedItemsForProceed.length} 条` : '整理全部',
          onClick: handleProceed,
        }}
      />

      <main className="discover-layout">
        <aside className="discover-sidebar">
          {settingsPanel}
        </aside>

        <section className="discover-main">
          <div className="discover-toolbar">
            <div className="discover-toolbar-filters">
              <Button className="discover-mobile-control discover-mobile-settings" icon={<SettingOutlined />} onClick={() => setSettingsDrawerOpen(true)} aria-label="打开采集设置" />
              <Input
                allowClear
                prefix={<FilterOutlined />}
                value={query}
                placeholder="搜索标题、内容或来源"
                onChange={event => setQuery(event.target.value)}
              />
              <Select
                value={sourceFilter}
                onChange={setSourceFilter}
                options={[
                  { value: 'all', label: '全部来源' },
                  ...sources.map(source => ({ value: source.id, label: source.name })),
                ]}
              />
            </div>
            <div className="discover-toolbar-actions">
              <Button disabled={running || filteredItems.length === 0} onClick={selectAllVisible}>
                {allVisibleSelected ? '反选' : '全选'}
              </Button>
              <Button className="discover-mobile-control discover-mobile-detail" icon={<InfoCircleOutlined />} onClick={() => setDetailDrawerOpen(true)} disabled={!detailPanelItem} aria-label="打开新闻详情" />
              <Dropdown
                trigger={['click']}
                menu={{
                  items: [
                    { key: 'clear-selection', label: '清空选择', disabled: running || selectedItemsForProceed.length === 0 },
                    { key: 'audit', label: '查看采集复盘', disabled: !hasAudit },
                    { type: 'divider' },
                    { key: 'clear-collection', label: '清空当前采集', danger: true, disabled: running || currentItems.length === 0 },
                  ],
                  onClick: ({ key }) => {
                    if (key === 'clear-selection') setSelectedKeys(new Set())
                    if (key === 'audit') setAuditOpen(true)
                    if (key === 'clear-collection') void handleClearCollection()
                  },
                }}
              >
                <Button icon={<MoreOutlined />} aria-label="更多素材操作" />
              </Dropdown>
            </div>
          </div>

          {notice && (
            <div className="discover-notice" style={noticeStyle(notice.type)}>
              <div className="discover-notice-copy">
                {notice.type === 'success' ? <CheckCircleOutlined /> : notice.type === 'error' || notice.type === 'warning' ? <WarningOutlined /> : <InfoCircleOutlined />}
                <span>{notice.text}</span>
              </div>
              {hasAudit && (
                <Button
                  size="small"
                  className="discover-notice-detail"
                  onClick={() => setAuditOpen(true)}
                >
                  查看详情
                </Button>
              )}
            </div>
          )}

          {showStreamPanel && (
            <div className={`discover-stream ${streamState.phase}`}>
              <div className="discover-stream-progress">
                <div
                  className="discover-stream-bar"
                  role="progressbar"
                  aria-label="采集进度"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(displayProgress)}
                >
                  <span style={{ width: `${Math.round(displayProgress)}%` }} />
                </div>
                <small title={streamState.detail}>{streamState.detail}</small>
              </div>
              {streamSources.length > 0 && (
                <div className="discover-stream-sources">
                  {streamSources.map(source => (
                    <span key={source.id} className={`discover-stream-source ${source.status}`} title={source.error || source.name}>
                      {source.status === 'running' && <LoadingOutlined spin />}
                      {source.status === 'completed' && <CheckCircleOutlined />}
                      {source.status === 'failed' && <WarningOutlined />}
                      <b>{source.name}</b>
                      <em>{source.count}</em>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          <div
            className="discover-list"
            role={filteredItems.length > 0 ? 'listbox' : undefined}
            aria-multiselectable={filteredItems.length > 0 ? true : undefined}
            aria-label={filteredItems.length > 0 ? '新闻素材列表' : undefined}
          >
            {filteredItems.length === 0 ? (
              <Empty description={running ? '正在等待数据源返回素材' : '暂无素材，点击右上角运行采集'} />
            ) : filteredItems.map(item => {
              const selected = selectedKeys.has(identity(item))
              const active = activeDetailKey === identity(item)
              return (
                <article
                  key={identity(item)}
                  className={`discover-item ${active ? 'active' : ''}`}
                  aria-current={active ? 'true' : undefined}
                  aria-selected={selected}
                  role="option"
                  tabIndex={0}
                  onClick={() => openDetail(item)}
                  onKeyDown={event => {
                    if (event.key === 'Enter') openDetail(item)
                    if (event.key === ' ' && !running) {
                      event.preventDefault()
                      toggleSelected(item)
                    }
                  }}
                >
                  <Checkbox
                    checked={selected}
                    aria-label={selected ? '取消选择素材' : '选择素材'}
                    disabled={running}
                    onClick={event => event.stopPropagation()}
                    onChange={() => toggleSelected(item)}
                  />
                  <div className="discover-item-body">
                    <h3>{item.title || '未命名素材'}</h3>
                  </div>
                </article>
              )
            })}
          </div>
        </section>

        <aside className="discover-summary">
          <div className="discover-detail-heading"><InfoCircleOutlined /> 新闻详情</div>
          {detailPanel}
        </aside>
      </main>
      <Drawer title="采集设置" placement="left" width={340} open={settingsDrawerOpen} destroyOnClose onClose={() => setSettingsDrawerOpen(false)} className="discover-responsive-drawer">
        {settingsPanel}
      </Drawer>
      <Drawer title="新闻详情" width={420} open={detailDrawerOpen} destroyOnClose onClose={() => setDetailDrawerOpen(false)} className="discover-responsive-drawer">
        {detailPanel}
      </Drawer>
      <DiscoverRunAuditModal
        open={auditOpen}
        audit={currentMeta.audit}
        meta={currentMeta}
        onClose={() => setAuditOpen(false)}
      />
      <Modal
        title="NewsNow 子源"
        open={newsNowOpen}
        width={780}
        onCancel={() => setNewsNowOpen(false)}
        footer={[
          <Button key="clear" onClick={() => updateConfig({ newsnow_source_ids: [] })}>
            清空
          </Button>,
          <Button key="enable" type="primary" onClick={() => {
            if (!config.enabled_sources.includes('newsnow')) toggleSource('newsnow', true)
            setNewsNowOpen(false)
          }}>
            启用 NewsNow
          </Button>,
        ]}
        className="newsnow-source-modal"
      >
        <div className="newsnow-source-toolbar">
          <Input
            allowClear
            prefix={<FilterOutlined />}
            value={newsNowQuery}
            placeholder="搜索 NewsNow 子源"
            onChange={event => setNewsNowQuery(event.target.value)}
          />
          <Select
            value={newsNowCategory}
            onChange={value => setNewsNowCategory(value)}
            options={[
              { value: 'all', label: '全部分类' },
              ...Object.entries(NEWSNOW_CATEGORY_LABELS).map(([value, label]) => ({ value, label })),
            ]}
          />
        </div>
        <div className="newsnow-preset-row">
          {NEWSNOW_PRESETS.map(preset => (
            <Button key={preset.label} size="small" onClick={() => applyNewsNowPreset(preset.ids)}>
              {preset.label}
            </Button>
          ))}
        </div>
        <div className="newsnow-source-summary">
          <span>已选 {newsNowSelectedIds.length} 个子源</span>
        </div>
        <div className="newsnow-source-grid">
          {filteredNewsNowSources.length === 0 ? (
            <Empty description="没有匹配的 NewsNow 子源" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          ) : filteredNewsNowSources.map(source => (
            <label key={source.id} className="newsnow-source-item">
              <span>
                <strong>{source.name}</strong>
              </span>
              <span className="newsnow-source-meta">
                {source.type && <Tag>{source.type === 'hottest' ? '热榜' : '快讯'}</Tag>}
                {source.disabledOnCloudflare && <Tag color="warning">CF 受限</Tag>}
                <Switch size="small" checked={newsNowSelectedSet.has(source.id)} onChange={checked => toggleNewsNowSource(source.id, checked)} />
              </span>
            </label>
          ))}
        </div>
      </Modal>
    </div>
  )
}
