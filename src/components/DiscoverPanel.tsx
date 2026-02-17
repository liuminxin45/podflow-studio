import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Empty, Input, InputNumber, Select, Switch, Tooltip } from 'antd'
import {
  ArrowLeftOutlined,
  ArrowRightOutlined,
  CheckCircleOutlined,
  CloseOutlined,
  DatabaseOutlined,
  ExportSquareOutlined,
  FilterOutlined,
  InfoCircleOutlined,
  LoadingOutlined,
  RadarChartOutlined,
  ReloadOutlined,
  SettingOutlined,
  SyncOutlined,
  WarningOutlined,
} from '../icons/antdCompat'
import type { ContentItem } from '../types/workflow'
import type {
  TrendRadarConfigView,
  TrendRadarItem,
  TrendRadarMeta,
  TrendRadarRunResult,
  TrendRadarSource,
  TrendRadarStatus,
  TrendRadarUpdateStatus,
} from '../types/trendradar'

type Notice = { type: 'info' | 'success' | 'warning' | 'error'; text: string } | null

type FetchRunLog = {
  id: string
  at: number
  level: 'info' | 'success' | 'error'
  text: string
}

interface Props {
  visible: boolean
  onClose: () => void
  items: TrendRadarItem[]
  selectedItems: TrendRadarItem[]
  meta?: TrendRadarMeta
  onRunOnce: (config: Partial<TrendRadarConfigView>) => Promise<TrendRadarRunResult>
  onLoadConfig: () => Promise<TrendRadarConfigView>
  onSaveConfig: (config: Partial<TrendRadarConfigView>) => Promise<TrendRadarConfigView>
  onListSources: () => Promise<TrendRadarSource[]>
  onGetStatus: () => Promise<TrendRadarStatus>
  onCheckUpdate: () => Promise<TrendRadarUpdateStatus>
  onUpdateDependency: () => Promise<Record<string, any>>
  onOpenReport: (reportPath: string) => Promise<void>
  onProceedToOrganize: (items: TrendRadarItem[], meta: TrendRadarMeta) => void
}

const DEFAULT_CONFIG: TrendRadarConfigView = {
  platforms_enabled: true,
  rss_enabled: true,
  enabled_platforms: [],
  enabled_rss_feeds: [],
  max_items_per_source: 30,
  freshness_days: 3,
  filter_method: 'keyword',
  ai_available: false,
  ai_model: '',
  api_url: '',
  proxy_enabled: false,
  proxy_url: '',
  schedule_preset: 'morning_evening',
  report_mode: 'current',
}

function identity(item: ContentItem): string {
  return item.trendradar_id || `${item.url || ''}|${item.title || ''}|${item.source || ''}`
}

function formatTime(value?: string | null): string {
  if (!value) return '暂无'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN', { hour12: false })
}

function sourceLabel(item: TrendRadarItem): string {
  const rank = item.rank ? ` #${item.rank}` : ''
  return `${item.source_name || item.source || '未知来源'}${rank}`
}

function noticeStyle(type: NonNullable<Notice>['type']) {
  if (type === 'error') return { background: 'var(--error-bg)', color: 'var(--error-color)', borderColor: '#f3c4c4' }
  if (type === 'warning') return { background: 'var(--warning-bg)', color: 'var(--warning-color)', borderColor: '#ead9a4' }
  if (type === 'success') return { background: 'var(--success-bg)', color: 'var(--success-color)', borderColor: '#cadfca' }
  return { background: 'var(--info-bg)', color: 'var(--info-color)', borderColor: '#c6dfef' }
}

