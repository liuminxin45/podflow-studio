import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button, Empty, Input, InputNumber, Select, Switch, Tag, Tooltip } from 'antd'
import {
  ArrowRightOutlined,
  BulbOutlined,
  CheckCircleOutlined,
  CloseOutlined,
  DatabaseOutlined,
  DeleteOutlined,
  FilterOutlined,
  GlobalOutlined,
  InfoCircleOutlined,
  LoadingOutlined,
  RadarChartOutlined,
  ReloadOutlined,
  SettingOutlined,
  WarningOutlined,
} from '../icons/antdCompat'
import AutoTopicModal from './AutoTopicModal'
import type { ContentItem } from '../types/workflow'
import { llmConfigResolver, type LLMConfig } from '../services/settings/llmConfigResolver'
import { llmService } from '../services/llmService'

type Notice = { type: 'info' | 'success' | 'warning' | 'error'; text: string } | null

export interface FetchSourceOption {
  id: string
  name: string
  description: string
}

export interface DiscoverConfig {
  topic: string
  breadth: number
  quality: number
  freshness: number
  enabled_sources: string[]
  min_relevance: number
  allow_duplicates: boolean
  prefer_original: boolean
  language_mix: 'chinese' | 'english' | 'mixed'
  keywords: string[]
  exclude_keywords: string[]
  event_detection: boolean
  trending_boost: boolean
  max_articles: number
  group_by_topic: boolean
  include_summary: boolean
  monitor_enabled: boolean
  monitor_interval_min: number
  monitor_keep_last: number
}

export interface DiscoverMeta {
  generated_at?: string
  item_count?: number
  source_counts?: Record<string, number>
  errors?: Array<{ source?: string; message?: string; detail?: string }>
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
  onRunOnce: (config: DiscoverConfig) => Promise<DiscoverRunResult>
  onLoadConfig: () => Promise<Partial<DiscoverConfig>>
  onListSources: () => Promise<FetchSourceOption[]>
  onProceedToOrganize: (items: ContentItem[], meta: DiscoverMeta, config: DiscoverConfig) => void
}

const DEFAULT_CONFIG: DiscoverConfig = {
  topic: '',
  breadth: 3,
  quality: 3,
  freshness: 4,
  enabled_sources: [],
  min_relevance: 3,
  allow_duplicates: false,
  prefer_original: true,
  language_mix: 'mixed',
  keywords: [],
  exclude_keywords: [],
  event_detection: true,
  trending_boost: false,
  max_articles: 50,
  group_by_topic: true,
  include_summary: true,
  monitor_enabled: false,
  monitor_interval_min: 30,
  monitor_keep_last: 100,
}

