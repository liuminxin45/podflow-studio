import { useState, useCallback, useEffect, useRef } from 'react'
import { Button, Modal, message } from 'antd'
import {
  CloseOutlined,
  UserOutlined,
  SettingOutlined,
  CheckOutlined,
  UndoOutlined,
  RightOutlined,
  ApiOutlined,
  FileTextOutlined,
} from '../icons/antdCompat'
import SettingsAPIConfig from './SettingsAPIConfig'
import LogPanel from './LogPanel'
import type { Workflow } from '../types/workflow'
import {
  mergeAppSettings,
  settingsRepository,
} from '../services/settings/repository'
import {
  applyDetectedLocalAgentsToSettings,
  detectLocalAgentStatuses,
} from '../services/settings/localAgentDetection'
import type {
  AppSettings,
  SettingsSection,
  AudioQuality,
  ContentTendency,
  DurationPreference,
  EditorialVoice,
  NodeOverrideStageId,
  NodeCapabilityType,
  AIModelProviderConfig,
  LocalAgentConfig,
} from '../types/settings'
import { DEFAULT_SETTINGS } from '../types/settings'
import type { OrganizeCompletionMode } from '../types/organize'
import { VOICE_OPTIONS } from '../constants'
import { FETCH_NEUTRAL_CONFIG } from '../constants/fetchConfig'
import {
  MORNING_NEWS_DURATION_PROFILES,
  resolveMorningNewsProfile,
} from '../services/writing/morningNewsProfile'

// ============================================================
// Props
// ============================================================

interface Props {
  visible: boolean
  workflow: Workflow | null
  onClose: () => void
}

const CAPABILITY_TO_GLOBAL_PREFIX: Record<NodeCapabilityType, 'text' | 'audio'> = {
  search: 'text',
  text: 'text',
  reasoning: 'text',
  audio: 'audio',
}

