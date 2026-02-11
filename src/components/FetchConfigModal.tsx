import { Modal, Slider, Switch, Tag, message, Input } from 'antd'
import { useState, useEffect, useCallback } from 'react'
import {
  SearchOutlined,
  SettingOutlined,
  ClockCircleOutlined,
  GlobalOutlined,
  FilterOutlined,
  StarOutlined,
  AlertOutlined,
  HeartOutlined,
  CheckCircleFilled,
  CloseOutlined,
  RadarChartOutlined,
  CoffeeOutlined,
  FileTextOutlined,
  AimOutlined,
  AppstoreOutlined,
  ExperimentOutlined,
} from '@ant-design/icons'

// ============================================================
// Types
// ============================================================

interface FetchSource {
  id: string
  name: string
  description: string
}

interface FetchConfig {
  // Quick mode
  topic: string
  breadth: number       // 1-5: maps to source count + max_items
  quality: number       // 1-5: maps to similarity_threshold
  freshness: number     // 1-5: maps to time_range
  // Advanced - Sources
  enabled_sources: string[]
  auto_discover: boolean
  // Advanced - Content
  min_relevance: number // 1-5
  allow_duplicates: boolean
  prefer_original: boolean
  language_mix: 'chinese' | 'english' | 'mixed'
  // Advanced - Focus
  keywords: string[]
  exclude_keywords: string[]
  event_detection: boolean
  trending_boost: boolean
  // Advanced - Output
  max_articles: number
  group_by_topic: boolean
  include_summary: boolean
  // Preset
  activePreset: string | null
}

interface Props {
  visible: boolean
  onClose: () => void
  initialConfig?: Record<string, any>
  onSave: (config: Record<string, any>) => void
  sources: FetchSource[]
}

// ============================================================
// Presets
// ============================================================

interface Preset {
  id: string
  name: string
  icon: React.ReactNode
  tagline: string
  color: string
  config: Partial<FetchConfig>
}

const PRESETS: Preset[] = [
  {
    id: 'commute',
    name: '通勤速听',
    icon: <CoffeeOutlined />,
    tagline: '5分钟掌握今日要点',
    color: '#f59e0b',
    config: {
      breadth: 2,
      quality: 4,
      freshness: 5,
      min_relevance: 4,
      max_articles: 8,
      group_by_topic: false,
      include_summary: true,
      event_detection: false,
      trending_boost: true,
    }
  },
  {
    id: 'daily',
    name: '每日综述',
    icon: <FileTextOutlined />,
    tagline: '全面回顾，不遗漏重要动态',
    color: '#3b82f6',
    config: {
      breadth: 3,
      quality: 3,
      freshness: 4,
      min_relevance: 3,
      max_articles: 15,
      group_by_topic: true,
      include_summary: true,
      event_detection: true,
      trending_boost: false,
    }
  },
  {
    id: 'deep_radar',
    name: '深度雷达',
    icon: <RadarChartOutlined />,
    tagline: '最大覆盖，捕获一切信号',
    color: '#8b5cf6',
    config: {
      breadth: 5,
      quality: 2,
      freshness: 3,
      min_relevance: 2,
      max_articles: 30,
      group_by_topic: true,
      include_summary: false,
      event_detection: true,
      trending_boost: true,
    }
  },
  {
    id: 'risk_alert',
    name: '风险预警',
    icon: <AlertOutlined />,
    tagline: '监控风险信号与行业震荡',
    color: '#ef4444',
    config: {
      breadth: 4,
      quality: 3,
      freshness: 5,
      min_relevance: 4,
      max_articles: 20,
      group_by_topic: true,
      include_summary: true,
      event_detection: true,
      trending_boost: true,
    }
  },
  {
    id: 'pulse',
    name: '行业脉搏',
    icon: <HeartOutlined />,
    tagline: '追踪行业核心趋势与脉络',
    color: '#10b981',
    config: {
      breadth: 3,
      quality: 4,
      freshness: 3,
      min_relevance: 4,
      max_articles: 12,
      group_by_topic: true,
      include_summary: true,
      event_detection: false,
      trending_boost: false,
    }
  },
]

// ============================================================
// Default Config
// ============================================================

