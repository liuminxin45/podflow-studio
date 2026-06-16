import { useState, useCallback, useEffect } from 'react'
import { Button, Slider, Tooltip, message } from 'antd'
import {
  CloseOutlined,
  SoundOutlined,
  RobotOutlined,
  UserOutlined,
  SettingOutlined,
  CheckOutlined,
  UndoOutlined,
  RightOutlined,
  ThunderboltOutlined,
  BulbOutlined,
  AudioOutlined,
  LockOutlined,
  ApiOutlined,
  LineChartOutlined,
  TrophyOutlined,
  FileTextOutlined,
} from '@ant-design/icons'
import SettingsAPIConfig from './SettingsAPIConfig'
import SettingsAnalytics from './SettingsAnalytics'
import SettingsGrowth from './SettingsGrowth'
import LogPanel from './LogPanel'
import type { Workflow } from '../types/workflow'
import type {
  AppSettings,
  SettingsSection,
  SearchIntensity,
  SearchLanguage,
  TextMode,
  CostQualityBalance,
  AudioQuality,
  ComplianceStrictness,
  ReminderIntensity,
  AIAssistLevel,
  PublishFlowMode,
  IdeationChallenge,
  ToneStyle,
  ContentTendency,
  DurationPreference,
  RetentionPolicy,
  StageId,
  NodeCapabilityType,
} from '../types/settings'
import { DEFAULT_SETTINGS } from '../types/settings'
import { VOICE_OPTIONS, PLATFORM_OPTIONS } from '../constants'

// ============================================================
// Props
// ============================================================

interface Props {
  visible: boolean
  workflow: Workflow | null
  onClose: () => void
}

const CAPABILITY_TO_GLOBAL_PREFIX: Record<NodeCapabilityType, 'text' | 'search' | 'audio'> = {
  search: 'search',
  text: 'text',
  reasoning: 'text',
  compliance: 'text',
  audio: 'audio',
}

const DEFAULT_MODEL_BY_PREFIX: Record<'text' | 'search' | 'audio', string> = {
  text: 'gpt-4o-mini',
  search: 'gpt-4o-mini',
  audio: 'tts-1',
}

const VOICE_TO_EDGE_VOICE: Record<string, string> = {
  'warm-male': 'zh-CN-YunxiNeural',
  'steady-male': 'zh-CN-YunjianNeural',
  'gentle-female': 'zh-CN-XiaoxiaoNeural',
  'energetic-female': 'zh-CN-XiaoyiNeural',
  professional: 'zh-CN-YunyangNeural',
  storyteller: 'zh-CN-XiaoxiaoNeural',
}

function resolveApiSettings(settings: AppSettings, stageId: StageId) {
  const override = settings.apiConfig.nodeOverrides[stageId]
  if (override.overrideMode === 'custom') {
    return {
      api_key: override.apiKey || '',
      api_base: override.apiBase || '',
      llm_model: override.apiModel || DEFAULT_MODEL_BY_PREFIX[CAPABILITY_TO_GLOBAL_PREFIX[override.capabilityType]],
    }
  }

  const prefix = CAPABILITY_TO_GLOBAL_PREFIX[override.capabilityType]
  const global = settings.apiConfig.global
  return {
    api_key: String(global[`${prefix}ApiKey`] || ''),
    api_base: String(global[`${prefix}ApiBase`] || ''),
    llm_model: String(global[`${prefix}ApiModel`] || DEFAULT_MODEL_BY_PREFIX[prefix]),
  }
}