const DEFAULT_MODEL_BY_PREFIX: Record<'text' | 'audio', string> = {
  text: 'gpt-4o-mini',
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

function resolveApiSettings(settings: AppSettings, stageId: NodeOverrideStageId) {
  const override = settings.apiConfig.nodeOverrides[stageId]
  if (override.overrideMode === 'custom') {
    const inherited = resolveGlobalApiSettings(settings)
    const inheritedRemote = inherited.provider_kind === 'local_agent' ? null : inherited
    const hasCustomEndpoint = Boolean(override.apiKey || override.apiBase)
    const canOverrideModel = inherited.provider_kind !== 'local_agent' || hasCustomEndpoint
    if (!hasCustomEndpoint && !canOverrideModel) return inherited
    return {
      ...inheritedRemote,
      api_key: override.apiKey || inheritedRemote?.api_key || '',
      api_key_env_var: override.apiKey ? '' : inheritedRemote?.api_key_env_var || '',
      api_base: override.apiBase || inheritedRemote?.api_base || 'https://api.openai.com/v1',
      llm_model: canOverrideModel
        ? override.apiModel || inheritedRemote?.llm_model || DEFAULT_MODEL_BY_PREFIX[CAPABILITY_TO_GLOBAL_PREFIX[override.capabilityType]]
        : inherited.llm_model,
      provider_kind: hasCustomEndpoint ? 'openai_compatible' : inheritedRemote?.provider_kind || 'openai_compatible',
      ai_target: `node:${stageId}`,
    }
  }

  return resolveGlobalApiSettings(settings)
}

function resolveGlobalApiSettings(settings: AppSettings) {

  const selectedTarget = resolveDefaultModelTarget(settings)
  if (selectedTarget) {
    const apiKey = targetDefaultApiKey(selectedTarget)
    return {
      api_key: apiKey,
      api_key_env_var: selectedTarget.apiKeyStorage === 'env' ? selectedTarget.apiKeyEnvVar || '' : '',
      api_base: selectedTarget.apiBase || '',
      llm_model: selectedTarget.model || 'gpt-4o-mini',
      provider_kind: selectedTarget.kind,
      ai_target: `model:${selectedTarget.id}`,
    }
  }

  const global = settings.apiConfig.global
  const defaultTarget = String(global.defaultAITarget || '')
  if (defaultTarget.startsWith('agent:')) {
    const localAgentId = defaultTarget.replace(/^agent:/, '')
    const localAgent = resolveDefaultLocalAgent(settings)
    return {
      api_key: '',
      api_key_env_var: '',
      api_base: '',
      llm_model: localAgentId,
      provider_kind: 'local_agent',
      ai_target: defaultTarget,
      local_agent_id: localAgentId,
      local_agent_command: localAgent?.command || localAgentId,
      local_agent_args: localAgent?.runArgs || ['{prompt}'],
      local_agent_output_mode: localAgent?.outputMode || 'stdout',
    }
  }

  return {
    api_key: '',
    api_key_env_var: '',
    api_base: '',
    llm_model: DEFAULT_MODEL_BY_PREFIX.text,
    provider_kind: 'openai_compatible',
    ai_target: '',
  }
}

function resolveDefaultModelTarget(settings: AppSettings): AIModelProviderConfig | null {
  const targetId = settings.apiConfig.global.defaultAITarget || ''
  if (!targetId.startsWith('model:')) return null
  const providerId = targetId.replace(/^model:/, '')
  return settings.apiConfig.global.aiModelProviders.find(provider => provider.id === providerId) || null
}

function resolveDefaultLocalAgent(settings: AppSettings): LocalAgentConfig | null {
  const targetId = settings.apiConfig.global.defaultAITarget || ''
  if (!targetId.startsWith('agent:')) return null
  const agentId = targetId.replace(/^agent:/, '')
  return settings.apiConfig.global.localAgents.find(agent => agent.id === agentId) || null
}

function targetDefaultApiKey(provider: AIModelProviderConfig): string {
  if (provider.targetKind === 'local_model') return 'local-model'
  if (provider.apiKeyStorage === 'none') return 'no-key'
  if (provider.apiKeyStorage === 'env') return ''
  return provider.apiKey || ''
}

// Exported as a deterministic configuration builder for focused contract tests.
// eslint-disable-next-line react-refresh/only-export-components
export function buildNodeConfigs(settings: AppSettings): Record<string, Record<string, any>> {
  const morningNewsProfile = resolveMorningNewsProfile(settings)
  const ttsVoice = VOICE_TO_EDGE_VOICE[settings.capability.audio.defaultVoice] || VOICE_TO_EDGE_VOICE['warm-male']
  const audioProvider = settings.apiConfig.global.audioProvider || 'edge-tts'
  const globalAudio = settings.apiConfig.global
  const audioConfig = {
    api_key: globalAudio.audioApiKey,
    api_base: globalAudio.audioApiBase,
    llm_model: globalAudio.audioApiModel,
  }
  const isDoubaoClone = audioProvider === 'voice_clone'
  const doubaoVoice = isDoubaoClone
    ? globalAudio.audioDoubaoCloneSpeakerId
    : globalAudio.audioDoubaoVoiceType
  const defaultVoice = audioProvider === 'openai-compatible'
    ? 'alloy'
    : audioProvider === 'doubao_tts' || isDoubaoClone
      ? doubaoVoice
      : ttsVoice

  return {
    app_settings: settings,
    fetch: {
      ...FETCH_NEUTRAL_CONFIG,
      ...resolveGlobalApiSettings(settings),
    },
    research: {
      ...resolveApiSettings(settings, 'organize'),
      temperature: 0.4,
    },
    topic_selection: {
      ...resolveApiSettings(settings, 'draft'),
      temperature: 0.3,
    },
    script: {
      ...resolveApiSettings(settings, 'draft'),
      preset_id: 'morning_news_brief',
      content_type: 'news_brief',
      editorial_voice: morningNewsProfile.editorialVoice,
      target_duration_minutes: morningNewsProfile.targetDurationMinutes,
      num_hosts: 1,
      recommended_news_item_count: morningNewsProfile.recommendedNewsItemCount,
      quick_news_recommended_count: morningNewsProfile.quickNewsRecommendedCount,
      deep_dive_recommended_count: morningNewsProfile.deepDiveRecommendedCount,
      quick_news_chars_min: morningNewsProfile.quickNewsChars.min,
      quick_news_chars_max: morningNewsProfile.quickNewsChars.max,
      deep_dive_chars_min: morningNewsProfile.deepDiveChars.min,
      deep_dive_chars_max: morningNewsProfile.deepDiveChars.max,
      episode_chars_min: morningNewsProfile.episodeChars.min,
      episode_chars_max: morningNewsProfile.episodeChars.max,
      tone: morningNewsProfile.tone,
      content_tendency: settings.creatorPreferences.contentTendency,
      content_guidance: morningNewsProfile.contentGuidance,
      language: 'zh-CN',
      require_approval: true,
      words_per_minute: morningNewsProfile.wordsPerMinute,
    },
    facts: {
      max_facts: 20,
      selected_topic_count: morningNewsProfile.recommendedNewsItemCount,
    },
    tts: {
      engine: audioProvider,
      api_key: audioProvider === 'openai-compatible' ? audioConfig.api_key : '',
      api_base: audioProvider === 'openai-compatible' ? audioConfig.api_base : '',
      model: audioProvider === 'openai-compatible' ? audioConfig.llm_model : 'tts-1',
      default_voice: defaultVoice,
      voice_mapping: {
        'Host A': defaultVoice,
      },
      output_format: 'mp3',
      rate: '+0%',
      volume: '+0%',
      doubao_app_id: isDoubaoClone ? globalAudio.audioDoubaoCloneAppId : globalAudio.audioDoubaoAppId,
      doubao_access_token: isDoubaoClone ? globalAudio.audioDoubaoCloneAccessToken : globalAudio.audioDoubaoAccessToken,
      doubao_cluster: isDoubaoClone ? globalAudio.audioDoubaoCloneCluster : globalAudio.audioDoubaoCluster,
      doubao_voice_type: doubaoVoice,
      doubao_endpoint: isDoubaoClone ? globalAudio.audioDoubaoCloneEndpoint : globalAudio.audioDoubaoEndpoint,
      doubao_resource_id: isDoubaoClone ? globalAudio.audioDoubaoCloneResourceId : globalAudio.audioDoubaoResourceId,
    },
    audio_postprocess: {
      output_dir: 'out/episodes',
      output_format: settings.capability.audio.quality,
    },
    review: {
      require_approval: false,
    },
    publish: {
      storage_type: 'local',
      local_base_dir: 'dist/episodes',
      rss_output_dir: 'out/rss',
      public_base_url: '',
      podcast_title: '通勤早咖啡',
      podcast_description: '单人新闻早报播客',
      podcast_author: 'PodFlow Studio',
      podcast_language: 'zh-CN',
    },
  }
}

// ============================================================
// Navigation Items
// ============================================================

const NAV_ITEMS: {
  key: SettingsSection
  icon: React.ReactNode
  label: string
  desc: string
  dividerBefore?: boolean
  disabled?: boolean
  badge?: string
}[] = [
  { key: 'creation', icon: <UserOutlined />, label: '创作设置', desc: '成稿、结构与声音' },
  { key: 'api-config', icon: <ApiOutlined />, label: '智能能力接口', desc: '密钥与节点级配置', dividerBefore: true },
  { key: 'logs', icon: <FileTextOutlined />, label: '执行日志', desc: '查看日志与错误', dividerBefore: true },
]

// ============================================================
// Option Card Component
// ============================================================

interface OptionCardProps {
  selected: boolean
  onClick: () => void
  title: string
  desc: string
  badge?: string
  disabled?: boolean
}

function OptionCard({ selected, onClick, title, desc, badge, disabled }: OptionCardProps) {
  return (
    <div
      onClick={disabled ? undefined : onClick}
      style={{
        flex: 1,
        minWidth: 140,
        padding: '16px 14px 14px',
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        {selected && (
          <span style={{
            width: 16,
            height: 16,
            borderRadius: '50%',
            background: 'var(--accent-primary)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}>
            <CheckOutlined style={{ fontSize: 9, color: '#fff' }} />
          </span>
        )}
        <div style={{
          fontSize: 13,
          fontWeight: 600,
          color: selected ? 'var(--accent-primary)' : 'var(--text-primary)',
          minWidth: 0,
        }}>
          {title}
        </div>
        {badge && (
          <span style={{
            marginLeft: 'auto',
            fontSize: 10,
            padding: '1px 6px',
            borderRadius: 4,
            background: selected ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
            color: selected ? '#fff' : 'var(--text-tertiary)',
            fontWeight: 500,
            whiteSpace: 'nowrap',
          }}>
            {badge}
          </span>
        )}
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-tertiary)', lineHeight: 1.4 }}>{desc}</div>
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
// Main Component
// ============================================================

export default function SettingsPage({ visible, workflow, onClose }: Props) {
  const [activeSection, setActiveSection] = useState<SettingsSection>('creation')
  const [settings, setSettings] = useState<AppSettings>(() => structuredClone(DEFAULT_SETTINGS))
  const [hasChanges, setHasChanges] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const committedSettingsRef = useRef<AppSettings>(structuredClone(DEFAULT_SETTINGS))

  // Reset state when opening
  useEffect(() => {
    if (!visible) return

    let cancelled = false

    const loadSettings = async () => {
      setSaveSuccess(false)
      setHasChanges(false)

      let loadedSettings: AppSettings
      try {
        const config = window.electronAPI?.loadNodeConfig
          ? await window.electronAPI.loadNodeConfig('app_settings')
          : null
        loadedSettings = mergeAppSettings((config as Partial<AppSettings> | null) || settingsRepository.load())
      } catch (error) {
        console.error('Failed to load app settings:', error)
        loadedSettings = mergeAppSettings(settingsRepository.load())
      }

      if (cancelled) return
      committedSettingsRef.current = structuredClone(loadedSettings)
      setSettings(loadedSettings)

      try {
        const detected = await detectLocalAgentStatuses()
        if (cancelled || !detected.length) return
        setSettings(prev => applyDetectedLocalAgentsToSettings(prev, detected))
      } catch (error) {
        console.warn('[SettingsPage] Local agent detection failed:', error)
      }
    }

    void loadSettings()

    return () => {
      cancelled = true
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
      settingsRepository.save(settings)
      committedSettingsRef.current = structuredClone(settings)

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
    Modal.confirm({
      title: '恢复默认设置？',
      content: '这会覆盖当前页面中所有未保存的设置。恢复后仍需点击“保存设置”才会写入本地配置。',
      okText: '恢复默认',
      cancelText: '取消',
      okButtonProps: { danger: true },
      centered: true,
      onOk: () => {
        setSettings(structuredClone(DEFAULT_SETTINGS))
        setHasChanges(true)
        setSaveSuccess(false)
        message.info({ content: '已恢复默认设置，点击保存以生效', duration: 2, style: { marginTop: 60 } })
      },
    })
  }, [])

  if (!visible) return null

  // ============================================================
  // Render: Creation Settings
  // ============================================================
  const renderCreationSettings = () => (
    <div>
      <SectionHeader
        icon={<UserOutlined />}
        title="创作设置"
        desc="设置早咖啡单人新闻播客的成稿表达、内容结构与声音输出"
      />

      <SubsectionBlock title="播报表达" desc="选择主持人在口播稿中的表达方式">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10 }}>
          {([
            {
              key: 'professional' as EditorialVoice,
              title: '专业播报',
              desc: '语气理性克制，突出来源、数字和结论边界。',
            },
            {
              key: 'human' as EditorialVoice,
              title: '自然人味',
              desc: '语气平静自然，保留轻微口头衔接和主持人反应。',
              badge: '推荐',
            },
          ]).map(option => (
            <OptionCard
              key={option.key}
              selected={settings.creatorPreferences.editorialVoice === option.key}
              onClick={() => updateSettings('creatorPreferences', current => ({
                ...current,
                editorialVoice: option.key,
              }))}
              title={option.title}
              desc={option.desc}
              badge={option.badge}
            />
          ))}
        </div>
      </SubsectionBlock>

      <SubsectionBlock title="内容侧重" desc="决定单期节目更偏向快速交代新闻，还是解释新闻影响">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10 }}>
          {([
            {
              key: 'news' as ContentTendency,
              title: '新闻解读',
              desc: '先交代最新变化，再补充必要背景和听众相关性。',
              badge: '推荐',
            },
            {
              key: 'analysis' as ContentTendency,
              title: '深度分析',
              desc: '增加因果和影响解释，推断仍与事实明确分开。',
            },
          ]).map(option => (
            <OptionCard
              key={option.key}
              selected={settings.creatorPreferences.contentTendency === option.key}
              onClick={() => updateSettings('creatorPreferences', current => ({
                ...current,
                contentTendency: option.key,
              }))}
              title={option.title}
              desc={option.desc}
              badge={option.badge}
            />
          ))}
        </div>
      </SubsectionBlock>

      <SubsectionBlock title="资料补全方式" desc="整理资料时固定使用这里保存的方式，整理页不再临时切换">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10 }}>
          {([
            {
              key: 'hybrid' as OrganizeCompletionMode,
              title: '智能补全',
              desc: '联网核验关键事实，同时用 AI 补充背景、机制和分析角度。',
              badge: '推荐',
            },
            {
              key: 'web_only' as OrganizeCompletionMode,
              title: '仅联网核验',
              desc: '只检索和筛选网页证据，不引入 AI 自身知识。',
            },
            {
              key: 'ai_knowledge' as OrganizeCompletionMode,
              title: '仅 AI 知识扩展',
              desc: '不进行联网搜索，生成的知识候选默认视为尚未核验。',
            },
          ]).map(option => (
            <OptionCard
              key={option.key}
              selected={settings.creatorPreferences.organizeCompletionMode === option.key}
              onClick={() => updateSettings('creatorPreferences', current => ({
                ...current,
                organizeCompletionMode: option.key,
              }))}
              title={option.title}
              desc={option.desc}
              badge={option.badge}
            />
          ))}
        </div>
      </SubsectionBlock>

      <SubsectionBlock title="节目时长" desc="直接决定推荐新闻数量、单条长度和节目结构">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10 }}>
          {([
            {
              key: 'short' as DurationPreference,
              title: '短早报',
              desc: `约 ${MORNING_NEWS_DURATION_PROFILES.short.targetDurationMinutes} 分钟，6 条快讯，全期 2000-2800 字`,
            },
            {
              key: 'medium' as DurationPreference,
              title: '标准早报',
              desc: `约 ${MORNING_NEWS_DURATION_PROFILES.medium.targetDurationMinutes} 分钟，9 条快讯和 1 条深度稿，全期 5200-6200 字`,
              badge: '推荐',
            },
          ]).map(option => (
            <OptionCard
              key={option.key}
              selected={settings.creatorPreferences.durationPreference === option.key}
              onClick={() => updateSettings('creatorPreferences', current => ({
                ...current,
                durationPreference: option.key,
              }))}
              title={option.title}
              desc={option.desc}
              badge={option.badge}
            />
          ))}
        </div>
      </SubsectionBlock>

      <SubsectionBlock title="声音输出" desc="设置默认声音与音频输出格式">
        {settings.apiConfig.global.audioProvider === 'edge-tts' ? (
          <div style={{ marginBottom: 16 }}>
            <div style={{ marginBottom: 10, color: 'var(--text-secondary)', fontSize: 12, fontWeight: 500 }}>
              Edge TTS 默认音色
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
              {VOICE_OPTIONS.map(voice => (
                <OptionCard
                  key={voice.id}
                  selected={settings.capability.audio.defaultVoice === voice.id}
                  onClick={() => updateSettings('capability', current => ({
                    ...current,
                    audio: { ...current.audio, defaultVoice: voice.id },
                  }))}
                  title={voice.label}
                  desc={voice.desc}
                />
              ))}
            </div>
          </div>
        ) : (
          <div style={{
            marginBottom: 16,
            padding: '10px 12px',
            borderRadius: 8,
            background: 'var(--bg-tertiary)',
            color: 'var(--text-secondary)',
            fontSize: 11,
            lineHeight: 1.6,
          }}>
            当前音色由“智能能力接口”中的语音服务配置决定。
          </div>
        )}

        <div style={{ marginBottom: 10, color: 'var(--text-secondary)', fontSize: 12, fontWeight: 500 }}>
          音频输出格式与用途
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
          {([
            { key: 'mp3' as AudioQuality, title: 'MP3', desc: '文件较小，适合日常试听与发布', badge: '推荐' },
            { key: 'wav' as AudioQuality, title: 'WAV', desc: '无损输出，适合后期处理' },
          ]).map(option => (
            <OptionCard
              key={option.key}
              selected={settings.capability.audio.quality === option.key}
              onClick={() => updateSettings('capability', current => ({
                ...current,
                audio: { ...current.audio, quality: option.key },
              }))}
              title={option.title}
              desc={option.desc}
              badge={option.badge}
            />
          ))}
        </div>
      </SubsectionBlock>
    </div>
  )

  const renderLogs = () => (
    <div>
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
      case 'creation': return renderCreationSettings()
      case 'api-config': return <SettingsAPIConfig settings={settings} updateSettings={updateSettings} />
      case 'logs': return renderLogs()
      default: return renderCreationSettings()
    }
  }

  // ============================================================
  // Main Render
  // ============================================================
  return (
    <div style={{
      position: 'fixed',
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
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
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Button
            title="恢复默认设置"
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
            <Button
              title="关闭设置"
              type="text"
              icon={<CloseOutlined />}
              onClick={onClose}
              style={{ color: 'var(--text-secondary)', width: 30, height: 30 }}
            />
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
            const disabled = Boolean(item.disabled)
            return (
              <div key={item.key}>
                {item.dividerBefore && (
                  <div style={{ height: 1, background: 'var(--border-color)', margin: '8px 12px' }} />
                )}
                <div
                  aria-disabled={disabled}
                  onClick={disabled ? undefined : () => setActiveSection(item.key)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '10px 12px',
                    borderRadius: 8,
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    background: active ? 'var(--accent-light)' : 'transparent',
                    opacity: disabled ? 0.48 : 1,
                    transition: 'all 0.15s ease',
                  }}
                  className={active || disabled ? '' : 'settings-nav-item'}
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
                  <div style={{ flex: 1, minWidth: 0 }}>
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
                  {item.badge && (
                    <span style={{
                      marginLeft: 'auto',
                      fontSize: 10,
                      fontWeight: 500,
                      color: 'var(--text-tertiary)',
                      background: 'var(--bg-tertiary)',
                      border: '1px solid var(--border-color)',
                      borderRadius: 6,
                      padding: '1px 6px',
                      whiteSpace: 'nowrap',
                    }}>
                      {item.badge}
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* Right Content */}
        <div style={{
          flex: 1,
          overflow: 'auto',
          scrollbarGutter: 'stable',
          padding: '28px 36px 60px 36px',
          background: 'var(--bg-primary)',
        }}>
          <div style={{ maxWidth: 960, width: '100%', margin: '0 auto' }}>
            <div
              key={activeSection}
              style={{
                width: '100%',
                animation: 'settingsContentIn 0.3s ease',
              }}
            >
              {renderContent()}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