export default function DiscoverPanel({
  visible,
  onClose,
  items,
  selectedItems,
  meta,
  onRunOnce,
  onLoadConfig,
  onSaveConfig,
  onListSources,
  onGetStatus,
  onCheckUpdate,
  onUpdateDependency,
  onOpenReport,
  onProceedToOrganize,
}: Props) {
  const [config, setConfig] = useState<TrendRadarConfigView>(DEFAULT_CONFIG)
  const [sources, setSources] = useState<TrendRadarSource[]>([])
  const [status, setStatus] = useState<TrendRadarStatus | null>(null)
  const [updateStatus, setUpdateStatus] = useState<TrendRadarUpdateStatus | null>(null)
  const [currentItems, setCurrentItems] = useState<TrendRadarItem[]>(items)
  const [currentMeta, setCurrentMeta] = useState<TrendRadarMeta>(meta || {})
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set(selectedItems.map(identity)))
  const [query, setQuery] = useState('')
  const [sourceKind, setSourceKind] = useState<'all' | 'platform' | 'rss'>('all')
  const [running, setRunning] = useState(false)
  const [saving, setSaving] = useState(false)
  const [checkingUpdate, setCheckingUpdate] = useState(false)
  const [updatingDependency, setUpdatingDependency] = useState(false)
  const [notice, setNotice] = useState<Notice>(null)

  const appendFetchLog = useCallback((level: FetchRunLog['level'], text: string) => {
    const entry: FetchRunLog = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      at: Date.now(),
      level,
      text,
    }
    setFetchRunLogs(prev => [entry, ...prev].slice(0, 20))
  }, [])

  useEffect(() => {
    if (!visible) return
    setCurrentItems(items)
    setCurrentMeta(meta || {})
    setSelectedKeys(new Set(selectedItems.map(identity)))
  }, [visible, items, selectedItems, meta])

  useEffect(() => {
    if (!visible) return
    let cancelled = false
    Promise.all([onLoadConfig(), onListSources(), onGetStatus()])
      .then(([loadedConfig, loadedSources, loadedStatus]) => {
        if (cancelled) return
        setConfig({ ...DEFAULT_CONFIG, ...loadedConfig })
        setSources(loadedSources)
        setStatus(loadedStatus)
      })
      .catch((error) => {
        if (!cancelled) setNotice({ type: 'error', text: `TrendRadar 初始化失败：${error.message}` })
      })
    return () => { cancelled = true }
  }, [visible, onLoadConfig, onListSources, onGetStatus])

  const selectedItemsForProceed = useMemo(() => {
    return currentItems.filter(item => selectedKeys.has(identity(item)))
  }, [currentItems, selectedKeys])

  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return currentItems.filter(item => {
      if (sourceKind !== 'all' && item.source_kind !== sourceKind) return false
      if (!normalizedQuery) return true
      const text = `${item.title || ''} ${item.content || ''} ${item.source_name || ''}`.toLowerCase()
      return text.includes(normalizedQuery)
    })
  }, [currentItems, query, sourceKind])

  const platformSources = useMemo(() => sources.filter(source => source.kind === 'platform'), [sources])
  const rssSources = useMemo(() => sources.filter(source => source.kind === 'rss'), [sources])

  const updateConfig = useCallback((patch: Partial<TrendRadarConfigView>) => {
    setConfig(prev => ({ ...prev, ...patch }))
  }, [])

  const toggleSource = useCallback((source: TrendRadarSource, enabled: boolean) => {
    if (source.kind === 'platform') {
      const next = new Set(config.enabled_platforms)
      if (enabled) next.add(source.id)
      else next.delete(source.id)
      updateConfig({ enabled_platforms: Array.from(next) })
    } else {
      const next = new Set(config.enabled_rss_feeds)
      if (enabled) next.add(source.id)
      else next.delete(source.id)
      updateConfig({ enabled_rss_feeds: Array.from(next) })
    }
  }, [config.enabled_platforms, config.enabled_rss_feeds, updateConfig])

  const handleSaveConfig = useCallback(async () => {
    setSaving(true)
    setNotice(null)
    try {
      const saved = await onSaveConfig(config)
      setConfig({ ...DEFAULT_CONFIG, ...saved })
      const loadedSources = await onListSources()
      setSources(loadedSources)
      setNotice({ type: 'success', text: 'TrendRadar 配置已保存' })
    } catch (error: any) {
      setNotice({ type: 'error', text: error.message || '配置保存失败' })
    } finally {
      setSaving(false)
    }
  }, [config, onSaveConfig, onListSources])

  const handleRunOnce = useCallback(async () => {
    setRunning(true)
    setNotice(null)
    try {
      const result = await onRunOnce(config)
      const nextItems = result.items || result.fetch_contents || []
      setCurrentItems(nextItems)
      setCurrentMeta(result.meta || {})
      setSelectedKeys(new Set())
      const nextStatus = await onGetStatus()
      setStatus(nextStatus)
      setNotice({ type: 'success', text: `采集完成，获得 ${nextItems.length} 条素材` })
    } catch (error: any) {
      setNotice({ type: 'error', text: error.message || '采集失败' })
    } finally {
      setRunning(false)
    }
  }, [config, onRunOnce, onGetStatus])

  const handleCheckUpdate = useCallback(async () => {
    setCheckingUpdate(true)
    setNotice(null)
    try {
      const result = await onCheckUpdate()
      setUpdateStatus(result)
      if (result.blocked) {
        setNotice({ type: 'warning', text: result.blocker || '当前运行时不满足上游版本要求' })
      } else if (result.updateAvailable) {
        setNotice({ type: 'info', text: `发现 TrendRadar ${result.remoteVersion}` })
      } else {
        setNotice({ type: 'success', text: 'TrendRadar 当前无需更新' })
      }
    } catch (error: any) {
      setNotice({ type: 'error', text: error.message || '更新检查失败' })
    } finally {
      setCheckingUpdate(false)
    }
  }, [onCheckUpdate])

  const handleUpdateDependency = useCallback(async () => {
    setUpdatingDependency(true)
    setNotice(null)
    try {
      await onUpdateDependency()
      const [nextStatus, nextUpdateStatus, loadedSources] = await Promise.all([
        onGetStatus(),
        onCheckUpdate(),
        onListSources(),
      ])
      setStatus(nextStatus)
      setUpdateStatus(nextUpdateStatus)
      setSources(loadedSources)
      setNotice({ type: 'success', text: 'TrendRadar 依赖已更新' })
    } catch (error: any) {
      setNotice({ type: 'error', text: error.message || 'TrendRadar 更新失败' })
    } finally {
      setUpdatingDependency(false)
    }
  }, [onUpdateDependency, onGetStatus, onCheckUpdate, onListSources])

  const toggleSelected = useCallback((item: TrendRadarItem) => {
    const key = identity(item)
    setSelectedKeys(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const selectAllVisible = useCallback(() => {
    setSelectedKeys(prev => {
      const next = new Set(prev)
      filteredItems.forEach(item => next.add(identity(item)))
      return next
    })
  }, [filteredItems])

  const handleProceed = useCallback(() => {
    if (selectedItemsForProceed.length === 0) {
      setNotice({ type: 'warning', text: '请先选择至少一条素材' })
      return
    }
    onProceedToOrganize(selectedItemsForProceed, currentMeta)
  }, [selectedItemsForProceed, currentMeta, onProceedToOrganize])

  if (!visible) return null

  return (
    <div className="discover-workbench">
      <header className="discover-header">
        <div className="discover-title">
          <span className="discover-title-icon"><RadarChartOutlined /></span>
          <div>
            <div className="discover-title-text">发现</div>
            <div className="discover-title-sub">
              TrendRadar 单一数据源 · {currentItems.length} 条素材 · {selectedItemsForProceed.length} 条已选
            </div>
          </div>
        </div>
        <div className="discover-actions">
          {currentMeta.report_path && (
            <Tooltip title="打开 TrendRadar 报告">
              <Button icon={<ExportSquareOutlined />} onClick={() => onOpenReport(currentMeta.report_path || '')} />
            </Tooltip>
          )}
          <Tooltip title="检查 TrendRadar 更新">
            <Button icon={checkingUpdate ? <LoadingOutlined spin /> : <SyncOutlined />} onClick={handleCheckUpdate} />
          </Tooltip>
          {updateStatus?.updateAvailable && !updateStatus.blocked && (
            <Tooltip title="更新 TrendRadar 依赖">
              <Button icon={updatingDependency ? <LoadingOutlined spin /> : <SyncOutlined />} loading={updatingDependency} onClick={handleUpdateDependency}>
                更新
              </Button>
            </Tooltip>
          )}
          <Tooltip title="立即采集">
            <Button type="primary" icon={running ? <LoadingOutlined spin /> : <ReloadOutlined />} loading={running} onClick={handleRunOnce}>
              采集
            </Button>
          </Tooltip>
          <Tooltip title="返回">
            <Button icon={<ArrowLeftOutlined />} onClick={onClose} />
          </Tooltip>
        </div>
      </header>

      <main className="discover-body">
        <aside className="discover-side">
          <section className="discover-panel-block">
            <div className="discover-block-title"><SettingOutlined /> 采集设置</div>
            <label className="discover-field">
              <span>每源条数</span>
              <InputNumber
                min={1}
                max={100}
                value={config.max_items_per_source}
                onChange={value => updateConfig({ max_items_per_source: Number(value || 30) })}
              />
            </label>
            <label className="discover-field">
              <span>RSS 新鲜度</span>
              <InputNumber
                min={0}
                max={30}
                addonAfter="天"
                value={config.freshness_days}
                onChange={value => updateConfig({ freshness_days: Number(value || 0) })}
              />
            </label>
            <label className="discover-field">
              <span>筛选方式</span>
              <Select
                value={config.filter_method}
                onChange={value => updateConfig({ filter_method: value })}
                options={[
                  { value: 'keyword', label: '关键词' },
                  { value: 'ai', label: config.ai_available ? 'AI 智能筛选' : 'AI 智能筛选（未配置）', disabled: !config.ai_available },
                ]}
              />
            </label>
            {!config.ai_available && (
              <div className="discover-hint warning">
                <WarningOutlined /> AI 筛选依赖 TrendRadar 的 AI API Key。未配置前只能使用关键词筛选。
              </div>
            )}
            <label className="discover-field">
              <span>NewsNow API</span>
              <Input
                value={config.api_url}
                placeholder="留空使用 TrendRadar 默认接口"
                onChange={event => updateConfig({ api_url: event.target.value })}
              />
            </label>
            <label className="discover-switch-row">
              <span>代理</span>
              <Switch checked={config.proxy_enabled} onChange={checked => updateConfig({ proxy_enabled: checked })} />
            </label>
            {config.proxy_enabled && (
              <Input
                value={config.proxy_url}
                placeholder="http://127.0.0.1:10801"
                onChange={event => updateConfig({ proxy_url: event.target.value })}
              />
            )}
            <Button block onClick={handleSaveConfig} loading={saving}>
              保存设置
            </Button>
          </section>

          <section className="discover-panel-block">
            <div className="discover-block-title"><DatabaseOutlined /> 数据源</div>
            <label className="discover-switch-row">
              <span>热榜平台</span>
              <Switch checked={config.platforms_enabled} onChange={checked => updateConfig({ platforms_enabled: checked })} />
            </label>
            <div className="discover-source-list">
              {platformSources.map(source => (
                <label key={`platform-${source.id}`} className="discover-source-row">
                  <span>{source.name}</span>
                  <Switch size="small" checked={config.enabled_platforms.includes(source.id)} onChange={checked => toggleSource(source, checked)} />
                </label>
              ))}
            </div>
            <label className="discover-switch-row">
              <span>RSS</span>
              <Switch checked={config.rss_enabled} onChange={checked => updateConfig({ rss_enabled: checked })} />
            </label>
            <div className="discover-source-list">
              {rssSources.map(source => (
                <label key={`rss-${source.id}`} className="discover-source-row">
                  <span title={source.url}>{source.name}</span>
                  <Switch size="small" checked={config.enabled_rss_feeds.includes(source.id)} onChange={checked => toggleSource(source, checked)} />
                </label>
              ))}
            </div>
          </section>
        </aside>

        <section className="discover-main">
          <div className="discover-toolbar">
            <Input
              allowClear
              prefix={<FilterOutlined />}
              value={query}
              placeholder="搜索标题、内容或来源"
              onChange={event => setQuery(event.target.value)}
            />
            <Select
              value={sourceKind}
              onChange={setSourceKind}
              style={{ width: 132 }}
              options={[
                { value: 'all', label: '全部来源' },
                { value: 'platform', label: '热榜' },
                { value: 'rss', label: 'RSS' },
              ]}
            />
            <Button onClick={selectAllVisible}>全选当前</Button>
            <Button onClick={() => setSelectedKeys(new Set())} icon={<CloseOutlined />}>清空选择</Button>
          </div>

          {notice && (
            <div className="discover-notice" style={noticeStyle(notice.type)}>
              {notice.type === 'success' ? <CheckCircleOutlined /> : notice.type === 'error' || notice.type === 'warning' ? <WarningOutlined /> : <InfoCircleOutlined />}
              <span>{notice.text}</span>
            </div>
          )}

          <div className="discover-status-grid">
            <div>
              <span>运行状态</span>
              <strong>{running ? '采集中' : status?.status || '就绪'}</strong>
            </div>
            <div>
              <span>最近采集</span>
              <strong>{formatTime(status?.latestRunAt || currentMeta.generated_at)}</strong>
            </div>
            <div>
              <span>失败来源</span>
              <strong>{currentMeta.failed_sources?.length || 0}</strong>
            </div>
            <div>
              <span>版本</span>
              <strong>{updateStatus?.remoteVersion ? `${status?.localVersion || '未知'} / ${updateStatus.remoteVersion}` : status?.localVersion || '未知'}</strong>
            </div>
          </div>

          {status?.runtimeBlocked && (
            <div className="discover-notice" style={noticeStyle('warning')}>
              <WarningOutlined />
              <span>{status.runtimeBlocker || 'TrendRadar 完整运行时未就绪，热榜薄适配仍可用于采集。'}</span>
            </div>
          )}

          {updateStatus?.blocked && (
            <div className="discover-notice" style={noticeStyle('warning')}>
              <WarningOutlined />
              <span>{updateStatus.blocker}</span>
            </div>
          )}

          <div className="discover-topic-strip">
            {(currentMeta.topics || []).slice(0, 8).map(topic => (
              <span key={topic.name}>{topic.name}<b>{topic.count}</b></span>
            ))}
            {(currentMeta.topics || []).length === 0 && <span>暂无趋势统计</span>}
          </div>

          <div className="discover-list">
            {filteredItems.length === 0 ? (
              <Empty description="暂无 TrendRadar 素材，点击右上角采集" />
            ) : filteredItems.map(item => {
              const selected = selectedKeys.has(identity(item))
              return (
                <article
                  key={identity(item)}
                  className={`discover-item ${selected ? 'selected' : ''}`}
                  onClick={() => toggleSelected(item)}
                >
                  <div className="discover-item-check">
                    {selected ? <CheckCircleOutlined /> : null}
                  </div>
                  <div className="discover-item-body">
                    <div className="discover-item-meta">
                      <span>{item.source_kind === 'rss' ? 'RSS' : '热榜'}</span>
                      <span>{sourceLabel(item)}</span>
                      <span>{formatTime(item.published || item.first_seen)}</span>
                    </div>
                    <h3>{item.title || '未命名素材'}</h3>
                    <p>{item.content || item.matched_reason || '无摘要'}</p>
                    <div className="discover-item-foot">
                      <span>{item.matched_reason || 'TrendRadar'}</span>
                      {item.url && <a href={item.url} onClick={event => event.stopPropagation()} target="_blank" rel="noreferrer">打开链接</a>}
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        </section>

        <aside className="discover-summary">
          <div className="discover-panel-block">
            <div className="discover-block-title"><RadarChartOutlined /> 素材摘要</div>
            <div className="discover-metric"><span>当前列表</span><strong>{filteredItems.length}</strong></div>
            <div className="discover-metric"><span>已选择</span><strong>{selectedItemsForProceed.length}</strong></div>
            <div className="discover-metric"><span>热榜来源</span><strong>{currentMeta.platform_count || 0}</strong></div>
            <div className="discover-metric"><span>RSS 来源</span><strong>{currentMeta.rss_count || 0}</strong></div>
            <Button type="primary" block icon={<ArrowRightOutlined />} onClick={handleProceed}>
              进入整理
            </Button>
          </div>
        </aside>
      </main>
    </div>
  )
}