function buildNodeConfigs(settings: AppSettings): Record<string, Record<string, any>> {
  const durationToMinutes: Record<DurationPreference, number> = {
    short: 8,
    medium: 15,
    long: 30,
  }
  const qualityToFormat: Record<AudioQuality, string> = {
    standard: 'mp3',
    high: 'mp3',
    ultra: 'wav',
  }
  const searchMax = settings.capability.search.resultRange[1]
  const ttsVoice = VOICE_TO_EDGE_VOICE[settings.capability.audio.defaultVoice] || VOICE_TO_EDGE_VOICE['warm-male']
  const audioProvider = settings.apiConfig.global.audioProvider || 'edge-tts'
  const audioConfig = resolveApiSettings(settings, 'produce')

  return {
    app_settings: settings,
    fetch: {
      breadth: settings.capability.search.intensity === 'deep' ? 5 : settings.capability.search.intensity === 'light' ? 2 : 3,
      quality: settings.capability.text.balance === 'quality' ? 5 : settings.capability.text.balance === 'cost' ? 3 : 4,
      freshness: 4,
      min_relevance: settings.capability.search.intensity === 'deep' ? 2 : 3,
      language_mix: settings.capability.search.language === 'zh'
        ? 'chinese'
        : settings.capability.search.language === 'en'
          ? 'english'
          : 'mixed',
      max_articles: searchMax,
      include_summary: true,
      group_by_topic: true,
    },
    research: {
      ...resolveApiSettings(settings, 'organize'),
      temperature: settings.capability.text.mode === 'quality' ? 0.4 : 0.6,
    },
    topic_selection: {
      ...resolveApiSettings(settings, 'ideate'),
      temperature: settings.nodeBehavior.ideationChallenge === 'reverse' ? 0.8 : 0.3,
    },
    script: {
      ...resolveApiSettings(settings, 'write'),
      target_duration_minutes: durationToMinutes[settings.creatorPreferences.durationPreference],
      dialogue_style: settings.creatorPreferences.toneStyle === 'rational' ? 'formal' : 'conversational',
      require_approval: settings.nodeBehavior.assistLevel !== 'deep',
      words_per_minute: 150,
    },
    stages: {
      words_per_minute: 150,
      max_segment_duration: settings.creatorPreferences.durationPreference === 'long' ? 180 : 120,
    },
    tts: {
      engine: audioProvider,
      api_key: audioProvider === 'openai-compatible' ? audioConfig.api_key : '',
      api_base: audioProvider === 'openai-compatible' ? audioConfig.api_base : 'https://api.openai.com/v1',
      model: audioProvider === 'openai-compatible' ? audioConfig.llm_model : 'tts-1',
      default_voice: audioProvider === 'openai-compatible' ? 'alloy' : ttsVoice,
      voice_mapping: {
        'Host A': audioProvider === 'openai-compatible' ? 'alloy' : ttsVoice,
        'Host B': audioProvider === 'openai-compatible' ? 'alloy' : ttsVoice,
      },
      output_format: 'mp3',
      rate: settings.capability.audio.quality === 'standard' ? '+0%' : '-5%',
      volume: '+0%',
    },
    audio_postprocess: {
      output_dir: 'out/episodes',
      output_format: qualityToFormat[settings.capability.audio.quality],
    },
    review: {
      require_approval: settings.capability.compliance.strictness === 'strict',
    },
    publish: {
      storage_type: 'local',
      local_base_dir: 'out/published',
      rss_output_dir: 'out/rss',
      podcast_title: 'Auto Podcast',
      podcast_description: 'AI assisted local podcast production',
      podcast_author: 'Auto-Podcast',
      podcast_language: settings.capability.search.language === 'en' ? 'en-US' : 'zh-CN',
      enabled_platforms: settings.system.defaultPlatforms,
    },
  }
}

function mergeSettings(saved: Partial<AppSettings> | null | undefined): AppSettings {
  const defaults = structuredClone(DEFAULT_SETTINGS)
  if (!saved) return defaults
  return {
    ...defaults,
    ...saved,
    capability: { ...defaults.capability, ...saved.capability },
    nodeBehavior: { ...defaults.nodeBehavior, ...saved.nodeBehavior },
    creatorPreferences: { ...defaults.creatorPreferences, ...saved.creatorPreferences },
    system: { ...defaults.system, ...saved.system },
    apiConfig: {
      ...defaults.apiConfig,
      ...saved.apiConfig,
      global: { ...defaults.apiConfig.global, ...saved.apiConfig?.global },
      nodeOverrides: {
        ...defaults.apiConfig.nodeOverrides,
        ...saved.apiConfig?.nodeOverrides,
      },
    },
  }
}

// ============================================================
// Navigation Items
// ============================================================

const NAV_ITEMS: { key: SettingsSection; icon: React.ReactNode; label: string; desc: string; dividerBefore?: boolean }[] = [
  { key: 'capability', icon: <ThunderboltOutlined />, label: '能力配置', desc: '配置系统核心能力' },
  { key: 'node-behavior', icon: <RobotOutlined />, label: '智能行为', desc: '调节智能协作方式' },
  { key: 'creator-preferences', icon: <UserOutlined />, label: '创作偏好', desc: '你的风格与倾向' },
  { key: 'api-config', icon: <ApiOutlined />, label: '智能能力接口', desc: '密钥与节点级配置', dividerBefore: true },
  { key: 'system', icon: <SettingOutlined />, label: '系统与发布', desc: '发布与数据管理' },
  { key: 'analytics', icon: <LineChartOutlined />, label: '数据与表现', desc: '收听数据与洞察', dividerBefore: true },
  { key: 'growth', icon: <TrophyOutlined />, label: '创作者成长', desc: '风格分析与建议' },
  { key: 'logs', icon: <FileTextOutlined />, label: '执行日志', desc: '查看日志与错误', dividerBefore: true },
]

// ============================================================
// Option Card Component
// ============================================================

interface OptionCardProps {
  selected: boolean
  onClick: () => void
  icon: React.ReactNode
  title: string
  desc: string
  badge?: string
  disabled?: boolean
}

function OptionCard({ selected, onClick, icon, title, desc, badge, disabled }: OptionCardProps) {
  return (
    <div
      onClick={disabled ? undefined : onClick}
      style={{
        flex: 1,
        minWidth: 140,
        padding: '16px 14px',
        borderRadius: 12,
        border: `1.5px solid ${selected ? 'var(--accent-primary)' : 'var(--border-color)'}`,
        background: selected ? 'var(--accent-light)' : disabled ? 'var(--bg-tertiary)' : 'var(--bg-secondary)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'all 0.2s ease',
        position: 'relative',
      }}
      className="settings-option-card"
    >
      {badge && (
        <span style={{
          position: 'absolute',
          top: 8,
          right: 8,
          fontSize: 10,
          padding: '1px 6px',
          borderRadius: 4,
          background: selected ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
          color: selected ? '#fff' : 'var(--text-tertiary)',
          fontWeight: 500,
        }}>
          {badge}
        </span>
      )}
      <div style={{ fontSize: 20, marginBottom: 8 }}>{icon}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: selected ? 'var(--accent-primary)' : 'var(--text-primary)', marginBottom: 4 }}>
        {title}
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-tertiary)', lineHeight: 1.4 }}>{desc}</div>
      {selected && (
        <div style={{
          position: 'absolute',
          top: 8,
          left: 8,
          width: 16,
          height: 16,
          borderRadius: '50%',
          background: 'var(--accent-primary)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <CheckOutlined style={{ fontSize: 9, color: '#fff' }} />
        </div>
      )}
    </div>
  )
}