const DEFAULT_CONFIG: FetchConfig = {
  topic: '',
  breadth: 3,
  quality: 3,
  freshness: 4,
  enabled_sources: [],
  auto_discover: true,
  min_relevance: 3,
  allow_duplicates: false,
  prefer_original: true,
  language_mix: 'mixed',
  keywords: [],
  exclude_keywords: [],
  event_detection: true,
  trending_boost: false,
  max_articles: 15,
  group_by_topic: true,
  include_summary: true,
  activePreset: 'daily',
}

// ============================================================
// Feedback Text Generators
// ============================================================

const BREADTH_LABELS: Record<number, { text: string; desc: string }> = {
  1: { text: '精准', desc: '只看最相关的核心来源' },
  2: { text: '聚焦', desc: '重点来源 + 少量扩展' },
  3: { text: '均衡', desc: '主流来源全覆盖' },
  4: { text: '广泛', desc: '覆盖长尾来源和小众渠道' },
  5: { text: '全网', desc: '最大化信息雷达范围' },
}

const QUALITY_LABELS: Record<number, { text: string; desc: string }> = {
  1: { text: '不过滤', desc: '接收所有内容，自己筛选' },
  2: { text: '宽松', desc: '过滤明显垃圾，保留大部分' },
  3: { text: '标准', desc: '平衡数量和质量' },
  4: { text: '精选', desc: '只保留高质量和深度内容' },
  5: { text: '严选', desc: '只留最有洞察力的内容' },
}

const FRESHNESS_LABELS: Record<number, { text: string; desc: string }> = {
  1: { text: '不限', desc: '无时间限制，历史内容也可以' },
  2: { text: '近一周', desc: '7天内的内容' },
  3: { text: '近三天', desc: '3天内的内容' },
  4: { text: '今天', desc: '仅获取今日内容' },
  5: { text: '实时', desc: '最新几小时内的热点' },
}

// ============================================================
// Helper: Source Category Icons
// ============================================================

const SOURCE_ICONS: Record<string, React.ReactNode> = {
  hackernews: <span style={{ fontSize: 18 }}>🟠</span>,
  techcrunch: <span style={{ fontSize: 18 }}>💚</span>,
  ai_news_daily: <span style={{ fontSize: 18 }}>🤖</span>,
  example_custom: <span style={{ fontSize: 18 }}>🔧</span>,
}

// ============================================================
// Component
// ============================================================