function identity(item: ContentItem): string {
  return `${item.url || ''}|${item.title || ''}|${item.source || ''}`
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

function listToInput(value?: string[]): string {
  return (value || []).join(', ')
}

function inputToList(value: string): string[] {
  return value.split(',').map(part => part.trim()).filter(Boolean)
}

function mergeConfig(...configs: Array<Partial<DiscoverConfig> | undefined>): DiscoverConfig {
  return configs.reduce<DiscoverConfig>((merged, current) => ({
    ...merged,
    ...(current || {}),
    enabled_sources: current?.enabled_sources ?? merged.enabled_sources,
    keywords: current?.keywords ?? merged.keywords,
    exclude_keywords: current?.exclude_keywords ?? merged.exclude_keywords,
  }), { ...DEFAULT_CONFIG })
}

function sourceLabel(item: ContentItem): string {
  return item.source_name || item.source || '未知来源'
}

function isTranslatedItem(item: ContentItem): boolean {
  return (item as any).translation_status === 'translated' || Boolean((item as any).translated_at)
}

function isPureEnglishItem(item: ContentItem): boolean {
  if (isTranslatedItem(item)) return false
  const text = `${item.title || ''} ${item.content || ''}`.trim()
  if (!text) return false
  if (/[^\x00-\x7F]/.test(text)) return false
  const letters = text.match(/[A-Za-z]/g)?.length || 0
  return letters >= 8
}

type TranslationRecord = {
  id: string
  title: string
  content: string
}

function parseTranslationRecords(raw: string): TranslationRecord[] {
  const trimmed = raw.trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
  const arrayStart = trimmed.indexOf('[')
  const objectStart = trimmed.indexOf('{')
  const start = arrayStart >= 0 && (objectStart < 0 || arrayStart < objectStart) ? arrayStart : objectStart
  if (start < 0) return []
  const candidate = trimmed.slice(start)
  const parsed = JSON.parse(candidate)
  const rows: Array<Record<string, unknown>> = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.items)
      ? parsed.items
      : Array.isArray(parsed?.translations)
        ? parsed.translations
        : []
  return rows
    .map((row: Record<string, unknown>) => ({
      id: String(row.id || '').trim(),
      title: String(row.title || row.translated_title || '').trim(),
      content: String(row.content || row.translated_content || '').trim(),
    }))
    .filter(row => row.id && (row.title || row.content))
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
  onProceedToOrganize,
}: Props) {
  const [config, setConfig] = useState<DiscoverConfig>(DEFAULT_CONFIG)
  const [sources, setSources] = useState<FetchSourceOption[]>([])
  const [currentItems, setCurrentItems] = useState<ContentItem[]>(items)
  const [currentMeta, setCurrentMeta] = useState<DiscoverMeta>(meta || {})
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set(selectedItems.map(identity)))
  const [query, setQuery] = useState('')
  const [sourceFilter, setSourceFilter] = useState<string>('all')
  const [running, setRunning] = useState(false)
  const [saving, setSaving] = useState(false)
  const [translating, setTranslating] = useState(false)
  const [notice, setNotice] = useState<Notice>(null)
  const [autoTopicModalVisible, setAutoTopicModalVisible] = useState(false)
  const [autoTopicLlmConfig, setAutoTopicLlmConfig] = useState<LLMConfig | null>(null)
  const hasLoadedConfigRef = useRef(false)

  useEffect(() => {
    if (!visible) return
    setCurrentItems(items)
    setCurrentMeta(meta || {})
    setSelectedKeys(new Set(selectedItems.map(identity)))
  }, [visible, items, selectedItems, meta])

  useEffect(() => {
    if (!visible) {
      hasLoadedConfigRef.current = false
      return
    }
    if (hasLoadedConfigRef.current) return
    hasLoadedConfigRef.current = true
    let cancelled = false
    Promise.all([onLoadConfig(), onListSources()])
      .then(([loadedConfig, loadedSources]) => {
        if (cancelled) return
        const enabledSources = loadedConfig.enabled_sources?.length
          ? loadedConfig.enabled_sources
          : loadedSources.map(source => source.id)
        setConfig(mergeConfig(loadedConfig, initialConfig, { enabled_sources: enabledSources }))
        setSources(loadedSources)
      })
      .catch((error) => {
        if (!cancelled) setNotice({ type: 'error', text: `采集配置初始化失败：${error.message}` })
      })
    return () => { cancelled = true }
  }, [visible])

  const selectedItemsForProceed = useMemo(() => {
    return currentItems.filter(item => selectedKeys.has(identity(item)))
  }, [currentItems, selectedKeys])

  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return currentItems.filter(item => {
      if (sourceFilter !== 'all' && item.source !== sourceFilter) return false
      if (!normalizedQuery) return true
      const text = `${item.title || ''} ${item.content || ''} ${item.source || ''}`.toLowerCase()
      return text.includes(normalizedQuery)
    })
  }, [currentItems, query, sourceFilter])

  const sourceCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    currentItems.forEach(item => {
      const key = item.source || 'unknown'
      counts[key] = (counts[key] || 0) + 1
    })
    return counts
  }, [currentItems])

  const translationTargets = useMemo(() => currentItems.filter(isPureEnglishItem), [currentItems])
  const translatedCount = useMemo(() => currentItems.filter(isTranslatedItem).length, [currentItems])

  const updateConfig = useCallback((patch: Partial<DiscoverConfig>) => {
    setConfig(prev => {
      const next = mergeConfig(prev, patch)
      onConfigChange?.(next)
      return next
    })
  }, [onConfigChange])

  const refreshAutoTopicLlmConfig = useCallback(() => {
    setAutoTopicLlmConfig(llmConfigResolver.getLLMConfig('discover'))
  }, [])

  useEffect(() => {
    if (visible) refreshAutoTopicLlmConfig()
  }, [visible, refreshAutoTopicLlmConfig])

  const handleOpenAutoTopic = useCallback(() => {
    refreshAutoTopicLlmConfig()
    setAutoTopicModalVisible(true)
  }, [refreshAutoTopicLlmConfig])

  const toggleSource = useCallback((sourceId: string, enabled: boolean) => {
    const next = new Set(config.enabled_sources)
    if (enabled) next.add(sourceId)
    else next.delete(sourceId)
    updateConfig({ enabled_sources: Array.from(next) })
  }, [config.enabled_sources, updateConfig])

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
    if (config.enabled_sources.length === 0) {
      setNotice({ type: 'warning', text: '请至少启用一个内置数据源。' })
      return
    }
    setRunning(true)
    setNotice(null)
    try {
      onConfigChange?.(config)
      const result = await onRunOnce(config)
      const nextItems = result.items || []
      setCurrentItems(nextItems)
      setCurrentMeta(result.meta || {})
      setSelectedKeys(new Set())
      setNotice({ type: 'success', text: `采集完成，获得 ${nextItems.length} 条素材` })
    } catch (error: any) {
      setNotice({ type: 'error', text: error.message || '采集失败' })
    } finally {
      setRunning(false)
    }
  }, [config, onConfigChange, onRunOnce])

  const handleClearCollection = useCallback(() => {
    setCurrentItems([])
    setCurrentMeta({})
    setSelectedKeys(new Set())
    setQuery('')
    setSourceFilter('all')
    setNotice({ type: 'success', text: '已清空当前采集列表' })
  }, [])

  const handleTranslateEnglishItems = useCallback(async () => {
    if (translationTargets.length === 0) {
      setNotice({ type: 'info', text: '当前没有可翻译的纯英文素材' })
      return
    }

    const llmConfig = llmConfigResolver.getLLMConfig('discover')
    if (!llmConfig) {
      setNotice({ type: 'warning', text: '请先在设置中配置发现/搜索模型，才能使用 AI 翻译。' })
      return
    }

    setTranslating(true)
    setNotice(null)
    try {
      const payload = translationTargets.map(item => ({
        id: identity(item),
        title: item.title || '',
        content: item.content || '',
      }))
      const response = await llmService.call({
        apiBase: llmConfig.apiBase,
        apiKey: llmConfig.apiKey,
        model: llmConfig.model,
        temperature: llmConfig.temperature ?? 0.2,
        timeout: llmConfig.timeout,
        maxTokens: Math.min(8000, Math.max(1200, payload.length * 500)),
        messages: [
          {
            role: 'system',
            content: 'Translate the following English podcast source materials into concise Chinese. Return strict JSON array with id, title, content.',
          },
          {
            role: 'user',
            content: JSON.stringify(payload, null, 2),
          },
        ],
      })
      const raw = response.choices?.[0]?.message?.content || ''
      const translations = parseTranslationRecords(raw)
      const translationMap = new Map(translations.map(row => [row.id, row]))
      let translated = 0
      const nextItems = currentItems.map(item => {
        const row = translationMap.get(identity(item))
        if (!row) return item
        translated += 1
        return {
          ...item,
          original_title: item.title,
          original_content: item.content,
          title: row.title || item.title,
          content: row.content || item.content,
          translated_title: row.title,
          translated_content: row.content,
          translated_at: new Date().toISOString(),
          translation_status: 'translated',
          translation_provider: llmConfig.model,
        } as ContentItem
      })
      setCurrentItems(nextItems)
      setSelectedKeys(prev => new Set(Array.from(prev)))
      setNotice({ type: translated > 0 ? 'success' : 'warning', text: translated > 0 ? `已翻译 ${translated} 条英文素材` : '模型未返回可匹配的翻译结果' })
    } catch (error: any) {
      setNotice({ type: 'error', text: error.message || '翻译失败' })
    } finally {
      setTranslating(false)
    }
  }, [currentItems, translationTargets])

  const toggleSelected = useCallback((item: ContentItem) => {
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
    const selected = selectedItemsForProceed.length > 0 ? selectedItemsForProceed : currentItems
    onProceedToOrganize(selected, {
      ...currentMeta,
      item_count: currentItems.length,
      source_counts: sourceCounts,
      generated_at: currentMeta.generated_at || new Date().toISOString(),
    }, config)
  }, [config, currentItems, currentMeta, onProceedToOrganize, selectedItemsForProceed, sourceCounts])

  if (!visible) return null

  return (
    <div className="discover-page">
      <header className="discover-hero">
        <div>
          <p>DISCOVER</p>
          <h1>素材发现</h1>
          <span>
            内置数据源 · {currentItems.length} 条素材 · {selectedItemsForProceed.length} 条已选
          </span>
        </div>
        <div className="discover-hero-actions">
          <Tooltip title="AI 自动筛选主题素材">
            <Button icon={<BulbOutlined />} onClick={handleOpenAutoTopic}>
              自动选题
            </Button>
          </Tooltip>
          <Button type="primary" icon={running ? <LoadingOutlined spin /> : <ReloadOutlined />} loading={running} onClick={handleRunOnce}>
            运行采集
          </Button>
          <Button
            icon={<ArrowRightOutlined />}
            disabled={currentItems.length === 0}
            onClick={handleProceed}
          >
            进入整理
          </Button>
        </div>
      </header>

      <main className="discover-layout">
        <aside className="discover-sidebar">
          <section className="discover-panel-block">
            <div className="discover-block-title"><SettingOutlined /> 采集设置</div>
            <label className="discover-field">
              <span>关注主题</span>
              <Input value={config.topic} placeholder="例如：AI 产品、出海、创业" onChange={event => updateConfig({ topic: event.target.value })} />
            </label>
            <label className="discover-field">
              <span>关键词</span>
              <Input value={listToInput(config.keywords)} placeholder="多个关键词用逗号分隔" onChange={event => updateConfig({ keywords: inputToList(event.target.value) })} />
            </label>
            <label className="discover-field">
              <span>排除词</span>
              <Input value={listToInput(config.exclude_keywords)} placeholder="多个排除词用逗号分隔" onChange={event => updateConfig({ exclude_keywords: inputToList(event.target.value) })} />
            </label>
            <label className="discover-field">
              <span>语言偏好</span>
              <Select
                value={config.language_mix}
                onChange={value => updateConfig({ language_mix: value })}
                options={[
                  { value: 'mixed', label: '中英混合' },
                  { value: 'chinese', label: '中文优先' },
                  { value: 'english', label: '英文优先' },
                ]}
              />
            </label>
            <label className="discover-field">
              <span>信息广度</span>
              <InputNumber min={1} max={5} value={config.breadth} onChange={value => updateConfig({ breadth: Number(value || 3) })} />
            </label>
            <label className="discover-field">
              <span>内容质量</span>
              <InputNumber min={1} max={5} value={config.quality} onChange={value => updateConfig({ quality: Number(value || 3) })} />
            </label>
            <label className="discover-field">
              <span>时效要求</span>
              <InputNumber min={1} max={5} value={config.freshness} onChange={value => updateConfig({ freshness: Number(value || 4) })} />
            </label>
            <label className="discover-field">
              <span>相关度下限</span>
              <InputNumber min={1} max={5} value={config.min_relevance} onChange={value => updateConfig({ min_relevance: Number(value || 3) })} />
            </label>
            <label className="discover-field">
              <span>输出上限</span>
              <InputNumber min={1} max={500} value={config.max_articles} onChange={value => updateConfig({ max_articles: Number(value || 50) })} />
            </label>
            <label className="discover-switch-row">
              <span>事件聚合</span>
              <Switch checked={config.event_detection} onChange={checked => updateConfig({ event_detection: checked })} />
            </label>
            <label className="discover-switch-row">
              <span>热度加权</span>
              <Switch checked={config.trending_boost} onChange={checked => updateConfig({ trending_boost: checked })} />
            </label>
            <label className="discover-switch-row">
              <span>按主题分组</span>
              <Switch checked={config.group_by_topic} onChange={checked => updateConfig({ group_by_topic: checked })} />
            </label>
            <label className="discover-switch-row">
              <span>生成摘要</span>
              <Switch checked={config.include_summary} onChange={checked => updateConfig({ include_summary: checked })} />
            </label>
            <Button block onClick={handleSaveConfig} loading={saving}>
              保存到节目
            </Button>
          </section>

          <section className="discover-panel-block">
            <div className="discover-block-title"><DatabaseOutlined /> 内置数据源</div>
            <div className="discover-source-list">
              {sources.length === 0 ? (
                <Empty description="暂无可用数据源" image={Empty.PRESENTED_IMAGE_SIMPLE} />
              ) : sources.map(source => (
                <label key={source.id} className="discover-source-row">
                  <span title={source.description}>{source.name}</span>
                  <Switch size="small" checked={config.enabled_sources.includes(source.id)} onChange={checked => toggleSource(source.id, checked)} />
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
              value={sourceFilter}
              onChange={setSourceFilter}
              style={{ width: 160 }}
              options={[
                { value: 'all', label: '全部来源' },
                ...sources.map(source => ({ value: source.id, label: source.name })),
              ]}
            />
            <Button onClick={selectAllVisible}>全选当前</Button>
            <Button onClick={() => setSelectedKeys(new Set())} icon={<CloseOutlined />}>清空选择</Button>
            <Button
              icon={<GlobalOutlined />}
              loading={translating}
              disabled={running || translating || translationTargets.length === 0}
              onClick={handleTranslateEnglishItems}
            >
              翻译英文{translationTargets.length > 0 ? ` ${translationTargets.length}` : ''}
            </Button>
            <Button
              danger
              icon={<DeleteOutlined />}
              disabled={running || translating || currentItems.length === 0}
              onClick={handleClearCollection}
            >
              清空当前采集
            </Button>
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
              <strong>{running ? '采集中' : '就绪'}</strong>
            </div>
            <div>
              <span>最近采集</span>
              <strong>{formatTime(currentMeta.generated_at)}</strong>
            </div>
            <div>
              <span>失败来源</span>
              <strong>{currentMeta.errors?.length || 0}</strong>
            </div>
            <div>
              <span>启用来源</span>
              <strong>{config.enabled_sources.length}</strong>
            </div>
          </div>

          <div className="discover-topic-strip">
            {Object.entries(sourceCounts).slice(0, 8).map(([source, count]) => (
              <span key={source}>{source}<b>{count}</b></span>
            ))}
            {Object.keys(sourceCounts).length === 0 && <span>暂无来源统计</span>}
          </div>

          <div className="discover-list">
            {filteredItems.length === 0 ? (
              <Empty description="暂无素材，点击右上角运行采集" />
            ) : filteredItems.map(item => {
              const selected = selectedKeys.has(identity(item))
              const translated = isTranslatedItem(item)
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
                      <span>{item.type || '素材'}</span>
                      <span>{sourceLabel(item)}</span>
                      <span>{formatTime(item.published)}</span>
                    </div>
                    <h3>
                      <span>{item.title || '未命名素材'}</span>
                      {translated && (
                        <Tooltip title={(item as any).original_title ? `原文：${(item as any).original_title}` : '已由 AI 翻译，原文已保留'}>
                          <Tag className="discover-translation-tag" icon={<GlobalOutlined />}>已翻译</Tag>
                        </Tooltip>
                      )}
                    </h3>
                    <p>{item.content || item.summary || '无摘要'}</p>
                    <div className="discover-item-foot">
                      <span>{translated ? 'AI 翻译 · 原文已保留' : item.summary || sourceLabel(item)}</span>
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
            <div className="discover-metric"><span>已翻译</span><strong>{translatedCount}</strong></div>
            <div className="discover-metric"><span>数据源数</span><strong>{Object.keys(sourceCounts).length}</strong></div>
            <div className="discover-metric"><span>总素材</span><strong>{currentItems.length}</strong></div>
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
        llmConfig={autoTopicLlmConfig}
        onRunFetch={async () => { await handleRunOnce() }}
        onComplete={(selected) => {
          setSelectedKeys(new Set(selected.map(identity)))
          setAutoTopicModalVisible(false)
        }}
      />
    </div>
  )
}