// ============================================================
// Section Header
// ============================================================

function SectionHeader({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 16, color: 'var(--accent-primary)' }}>{icon}</span>
        <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>{title}</span>
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-tertiary)', paddingLeft: 24 }}>{desc}</div>
    </div>
  )
}

// ============================================================
// Subsection Block
// ============================================================

function SubsectionBlock({ title, desc, children, collapsible = false }: {
  title: string
  desc?: string
  children: React.ReactNode
  collapsible?: boolean
}) {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div style={{
      background: 'var(--bg-secondary)',
      border: '1px solid var(--border-color)',
      borderRadius: 12,
      padding: '18px 20px',
      marginBottom: 16,
      transition: 'box-shadow 0.2s ease',
    }}
    className="settings-subsection"
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: collapsible ? 'pointer' : 'default',
          marginBottom: collapsed ? 0 : 14,
        }}
        onClick={collapsible ? () => setCollapsed(!collapsed) : undefined}
      >
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{title}</div>
          {desc && <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>{desc}</div>}
        </div>
        {collapsible && (
          <RightOutlined style={{
            fontSize: 10,
            color: 'var(--text-tertiary)',
            transform: collapsed ? 'rotate(0deg)' : 'rotate(90deg)',
            transition: 'transform 0.2s ease',
          }} />
        )}
      </div>
      {!collapsed && (
        <div style={{ animation: 'settingsFadeIn 0.2s ease' }}>
          {children}
        </div>
      )}
    </div>
  )
}

// ============================================================
// Coming Soon Block
// ============================================================

function ComingSoonBlock({ title, desc, icon }: { title: string; desc: string; icon: React.ReactNode }) {
  return (
    <div style={{
      background: 'var(--bg-tertiary)',
      border: '1px dashed var(--border-color)',
      borderRadius: 12,
      padding: '20px',
      marginBottom: 16,
      opacity: 0.6,
      textAlign: 'center',
    }}>
      <div style={{ fontSize: 24, marginBottom: 8, opacity: 0.5 }}>{icon}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{desc}</div>
      <div style={{
        marginTop: 10,
        fontSize: 10,
        padding: '2px 10px',
        background: 'var(--bg-secondary)',
        borderRadius: 10,
        display: 'inline-block',
        color: 'var(--text-tertiary)',
        fontWeight: 500,
      }}>
        即将上线
      </div>
    </div>
  )
}


// ============================================================
// Main Component
// ============================================================

