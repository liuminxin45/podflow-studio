import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Empty, Input, InputNumber, Select, Switch, Tooltip } from 'antd'
import {
  ArrowLeftOutlined,
  ArrowRightOutlined,
  BulbOutlined,
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
import AutoTopicModal from './AutoTopicModal'
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

interface Props {
  visible: boolean
  onClose: () => void
  items: TrendRadarItem[]
  selectedItems: TrendRadarItem[]
  meta?: TrendRadarMeta
  initialConfig?: Partial<TrendRadarConfigView>
  onConfigChange?: (config: TrendRadarConfigView) => void
  onRunOnce: (config: Partial<TrendRadarConfigView>) => Promise<TrendRadarRunResult>
  onLoadConfig: () => Promise<TrendRadarConfigView>
  onListSources: () => Promise<TrendRadarSource[]>
  onGetStatus: () => Promise<TrendRadarStatus>
  onCheckUpdate: () => Promise<TrendRadarUpdateStatus>
  onUpdateDependency: () => Promise<Record<string, any>>
  onOpenReport: (reportPath: string) => Promise<void>
  onProceedToOrganize: (items: TrendRadarItem[], meta: TrendRadarMeta, config: TrendRadarConfigView) => void
}

const DEFAULT_CONFIG: TrendRadarConfigView = {
  timezone: 'Asia/Shanghai',
  show_version_update: true,
  platforms_enabled: true,
  rss_enabled: true,
  enabled_platforms: [],
  enabled_rss_feeds: [],
  max_items_per_source: 30,
  freshness_days: 3,
  rss_freshness_enabled: true,
  rss_request_interval: 1000,
  rss_timeout: 15,
  rss_proxy_enabled: false,
  rss_proxy_url: '',
  crawler_request_interval: 2000,
  filter_method: 'keyword',
  filter_priority_sort_enabled: true,
  ai_available: false,
  ai_api_key_set: false,
  ai_provider_source: 'none',
  ai_model: '',
  ai_api_base: '',
  ai_timeout: 120,
  ai_temperature: 1,
  ai_max_tokens: 5000,
  ai_num_retries: 1,
  ai_fallback_models: [],
  ai_filter_batch_size: 200,
  ai_filter_batch_interval: 2,
  ai_filter_min_score: 0.7,
  ai_filter_reclassify_threshold: 0.6,
  ai_interests_file: '',
  ai_filter_prompt_file: 'prompt.txt',
  ai_filter_extract_prompt_file: 'extract_prompt.txt',
  ai_filter_update_tags_prompt_file: 'update_tags_prompt.txt',
  api_url: '',
  proxy_enabled: false,
  proxy_url: '',
  schedule_preset: 'morning_evening',
  report_mode: 'current',
  report_display_mode: 'keyword',
  sort_by_position_first: true,
  rank_threshold: 30,
  max_news_per_keyword: 3,
  display_standalone_enabled: false,
  standalone_platforms: [],
  standalone_rss_feeds: [],
  standalone_max_items: 5,
  debug: false,
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

function aiProviderText(config: TrendRadarConfigView): string {
  if (config.ai_provider_source === 'app') return 'Settings 中的发现/搜索模型'
  if (config.ai_provider_source === 'env') return '环境变量 AI_MODEL / AI_API_KEY'
  if (config.ai_provider_source === 'trendradar') return 'TrendRadar 默认 AI 配置'
  return 'Settings 或 TrendRadar 环境配置'
}

function listToInput(value?: string[]): string {
  return (value || []).join(', ')
}

function inputToList(value: string): string[] {
  return value.split(',').map(part => part.trim()).filter(Boolean)
}

function mergeConfig(...configs: Array<Partial<TrendRadarConfigView> | undefined>): TrendRadarConfigView {
  return configs.reduce<TrendRadarConfigView>((merged, current) => ({
    ...merged,
    ...(current || {}),
    enabled_platforms: current?.enabled_platforms ?? merged.enabled_platforms,
    enabled_rss_feeds: current?.enabled_rss_feeds ?? merged.enabled_rss_feeds,
    ai_fallback_models: current?.ai_fallback_models ?? merged.ai_fallback_models,
    standalone_platforms: current?.standalone_platforms ?? merged.standalone_platforms,
    standalone_rss_feeds: current?.standalone_rss_feeds ?? merged.standalone_rss_feeds,
  }), { ...DEFAULT_CONFIG })
}

function buildEpisodeDefaultConfig(loadedConfig: TrendRadarConfigView, sources: TrendRadarSource[]): TrendRadarConfigView {
  return mergeConfig({
    timezone: loadedConfig.timezone || DEFAULT_CONFIG.timezone,
    show_version_update: loadedConfig.show_version_update ?? DEFAULT_CONFIG.show_version_update,
    enabled_platforms: sources
      .filter(source => source.kind === 'platform' && source.enabled)
      .map(source => source.id),
    enabled_rss_feeds: sources
      .filter(source => source.kind === 'rss' && source.enabled)
      .map(source => source.id),
    ai_available: loadedConfig.ai_available,
    ai_api_key_set: loadedConfig.ai_api_key_set,
    ai_provider_source: loadedConfig.ai_provider_source,
    ai_model: loadedConfig.ai_model,
    ai_api_base: loadedConfig.ai_api_base,
    ai_timeout: loadedConfig.ai_timeout,
    ai_temperature: loadedConfig.ai_temperature,
    ai_max_tokens: loadedConfig.ai_max_tokens,
    ai_num_retries: loadedConfig.ai_num_retries,
    ai_fallback_models: loadedConfig.ai_fallback_models,
  })
}

export default function DiscoverPanel({
  visible,
  onClose,
  items,
  selectedItems,
  meta,
  initialConfig,
  onConfigChange,
  onRunOnce,
  onLoadConfig,
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
  const [autoTopicModalVisible, setAutoTopicModalVisible] = useState(false)

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
        setConfig(mergeConfig(buildEpisodeDefaultConfig(loadedConfig, loadedSources), initialConfig))
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
    setConfig(prev => {
      const next = mergeConfig(prev, patch)
      onConfigChange?.(next)
      return next
    })
  }, [onConfigChange])

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
      onConfigChange?.(config)
      setNotice({ type: 'success', text: '采集设置已保存到当前节目' })
    } catch (error: any) {
      setNotice({ type: 'error', text: error.message || '配置保存失败' })
    } finally {
      setSaving(false)
    }
  }, [config, onConfigChange])

  const handleRunOnce = useCallback(async () => {
    setRunning(true)
    setNotice(null)
    try {
      onConfigChange?.(config)
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
  }, [config, onConfigChange, onRunOnce, onGetStatus])

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
    onProceedToOrganize(selectedItemsForProceed, currentMeta, config)
  }, [selectedItemsForProceed, currentMeta, config, onProceedToOrganize])

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
          <Tooltip title="AI 自动选题">
            <Button
              type="primary"
              icon={<BulbOutlined />}
              onClick={() => setAutoTopicModalVisible(true)}
              style={{ borderRadius: 8, fontSize: 12, height: 30 }}
            >
              自动选题
            </Button>
          </Tooltip>
          <Tooltip title="进入整理">
            <Button
              type="primary"
              icon={<ArrowRightOutlined />}
              onClick={handleProceed}
              style={{
                background: 'var(--accent-primary)',
                borderColor: 'var(--accent-primary)',
                borderRadius: 8, height: 32, minWidth: 32,
              }}
            />
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
              <span>时区</span>
              <Input
                value={config.timezone || ''}
                placeholder="Asia/Shanghai"
                onChange={event => updateConfig({ timezone: event.target.value })}
              />
            </label>
            <label className="discover-field">
              <span>热榜间隔</span>
              <InputNumber
                min={0}
                max={30000}
                addonAfter="ms"
                value={config.crawler_request_interval}
                onChange={value => updateConfig({ crawler_request_interval: Number(value ?? 2000) })}
              />
            </label>
            <label className="discover-switch-row">
              <span>RSS 新鲜度过滤</span>
              <Switch
                checked={config.rss_freshness_enabled !== false}
                onChange={checked => updateConfig({ rss_freshness_enabled: checked })}
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
              <span>RSS 间隔</span>
              <InputNumber
                min={0}
                max={30000}
                addonAfter="ms"
                value={config.rss_request_interval}
                onChange={value => updateConfig({ rss_request_interval: Number(value ?? 1000) })}
              />
            </label>
            <label className="discover-field">
              <span>RSS 超时</span>
              <InputNumber
                min={1}
                max={120}
                addonAfter="秒"
                value={config.rss_timeout}
                onChange={value => updateConfig({ rss_timeout: Number(value ?? 15) })}
              />
            </label>
            <label className="discover-switch-row">
              <span>RSS 代理</span>
              <Switch checked={!!config.rss_proxy_enabled} onChange={checked => updateConfig({ rss_proxy_enabled: checked })} />
            </label>
            {config.rss_proxy_enabled && (
              <Input
                value={config.rss_proxy_url || ''}
                placeholder="http://127.0.0.1:10801"
                onChange={event => updateConfig({ rss_proxy_url: event.target.value })}
              />
            )}
            <label className="discover-field">
              <span>筛选方式</span>
              <Select
                value={config.filter_method}
                onChange={value => updateConfig({ filter_method: value })}
                options={[
                  { value: 'keyword', label: '关键词' },
                  { value: 'ai', label: 'AI 智能筛选' },
                ]}
              />
            </label>
            {config.filter_method === 'ai' && (
              <div className={`discover-hint ${config.ai_available ? 'info' : 'warning'}`}>
                {config.ai_available ? <InfoCircleOutlined /> : <WarningOutlined />}
                {config.ai_available
                  ? `AI 筛选将使用 ${aiProviderText(config)}，并按 TrendRadar 6.10 的 ai_filter 配置执行。`
                  : 'AI 筛选已可选择；运行时会优先读取 Settings 的发现/搜索模型，其次读取 AI_MODEL / AI_API_KEY 环境变量。'}
              </div>
            )}
            {config.filter_method === 'ai' && (
              <>
                <label className="discover-field">
                  <span>AI 模型</span>
                  <Input
                    value={config.ai_model || ''}
                    placeholder="留空使用 Settings 或 TrendRadar 默认模型"
                    onChange={event => updateConfig({ ai_model: event.target.value })}
                  />
                </label>
                <label className="discover-field">
                  <span>AI API Base</span>
                  <Input
                    value={config.ai_api_base || ''}
                    placeholder="留空使用 Settings 或 TrendRadar 默认接口"
                    onChange={event => updateConfig({ ai_api_base: event.target.value })}
                  />
                </label>
                <label className="discover-field">
                  <span>AI 超时</span>
                  <InputNumber
                    min={1}
                    max={600}
                    addonAfter="秒"
                    value={config.ai_timeout}
                    onChange={value => updateConfig({ ai_timeout: Number(value ?? 120) })}
                  />
                </label>
                <label className="discover-field">
                  <span>温度</span>
                  <InputNumber
                    min={0}
                    max={2}
                    step={0.1}
                    value={config.ai_temperature}
                    onChange={value => updateConfig({ ai_temperature: Number(value ?? 1) })}
                  />
                </label>
                <label className="discover-field">
                  <span>最大 Tokens</span>
                  <InputNumber
                    min={0}
                    max={64000}
                    value={config.ai_max_tokens}
                    onChange={value => updateConfig({ ai_max_tokens: Number(value ?? 5000) })}
                  />
                </label>
                <label className="discover-field">
                  <span>重试次数</span>
                  <InputNumber
                    min={0}
                    max={10}
                    value={config.ai_num_retries}
                    onChange={value => updateConfig({ ai_num_retries: Number(value ?? 1) })}
                  />
                </label>
                <label className="discover-field">
                  <span>备用模型</span>
                  <Input
                    value={listToInput(config.ai_fallback_models)}
                    placeholder="model-a, model-b"
                    onChange={event => updateConfig({ ai_fallback_models: inputToList(event.target.value) })}
                  />
                </label>
                <label className="discover-field">
                  <span>兴趣文件</span>
                  <Input
                    value={config.ai_interests_file || ''}
                    placeholder="默认 ai_interests.txt；自定义文件放 config/custom/ai"
                    onChange={event => updateConfig({ ai_interests_file: event.target.value })}
                  />
                </label>
                <label className="discover-field">
                  <span>分类提示词</span>
                  <Input
                    value={config.ai_filter_prompt_file || ''}
                    placeholder="prompt.txt"
                    onChange={event => updateConfig({ ai_filter_prompt_file: event.target.value })}
                  />
                </label>
                <label className="discover-field">
                  <span>标签提示词</span>
                  <Input
                    value={config.ai_filter_extract_prompt_file || ''}
                    placeholder="extract_prompt.txt"
                    onChange={event => updateConfig({ ai_filter_extract_prompt_file: event.target.value })}
                  />
                </label>
                <label className="discover-field">
                  <span>更新提示词</span>
                  <Input
                    value={config.ai_filter_update_tags_prompt_file || ''}
                    placeholder="update_tags_prompt.txt"
                    onChange={event => updateConfig({ ai_filter_update_tags_prompt_file: event.target.value })}
                  />
                </label>
                <label className="discover-field">
                  <span>最低分数</span>
                  <InputNumber
                    min={0}
                    max={1}
                    step={0.05}
                    value={config.ai_filter_min_score}
                    onChange={value => updateConfig({ ai_filter_min_score: Number(value ?? 0.7) })}
                  />
                </label>
                <label className="discover-field">
                  <span>重分类阈值</span>
                  <InputNumber
                    min={0}
                    max={1}
                    step={0.05}
                    value={config.ai_filter_reclassify_threshold}
                    onChange={value => updateConfig({ ai_filter_reclassify_threshold: Number(value ?? 0.6) })}
                  />
                </label>
                <label className="discover-field">
                  <span>AI 批大小</span>
                  <InputNumber
                    min={1}
                    max={500}
                    value={config.ai_filter_batch_size}
                    onChange={value => updateConfig({ ai_filter_batch_size: Number(value || 200) })}
                  />
                </label>
                <label className="discover-field">
                  <span>批间隔</span>
                  <InputNumber
                    min={0}
                    max={60}
                    addonAfter="秒"
                    value={config.ai_filter_batch_interval}
                    onChange={value => updateConfig({ ai_filter_batch_interval: Number(value ?? 2) })}
                  />
                </label>
                <label className="discover-switch-row">
                  <span>按兴趣顺序排序</span>
                  <Switch
                    checked={config.filter_priority_sort_enabled !== false}
                    onChange={checked => updateConfig({ filter_priority_sort_enabled: checked })}
                  />
                </label>
              </>
            )}
            <label className="discover-field">
              <span>报告模式</span>
              <Select
                value={config.report_mode || 'current'}
                onChange={value => updateConfig({ report_mode: value })}
                options={[
                  { value: 'current', label: '当前模式' },
                  { value: 'daily', label: '日报模式' },
                  { value: 'incremental', label: '增量模式' },
                ]}
              />
            </label>
            <label className="discover-field">
              <span>展示分组</span>
              <Select
                value={config.report_display_mode || 'keyword'}
                onChange={value => updateConfig({ report_display_mode: value })}
                options={[
                  { value: 'keyword', label: '按主题' },
                  { value: 'platform', label: '按平台' },
                ]}
              />
            </label>
            <label className="discover-field">
              <span>排名阈值</span>
              <InputNumber
                min={0}
                max={100}
                value={config.rank_threshold}
                onChange={value => updateConfig({ rank_threshold: Number(value ?? 30) })}
              />
            </label>
            <label className="discover-field">
              <span>每主题上限</span>
              <InputNumber
                min={0}
                max={100}
                value={config.max_news_per_keyword}
                onChange={value => updateConfig({ max_news_per_keyword: Number(value ?? 3) })}
              />
            </label>
            <label className="discover-switch-row">
              <span>优先来源位置</span>
              <Switch
                checked={config.sort_by_position_first !== false}
                onChange={checked => updateConfig({ sort_by_position_first: checked })}
              />
            </label>
            <label className="discover-switch-row">
              <span>独立展示</span>
              <Switch
                checked={!!config.display_standalone_enabled}
                onChange={checked => updateConfig({ display_standalone_enabled: checked })}
              />
            </label>
            {config.display_standalone_enabled && (
              <>
                <label className="discover-field">
                  <span>独立平台</span>
                  <Input
                    value={listToInput(config.standalone_platforms)}
                    placeholder="douyin, bilibili"
                    onChange={event => updateConfig({ standalone_platforms: inputToList(event.target.value) })}
                  />
                </label>
                <label className="discover-field">
                  <span>独立 RSS</span>
                  <Input
                    value={listToInput(config.standalone_rss_feeds)}
                    placeholder="tech_news"
                    onChange={event => updateConfig({ standalone_rss_feeds: inputToList(event.target.value) })}
                  />
                </label>
                <label className="discover-field">
                  <span>独立条数</span>
                  <InputNumber
                    min={1}
                    max={50}
                    value={config.standalone_max_items}
                    onChange={value => updateConfig({ standalone_max_items: Number(value ?? 5) })}
                  />
                </label>
              </>
            )}
            <label className="discover-switch-row">
              <span>调试日志</span>
              <Switch checked={!!config.debug} onChange={checked => updateConfig({ debug: checked })} />
            </label>
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
              保存到节目
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
                  className={`discover-item ${selected ? 'selected' : ''} ${item.rank_highlight ? 'rank-highlight' : ''}`}
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
      <AutoTopicModal
        visible={autoTopicModalVisible}
        onClose={() => setAutoTopicModalVisible(false)}
        fetchContents={currentItems}
        llmConfig={null}
        onRunFetch={handleRunOnce}
        onComplete={(selected) => {
          setSelectedKeys(new Set(selected.map(identity)))
          setAutoTopicModalVisible(false)
        }}
      />
    </div>
  )
}