export default function FetchConfigModal({ visible, onClose, initialConfig, onSave, sources }: Props) {
  const [config, setConfig] = useState<FetchConfig>({ ...DEFAULT_CONFIG })
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [advancedSection, setAdvancedSection] = useState<string>('sources')
  const [keywordInput, setKeywordInput] = useState('')
  const [excludeInput, setExcludeInput] = useState('')
  const [saving, setSaving] = useState(false)

  // Load initial config
  useEffect(() => {
    if (initialConfig && visible) {
      setConfig(prev => ({
        ...DEFAULT_CONFIG,
        ...prev,
        ...initialConfig,
        enabled_sources: initialConfig.enabled_sources || prev.enabled_sources || DEFAULT_CONFIG.enabled_sources,
      }))
      if (initialConfig.activePreset) {
        // Keep preset selection
      }
    }
  }, [initialConfig, visible])

  // Apply preset
  const applyPreset = useCallback((preset: Preset) => {
    setConfig(prev => ({
      ...prev,
      ...preset.config,
      activePreset: preset.id,
      // Keep user's topic and sources
      topic: prev.topic,
      enabled_sources: prev.enabled_sources,
    }))
  }, [])

  // Update config field
  const updateConfig = useCallback((field: keyof FetchConfig, value: any) => {
    setConfig(prev => ({
      ...prev,
      [field]: value,
      activePreset: null, // Clear preset when user manually changes
    }))
  }, [])

  // Toggle source
  const toggleSource = useCallback((sourceId: string) => {
    setConfig(prev => {
      const sources = prev.enabled_sources.includes(sourceId)
        ? prev.enabled_sources.filter(s => s !== sourceId)
        : [...prev.enabled_sources, sourceId]
      return { ...prev, enabled_sources: sources, activePreset: null }
    })
  }, [])

  // Add keyword
  const addKeyword = useCallback((type: 'keywords' | 'exclude_keywords', value: string) => {
    const trimmed = value.trim()
    if (!trimmed) return
    setConfig(prev => {
      if (prev[type].includes(trimmed)) return prev
      return { ...prev, [type]: [...prev[type], trimmed], activePreset: null }
    })
    if (type === 'keywords') setKeywordInput('')
    else setExcludeInput('')
  }, [])

  // Remove keyword
  const removeKeyword = useCallback((type: 'keywords' | 'exclude_keywords', value: string) => {
    setConfig(prev => ({
      ...prev,
      [type]: prev[type].filter(k => k !== value),
      activePreset: null,
    }))
  }, [])

  // Save
  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave(config as any)
      message.success('配置已保存')
      onClose()
    } catch (e: any) {
      message.error(`保存失败: ${e.message}`)
    } finally {
      setSaving(false)
    }
  }

  // ============================================================
  // Render: Presets
  // ============================================================

  const renderPresets = () => (
    <div style={{ marginBottom: 28 }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        marginBottom: 14,
      }}>
        <StarOutlined style={{ color: 'var(--accent-primary)', fontSize: 14 }} />
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
          快速选择风格
        </span>
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {PRESETS.map(preset => {
          const isActive = config.activePreset === preset.id
          return (
            <div
              key={preset.id}
              onClick={() => applyPreset(preset)}
              style={{
                flex: '1 1 calc(33.333% - 8px)',
                minWidth: 140,
                padding: '14px 16px',
                borderRadius: 12,
                border: isActive ? `2px solid ${preset.color}` : '1px solid var(--border-color)',
                background: isActive ? `${preset.color}08` : 'var(--bg-secondary)',
                cursor: 'pointer',
                transition: 'all 0.25s cubic-bezier(0.25, 0.8, 0.25, 1)',
                position: 'relative',
                overflow: 'hidden',
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.borderColor = `${preset.color}60`
                  e.currentTarget.style.transform = 'translateY(-1px)'
                  e.currentTarget.style.boxShadow = `0 4px 12px ${preset.color}15`
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.borderColor = 'var(--border-color)'
                  e.currentTarget.style.transform = 'none'
                  e.currentTarget.style.boxShadow = 'none'
                }
              }}
            >
              {isActive && (
                <CheckCircleFilled style={{
                  position: 'absolute',
                  top: 8,
                  right: 8,
                  color: preset.color,
                  fontSize: 14,
                }} />
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{
                  fontSize: 16,
                  width: 28,
                  height: 28,
                  borderRadius: 8,
                  background: `${preset.color}15`,
                  color: preset.color,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  {preset.icon}
                </span>
                <span style={{
                  fontWeight: 600,
                  fontSize: 13,
                  color: isActive ? preset.color : 'var(--text-primary)',
                }}>
                  {preset.name}
                </span>
              </div>
              <div style={{
                fontSize: 11,
                color: 'var(--text-tertiary)',
                lineHeight: 1.4,
              }}>
                {preset.tagline}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )

  // ============================================================
  // Render: Topic Input
  // ============================================================

  const renderTopicInput = () => (
    <div style={{ marginBottom: 24 }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        marginBottom: 10,
      }}>
        <AimOutlined style={{ color: 'var(--accent-primary)', fontSize: 14 }} />
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
          我关注的方向
        </span>
      </div>
      <Input
        value={config.topic}
        onChange={(e) => updateConfig('topic', e.target.value)}
        placeholder="例如：AI 大模型、自动驾驶、开发者工具、芯片制裁..."
        style={{
          height: 44,
          borderRadius: 10,
          fontSize: 14,
          border: '1px solid var(--border-color)',
          background: 'var(--bg-secondary)',
          padding: '0 16px',
        }}
        prefix={<SearchOutlined style={{ color: 'var(--text-tertiary)', marginRight: 4 }} />}
        allowClear
      />
      <div style={{
        fontSize: 11,
        color: 'var(--text-tertiary)',
        marginTop: 6,
        paddingLeft: 2,
      }}>
        输入你最关心的话题，系统会围绕它智能采集
      </div>
    </div>
  )

  // ============================================================
  // Render: Smart Slider
  // ============================================================

  const renderSmartSlider = (
    field: 'breadth' | 'quality' | 'freshness',
    icon: React.ReactNode,
    title: string,
    labels: Record<number, { text: string; desc: string }>,
  ) => {
    const val = config[field]
    const label = labels[val] || labels[3]
    return (
      <div style={{ marginBottom: 22 }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 4,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: 'var(--accent-primary)', fontSize: 14 }}>{icon}</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
              {title}
            </span>
          </div>
          <Tag
            bordered={false}
            style={{
              background: 'var(--accent-light)',
              color: 'var(--accent-primary)',
              fontWeight: 600,
              fontSize: 12,
              borderRadius: 6,
              padding: '2px 10px',
              margin: 0,
            }}
          >
            {label.text}
          </Tag>
        </div>
        <Slider
          min={1}
          max={5}
          value={val}
          onChange={(v) => updateConfig(field, v)}
          marks={{
            1: { label: <span style={{ fontSize: 10 }}>{labels[1].text}</span> },
            3: { label: <span style={{ fontSize: 10 }}>{labels[3].text}</span> },
            5: { label: <span style={{ fontSize: 10 }}>{labels[5].text}</span> },
          }}
          tooltip={{ formatter: (v) => v ? labels[v]?.text : '' }}
          styles={{
            track: { background: 'var(--accent-primary)' },
            rail: { background: 'var(--border-color)' },
          }}
        />
        <div style={{
          fontSize: 11,
          color: 'var(--text-tertiary)',
          marginTop: -4,
          paddingLeft: 2,
          transition: 'all 0.2s ease',
        }}>
          {label.desc}
        </div>
      </div>
    )
  }

  // ============================================================
  // Render: Quick Mode
  // ============================================================

  const renderQuickMode = () => (
    <div>
      {renderTopicInput()}
      <div style={{
        background: 'var(--bg-primary)',
        borderRadius: 12,
        padding: '20px 24px 8px',
        border: '1px solid var(--border-light)',
      }}>
        {renderSmartSlider('breadth', <GlobalOutlined />, '信息广度', BREADTH_LABELS)}
        {renderSmartSlider('quality', <FilterOutlined />, '内容质量', QUALITY_LABELS)}
        {renderSmartSlider('freshness', <ClockCircleOutlined />, '时效要求', FRESHNESS_LABELS)}
      </div>
    </div>
  )

  // ============================================================
  // Render: Advanced Sections
  // ============================================================

  const advancedSections = [
    { key: 'sources', icon: <GlobalOutlined />, label: '信息来源' },
    { key: 'content', icon: <FilterOutlined />, label: '内容偏好' },
    { key: 'focus', icon: <AimOutlined />, label: '聚焦策略' },
    { key: 'output', icon: <AppstoreOutlined />, label: '输出方式' },
  ]

  const renderAdvancedNav = () => (
    <div style={{
      display: 'flex',
      gap: 4,
      marginBottom: 20,
      background: 'var(--bg-primary)',
      borderRadius: 10,
      padding: 4,
    }}>
      {advancedSections.map(sec => {
        const isActive = advancedSection === sec.key
        return (
          <div
            key={sec.key}
            onClick={() => setAdvancedSection(sec.key)}
            style={{
              flex: 1,
              textAlign: 'center',
              padding: '8px 12px',
              borderRadius: 8,
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: isActive ? 600 : 400,
              color: isActive ? 'var(--accent-primary)' : 'var(--text-secondary)',
              background: isActive ? 'var(--bg-secondary)' : 'transparent',
              boxShadow: isActive ? 'var(--shadow-sm)' : 'none',
              transition: 'all 0.2s ease',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
            }}
          >
            {sec.icon}
            {sec.label}
          </div>
        )
      })}
    </div>
  )

  // -- Sources Section --
  const renderSourcesSection = () => (
    <div className="fetch-config-section">
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>
          选择要监控的信息渠道
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {sources.map(source => {
            const isSelected = config.enabled_sources.includes(source.id)
            return (
              <div
                key={source.id}
                onClick={() => toggleSource(source.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '12px 16px',
                  borderRadius: 10,
                  border: isSelected ? '1px solid var(--accent-primary)' : '1px solid var(--border-color)',
                  background: isSelected ? 'var(--accent-light)' : 'var(--bg-secondary)',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
              >
                <div style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  background: isSelected ? `var(--accent-primary)15` : 'var(--bg-tertiary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  {SOURCE_ICONS[source.id] || <GlobalOutlined style={{ fontSize: 16, color: 'var(--text-tertiary)' }} />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: isSelected ? 'var(--accent-primary)' : 'var(--text-primary)',
                  }}>
                    {source.name}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
                    {source.description}
                  </div>
                </div>
                <div style={{
                  width: 20,
                  height: 20,
                  borderRadius: 6,
                  border: isSelected ? 'none' : '1.5px solid var(--border-color)',
                  background: isSelected ? 'var(--accent-primary)' : 'transparent',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.2s ease',
                  flexShrink: 0,
                }}>
                  {isSelected && <CheckCircleFilled style={{ color: '#fff', fontSize: 14 }} />}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Auto Discover Toggle */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '14px 16px',
        borderRadius: 10,
        background: 'var(--bg-primary)',
        border: '1px solid var(--border-light)',
      }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>
            自动发现新来源
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
            系统会根据你的兴趣自动推荐新渠道
          </div>
        </div>
        <Switch
          checked={config.auto_discover}
          onChange={(v) => updateConfig('auto_discover', v)}
          style={{ background: config.auto_discover ? 'var(--accent-primary)' : undefined }}
        />
      </div>
    </div>
  )

  // -- Content Section --
  const renderContentSection = () => {
    const RELEVANCE_LABELS: Record<number, string> = {
      1: '全部接收',
      2: '基本相关',
      3: '中等相关',
      4: '高度相关',
      5: '精准匹配',
    }

    return (
      <div className="fetch-config-section">
        {/* Relevance */}
        <div style={{ marginBottom: 20 }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 8,
          }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>
              内容相关度要求
            </span>
            <Tag bordered={false} style={{
              background: 'var(--accent-light)',
              color: 'var(--accent-primary)',
              fontWeight: 600,
              fontSize: 11,
              borderRadius: 6,
              margin: 0,
            }}>
              {RELEVANCE_LABELS[config.min_relevance]}
            </Tag>
          </div>
          <Slider
            min={1} max={5}
            value={config.min_relevance}
            onChange={(v) => updateConfig('min_relevance', v)}
            styles={{
              track: { background: 'var(--accent-primary)' },
              rail: { background: 'var(--border-color)' },
            }}
          />
        </div>

        {/* Toggle Options */}
        {[
          {
            key: 'allow_duplicates' as const,
            title: '允许重复内容',
            desc: '不同来源的相似内容是否保留多份',
            value: config.allow_duplicates,
            invert: false,
          },
          {
            key: 'prefer_original' as const,
            title: '优先原始报道',
            desc: '优先保留第一手报道，过滤二手转载',
            value: config.prefer_original,
            invert: false,
          },
        ].map(item => (
          <div
            key={item.key}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '14px 16px',
              borderRadius: 10,
              background: 'var(--bg-primary)',
              border: '1px solid var(--border-light)',
              marginBottom: 10,
            }}
          >
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>
                {item.title}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
                {item.desc}
              </div>
            </div>
            <Switch
              checked={item.value}
              onChange={(v) => updateConfig(item.key, v)}
              style={{ background: item.value ? 'var(--accent-primary)' : undefined }}
            />
          </div>
        ))}

        {/* Language */}
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 10 }}>
            语言偏好
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {[
              { value: 'chinese' as const, label: '中文优先' },
              { value: 'english' as const, label: '英文优先' },
              { value: 'mixed' as const, label: '中英混合' },
            ].map(opt => {
              const isActive = config.language_mix === opt.value
              return (
                <div
                  key={opt.value}
                  onClick={() => updateConfig('language_mix', opt.value)}
                  style={{
                    flex: 1,
                    textAlign: 'center',
                    padding: '10px 12px',
                    borderRadius: 8,
                    border: isActive ? '1px solid var(--accent-primary)' : '1px solid var(--border-color)',
                    background: isActive ? 'var(--accent-light)' : 'var(--bg-secondary)',
                    color: isActive ? 'var(--accent-primary)' : 'var(--text-secondary)',
                    fontWeight: isActive ? 600 : 400,
                    fontSize: 12,
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                  }}
                >
                  {opt.label}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    )
  }

  // -- Focus Section --
  const renderFocusSection = () => (
    <div className="fetch-config-section">
      {/* Keywords */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 8 }}>
          重点关注词
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 10 }}>
          包含这些词的内容会被优先采集
        </div>
        <Input
          value={keywordInput}
          onChange={(e) => setKeywordInput(e.target.value)}
          onPressEnter={() => addKeyword('keywords', keywordInput)}
          placeholder="输入关键词后按回车添加..."
          style={{
            borderRadius: 8,
            marginBottom: 8,
          }}
          suffix={
            <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>↵</span>
          }
        />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {config.keywords.map(kw => (
            <Tag
              key={kw}
              closable
              onClose={() => removeKeyword('keywords', kw)}
              style={{
                background: 'var(--accent-light)',
                color: 'var(--accent-primary)',
                border: 'none',
                borderRadius: 6,
                fontSize: 12,
                padding: '2px 10px',
              }}
            >
              {kw}
            </Tag>
          ))}
        </div>
      </div>

      {/* Exclude Keywords */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 8 }}>
          排除关键词
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 10 }}>
          包含这些词的内容会被自动过滤
        </div>
        <Input
          value={excludeInput}
          onChange={(e) => setExcludeInput(e.target.value)}
          onPressEnter={() => addKeyword('exclude_keywords', excludeInput)}
          placeholder="输入要排除的词后按回车..."
          style={{
            borderRadius: 8,
            marginBottom: 8,
          }}
          suffix={
            <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>↵</span>
          }
        />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {config.exclude_keywords.map(kw => (
            <Tag
              key={kw}
              closable
              onClose={() => removeKeyword('exclude_keywords', kw)}
              style={{
                background: 'var(--error-bg)',
                color: 'var(--error-color)',
                border: 'none',
                borderRadius: 6,
                fontSize: 12,
                padding: '2px 10px',
              }}
            >
              {kw}
            </Tag>
          ))}
        </div>
      </div>

      {/* Toggle options */}
      {[
        {
          key: 'event_detection' as const,
          title: '事件聚合',
          desc: '自动识别并归类同一事件的多篇报道',
          value: config.event_detection,
        },
        {
          key: 'trending_boost' as const,
          title: '热度加权',
          desc: '正在被大量讨论的话题会被提升优先级',
          value: config.trending_boost,
        },
      ].map(item => (
        <div
          key={item.key}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 16px',
            borderRadius: 10,
            background: 'var(--bg-primary)',
            border: '1px solid var(--border-light)',
            marginBottom: 10,
          }}
        >
          <div>
            <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>
              {item.title}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
              {item.desc}
            </div>
          </div>
          <Switch
            checked={item.value}
            onChange={(v) => updateConfig(item.key, v)}
            style={{ background: item.value ? 'var(--accent-primary)' : undefined }}
          />
        </div>
      ))}
    </div>
  )

  // -- Output Section --
  const renderOutputSection = () => {
    const ARTICLE_LABELS: Record<number, string> = {
      5: '极简 · 5篇',
      8: '精简 · 8篇',
      10: '简约 · 10篇',
      15: '标准 · 15篇',
      20: '丰富 · 20篇',
      30: '全面 · 30篇',
    }

    return (
      <div className="fetch-config-section">
        {/* Max Articles */}
        <div style={{ marginBottom: 20 }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 8,
          }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>
              采集数量上限
            </span>
            <Tag bordered={false} style={{
              background: 'var(--accent-light)',
              color: 'var(--accent-primary)',
              fontWeight: 600,
              fontSize: 11,
              borderRadius: 6,
              margin: 0,
            }}>
              最多 {config.max_articles} 篇
            </Tag>
          </div>
          <Slider
            min={5} max={30} step={5}
            value={config.max_articles}
            onChange={(v) => updateConfig('max_articles', v)}
            marks={{
              5: { label: <span style={{ fontSize: 10 }}>5</span> },
              15: { label: <span style={{ fontSize: 10 }}>15</span> },
              30: { label: <span style={{ fontSize: 10 }}>30</span> },
            }}
            tooltip={{ formatter: (v) => v ? (ARTICLE_LABELS[v] || `${v}篇`) : '' }}
            styles={{
              track: { background: 'var(--accent-primary)' },
              rail: { background: 'var(--border-color)' },
            }}
          />
        </div>

        {/* Toggle options */}
        {[
          {
            key: 'group_by_topic' as const,
            title: '按主题分组',
            desc: '相关内容自动归类，方便浏览和筛选',
            value: config.group_by_topic,
          },
          {
            key: 'include_summary' as const,
            title: '生成摘要',
            desc: '为每条内容自动生成简短摘要',
            value: config.include_summary,
          },
        ].map(item => (
          <div
            key={item.key}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '14px 16px',
              borderRadius: 10,
              background: 'var(--bg-primary)',
              border: '1px solid var(--border-light)',
              marginBottom: 10,
            }}
          >
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>
                {item.title}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
                {item.desc}
              </div>
            </div>
            <Switch
              checked={item.value}
              onChange={(v) => updateConfig(item.key, v)}
              style={{ background: item.value ? 'var(--accent-primary)' : undefined }}
            />
          </div>
        ))}
      </div>
    )
  }

  const renderAdvancedContent = () => {
    switch (advancedSection) {
      case 'sources': return renderSourcesSection()
      case 'content': return renderContentSection()
      case 'focus': return renderFocusSection()
      case 'output': return renderOutputSection()
      default: return null
    }
  }

  // ============================================================
  // Render: Config Summary Bar
  // ============================================================

  const renderSummaryBar = () => {
    const items: string[] = []
    if (config.topic) items.push(`📍 ${config.topic}`)
    items.push(`📡 ${BREADTH_LABELS[config.breadth].text}`)
    items.push(`✨ ${QUALITY_LABELS[config.quality].text}`)
    items.push(`⏱ ${FRESHNESS_LABELS[config.freshness].text}`)
    if (config.enabled_sources.length > 0) {
      items.push(`📰 ${config.enabled_sources.length}个来源`)
    }

    return (
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '6px 12px',
        padding: '10px 16px',
        background: 'var(--bg-primary)',
        borderRadius: 8,
        marginBottom: 16,
        fontSize: 12,
        color: 'var(--text-secondary)',
      }}>
        {items.map((item, i) => (
          <span key={i}>{item}</span>
        ))}
      </div>
    )
  }

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
        <ExperimentOutlined />
        <span>系统会持续学习你的偏好</span>
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
            background: 'var(--accent-primary)',
            color: '#fff',
            cursor: saving ? 'not-allowed' : 'pointer',
            fontSize: 13,
            fontWeight: 600,
            transition: 'all 0.2s ease',
            boxShadow: '0 2px 8px rgba(37, 99, 235, 0.3)',
            opacity: saving ? 0.7 : 1,
          }}
        >
          {saving ? '保存中...' : '开始采集'}
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
      width={620}
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
      className="fetch-config-modal"
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
            background: 'linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontSize: 16,
          }}>
            <RadarChartOutlined />
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
              信息雷达配置
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
              定义你的信息世界
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
        padding: '24px',
        background: 'var(--bg-secondary)',
      }}>
        {/* Presets */}
        {renderPresets()}

        {/* Summary */}
        {renderSummaryBar()}

        {/* Quick Mode */}
        {renderQuickMode()}

        {/* Advanced Toggle */}
        <div
          onClick={() => setShowAdvanced(!showAdvanced)}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            padding: '12px 0',
            margin: '20px 0 0',
            cursor: 'pointer',
            fontSize: 12,
            color: 'var(--text-tertiary)',
            transition: 'color 0.2s ease',
            borderTop: '1px solid var(--border-light)',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--accent-primary)' }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-tertiary)' }}
        >
          <SettingOutlined style={{
            transition: 'transform 0.3s ease',
            transform: showAdvanced ? 'rotate(90deg)' : 'none',
          }} />
          <span>{showAdvanced ? '收起高级设置' : '更多设置'}</span>
        </div>

        {/* Advanced Mode */}
        {showAdvanced && (
          <div style={{
            animation: 'fetchConfigSlideDown 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
            marginTop: 16,
          }}>
            {renderAdvancedNav()}
            {renderAdvancedContent()}
          </div>
        )}
      </div>

      {/* Footer */}
      {renderFooter()}
    </Modal>
  )
}