export default function SettingsPage({ visible, workflow, onClose }: Props) {
  const [activeSection, setActiveSection] = useState<SettingsSection>('capability')
  const [settings, setSettings] = useState<AppSettings>(() => structuredClone(DEFAULT_SETTINGS))
  const [hasChanges, setHasChanges] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)

  // Reset state when opening
  useEffect(() => {
    if (visible) {
      setSaveSuccess(false)
      setHasChanges(false)
      if (window.electronAPI?.loadNodeConfig) {
        window.electronAPI.loadNodeConfig('app_settings')
          .then(config => {
            if (config) setSettings(mergeSettings(config as Partial<AppSettings>))
          })
          .catch(error => console.error('Failed to load app settings:', error))
      }
    }
  }, [visible])

  // Update helper
  const updateSettings = useCallback(<K extends keyof AppSettings>(
    module: K,
    updater: (prev: AppSettings[K]) => AppSettings[K]
  ) => {
    setSettings(prev => ({
      ...prev,
      [module]: updater(prev[module]),
    }))
    setHasChanges(true)
    setSaveSuccess(false)
  }, [])

  // Save
  const handleSave = useCallback(async () => {
    setSaving(true)
    try {
      if (!window.electronAPI?.saveNodeConfig) {
        throw new Error('当前运行环境未连接 Electron 后端，无法写入本地节点配置')
      }

      const nodeConfigs = buildNodeConfigs(settings)
      const results = await Promise.all(
        Object.entries(nodeConfigs).map(([nodeName, config]) =>
          window.electronAPI.saveNodeConfig(nodeName, config)
        )
      )
      const failed = results.find(result => !result?.success)
      if (failed) {
        throw new Error(failed.error || '节点配置保存失败')
      }

      setHasChanges(false)
      setSaveSuccess(true)
      message.success({ content: '设置已保存到本地节点配置', duration: 2, style: { marginTop: 60 } })
      setTimeout(() => setSaveSuccess(false), 3000)
    } catch (error: any) {
      setSaveSuccess(false)
      message.error({ content: error?.message || '设置保存失败', duration: 3, style: { marginTop: 60 } })
    } finally {
      setSaving(false)
    }
  }, [settings])

  // Reset
  const handleReset = useCallback(() => {
    setSettings(structuredClone(DEFAULT_SETTINGS))
    setHasChanges(true)
    message.info({ content: '已恢复默认设置，点击保存以生效', duration: 2, style: { marginTop: 60 } })
  }, [])

  if (!visible) return null

  // ============================================================
  // Render: Capability Config (Module 1)
  // ============================================================
  const renderCapability = () => (
    <div style={{ animation: 'settingsContentIn 0.3s ease' }}>
      <SectionHeader
        icon={<ThunderboltOutlined />}
        title="能力配置"
        desc="配置系统在不同环节使用的核心能力，影响创作质量与效率"
      />

      {/* 1. Search Capability */}
      <SubsectionBlock title="信息获取能力" desc="影响发现层的信息搜索范围与质量">
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 10 }}>搜索深度</div>
          <div style={{ display: 'flex', gap: 10 }}>
            {([
              { key: 'light' as SearchIntensity, icon: '🔍', title: '快速浏览', desc: '快速获取核心信息' },
              { key: 'standard' as SearchIntensity, icon: '📡', title: '标准搜索', desc: '平衡速度与覆盖面' },
              { key: 'deep' as SearchIntensity, icon: '🔬', title: '深度挖掘', desc: '全面搜索，覆盖更多来源' },
            ]).map(opt => (
              <OptionCard
                key={opt.key}
                selected={settings.capability.search.intensity === opt.key}
                onClick={() => updateSettings('capability', c => ({ ...c, search: { ...c.search, intensity: opt.key } }))}
                icon={opt.icon}
                title={opt.title}
                desc={opt.desc}
              />
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 10 }}>语言偏好</div>
          <div style={{ display: 'flex', gap: 10 }}>
            {([
              { key: 'zh' as SearchLanguage, icon: '🇨🇳', title: '中文优先', desc: '优先搜索中文内容' },
              { key: 'en' as SearchLanguage, icon: '🌍', title: '英文优先', desc: '优先搜索英文内容' },
              { key: 'auto' as SearchLanguage, icon: '🔄', title: '智能匹配', desc: '根据话题自动选择' },
            ]).map(opt => (
              <OptionCard
                key={opt.key}
                selected={settings.capability.search.language === opt.key}
                onClick={() => updateSettings('capability', c => ({ ...c, search: { ...c.search, language: opt.key } }))}
                icon={opt.icon}
                title={opt.title}
                desc={opt.desc}
              />
            ))}
          </div>
        </div>

        <div>
          <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 10 }}>
            结果数量范围
            <span style={{ fontWeight: 400, color: 'var(--text-tertiary)', marginLeft: 8 }}>
              {settings.capability.search.resultRange[0]} ~ {settings.capability.search.resultRange[1]} 条
            </span>
          </div>
          <Slider
            range
            min={1}
            max={30}
            value={settings.capability.search.resultRange}
            onChange={(val) => updateSettings('capability', c => ({ ...c, search: { ...c.search, resultRange: val as [number, number] } }))}
            marks={{ 1: '1', 10: '10', 20: '20', 30: '30' }}
            style={{ margin: '0 8px' }}
          />
        </div>
      </SubsectionBlock>

      {/* 2. Text Capability */}
      <SubsectionBlock title="文本理解与生成能力" desc="影响整理层、构思层、写作层的文本处理质量">
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 10 }}>处理模式</div>
          <div style={{ display: 'flex', gap: 10 }}>
            {([
              { key: 'standard' as TextMode, icon: '⚡', title: '标准模式', desc: '满足日常创作，响应快速' },
              { key: 'deep' as TextMode, icon: '🧠', title: '深度模式', desc: '更深入的分析与理解' },
              { key: 'quality' as TextMode, icon: '💎', title: '高质量模式', desc: '最佳输出质量，耗时更长' },
            ]).map(opt => (
              <OptionCard
                key={opt.key}
                selected={settings.capability.text.mode === opt.key}
                onClick={() => updateSettings('capability', c => ({ ...c, text: { ...c.text, mode: opt.key } }))}
                icon={opt.icon}
                title={opt.title}
                desc={opt.desc}
              />
            ))}
          </div>
        </div>

        <div>
          <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 10 }}>效率与质量</div>
          <div style={{ display: 'flex', gap: 10 }}>
            {([
              { key: 'cost' as CostQualityBalance, icon: '🚀', title: '效率优先', desc: '更快完成，节省资源' },
              { key: 'balanced' as CostQualityBalance, icon: '⚖️', title: '均衡模式', desc: '兼顾效率与质量' },
              { key: 'quality' as CostQualityBalance, icon: '🎯', title: '质量优先', desc: '不计资源，追求最佳' },
            ]).map(opt => (
              <OptionCard
                key={opt.key}
                selected={settings.capability.text.balance === opt.key}
                onClick={() => updateSettings('capability', c => ({ ...c, text: { ...c.text, balance: opt.key } }))}
                icon={opt.icon}
                title={opt.title}
                desc={opt.desc}
              />
            ))}
          </div>
        </div>
      </SubsectionBlock>

      {/* 3. Audio Capability */}
      <SubsectionBlock title="音频生成能力" desc="影响声音制作层的语音生成效果">
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 10 }}>默认音色</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            {VOICE_OPTIONS.map(voice => (
              <OptionCard
                key={voice.id}
                selected={settings.capability.audio.defaultVoice === voice.id}
                onClick={() => updateSettings('capability', c => ({ ...c, audio: { ...c.audio, defaultVoice: voice.id } }))}
                icon={voice.emoji}
                title={voice.label}
                desc={voice.desc}
              />
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 10 }}>音频质量</div>
          <div style={{ display: 'flex', gap: 10 }}>
            {([
              { key: 'standard' as AudioQuality, icon: '📻', title: '标准', desc: '文件较小，适合日常' },
              { key: 'high' as AudioQuality, icon: '🎵', title: '高品质', desc: '清晰自然，推荐使用' },
              { key: 'ultra' as AudioQuality, icon: '🎼', title: '无损', desc: '极致音质，文件较大' },
            ]).map(opt => (
              <OptionCard
                key={opt.key}
                selected={settings.capability.audio.quality === opt.key}
                onClick={() => updateSettings('capability', c => ({ ...c, audio: { ...c.audio, quality: opt.key } }))}
                icon={opt.icon}
                title={opt.title}
                desc={opt.desc}
                badge={opt.key === 'high' ? '推荐' : undefined}
              />
            ))}
          </div>
        </div>

        {/* Coming soon: Voice Clone */}
        <ComingSoonBlock
          icon={<AudioOutlined />}
          title="语音克隆"
          desc="上传你的声音样本，生成专属于你的智能音色"
        />

        {/* Coming soon: Multi-voice */}
        <ComingSoonBlock
          icon={<SoundOutlined />}
          title="多角色音色"
          desc="为不同播客角色分配独立音色，让对话更真实"
        />
      </SubsectionBlock>

      {/* 4. Compliance */}
      <SubsectionBlock title="合规与风险能力" desc="影响发布层的内容安全检查">
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 10 }}>审查严格度</div>
          <div style={{ display: 'flex', gap: 10 }}>
            {([
              { key: 'relaxed' as ComplianceStrictness, icon: '🟢', title: '宽松', desc: '仅标记高风险内容' },
              { key: 'standard' as ComplianceStrictness, icon: '🟡', title: '标准', desc: '平衡安全与创作自由' },
              { key: 'strict' as ComplianceStrictness, icon: '🔴', title: '严格', desc: '全面审查，适合敏感话题' },
            ]).map(opt => (
              <OptionCard
                key={opt.key}
                selected={settings.capability.compliance.strictness === opt.key}
                onClick={() => updateSettings('capability', c => ({ ...c, compliance: { ...c.compliance, strictness: opt.key } }))}
                icon={opt.icon}
                title={opt.title}
                desc={opt.desc}
              />
            ))}
          </div>
        </div>

        <div>
          <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 10 }}>提醒强度</div>
          <div style={{ display: 'flex', gap: 10 }}>
            {([
              { key: 'gentle' as ReminderIntensity, icon: '💬', title: '温和提醒', desc: '轻量提示，不打断创作' },
              { key: 'standard' as ReminderIntensity, icon: '⚠️', title: '标准提醒', desc: '明确标注风险点' },
              { key: 'strong' as ReminderIntensity, icon: '🚨', title: '强力提醒', desc: '高亮显示并要求确认' },
            ]).map(opt => (
              <OptionCard
                key={opt.key}
                selected={settings.capability.compliance.reminderIntensity === opt.key}
                onClick={() => updateSettings('capability', c => ({ ...c, compliance: { ...c.compliance, reminderIntensity: opt.key } }))}
                icon={opt.icon}
                title={opt.title}
                desc={opt.desc}
              />
            ))}
          </div>
        </div>
      </SubsectionBlock>
    </div>
  )

  // ============================================================
  // Render: Node Behavior (Module 2)
  // ============================================================
  const renderNodeBehavior = () => (
    <div style={{ animation: 'settingsContentIn 0.3s ease' }}>
      <SectionHeader
        icon={<RobotOutlined />}
        title="智能行为"
        desc="调节智能助手在创作过程中的介入方式与深度"
      />

      {/* 1. 智能介入强度 */}
      <SubsectionBlock title="全局智能介入强度" desc="控制智能助手在各环节的主动程度与分析深度">
        <div style={{ display: 'flex', gap: 10 }}>
          {([
            {
              key: 'light' as AIAssistLevel,
              icon: '🌿',
              title: '轻辅助',
              desc: '仅在你需要时出现，最少提示与干预',
            },
            {
              key: 'standard' as AIAssistLevel,
              icon: '🤝',
              title: '标准协作',
              desc: '适度提供建议和分析，保持创作节奏',
              badge: '推荐',
            },
            {
              key: 'deep' as AIAssistLevel,
              icon: '🧠',
              title: '深度协作',
              desc: '主动分析、多角度建议、深入挖掘',
            },
          ]).map(opt => (
            <OptionCard
              key={opt.key}
              selected={settings.nodeBehavior.assistLevel === opt.key}
              onClick={() => updateSettings('nodeBehavior', c => ({ ...c, assistLevel: opt.key }))}
              icon={opt.icon}
              title={opt.title}
              desc={opt.desc}
              badge={opt.badge}
            />
          ))}
        </div>
        <div style={{
          marginTop: 14,
          padding: '10px 14px',
          background: 'var(--accent-light)',
          borderRadius: 8,
          fontSize: 11,
          color: 'var(--text-secondary)',
          lineHeight: 1.6,
        }}>
          <BulbOutlined style={{ color: 'var(--accent-primary)', marginRight: 6 }} />
          {settings.nodeBehavior.assistLevel === 'light' && '轻辅助模式下，智能助手会减少主动提示，给你更多独立思考空间。适合经验丰富的创作者。'}
          {settings.nodeBehavior.assistLevel === 'standard' && '标准协作模式会在关键节点提供建议，同时保持你的创作主导权。适合大多数场景。'}
          {settings.nodeBehavior.assistLevel === 'deep' && '深度协作模式下，智能助手会主动提供多维度分析和更详细的建议。适合探索性创作。'}
        </div>
      </SubsectionBlock>

      {/* 2. Publish Flow Mode */}
      <SubsectionBlock title="发布流程默认模式" desc="选择开始发布时的默认路径">
        <div style={{ display: 'flex', gap: 10 }}>
          {([
            {
              key: 'smart' as PublishFlowMode,
              icon: '🚀',
              title: '智能发布',
              desc: '经过智能助手优化后发布',
            },
            {
              key: 'quick' as PublishFlowMode,
              icon: '⚡',
              title: '快速发布',
              desc: '跳过优化步骤，直接发布',
            },
            {
              key: 'remember' as PublishFlowMode,
              icon: '📌',
              title: '记住上次',
              desc: '自动使用上次选择的方式',
            },
          ]).map(opt => (
            <OptionCard
              key={opt.key}
              selected={settings.nodeBehavior.publishFlowMode === opt.key}
              onClick={() => updateSettings('nodeBehavior', c => ({ ...c, publishFlowMode: opt.key }))}
              icon={opt.icon}
              title={opt.title}
              desc={opt.desc}
            />
          ))}
        </div>
      </SubsectionBlock>

      {/* 3. Ideation Challenge */}
      <SubsectionBlock title="构思层挑战强度" desc="决定智能助手在构思阶段如何挑战你的想法">
        <div style={{ display: 'flex', gap: 10 }}>
          {([
            {
              key: 'normal' as IdeationChallenge,
              icon: '💡',
              title: '普通模式',
              desc: '温和地补充和完善你的想法',
            },
            {
              key: 'critical' as IdeationChallenge,
              icon: '🔍',
              title: '批判模式',
              desc: '指出薄弱环节，提供改进方向',
            },
            {
              key: 'reverse' as IdeationChallenge,
              icon: '🔄',
              title: '反向挑战',
              desc: '提出对立观点，激发深层思考',
            },
          ]).map(opt => (
            <OptionCard
              key={opt.key}
              selected={settings.nodeBehavior.ideationChallenge === opt.key}
              onClick={() => updateSettings('nodeBehavior', c => ({ ...c, ideationChallenge: opt.key }))}
              icon={opt.icon}
              title={opt.title}
              desc={opt.desc}
            />
          ))}
        </div>
        <div style={{
          marginTop: 14,
          padding: '10px 14px',
          background: settings.nodeBehavior.ideationChallenge === 'reverse' ? '#fef2f2' : 'var(--bg-tertiary)',
          borderRadius: 8,
          fontSize: 11,
          color: 'var(--text-secondary)',
          lineHeight: 1.6,
        }}>
          {settings.nodeBehavior.ideationChallenge === 'normal' && '💡 普通模式适合快速产出，智能助手会顺着你的思路补充细节。'}
          {settings.nodeBehavior.ideationChallenge === 'critical' && '🔍 批判模式会帮你发现论点漏洞，让内容更经得起推敲。'}
          {settings.nodeBehavior.ideationChallenge === 'reverse' && '🔄 反向挑战会提出完全相反的观点，帮你打磨更有深度的内容。慎用！'}
        </div>
      </SubsectionBlock>
    </div>
  )

  // ============================================================
  // Render: Creator Preferences (Module 3)
  // ============================================================
  const renderCreatorPreferences = () => (
    <div style={{ animation: 'settingsContentIn 0.3s ease' }}>
      <SectionHeader
        icon={<UserOutlined />}
        title="创作偏好"
        desc="这些设置会影响构思层和写作层的内容风格与结构"
      />

      {/* 1. Tone Style */}
      <SubsectionBlock title="默认语气风格" desc="你的节目整体语气倾向">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
          {([
            { key: 'rational' as ToneStyle, icon: '📊', title: '理性分析', desc: '数据驱动，逻辑清晰，客观中立' },
            { key: 'calm' as ToneStyle, icon: '🧊', title: '冷静评论', desc: '不急不缓，娓娓道来，从容大气' },
            { key: 'passionate' as ToneStyle, icon: '🔥', title: '热情表达', desc: '充满热情，感染力强，观点鲜明' },
            { key: 'latenight' as ToneStyle, icon: '🌙', title: '深夜电台', desc: '温暖私密，像朋友间的深度对话' },
          ]).map(opt => (
            <OptionCard
              key={opt.key}
              selected={settings.creatorPreferences.toneStyle === opt.key}
              onClick={() => updateSettings('creatorPreferences', c => ({ ...c, toneStyle: opt.key }))}
              icon={opt.icon}
              title={opt.title}
              desc={opt.desc}
            />
          ))}
        </div>
      </SubsectionBlock>

      {/* 2. Content Tendency */}
      <SubsectionBlock title="内容倾向" desc="你更擅长和偏好的表达方式">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
          {([
            { key: 'news' as ContentTendency, icon: '📰', title: '新闻解读', desc: '聚焦事件本身，提供背景与解读' },
            { key: 'commentary' as ContentTendency, icon: '🎤', title: '评论表达', desc: '基于事件发表观点，引发思考' },
            { key: 'analysis' as ContentTendency, icon: '🔬', title: '深度分析', desc: '抽丝剥茧，挖掘深层逻辑与影响' },
            { key: 'narrative' as ContentTendency, icon: '📖', title: '讲述型表达', desc: '以故事化手法呈现，引人入胜' },
          ]).map(opt => (
            <OptionCard
              key={opt.key}
              selected={settings.creatorPreferences.contentTendency === opt.key}
              onClick={() => updateSettings('creatorPreferences', c => ({ ...c, contentTendency: opt.key }))}
              icon={opt.icon}
              title={opt.title}
              desc={opt.desc}
            />
          ))}
        </div>
      </SubsectionBlock>

      {/* 3. Duration Preference */}
      <SubsectionBlock title="节目时长偏好" desc="影响内容节奏与结构建议">
        <div style={{ display: 'flex', gap: 10 }}>
          {([
            { key: 'short' as DurationPreference, icon: '⚡', title: '短节目', desc: '5-10 分钟，快节奏要点播报' },
            { key: 'medium' as DurationPreference, icon: '🎧', title: '中等时长', desc: '15-30 分钟，深入但不冗长', badge: '推荐' },
            { key: 'long' as DurationPreference, icon: '📻', title: '长节目', desc: '45-60 分钟，沉浸式深度内容' },
          ]).map(opt => (
            <OptionCard
              key={opt.key}
              selected={settings.creatorPreferences.durationPreference === opt.key}
              onClick={() => updateSettings('creatorPreferences', c => ({ ...c, durationPreference: opt.key }))}
              icon={opt.icon}
              title={opt.title}
              desc={opt.desc}
              badge={opt.badge}
            />
          ))}
        </div>
      </SubsectionBlock>
    </div>
  )

  // ============================================================
  // Render: System & Publishing (Module 4)
  // ============================================================
  const renderSystem = () => (
    <div style={{ animation: 'settingsContentIn 0.3s ease' }}>
      <SectionHeader
        icon={<SettingOutlined />}
        title="系统与发布"
        desc="管理发布平台、历史记录与数据"
      />

      {/* 1. Default Platforms */}
      <SubsectionBlock title="默认发布平台" desc="选择创建节目时默认勾选的发布平台">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {PLATFORM_OPTIONS.map(platform => {
            const selected = settings.system.defaultPlatforms.includes(platform.id)
            return (
              <div
                key={platform.id}
                onClick={() => {
                  updateSettings('system', c => ({
                    ...c,
                    defaultPlatforms: selected
                      ? c.defaultPlatforms.filter(p => p !== platform.id)
                      : [...c.defaultPlatforms, platform.id],
                  }))
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '12px 14px',
                  borderRadius: 10,
                  border: `1.5px solid ${selected ? 'var(--accent-primary)' : 'var(--border-color)'}`,
                  background: selected ? 'var(--accent-light)' : 'var(--bg-secondary)',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
                className="settings-option-card"
              >
                <span style={{ fontSize: 22 }}>{platform.icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: selected ? 'var(--accent-primary)' : 'var(--text-primary)' }}>
                    {platform.label}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{platform.desc}</div>
                </div>
                <div style={{
                  width: 20,
                  height: 20,
                  borderRadius: 4,
                  border: `1.5px solid ${selected ? 'var(--accent-primary)' : 'var(--border-color)'}`,
                  background: selected ? 'var(--accent-primary)' : 'transparent',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.2s ease',
                }}>
                  {selected && <CheckOutlined style={{ fontSize: 10, color: '#fff' }} />}
                </div>
              </div>
            )
          })}
        </div>
      </SubsectionBlock>

      {/* 2. Retention Policy */}
      <SubsectionBlock title="发布记录保留策略" desc="管理历史发布记录的保存方式">
        <div style={{ display: 'flex', gap: 10 }}>
          {([
            { key: 'forever' as RetentionPolicy, icon: '♾️', title: '永久保留', desc: '保留所有发布记录' },
            { key: 'recent50' as RetentionPolicy, icon: '📋', title: '最近 50 条', desc: '仅保留最近 50 条记录' },
            { key: 'recent20' as RetentionPolicy, icon: '📝', title: '最近 20 条', desc: '仅保留最近 20 条记录' },
          ]).map(opt => (
            <OptionCard
              key={opt.key}
              selected={settings.system.retentionPolicy === opt.key}
              onClick={() => updateSettings('system', c => ({ ...c, retentionPolicy: opt.key }))}
              icon={opt.icon}
              title={opt.title}
              desc={opt.desc}
            />
          ))}
        </div>
      </SubsectionBlock>

      {/* Data & Growth modules are now accessible via dedicated nav sections */}
    </div>
  )

  const renderLogs = () => (
    <div style={{ animation: 'settingsContentIn 0.3s ease' }}>
      <SectionHeader
        icon={<FileTextOutlined />}
        title="执行日志"
        desc="查看当前节目的执行日志与错误信息"
      />
      <div style={{
        height: 520,
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border-color)',
        borderRadius: 12,
        overflow: 'hidden',
      }}>
        <LogPanel workflow={workflow} collapsed={false} showToggle={false} />
      </div>
    </div>
  )

  // ============================================================
  // Render: Content Router
  // ============================================================
  const renderContent = () => {
    switch (activeSection) {
      case 'capability': return renderCapability()
      case 'node-behavior': return renderNodeBehavior()
      case 'creator-preferences': return renderCreatorPreferences()
      case 'system': return renderSystem()
      case 'api-config': return <SettingsAPIConfig settings={settings} updateSettings={updateSettings} />
      case 'analytics': return <SettingsAnalytics />
      case 'growth': return <SettingsGrowth />
      case 'logs': return renderLogs()
      default: return renderCapability()
    }
  }

  // ============================================================
  // Main Render
  // ============================================================
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
      animation: 'settingsPageIn 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
    }}>
      {/* Top Bar */}
      <div style={{
        height: 52,
        minHeight: 52,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 20px',
        borderBottom: '1px solid var(--border-color)',
        background: 'var(--bg-secondary)',
        boxShadow: 'var(--shadow-sm)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <SettingOutlined style={{ fontSize: 16, color: 'var(--accent-primary)' }} />
          <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>设置</span>
          <span style={{ fontSize: 12, color: 'var(--text-tertiary)', marginLeft: 4 }}>配置你的创作系统</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {hasChanges && (
            <Tooltip title="恢复默认设置">
              <Button
                size="small"
                icon={<UndoOutlined />}
                onClick={handleReset}
                style={{
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-secondary)',
                  fontSize: 12,
                  height: 30,
                }}
              >
                恢复默认
              </Button>
            </Tooltip>
          )}
          <Button
            type="primary"
            size="small"
            icon={saveSuccess ? <CheckOutlined /> : undefined}
            loading={saving}
            disabled={!hasChanges}
            onClick={handleSave}
            style={{
              background: saveSuccess ? 'var(--success-color)' : hasChanges ? 'var(--accent-primary)' : undefined,
              borderColor: saveSuccess ? 'var(--success-color)' : hasChanges ? 'var(--accent-primary)' : undefined,
              fontSize: 12,
              height: 30,
              minWidth: 72,
              transition: 'all 0.3s ease',
            }}
          >
            {saveSuccess ? '已保存' : '保存设置'}
          </Button>
          <div style={{ width: 1, height: 20, background: 'var(--border-color)', margin: '0 4px' }} />
          <Tooltip title="关闭设置">
            <Button
              type="text"
              icon={<CloseOutlined />}
              onClick={onClose}
              style={{ color: 'var(--text-secondary)', width: 30, height: 30 }}
            />
          </Tooltip>
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Left Navigation */}
        <div style={{
          width: 220,
          minWidth: 220,
          borderRight: '1px solid var(--border-color)',
          background: 'var(--bg-secondary)',
          padding: '16px 10px',
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
        }}>
          {NAV_ITEMS.map(item => {
            const active = activeSection === item.key
            return (
              <div key={item.key}>
                {item.dividerBefore && (
                  <div style={{ height: 1, background: 'var(--border-color)', margin: '8px 12px' }} />
                )}
                <div
                  onClick={() => setActiveSection(item.key)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '10px 12px',
                    borderRadius: 8,
                    cursor: 'pointer',
                    background: active ? 'var(--accent-light)' : 'transparent',
                    transition: 'all 0.15s ease',
                  }}
                  className={active ? '' : 'settings-nav-item'}
                >
                  <span style={{
                    fontSize: 15,
                    color: active ? 'var(--accent-primary)' : 'var(--text-tertiary)',
                    width: 20,
                    textAlign: 'center',
                    transition: 'color 0.15s ease',
                  }}>
                    {item.icon}
                  </span>
                  <div>
                    <div style={{
                      fontSize: 13,
                      fontWeight: active ? 600 : 500,
                      color: active ? 'var(--accent-primary)' : 'var(--text-primary)',
                      transition: 'color 0.15s ease',
                    }}>
                      {item.label}
                    </div>
                    <div style={{
                      fontSize: 11,
                      color: active ? 'var(--accent-primary)' : 'var(--text-tertiary)',
                      opacity: active ? 0.7 : 1,
                      marginTop: 1,
                    }}>
                      {item.desc}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}

          {/* Bottom info */}
          <div style={{ marginTop: 'auto', padding: '12px', borderTop: '1px solid var(--border-color)' }}>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', lineHeight: 1.6 }}>
              <LockOutlined style={{ marginRight: 4 }} />
              所有设置仅在本地保存，不会上传至任何服务器
            </div>
          </div>
        </div>

        {/* Right Content */}
        <div style={{
          flex: 1,
          overflow: 'auto',
          padding: '28px 36px 60px 36px',
          background: 'var(--bg-primary)',
        }}>
          <div style={{ maxWidth: 680, margin: '0 auto' }}>
            {renderContent()}
          </div>
        </div>
      </div>
    </div>
  )
}
