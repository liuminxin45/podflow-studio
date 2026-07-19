import { useState, useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react'
import { AutoComplete, Button, Input, message } from 'antd'
import {
  CheckOutlined,
  CloseCircleOutlined,
  LoadingOutlined,
  RightOutlined,
  LinkOutlined,
  SearchOutlined,
  FileTextOutlined,
  BulbOutlined,
  SoundOutlined,
  LockOutlined,
  EyeInvisibleOutlined,
  EyeOutlined,
  ThunderboltOutlined,
  RobotOutlined,
  CodeOutlined,
  CloudUploadOutlined,
} from '../icons/antdCompat'
import type {
  AppSettings,
  APIConnectionStatus,
  GlobalAPIConfig,
  StageId,
  NodeOverrideStageId,
  NodeCapabilityType,
  NodeOverrideMode,
  AudioProvider,
  AITargetKind,
  APIKeyStorageMode,
  LocalAgentConfig,
  AIModelProviderConfig,
  WebSearchProvider,
  WebSearchProviderConfig,
} from '../types/settings'
import { fetchModels } from '../utils/modelFetcher'
import { mergeDetectedLocalAgents } from '../services/settings/localAgentDetection'
import { verifyDefaultAISearchCapability } from '../services/organizeResearch'

const SEARCH_API_BASES = {
  tavily: 'https://api.tavily.com',
  bocha: 'https://api.bochaai.com',
} as const

const AGENT_ICON_SOURCES: Record<LocalAgentConfig['id'], string> = {
  claude_code: new URL('../assets/ai-agent-icons/claude-code.svg', import.meta.url).href,
  codex: new URL('../assets/ai-agent-icons/codex.svg', import.meta.url).href,
  opencode: new URL('../assets/ai-agent-icons/opencode.svg', import.meta.url).href,
  pi: new URL('../assets/ai-agent-icons/pi.svg', import.meta.url).href,
  gemini_cli: new URL('../assets/ai-agent-icons/gemini.svg', import.meta.url).href,
  kiro: new URL('../assets/ai-agent-icons/kiro.svg', import.meta.url).href,
  hermes: new URL('../assets/ai-agent-icons/hermes.svg', import.meta.url).href,
}

// ============================================================
// Props
// ============================================================

interface Props {
  settings: AppSettings
  updateSettings: <K extends keyof AppSettings>(
    module: K,
    updater: (prev: AppSettings[K]) => AppSettings[K]
  ) => void
}

// ============================================================
// Constants
// ============================================================

const CAPABILITY_LABELS: Record<NodeCapabilityType, { label: string; icon: React.ReactNode; color: string }> = {
  search: { label: '信息获取', icon: <SearchOutlined />, color: '#10b981' },
  text: { label: '文本理解', icon: <FileTextOutlined />, color: '#2563eb' },
  reasoning: { label: '深度推理', icon: <BulbOutlined />, color: '#8b5cf6' },
  audio: { label: '语音生成', icon: <SoundOutlined />, color: '#ef4444' },
}

const STAGE_META: Record<StageId, { label: string; icon: ReactNode; desc: string; defaultCap: NodeCapabilityType }> = {
  discover: { label: '发现层', icon: <SearchOutlined />, desc: '搜索与信息获取', defaultCap: 'search' },
  organize: { label: '整理层', icon: <FileTextOutlined />, desc: '素材整理与分类', defaultCap: 'text' },
  draft: { label: '成稿层', icon: <BulbOutlined />, desc: '事实卡片、结构确认与口播稿', defaultCap: 'text' },
  produce: { label: '声音制作层', icon: <SoundOutlined />, desc: '智能语音生成', defaultCap: 'audio' },
}

const TARGET_KIND_OPTIONS: Array<{
  key: AITargetKind
  label: string
  desc: string
  icon: React.ReactNode
}> = [
  { key: 'local_agent', label: '本地代理', desc: '调用已安装的 CLI 代理', icon: <CodeOutlined /> },
  { key: 'local_model', label: '本地模型', desc: 'Ollama 或 LM Studio', icon: <RobotOutlined /> },
  { key: 'api_model', label: 'API 模型', desc: '云端或兼容接口', icon: <CloudUploadOutlined /> },
]

const PROVIDER_KIND_COPY: Record<AIModelProviderConfig['kind'], {
  label: string
  badge: string
  desc: string
  mark: string
  accent: string
}> = {
  ollama: {
    label: 'Ollama',
    badge: '本地模型',
    desc: '默认监听 localhost:11434/v1',
    mark: 'Ol',
    accent: '#111827',
  },
  lm_studio: {
    label: 'LM Studio',
    badge: '本地模型',
    desc: '默认监听 127.0.0.1:1234/v1',
    mark: 'LM',
    accent: '#2563eb',
  },
  openai: {
    label: 'OpenAI',
    badge: 'API 模型',
    desc: 'OpenAI 官方接口',
    mark: 'AI',
    accent: '#111827',
  },
  anthropic: {
    label: 'Anthropic',
    badge: 'API 模型',
    desc: 'Claude 官方接口',
    mark: 'A',
    accent: '#d97706',
  },
  gemini: {
    label: 'Gemini',
    badge: 'API 模型',
    desc: 'Google Gemini 兼容接口',
    mark: 'G',
    accent: '#2563eb',
  },
  openrouter: {
    label: 'OpenRouter',
    badge: 'API 模型',
    desc: '多模型聚合接口',
    mark: 'OR',
    accent: '#7c3aed',
  },
  openai_compatible: {
    label: 'OpenAI 兼容',
    badge: 'API 模型',
    desc: '适配自建或第三方兼容接口',
    mark: 'OC',
    accent: '#0f766e',
  },
}

const API_KEY_STORAGE_OPTIONS: Array<{ key: APIKeyStorageMode; label: string; desc: string }> = [
  { key: 'local', label: '本地保存', desc: '保存到本机设置' },
  { key: 'env', label: '环境变量', desc: '运行时读取变量' },
  { key: 'none', label: '无密钥', desc: '兼容无需鉴权的服务' },
]

const AUDIO_PROVIDER_OPTIONS: Array<{
  key: AudioProvider
  label: string
  desc: string
}> = [
  { key: 'edge-tts', label: 'Edge TTS', desc: '无需密钥，联网即可使用' },
  { key: 'openai-compatible', label: 'OpenAI 兼容', desc: '调用 /audio/speech' },
  { key: 'doubao_tts', label: '豆包语音生成', desc: '使用豆包预置音色' },
  { key: 'voice_clone', label: '豆包语音克隆', desc: '使用已复刻的 Speaker ID' },
]

interface DoubaoVoiceOption {
  id: string
  name: string
  description: string
  status: string
  resourceId: string
  previewUrl: string
}

function getLocalCapabilityCopy(capKey: 'search' | 'audio', audioProvider: AudioProvider): {
  title: string
  desc: string
  badge: string
} {
  if (capKey === 'search') {
    return {
      title: '使用内置信息抓取源',
      desc: '发现层实际使用内置抓取源。抓取源配置在发现页维护，不需要在这里填写 OpenAI API Base。',
      badge: '内置可用',
    }
  }
  if (audioProvider === 'edge-tts') {
    return {
      title: '使用本地 Edge TTS',
      desc: '默认音频生成走 edge-tts，不需要 API Key、API Base 或模型。切换到 OpenAI 兼容语音后才需要远程接口配置。',
      badge: '本地可用',
    }
  }
  if (audioProvider === 'doubao_tts') {
    return {
      title: '使用豆包语音生成',
      desc: 'App ID、Access Token、预置音色和资源信息统一在上方“语音生成”区域维护。',
      badge: '全局配置',
    }
  }
  if (audioProvider === 'voice_clone') {
    return {
      title: '使用豆包语音克隆',
      desc: '复刻音色的 App ID、Access Token、Speaker ID 和资源信息统一在上方“语音生成”区域维护。',
      badge: '全局配置',
    }
  }
  return {
    title: '使用 OpenAI 兼容语音接口',
    desc: '该模式会调用 /audio/speech 生成音频，并使用 /models 做连接测试。',
    badge: '需配置',
  }
}

// ============================================================
// Connection Status Badge
// ============================================================

function StatusBadge({ status }: { status: APIConnectionStatus }) {
  const configs: Record<APIConnectionStatus, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
    untested: { label: '未测试', color: 'var(--text-tertiary)', bg: 'var(--bg-tertiary)', icon: null },
    testing: { label: '检测中...', color: 'var(--accent-primary)', bg: 'var(--accent-light)', icon: <LoadingOutlined spin /> },
    connected: { label: '已连接', color: 'var(--success-color)', bg: 'var(--success-bg)', icon: <CheckOutlined /> },
    failed: { label: '连接失败', color: 'var(--error-color)', bg: 'var(--error-bg)', icon: <CloseCircleOutlined /> },
  }
  const c = configs[status]
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      flexShrink: 0,
      gap: 4,
      fontSize: 11,
      fontWeight: 500,
      color: c.color,
      background: c.bg,
      padding: '2px 8px',
      borderRadius: 6,
      whiteSpace: 'nowrap',
    }}>
      {c.icon}
      {c.label}
    </span>
  )
}

// ============================================================
// API Key Input with masking
// ============================================================

function APIKeyInput({ value, onSave, onClear, status }: {
  value: string
  onSave: (key: string) => Promise<void> | void
  onClear: () => Promise<void> | void
  status: APIConnectionStatus
}) {
  const [editing, setEditing] = useState(false)
  const [inputVal, setInputVal] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (inputVal.trim() && !saving) {
      setSaving(true)
      try {
        await onSave(inputVal.trim())
      } catch {
        return
      } finally {
        setSaving(false)
      }
      setEditing(false)
      setInputVal('')
      setShowKey(false)
    }
  }

  if (!editing && !value) {
    return (
      <div
        onClick={() => setEditing(true)}
        style={{
          height: 32,
          padding: '0 12px',
          borderRadius: 8,
          border: '1.5px dashed var(--border-color)',
          background: 'var(--bg-tertiary)',
          cursor: 'pointer',
          fontSize: 12,
          color: 'var(--text-tertiary)',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          boxSizing: 'border-box',
          transition: 'all 0.2s ease',
        }}
        className="settings-option-card"
      >
        <LockOutlined />
        点击配置接入密钥
      </div>
    )
  }

  if (!editing && value) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        height: 32,
        minWidth: 0,
        padding: '0 8px 0 12px',
        borderRadius: 8,
        border: '1px solid var(--border-color)',
        background: 'var(--bg-secondary)',
        fontSize: 12,
        boxSizing: 'border-box',
      }}>
        <LockOutlined style={{ color: 'var(--success-color)', fontSize: 11 }} />
        <span style={{
          flex: 1,
          minWidth: 0,
          overflow: 'hidden',
          color: 'var(--text-secondary)',
          fontFamily: 'monospace',
          letterSpacing: 1,
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {value}
        </span>
        <StatusBadge status={status} />
        <Button
          size="small"
          type="text"
          onClick={() => { setEditing(true); setInputVal('') }}
          style={{ flexShrink: 0, fontSize: 11, color: 'var(--text-tertiary)', height: 24, whiteSpace: 'nowrap' }}
        >
          更换
        </Button>
        <Button
          size="small"
          type="text"
          danger
          onClick={() => { void onClear() }}
          style={{ flexShrink: 0, fontSize: 11, height: 24, whiteSpace: 'nowrap' }}
        >
          清除
        </Button>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <Input
        type={showKey ? 'text' : 'password'}
        value={inputVal}
        onChange={e => setInputVal(e.target.value)}
        placeholder="粘贴你的接入密钥"
        onPressEnter={() => { void handleSave() }}
        style={{
          flex: 1,
          borderRadius: 8,
          fontSize: 12,
          fontFamily: 'monospace',
        }}
        suffix={
            <span
              title={showKey ? '隐藏' : '显示'}
              onClick={() => setShowKey(!showKey)}
              style={{ cursor: 'pointer', color: 'var(--text-tertiary)' }}
            >
              {showKey ? <EyeOutlined /> : <EyeInvisibleOutlined />}
            </span>
        }
      />
      <Button
        size="small"
        type="primary"
        onClick={() => { void handleSave() }}
        disabled={!inputVal.trim() || saving}
        loading={saving}
        style={{ height: 32, fontSize: 12 }}
      >
        保存
      </Button>
      <Button
        size="small"
        onClick={() => { setEditing(false); setInputVal(''); setShowKey(false) }}
        style={{ height: 32, fontSize: 12 }}
      >
        取消
      </Button>
    </div>
  )
}

function maskApiKey(key: string): string {
  const trimmed = key.trim()
  if (!trimmed) return ''
  if (trimmed.length <= 8) return `${trimmed.slice(0, 2)}····`
  return `${trimmed.slice(0, 4)}····${trimmed.slice(-4)}`
}

function providerRuntimeApiKey(provider: AIModelProviderConfig): string {
  if (provider.targetKind === 'local_model') return 'local-model'
  if (provider.apiKeyStorage === 'none') return 'no-key'
  if (provider.apiKeyStorage === 'env') return provider.apiKey || ''
  return provider.apiKey
}

function providerRuntimeApiKeyEnvVar(provider: AIModelProviderConfig): string {
  return provider.apiKeyStorage === 'env' ? provider.apiKeyEnvVar || '' : ''
}

function targetLabel(target: string, agents: LocalAgentConfig[], providers: AIModelProviderConfig[]): string {
  if (target.startsWith('agent:')) {
    const agent = agents.find(item => item.id === target.replace(/^agent:/, ''))
    return agent ? `本地代理：${agent.name}` : '本地代理'
  }
  if (target.startsWith('model:')) {
    const provider = providers.find(item => item.id === target.replace(/^model:/, ''))
    if (!provider) return '模型目标'
    return `${PROVIDER_KIND_COPY[provider.kind].badge}：${provider.name}`
  }
  return '未选择'
}

function targetKindFromTarget(target: string, providers: AIModelProviderConfig[]): AITargetKind {
  if (target.startsWith('agent:')) return 'local_agent'
  if (target.startsWith('model:')) {
    const provider = providers.find(item => item.id === target.replace(/^model:/, ''))
    return provider?.targetKind || 'api_model'
  }
  return 'api_model'
}

function isProviderConfigured(provider: AIModelProviderConfig): boolean {
  if (!provider.apiBase || !provider.model) return false
  if (provider.targetKind === 'local_model') return provider.connectionStatus === 'connected'
  if (provider.apiKeyStorage === 'none') return true
  if (provider.apiKeyStorage === 'env') return Boolean(provider.apiKeySet || provider.connectionStatus === 'connected')
  return Boolean(provider.apiKey || provider.apiKeySet)
}

function providerKeyReady(provider: AIModelProviderConfig): boolean {
  if (provider.targetKind === 'local_model') return true
  if (provider.apiKeyStorage === 'none') return true
  if (provider.apiKeyStorage === 'env') return Boolean(providerRuntimeApiKey(provider) || providerRuntimeApiKeyEnvVar(provider))
  return Boolean(provider.apiKey)
}

function providerStatus(provider: AIModelProviderConfig): APIConnectionStatus {
  if (provider.targetKind === 'local_model' && provider.connectionStatus === 'untested') {
    return provider.apiBase ? 'untested' : 'failed'
  }
  return provider.connectionStatus
}

// ============================================================
// Node Override Row (expandable card)
// ============================================================

function NodeOverrideCard({ stageId, settings, updateSettings }: {
  stageId: NodeOverrideStageId
  settings: AppSettings
  updateSettings: Props['updateSettings']
}) {
  const [expanded, setExpanded] = useState(false)
  const meta = STAGE_META[stageId]
  const nodeConfig = settings.apiConfig.nodeOverrides[stageId]
  const capLabel = CAPABILITY_LABELS[nodeConfig.capabilityType]
  const modelKey = `node-${stageId}`
  const audioProvider = settings.apiConfig.global.audioProvider
  const remoteEnabled = nodeConfig.capabilityType !== 'search' &&
    (nodeConfig.capabilityType !== 'audio' || audioProvider === 'openai-compatible')
  const localCopy = remoteEnabled
    ? null
    : getLocalCapabilityCopy(nodeConfig.capabilityType === 'audio' ? 'audio' : 'search', audioProvider)
  const [modelOptions, setModelOptions] = useState<Record<string, string[]>>({})
  const [modelLoading, setModelLoading] = useState<Record<string, boolean>>({})

  const resolveEffectiveConnection = useCallback(() => {
    const global = settings.apiConfig.global
    const target = global.defaultAITarget || ''
    const agent = target.startsWith('agent:')
      ? global.localAgents.find(item => target === `agent:${item.id}`)
      : undefined
    const provider = target.startsWith('model:')
      ? global.aiModelProviders.find(item => target === `model:${item.id}`)
      : undefined
    const hasCustomEndpoint = Boolean(nodeConfig.apiBase || nodeConfig.apiKey)

    if (agent && !hasCustomEndpoint) {
      return { kind: 'local_agent' as const, available: agent.available, label: agent.name }
    }

    return {
      kind: hasCustomEndpoint ? 'openai_compatible' as const : provider?.kind || 'openai_compatible' as const,
      apiBase: nodeConfig.apiBase || provider?.apiBase || (hasCustomEndpoint ? 'https://api.openai.com/v1' : ''),
      apiKey: nodeConfig.apiKey || (provider ? providerRuntimeApiKey(provider) : ''),
      apiKeyEnvVar: nodeConfig.apiKey ? '' : provider ? providerRuntimeApiKeyEnvVar(provider) : '',
      model: nodeConfig.apiModel || provider?.model || (hasCustomEndpoint ? 'gpt-4o-mini' : ''),
    }
  }, [nodeConfig.apiBase, nodeConfig.apiKey, nodeConfig.apiModel, settings.apiConfig.global])

  const handleToggleMode = (mode: NodeOverrideMode) => {
    updateSettings('apiConfig', c => ({
      ...c,
      nodeOverrides: {
        ...c.nodeOverrides,
        [stageId]: { ...c.nodeOverrides[stageId], overrideMode: mode },
      },
    }))
  }

  const handleTest = useCallback(async () => {
    updateSettings('apiConfig', c => ({
      ...c,
      nodeOverrides: {
        ...c.nodeOverrides,
        [stageId]: { ...c.nodeOverrides[stageId], connectionStatus: 'testing' as const },
      },
    }))
    let success = false
    try {
      const effective = resolveEffectiveConnection()
      if (effective.kind === 'local_agent') {
        if (!effective.available) throw new Error(`${effective.label} 未安装或不可用`)
        success = true
      } else {
        if (!effective.apiBase || (!effective.apiKey && !effective.apiKeyEnvVar)) {
          throw new Error('请先配置可用的默认 AI，或补充节点 API Base 与密钥')
        }
        await fetchModels(effective.apiBase, effective.apiKey, effective.kind, effective.apiKeyEnvVar)
        success = true
      }
    } catch {
      success = false
    }
    updateSettings('apiConfig', c => ({
      ...c,
      nodeOverrides: {
        ...c.nodeOverrides,
        [stageId]: {
          ...c.nodeOverrides[stageId],
          connectionStatus: success ? 'connected' as const : 'failed' as const,
        },
      },
    }))
    if (success) {
      message.success({ content: `${meta.label}能力连接成功`, duration: 2, style: { marginTop: 60 } })
    } else {
      message.error({ content: `${meta.label}连接失败，请检查 API Base 与密钥`, duration: 3, style: { marginTop: 60 } })
    }
  }, [stageId, meta.label, resolveEffectiveConnection, updateSettings])

  const handleFetchModels = useCallback(async () => {
    const effective = resolveEffectiveConnection()
    if (effective.kind === 'local_agent') {
      message.info('本地代理不提供模型列表，请直接使用当前代理')
      return
    }
    if (!effective.apiBase || (!effective.apiKey && !effective.apiKeyEnvVar)) {
      message.warning('请先配置可用的默认 AI，或补充节点 API Base 与密钥')
      return
    }
    setModelLoading(prev => ({ ...prev, [modelKey]: true }))
    try {
      const models = await fetchModels(effective.apiBase, effective.apiKey, effective.kind, effective.apiKeyEnvVar)
      setModelOptions(prev => ({ ...prev, [modelKey]: models }))
      message.success(`已获取 ${models.length} 个模型`)
    } catch (error: any) {
      message.error(`获取模型失败：${error?.message || '未知错误'}`)
    } finally {
      setModelLoading(prev => ({ ...prev, [modelKey]: false }))
    }
  }, [modelKey, resolveEffectiveConnection])

  return (
    <div style={{
      border: '1px solid var(--border-color)',
      borderRadius: 12,
      background: 'var(--bg-secondary)',
      marginBottom: 10,
      overflow: 'hidden',
      transition: 'box-shadow 0.2s ease',
    }}
    className="settings-subsection"
    >
      {/* Header row */}
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '14px 16px',
          cursor: 'pointer',
          transition: 'background 0.15s ease',
        }}
        className="settings-node-row"
      >
        <span style={{
          width: 24,
          height: 24,
          borderRadius: 6,
          background: 'var(--bg-tertiary)',
          color: 'var(--text-secondary)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          fontSize: 13,
        }}>
          {meta.icon}
        </span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{meta.label}</div>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 1 }}>{meta.desc}</div>
        </div>

        {/* Capability tag */}
        <span style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          fontSize: 11,
          fontWeight: 500,
          color: capLabel.color,
          background: `${capLabel.color}10`,
          padding: '3px 10px',
          borderRadius: 6,
        }}>
          {capLabel.icon}
          {capLabel.label}
        </span>

        {/* Override mode indicator */}
        <span style={{
          fontSize: 11,
          color: nodeConfig.overrideMode === 'custom' ? 'var(--accent-primary)' : 'var(--text-tertiary)',
          fontWeight: 500,
        }}>
          {nodeConfig.overrideMode === 'custom' ? '自定义' : '跟随全局'}
        </span>

        <RightOutlined style={{
          fontSize: 10,
          color: 'var(--text-tertiary)',
          transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
          transition: 'transform 0.2s ease',
        }} />
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div style={{
          padding: '0 16px 16px',
          borderTop: '1px solid var(--border-light)',
          animation: 'settingsFadeIn 0.2s ease',
        }}>
          {/* Mode toggle */}
          <div style={{ display: 'flex', gap: 8, margin: '14px 0' }}>
            {([
              { key: 'global' as NodeOverrideMode, label: '跟随全局配置', desc: '使用全局默认的能力设置' },
              { key: 'custom' as NodeOverrideMode, label: '自定义配置', desc: '为此节点单独设置能力来源' },
            ]).map(opt => (
              <div
                key={opt.key}
                onClick={() => handleToggleMode(opt.key)}
                style={{
                  flex: 1,
                  padding: '12px 14px',
                  borderRadius: 10,
                  border: `1.5px solid ${nodeConfig.overrideMode === opt.key ? 'var(--accent-primary)' : 'var(--border-color)'}`,
                  background: nodeConfig.overrideMode === opt.key ? 'var(--accent-light)' : 'var(--bg-secondary)',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
                className="settings-option-card"
              >
                <div style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: nodeConfig.overrideMode === opt.key ? 'var(--accent-primary)' : 'var(--text-primary)',
                  marginBottom: 2,
                }}>
                  {opt.label}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{opt.desc}</div>
              </div>
            ))}
          </div>

          {nodeConfig.overrideMode === 'custom' && (
            <div style={{ animation: 'settingsFadeIn 0.25s ease' }}>
              {localCopy && (
                <div style={{
                  marginBottom: 14,
                  padding: '10px 12px',
                  borderRadius: 8,
                  background: 'var(--success-bg)',
                  border: '1px solid rgba(16,185,129,0.25)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <CheckOutlined style={{ color: 'var(--success-color)' }} />
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
                      {localCopy.title}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                    {localCopy.desc}
                  </div>
                </div>
              )}

              {remoteEnabled && (
                <>
                  {/* API Key for this node */}
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 8 }}>
                      接入密钥（可选，留空则继承默认 AI）
                    </div>
                    <APIKeyInput
                      value={nodeConfig.apiKeyMasked}
                      status={nodeConfig.connectionStatus}
                      onClear={() => updateSettings('apiConfig', c => ({
                        ...c,
                        nodeOverrides: {
                          ...c.nodeOverrides,
                          [stageId]: { ...c.nodeOverrides[stageId], apiKey: '', apiKeySet: false, apiKeyMasked: '', connectionStatus: 'untested' },
                        },
                      }))}
                      onSave={(key) => {
                        const masked = key.slice(0, 4) + '····' + key.slice(-4)
                        updateSettings('apiConfig', c => ({
                          ...c,
                          nodeOverrides: {
                            ...c.nodeOverrides,
                            [stageId]: {
                              ...c.nodeOverrides[stageId],
                              apiKey: key,
                              apiKeySet: true,
                              apiKeyMasked: masked,
                              connectionStatus: 'untested',
                            },
                          },
                        }))
                      }}
                    />
                  </div>

                  {/* API Base */}
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6 }}>
                      API Base URL
                    </div>
                    <Input
                      value={nodeConfig.apiBase}
                      onChange={e => updateSettings('apiConfig', c => ({
                        ...c,
                        nodeOverrides: {
                          ...c.nodeOverrides,
                          [stageId]: {
                            ...c.nodeOverrides[stageId],
                            apiBase: e.target.value,
                            connectionStatus: 'untested',
                          },
                        },
                      }))}
                      placeholder="https://api.openai.com/v1"
                      style={{ borderRadius: 8, fontSize: 12 }}
                    />
                  </div>

                  {/* Model */}
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6 }}>
                      Model
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <AutoComplete
                        value={nodeConfig.apiModel}
                        options={(modelOptions[modelKey] || []).map(model => ({ value: model, label: model }))}
                        onChange={(val) => updateSettings('apiConfig', c => ({
                          ...c,
                          nodeOverrides: {
                            ...c.nodeOverrides,
                            [stageId]: {
                              ...c.nodeOverrides[stageId],
                              apiModel: val,
                              connectionStatus: 'untested',
                            },
                          },
                        }))}
                        placeholder="输入或自动获取模型"
                        style={{ flex: 1 }}
                        filterOption={(inputValue, option) =>
                          option?.value.toLowerCase().includes(inputValue.toLowerCase()) || false
                        }
                      />
                      <Button
                        size="small"
                        icon={<SearchOutlined />}
                        loading={modelLoading[modelKey]}
                        onClick={handleFetchModels}
                        style={{ height: 32, borderRadius: 8, fontSize: 12 }}
                      >
                        自动获取
                      </Button>
                    </div>
                  </div>
                </>
              )}

              <Button
                size="small"
                icon={<LinkOutlined />}
                loading={nodeConfig.connectionStatus === 'testing'}
                onClick={handleTest}
                style={{
                  fontSize: 12,
                  height: 30,
                  borderRadius: 6,
                }}
              >
                {remoteEnabled ? '测试连接' : '检查状态'}
              </Button>

              {nodeConfig.connectionStatus === 'failed' && (
                <div style={{
                  marginTop: 10,
                  padding: '8px 12px',
                  background: 'var(--error-bg)',
                  borderRadius: 8,
                  fontSize: 11,
                  color: 'var(--error-color)',
                  lineHeight: 1.5,
                }}>
                  连接未成功，请检查密钥是否正确，或稍后重试。
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ProviderConfigFields({
  provider,
  modelLoading,
  updateProvider,
  handleFetchProviderModels,
  handleTestProvider,
  showTestAction = true,
}: {
  provider: AIModelProviderConfig
  modelLoading?: boolean
  updateProvider: (providerId: string, patch: Partial<AIModelProviderConfig>) => void
  handleFetchProviderModels: (provider: AIModelProviderConfig) => void
  handleTestProvider: (provider: AIModelProviderConfig) => void
  showTestAction?: boolean
}) {
  const copy = PROVIDER_KIND_COPY[provider.kind]
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.1fr) minmax(0, 0.9fr)', gap: 10 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 650, color: 'var(--text-secondary)', marginBottom: 6 }}>
            API Base URL
          </div>
          <Input
            value={provider.apiBase}
            onChange={event => updateProvider(provider.id, {
              apiBase: event.target.value,
              connectionStatus: 'untested',
            })}
            placeholder={provider.targetKind === 'local_model' ? 'http://localhost:11434/v1' : 'https://api.openai.com/v1'}
            style={{ borderRadius: 8, fontSize: 12 }}
          />
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 650, color: 'var(--text-secondary)', marginBottom: 6 }}>
            Model
          </div>
          <div data-testid="provider-model-row" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <AutoComplete
              value={provider.model}
              options={(provider.modelOptions || []).map(model => ({ value: model, label: model }))}
              onChange={value => updateProvider(provider.id, {
                model: value,
                connectionStatus: 'untested',
              })}
              placeholder="模型名称"
              style={{ flex: 1, minWidth: 0 }}
              filterOption={(inputValue, option) =>
                option?.value.toLowerCase().includes(inputValue.toLowerCase()) || false
              }
            />
            <Button
              size="small"
              icon={<SearchOutlined />}
              loading={modelLoading}
              onClick={() => handleFetchProviderModels(provider)}
              style={{ height: 32, flexShrink: 0, borderRadius: 7, fontSize: 11 }}
            >
              获取模型
            </Button>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 10 }}>
        {showTestAction ? (
          <Button
            size="small"
            icon={<LinkOutlined />}
            loading={provider.connectionStatus === 'testing'}
            onClick={() => handleTestProvider(provider)}
            style={{ height: 28, borderRadius: 7, fontSize: 11 }}
          >
            测试连接
          </Button>
        ) : <span />}
        <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-tertiary)' }}>
          {copy.label}
        </span>
      </div>

      {provider.connectionStatus === 'failed' && (
        <div style={{
          marginTop: 10,
          padding: '8px 10px',
          borderRadius: 8,
          background: 'var(--error-bg)',
          color: 'var(--error-color)',
          fontSize: 11,
          lineHeight: 1.5,
        }}>
          连接未成功，请检查地址、模型名称和密钥策略。
        </div>
      )}
    </div>
  )
}

function audioProviderConfigured(global: GlobalAPIConfig): boolean {
  if (global.audioProvider === 'edge-tts') return true
  if (global.audioProvider === 'openai-compatible') {
    return Boolean(global.audioApiBase.trim() && global.audioApiKey.trim() && global.audioApiModel.trim())
  }
  if (global.audioProvider === 'doubao_tts') {
    return Boolean(
      global.audioDoubaoAppId.trim()
      && global.audioDoubaoAccessToken.trim()
      && global.audioDoubaoCluster.trim()
      && global.audioDoubaoVoiceType.trim()
      && global.audioDoubaoEndpoint.trim()
      && global.audioDoubaoResourceId.trim()
    )
  }
  return Boolean(
    global.audioDoubaoCloneAppId.trim()
    && global.audioDoubaoCloneAccessToken.trim()
    && global.audioDoubaoCloneCluster.trim()
    && global.audioDoubaoCloneSpeakerId.trim()
    && global.audioDoubaoCloneEndpoint.trim()
    && global.audioDoubaoCloneResourceId.trim()
  )
}

function AudioProviderSettings({
  global,
  updateGlobal,
}: {
  global: GlobalAPIConfig
  updateGlobal: (patch: Partial<GlobalAPIConfig>) => void
}) {
  const configured = audioProviderConfigured(global)
  const fieldLabelStyle = {
    display: 'block',
    marginBottom: 6,
    color: 'var(--text-secondary)',
    fontSize: 11,
    fontWeight: 650,
  } as const
  const inputStyle = { borderRadius: 8, fontSize: 12 }
  const resetStatus = { audioConnectionStatus: 'untested' as APIConnectionStatus }
  const [voiceOptions, setVoiceOptions] = useState<Record<'preset' | 'clone', DoubaoVoiceOption[]>>({
    preset: [],
    clone: [],
  })
  const [voiceLoading, setVoiceLoading] = useState<'preset' | 'clone' | ''>('')
  const [voiceError, setVoiceError] = useState('')

  const loadDoubaoVoices = async (kind: 'preset' | 'clone') => {
    setVoiceError('')
    setVoiceLoading(kind)
    try {
      if (!window.electronAPI?.listDoubaoVoices) {
        throw new Error('当前运行环境未连接豆包音色查询服务')
      }
      const voices = await window.electronAPI.listDoubaoVoices({
        kind,
        appId: kind === 'clone' ? global.audioDoubaoCloneAppId : undefined,
        accessKey: global.audioDoubaoOpenAccessKey,
        secretKey: global.audioDoubaoOpenSecretKey,
      })
      setVoiceOptions(current => ({ ...current, [kind]: voices }))
      message.success({
        content: voices.length ? `已获取 ${voices.length} 个豆包音色` : '接口返回的音色列表为空',
        duration: 2,
        style: { marginTop: 60 },
      })
    } catch (error: any) {
      const detail = error?.message || '获取豆包音色失败'
      setVoiceError(detail)
      message.error({ content: detail, duration: 3, style: { marginTop: 60 } })
    } finally {
      setVoiceLoading('')
    }
  }

  const presetOptions = voiceOptions.preset.map(voice => ({
    value: voice.id,
    label: `${voice.name} (${voice.id})`,
  }))
  const cloneOptions = voiceOptions.clone.map(voice => ({
    value: voice.id,
    label: `${voice.name} (${voice.status || 'Unknown'})`,
    disabled: !['Success', 'Active', 'available'].includes(voice.status),
  }))

  return (
    <div className="settings-subsection" style={{
      background: 'var(--bg-secondary)',
      border: '1px solid var(--border-color)',
      borderRadius: 12,
      padding: '18px 20px',
      marginBottom: 20,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-primary)', fontSize: 14, fontWeight: 650 }}>
            <SoundOutlined style={{ color: 'var(--accent-primary)' }} /> 语音生成
          </div>
        </div>
        <span style={{
          flexShrink: 0,
          padding: '4px 9px',
          borderRadius: 7,
          background: configured ? 'var(--success-bg)' : 'var(--error-bg)',
          color: configured ? 'var(--success-color)' : 'var(--error-color)',
          fontSize: 11,
          fontWeight: 650,
        }}>
          {global.audioProvider === 'edge-tts' ? '无需配置' : configured ? '配置完整' : '待配置'}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8, marginBottom: 14 }}>
        {AUDIO_PROVIDER_OPTIONS.map(option => {
          const selected = global.audioProvider === option.key
          return (
            <button
              key={option.key}
              type="button"
              className="settings-option-card"
              aria-pressed={selected}
              onClick={() => updateGlobal({ audioProvider: option.key, ...resetStatus })}
              style={{
                border: `1.5px solid ${selected ? 'var(--text-primary)' : 'var(--border-color)'}`,
                borderRadius: 8,
                background: selected ? 'var(--bg-primary)' : 'var(--bg-secondary)',
                color: 'var(--text-primary)',
                padding: '12px 13px',
                textAlign: 'left',
                cursor: 'pointer',
                minHeight: 68,
              }}
            >
              <strong style={{ display: 'block', fontSize: 12 }}>{option.label}</strong>
              <span style={{ display: 'block', marginTop: 4, color: 'var(--text-tertiary)', fontSize: 10, lineHeight: 1.45 }}>
                {option.desc}
              </span>
            </button>
          )
        })}
      </div>

      {(global.audioProvider === 'doubao_tts' || global.audioProvider === 'voice_clone') && (
        <div style={{
          padding: '12px 13px',
          marginBottom: 14,
          border: '1px solid var(--border-color)',
          borderRadius: 8,
          background: 'var(--bg-primary)',
        }}>
          <div style={{ marginBottom: 10, color: 'var(--text-primary)', fontSize: 12, fontWeight: 650 }}>
            音色列表管理凭据
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
            <div>
              <span style={fieldLabelStyle}>Access Key ID</span>
              <APIKeyInput
                value={global.audioDoubaoOpenAccessKey ? maskApiKey(global.audioDoubaoOpenAccessKey) : ''}
                status="untested"
                onSave={key => updateGlobal({ audioDoubaoOpenAccessKey: key })}
                onClear={() => updateGlobal({ audioDoubaoOpenAccessKey: '' })}
              />
            </div>
            <div>
              <span style={fieldLabelStyle}>Secret Access Key</span>
              <APIKeyInput
                value={global.audioDoubaoOpenSecretKey ? maskApiKey(global.audioDoubaoOpenSecretKey) : ''}
                status="untested"
                onSave={key => updateGlobal({ audioDoubaoOpenSecretKey: key })}
                onClear={() => updateGlobal({ audioDoubaoOpenSecretKey: '' })}
              />
            </div>
          </div>
          <div style={{ marginTop: 8, color: 'var(--text-tertiary)', fontSize: 10, lineHeight: 1.55 }}>
            仅用于刷新音色列表；语音合成仍使用下方 App ID 与 Access Token。{' '}
            <a href="https://console.volcengine.com/iam/keymanage/" target="_blank" rel="noreferrer">打开密钥管理</a>
          </div>
        </div>
      )}

      {global.audioProvider === 'edge-tts' && (
        <div style={{ padding: '10px 12px', borderRadius: 8, background: 'var(--success-bg)', color: 'var(--text-secondary)', fontSize: 11, lineHeight: 1.6 }}>
          无需密钥，需要联网。
        </div>
      )}

      {global.audioProvider === 'openai-compatible' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10, marginBottom: 12 }}>
            <label>
              <span style={fieldLabelStyle}>API Base URL</span>
              <Input
                aria-label="语音 API Base URL"
                value={global.audioApiBase}
                onChange={event => updateGlobal({ audioApiBase: event.target.value, ...resetStatus })}
                placeholder="https://api.openai.com/v1"
                style={inputStyle}
              />
            </label>
            <label>
              <span style={fieldLabelStyle}>TTS Model</span>
              <Input
                aria-label="语音模型"
                value={global.audioApiModel}
                onChange={event => updateGlobal({ audioApiModel: event.target.value, ...resetStatus })}
                placeholder="tts-1"
                style={inputStyle}
              />
            </label>
          </div>
          <div>
            <span style={fieldLabelStyle}>API Key</span>
            <APIKeyInput
              value={global.audioApiKeyMasked}
              status={global.audioConnectionStatus}
              onClear={() => updateGlobal({ audioApiKey: '', audioApiKeySet: false, audioApiKeyMasked: '', ...resetStatus })}
              onSave={key => updateGlobal({
                audioApiKey: key,
                audioApiKeySet: true,
                audioApiKeyMasked: maskApiKey(key),
                ...resetStatus,
              })}
            />
          </div>
          <div style={{ marginTop: 8, color: 'var(--text-tertiary)', fontSize: 10, lineHeight: 1.5 }}>
            服务端需兼容 POST /audio/speech。
          </div>
        </div>
      )}

      {global.audioProvider === 'doubao_tts' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10, marginBottom: 12 }}>
            <label>
              <span style={fieldLabelStyle}>App ID</span>
              <Input aria-label="豆包语音 App ID" value={global.audioDoubaoAppId} onChange={event => updateGlobal({ audioDoubaoAppId: event.target.value, ...resetStatus })} style={inputStyle} />
            </label>
            <div>
              <span style={fieldLabelStyle}>Access Token</span>
              <APIKeyInput value={global.audioDoubaoAccessToken ? maskApiKey(global.audioDoubaoAccessToken) : ''} status={global.audioConnectionStatus} onSave={key => updateGlobal({ audioDoubaoAccessToken: key, ...resetStatus })} onClear={() => updateGlobal({ audioDoubaoAccessToken: '', ...resetStatus })} />
            </div>
            <label>
              <span style={fieldLabelStyle}>Cluster</span>
              <Input aria-label="豆包语音 Cluster" value={global.audioDoubaoCluster} onChange={event => updateGlobal({ audioDoubaoCluster: event.target.value, ...resetStatus })} placeholder="volcano_tts" style={inputStyle} />
            </label>
            <label>
              <span style={fieldLabelStyle}>Voice Type</span>
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 8 }}>
                <AutoComplete
                  aria-label="豆包语音 Voice Type"
                  value={global.audioDoubaoVoiceType}
                  options={presetOptions}
                  onChange={value => updateGlobal({ audioDoubaoVoiceType: value, ...resetStatus })}
                  placeholder="输入或从列表选择 Voice Type"
                  filterOption={(input, option) => String(option?.label || '').toLowerCase().includes(input.toLowerCase())}
                  style={{ width: '100%' }}
                />
                <Button loading={voiceLoading === 'preset'} onClick={() => void loadDoubaoVoices('preset')}>
                  刷新音色
                </Button>
              </div>
            </label>
            <label>
              <span style={fieldLabelStyle}>Resource ID</span>
              <Input aria-label="豆包语音 Resource ID" value={global.audioDoubaoResourceId} onChange={event => updateGlobal({ audioDoubaoResourceId: event.target.value, ...resetStatus })} placeholder="volc.service_type.10029" style={inputStyle} />
            </label>
            <label>
              <span style={fieldLabelStyle}>Endpoint</span>
              <Input aria-label="豆包语音 Endpoint" value={global.audioDoubaoEndpoint} onChange={event => updateGlobal({ audioDoubaoEndpoint: event.target.value, ...resetStatus })} placeholder="https://openspeech.bytedance.com/api/v1/tts" style={inputStyle} />
            </label>
          </div>
          <div style={{ color: 'var(--text-tertiary)', fontSize: 10, lineHeight: 1.5 }}>
            App ID、Access Token 和 Voice Type 需来自同一豆包语音应用。
          </div>
          {voiceError && <div style={{ marginTop: 8, color: 'var(--error-color)', fontSize: 10 }}>{voiceError}</div>}
        </div>
      )}

      {global.audioProvider === 'voice_clone' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10, marginBottom: 12 }}>
            <label>
              <span style={fieldLabelStyle}>App ID</span>
              <Input aria-label="豆包克隆 App ID" value={global.audioDoubaoCloneAppId} onChange={event => updateGlobal({ audioDoubaoCloneAppId: event.target.value, ...resetStatus })} style={inputStyle} />
            </label>
            <div>
              <span style={fieldLabelStyle}>Access Token</span>
              <APIKeyInput value={global.audioDoubaoCloneAccessToken ? maskApiKey(global.audioDoubaoCloneAccessToken) : ''} status={global.audioConnectionStatus} onSave={key => updateGlobal({ audioDoubaoCloneAccessToken: key, ...resetStatus })} onClear={() => updateGlobal({ audioDoubaoCloneAccessToken: '', ...resetStatus })} />
            </div>
            <label>
              <span style={fieldLabelStyle}>Cluster</span>
              <Input aria-label="豆包克隆 Cluster" value={global.audioDoubaoCloneCluster} onChange={event => updateGlobal({ audioDoubaoCloneCluster: event.target.value, ...resetStatus })} placeholder="volcano_tts" style={inputStyle} />
            </label>
            <label>
              <span style={fieldLabelStyle}>Speaker ID</span>
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 8 }}>
                <AutoComplete
                  aria-label="豆包克隆 Speaker ID"
                  value={global.audioDoubaoCloneSpeakerId}
                  options={cloneOptions}
                  onChange={value => updateGlobal({ audioDoubaoCloneSpeakerId: value, ...resetStatus })}
                  placeholder="输入或从列表选择 Speaker ID"
                  filterOption={(input, option) => String(option?.label || '').toLowerCase().includes(input.toLowerCase())}
                  style={{ width: '100%' }}
                />
                <Button loading={voiceLoading === 'clone'} onClick={() => void loadDoubaoVoices('clone')}>
                  刷新复刻音色
                </Button>
              </div>
            </label>
            <label>
              <span style={fieldLabelStyle}>Resource ID</span>
              <Input aria-label="豆包克隆 Resource ID" value={global.audioDoubaoCloneResourceId} onChange={event => updateGlobal({ audioDoubaoCloneResourceId: event.target.value, ...resetStatus })} placeholder="volc.megatts.default" style={inputStyle} />
            </label>
            <label>
              <span style={fieldLabelStyle}>Endpoint</span>
              <Input aria-label="豆包克隆 Endpoint" value={global.audioDoubaoCloneEndpoint} onChange={event => updateGlobal({ audioDoubaoCloneEndpoint: event.target.value, ...resetStatus })} placeholder="https://openspeech.bytedance.com/api/v1/tts" style={inputStyle} />
            </label>
          </div>
          <div style={{ color: 'var(--text-tertiary)', fontSize: 10, lineHeight: 1.6 }}>
            这里只选择已有 Speaker ID，不创建或训练音色。
          </div>
          {voiceError && <div style={{ marginTop: 8, color: 'var(--error-color)', fontSize: 10 }}>{voiceError}</div>}
        </div>
      )}
    </div>
  )
}

// ============================================================
// Main Render
// ============================================================

export default function SettingsAPIConfig({ settings, updateSettings }: Props) {
  const [modelLoading, setModelLoading] = useState<Record<string, boolean>>({})
  const [detectingAgents, setDetectingAgents] = useState(false)
  const [testingSearch, setTestingSearch] = useState(false)
  const searchTestRequestRef = useRef(0)

  const global = settings.apiConfig.global
  const globalRef = useRef(global)
  globalRef.current = global
  const selectedSearchProvider = global.searchProvider || 'tavily'
  const selectedSearchConfig = selectedSearchProvider === 'default_ai'
    ? null
    : global.webSearchProviders[selectedSearchProvider]
  const defaultAISearchVerified = global.defaultAISearchVerifiedTarget === global.defaultAITarget
  const displayedSearchStatus: APIConnectionStatus = testingSearch
    ? 'testing'
    : selectedSearchProvider === 'default_ai'
      ? (defaultAISearchVerified ? 'connected' : 'untested')
      : selectedSearchConfig?.connectionStatus || 'untested'
  const localAgents = useMemo(() => global.localAgents || [], [global.localAgents])
  const aiModelProviders = useMemo(() => global.aiModelProviders || [], [global.aiModelProviders])
  const [activeTargetKind, setActiveTargetKind] = useState<AITargetKind>(() =>
    targetKindFromTarget(global.defaultAITarget, aiModelProviders)
  )
  const [selectedLocalModelProviderId, setSelectedLocalModelProviderId] = useState(() => {
    const provider = aiModelProviders.find(item => global.defaultAITarget === `model:${item.id}`)
    return provider?.targetKind === 'local_model' ? provider.id : ''
  })
  const [selectedApiModelProviderId, setSelectedApiModelProviderId] = useState(() => {
    const provider = aiModelProviders.find(item => global.defaultAITarget === `model:${item.id}`)
    return provider?.targetKind === 'api_model' ? provider.id : ''
  })
  const localModelProviders = useMemo(
    () => aiModelProviders.filter(provider => provider.targetKind === 'local_model'),
    [aiModelProviders],
  )
  const apiModelProviders = useMemo(
    () => aiModelProviders.filter(provider => provider.targetKind === 'api_model'),
    [aiModelProviders],
  )
  const selectedTargetLabel = useMemo(
    () => targetLabel(global.defaultAITarget, localAgents, aiModelProviders),
    [global.defaultAITarget, localAgents, aiModelProviders],
  )
  const defaultTargetProvider = global.defaultAITarget.startsWith('model:')
    ? aiModelProviders.find(provider => global.defaultAITarget === `model:${provider.id}`)
    : undefined
  const defaultTargetKind = targetKindFromTarget(global.defaultAITarget, aiModelProviders)
  const defaultTargetProviderId = defaultTargetProvider?.id || ''

  useEffect(() => {
    setActiveTargetKind(defaultTargetKind)
  }, [defaultTargetKind])

  useEffect(() => {
    if (!defaultTargetProviderId) return
    if (defaultTargetKind === 'local_model') {
      setSelectedLocalModelProviderId(defaultTargetProviderId)
    } else {
      setSelectedApiModelProviderId(defaultTargetProviderId)
    }
  }, [defaultTargetKind, defaultTargetProviderId])

  useEffect(() => {
    if (localModelProviders.some(provider => provider.id === selectedLocalModelProviderId)) return
    const defaultProviderId = defaultTargetKind === 'local_model'
      && localModelProviders.some(provider => provider.id === defaultTargetProviderId)
      ? defaultTargetProviderId
      : ''
    setSelectedLocalModelProviderId(defaultProviderId || localModelProviders[0]?.id || '')
  }, [defaultTargetKind, defaultTargetProviderId, localModelProviders, selectedLocalModelProviderId])

  useEffect(() => {
    if (apiModelProviders.some(provider => provider.id === selectedApiModelProviderId)) return
    const defaultProviderId = defaultTargetKind === 'api_model'
      && apiModelProviders.some(provider => provider.id === defaultTargetProviderId)
      ? defaultTargetProviderId
      : ''
    setSelectedApiModelProviderId(defaultProviderId || apiModelProviders[0]?.id || '')
  }, [apiModelProviders, defaultTargetKind, defaultTargetProviderId, selectedApiModelProviderId])

  const targetOptions = useMemo(() => [
    ...localAgents.map(agent => ({
      value: `agent:${agent.id}`,
      label: `本地代理：${agent.name}（${agent.available ? agent.version || '已安装' : '未检测到'}）`,
      disabled: !agent.available,
    })),
    ...aiModelProviders
      .filter(provider => isProviderConfigured(provider) || global.defaultAITarget === `model:${provider.id}`)
      .map(provider => ({
      value: `model:${provider.id}`,
      label: `${PROVIDER_KIND_COPY[provider.kind].badge}：${provider.name}${provider.model ? `（${provider.model}）` : ''}`,
      disabled: false,
    })),
  ], [aiModelProviders, global.defaultAITarget, localAgents])

  const selectableTargetOptions = useMemo(
    () => targetOptions.filter(option => !option.disabled),
    [targetOptions],
  )

  const selectedLocalModelProvider = useMemo(
    () => localModelProviders.find(provider => provider.id === selectedLocalModelProviderId) || localModelProviders[0],
    [localModelProviders, selectedLocalModelProviderId],
  )
  const selectedApiModelProvider = useMemo(
    () => apiModelProviders.find(provider => provider.id === selectedApiModelProviderId) || apiModelProviders[0],
    [apiModelProviders, selectedApiModelProviderId],
  )

  const selectDefaultTarget = useCallback((target: string) => {
    updateSettings('apiConfig', c => ({
      ...c,
      global: {
        ...c.global,
        defaultAITarget: target,
        defaultAISearchVerifiedTarget: c.global.defaultAITarget === target
          ? c.global.defaultAISearchVerifiedTarget
          : '',
      },
    }))
  }, [updateSettings])

  const updateSearchSettings = useCallback(async (
    updater: (current: AppSettings['apiConfig']['global']) => AppSettings['apiConfig']['global'],
  ) => {
    const nextGlobal = updater(globalRef.current)
    globalRef.current = nextGlobal
    updateSettings('apiConfig', current => ({ ...current, global: updater(current.global) }))
  }, [updateSettings])

  const updateSearchProviderConfig = useCallback((
    patch: Partial<WebSearchProviderConfig>,
    invalidatePendingTest = true,
  ) => {
    if (selectedSearchProvider === 'default_ai') return
    if (invalidatePendingTest) searchTestRequestRef.current += 1
    return updateSearchSettings(current => ({
      ...current,
      webSearchProviders: {
        ...current.webSearchProviders,
        [selectedSearchProvider]: {
          ...current.webSearchProviders[selectedSearchProvider],
          ...patch,
        },
      },
    }))
  }, [selectedSearchProvider, updateSearchSettings])

  const selectSearchProvider = useCallback((provider: WebSearchProvider | 'default_ai') => {
    searchTestRequestRef.current += 1
    void updateSearchSettings(current => ({
      ...current,
      searchProvider: provider,
    }))
  }, [updateSearchSettings])

  const testSearchConnection = useCallback(async () => {
    const requestId = ++searchTestRequestRef.current
    setTestingSearch(true)
    try {
      const provider = global.searchProvider || 'tavily'
      if (provider === 'tavily' || provider === 'bocha') {
        const searchConfig = global.webSearchProviders[provider]
        await updateSearchProviderConfig({ connectionStatus: 'testing' }, false)
        const providerLabel = provider === 'bocha' ? '博查' : 'Tavily'
        if (!searchConfig.apiKey) throw new Error(`请先填写 ${providerLabel} API Key`)
        const providerSearch = provider === 'bocha'
          ? window.electronAPI?.bochaSearch
          : window.electronAPI?.tavilySearch
        if (typeof providerSearch !== 'function') {
          throw new Error('桌面搜索能力尚未加载，请完整退出并重新启动 Electron 应用后再试')
        }
        const result = await providerSearch({
          apiBase: searchConfig.apiBase || SEARCH_API_BASES[provider],
          apiKey: searchConfig.apiKey,
          query: '人工智能 最新动态',
          timeRange: 'week',
          maxResults: 2,
        })
        if (searchTestRequestRef.current !== requestId) return
        if (!result.results.length) throw new Error(`${providerLabel}未返回搜索结果`)
        await updateSearchProviderConfig({ connectionStatus: 'connected' }, false)
        message.success(`${providerLabel}搜索成功，返回 ${result.results.length} 个来源`)
      } else {
        const count = await verifyDefaultAISearchCapability(settings)
        if (searchTestRequestRef.current !== requestId) return
        await updateSearchSettings(current => ({ ...current, defaultAISearchVerifiedTarget: global.defaultAITarget }))
        message.success(`当前 AI 自身联网能力验证成功，返回 ${count} 个来源`)
      }
    } catch (error) {
      if (searchTestRequestRef.current !== requestId) return
      if ((global.searchProvider || 'tavily') !== 'default_ai') {
        await updateSearchProviderConfig({ connectionStatus: 'failed' }, false)
      } else {
        await updateSearchSettings(current => ({ ...current, defaultAISearchVerifiedTarget: '' }))
      }
      message.error(error instanceof Error ? error.message : '搜索能力测试失败')
    } finally {
      setTestingSearch(false)
    }
  }, [global.defaultAITarget, global.searchProvider, global.webSearchProviders, settings, updateSearchProviderConfig, updateSearchSettings])

  useEffect(() => {
    const targetStillExists = global.defaultAITarget.startsWith('agent:')
      ? localAgents.some(agent => agent.available && global.defaultAITarget === `agent:${agent.id}`)
      : global.defaultAITarget.startsWith('model:')
        ? aiModelProviders.some(provider => global.defaultAITarget === `model:${provider.id}`)
        : false
    if (targetStillExists) return
    if (!selectableTargetOptions.length) return
    selectDefaultTarget(selectableTargetOptions[0].value)
  }, [aiModelProviders, global.defaultAITarget, localAgents, selectDefaultTarget, selectableTargetOptions])

  const updateProvider = useCallback((providerId: string, patch: Partial<AIModelProviderConfig>) => {
    updateSettings('apiConfig', c => ({
      ...c,
      global: {
        ...c.global,
        aiModelProviders: c.global.aiModelProviders.map(provider =>
          provider.id === providerId ? { ...provider, ...patch } : provider
        ),
      },
    }))
  }, [updateSettings])

  const updateAudioGlobal = useCallback((patch: Partial<GlobalAPIConfig>) => {
    updateSettings('apiConfig', current => ({
      ...current,
      global: { ...current.global, ...patch },
    }))
  }, [updateSettings])

  const handleDetectLocalAgents = useCallback(async (silent = false) => {
    if (!window.electronAPI?.detectLocalAgents) {
      if (!silent) message.warning('当前运行环境无法检测本地代理')
      return
    }
    setDetectingAgents(true)
    try {
      const detected = await window.electronAPI.detectLocalAgents()
      updateSettings('apiConfig', c => ({
        ...c,
        global: {
          ...c.global,
          localAgents: mergeDetectedLocalAgents(c.global.localAgents, detected),
        },
      }))
      const availableCount = detected.filter(item => item.available).length
      if (!silent) {
        message.success({ content: `已识别 ${availableCount} 个本地代理`, duration: 2, style: { marginTop: 60 } })
      }
    } catch (error: any) {
      if (silent) {
        console.error('[SettingsAPIConfig] Local agent detection failed:', error)
      } else {
        message.error({ content: error?.message || '本地代理检测失败', duration: 3, style: { marginTop: 60 } })
      }
    } finally {
      setDetectingAgents(false)
    }
  }, [updateSettings])

  const handleFetchProviderModels = useCallback(async (provider: AIModelProviderConfig) => {
    const modelKey = `provider-${provider.id}`
    if (!provider.apiBase) {
      message.warning('请先填写 API Base URL')
      return
    }
    if (provider.targetKind === 'api_model' && !providerKeyReady(provider)) {
      message.warning('请先填写 API Key 或环境变量名')
      return
    }
    setModelLoading(prev => ({ ...prev, [modelKey]: true }))
    try {
      const models = await fetchModels(
        provider.apiBase,
        providerRuntimeApiKey(provider),
        provider.kind,
        providerRuntimeApiKeyEnvVar(provider),
      )
      updateProvider(provider.id, {
        modelOptions: models,
        model: provider.model || models[0] || provider.model,
        connectionStatus: 'connected',
      })
      message.success(`已获取 ${models.length} 个模型`)
    } catch (error: any) {
      updateProvider(provider.id, { connectionStatus: 'failed' })
      message.error(`获取模型失败：${error?.message || '未知错误'}`)
    } finally {
      setModelLoading(prev => ({ ...prev, [modelKey]: false }))
    }
  }, [updateProvider])

  const handleTestProvider = useCallback(async (provider: AIModelProviderConfig) => {
    updateProvider(provider.id, { connectionStatus: 'testing' })
    try {
      if (!provider.apiBase) throw new Error('请先填写 API Base URL')
      if (provider.targetKind === 'api_model' && !providerKeyReady(provider)) throw new Error('请先填写 API Key 或环境变量名')
      await fetchModels(
        provider.apiBase,
        providerRuntimeApiKey(provider),
        provider.kind,
        providerRuntimeApiKeyEnvVar(provider),
      )
      updateProvider(provider.id, { connectionStatus: 'connected' })
      message.success({ content: `${provider.name} 连接成功`, duration: 2, style: { marginTop: 60 } })
    } catch (error: any) {
      updateProvider(provider.id, { connectionStatus: 'failed' })
      message.error({ content: error?.message || `${provider.name} 连接失败`, duration: 3, style: { marginTop: 60 } })
    }
  }, [updateProvider])

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <span style={{ fontSize: 16, color: 'var(--accent-primary)' }}><ThunderboltOutlined /></span>
          <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>智能能力与接口配置</span>
        </div>
      </div>

      <div
        style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-color)',
          borderRadius: 12,
          padding: '18px 20px',
          marginBottom: 20,
        }}
        className="settings-subsection"
      >
        <div style={{ marginBottom: 16 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <RobotOutlined style={{ color: 'var(--accent-primary)' }} />
              <span style={{ fontSize: 14, fontWeight: 650, color: 'var(--text-primary)' }}>默认 AI 目标</span>
            </div>
            <div style={{
              marginTop: 10,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '5px 9px',
              borderRadius: 7,
              background: 'var(--accent-light)',
              color: 'var(--accent-primary)',
              fontSize: 11,
              fontWeight: 600,
            }}>
              <CheckOutlined />
              {selectedTargetLabel}
            </div>
          </div>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
          gap: 8,
          marginBottom: 16,
        }}>
          {TARGET_KIND_OPTIONS.map(option => {
            const active = activeTargetKind === option.key
            return (
              <button
                key={option.key}
                type="button"
                onClick={() => {
                  setActiveTargetKind(option.key)
                }}
                style={{
                  textAlign: 'left',
                  border: `1.5px solid ${active ? 'var(--text-primary)' : 'var(--border-color)'}`,
                  borderRadius: 8,
                  background: active ? 'var(--bg-primary)' : 'var(--bg-secondary)',
                  color: 'var(--text-primary)',
                  padding: '12px 14px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                }}
              >
                <span style={{ fontSize: 15, color: active ? 'var(--accent-primary)' : 'var(--text-tertiary)' }}>
                  {option.icon}
                </span>
                <span style={{ display: 'block' }}>
                  <span style={{ display: 'block', fontSize: 13, fontWeight: 650 }}>{option.label}</span>
                  <span style={{ display: 'block', marginTop: 2, fontSize: 11, color: 'var(--text-tertiary)' }}>
                    {option.desc}
                  </span>
                </span>
              </button>
            )
          })}
        </div>

        {activeTargetKind === 'local_agent' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 650, color: 'var(--text-primary)' }}>已识别的本地代理</div>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>选择已安装的 CLI 代理作为默认 AI。</div>
              </div>
              <Button
                size="small"
                icon={detectingAgents ? <LoadingOutlined spin /> : <SearchOutlined />}
                loading={detectingAgents}
                onClick={() => handleDetectLocalAgents(false)}
                style={{ height: 30, borderRadius: 7, fontSize: 11 }}
              >
                重新检测
              </Button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10 }}>
              {localAgents.map(agent => {
                const selected = global.defaultAITarget === `agent:${agent.id}`
                const iconSrc = AGENT_ICON_SOURCES[agent.id]
                return (
                  <button
                    key={agent.id}
                    type="button"
                    disabled={!agent.available}
                    onClick={() => agent.available && selectDefaultTarget(`agent:${agent.id}`)}
                    style={{
                      minHeight: 84,
                      padding: '12px 13px',
                      borderRadius: 8,
                      border: `1.5px solid ${selected ? 'var(--text-primary)' : 'var(--border-color)'}`,
                      background: selected ? 'var(--bg-primary)' : 'var(--bg-secondary)',
                      color: 'var(--text-primary)',
                      cursor: agent.available ? 'pointer' : 'not-allowed',
                      opacity: agent.available ? 1 : 0.58,
                      textAlign: 'left',
                    }}
                    className="settings-option-card"
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{
                        width: 34,
                        height: 34,
                        borderRadius: 9,
                        background: 'var(--bg-primary)',
                        border: '1px solid var(--border-color)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}>
                        <img
                          src={iconSrc}
                          alt=""
                          draggable={false}
                          style={{
                            width: 24,
                            height: 24,
                            objectFit: 'contain',
                            opacity: agent.available ? 1 : 0.45,
                            filter: agent.available ? 'none' : 'grayscale(1)',
                          }}
                        />
                      </span>
                      <span style={{ minWidth: 0 }}>
                        <span style={{ display: 'block', fontSize: 13, fontWeight: 650 }}>{agent.name}</span>
                        <span style={{
                          display: 'block',
                          marginTop: 3,
                          fontSize: 11,
                          color: agent.available ? 'var(--success-color)' : 'var(--text-tertiary)',
                        }}>
                          {agent.available ? (agent.version || agent.statusText || '已安装') : agent.statusText || '未检测到'}
                        </span>
                      </span>
                    </div>
                    {selected && (
                      <div style={{ marginTop: 10, fontSize: 11, color: 'var(--accent-primary)', fontWeight: 600 }}>
                        当前默认
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {activeTargetKind === 'local_model' && selectedLocalModelProvider && (
          <div>
            <div style={{ fontSize: 13, fontWeight: 650, color: 'var(--text-primary)', marginBottom: 4 }}>
              本地模型服务
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10, marginBottom: 14 }}>
              {localModelProviders.map(provider => {
                const selected = global.defaultAITarget === `model:${provider.id}`
                const editing = selectedLocalModelProvider?.id === provider.id
                return (
                  <button
                    key={provider.id}
                    type="button"
                    onClick={() => {
                      setSelectedLocalModelProviderId(provider.id)
                      if (isProviderConfigured(provider)) {
                        selectDefaultTarget(`model:${provider.id}`)
                      }
                    }}
                    style={{
                      border: `1.5px solid ${selected ? 'var(--text-primary)' : editing ? 'var(--accent-primary)' : 'var(--border-color)'}`,
                      borderRadius: 8,
                      background: selected || editing ? 'var(--bg-primary)' : 'var(--bg-secondary)',
                      color: 'var(--text-primary)',
                      padding: '13px 14px',
                      textAlign: 'left',
                      cursor: 'pointer',
                    }}
                    className="settings-option-card"
                  >
                    <span style={{ display: 'block', fontSize: 13, fontWeight: 650 }}>{provider.name}</span>
                    <span style={{ display: 'block', marginTop: 4, fontSize: 11, color: 'var(--text-tertiary)' }}>
                      {isProviderConfigured(provider) ? provider.model : '待配置'}
                    </span>
                  </button>
                )
              })}
            </div>

            <div style={{
              border: '1px solid var(--border-color)',
              borderRadius: 10,
              background: 'var(--bg-primary)',
              padding: 14,
            }}>
              <ProviderConfigFields
                provider={selectedLocalModelProvider}
                modelLoading={modelLoading[`provider-${selectedLocalModelProvider.id}`]}
                updateProvider={updateProvider}
                handleFetchProviderModels={handleFetchProviderModels}
                handleTestProvider={handleTestProvider}
              />
            </div>
          </div>
        )}

        {activeTargetKind === 'api_model' && selectedApiModelProvider && (
          <div>
            <div style={{ fontSize: 13, fontWeight: 650, color: 'var(--text-primary)', marginBottom: 4 }}>
              API 模型供应商
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 12 }}>配置并选择默认 API 模型。</div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8, marginBottom: 14 }}>
              {apiModelProviders.map(provider => {
                const selected = global.defaultAITarget === `model:${provider.id}`
                const editing = selectedApiModelProvider?.id === provider.id
                return (
                  <button
                    key={provider.id}
                    type="button"
                    onClick={() => {
                      setSelectedApiModelProviderId(provider.id)
                      if (isProviderConfigured(provider)) {
                        selectDefaultTarget(`model:${provider.id}`)
                      }
                    }}
                    style={{
                      border: `1.5px solid ${selected ? 'var(--text-primary)' : editing ? 'var(--accent-primary)' : 'var(--border-color)'}`,
                      borderRadius: 8,
                      background: selected || editing ? 'var(--bg-primary)' : 'var(--bg-secondary)',
                      color: 'var(--text-primary)',
                      padding: '12px 12px',
                      textAlign: 'left',
                      cursor: 'pointer',
                      minHeight: 82,
                    }}
                    className="settings-option-card"
                  >
                    <div style={{ fontSize: 13, fontWeight: 650, marginBottom: 8 }}>{provider.name}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-tertiary)', lineHeight: 1.4 }}>
                      {isProviderConfigured(provider) ? provider.model : '待配置'}
                    </div>
                  </button>
                )
              })}
            </div>

            <div style={{
              border: '1px solid var(--border-color)',
              borderRadius: 10,
              background: 'var(--bg-primary)',
              padding: 14,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 650, color: 'var(--text-primary)' }}>
                    {selectedApiModelProvider.name}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
                    {PROVIDER_KIND_COPY[selectedApiModelProvider.kind].desc}
                  </div>
                </div>
                <StatusBadge status={providerStatus(selectedApiModelProvider)} />
              </div>

              <ProviderConfigFields
                provider={selectedApiModelProvider}
                modelLoading={modelLoading[`provider-${selectedApiModelProvider.id}`]}
                updateProvider={updateProvider}
                handleFetchProviderModels={handleFetchProviderModels}
                handleTestProvider={handleTestProvider}
                showTestAction={false}
              />

              <div style={{ marginTop: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 650, color: 'var(--text-secondary)', marginBottom: 7 }}>
                  API 密钥保存
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
                  {API_KEY_STORAGE_OPTIONS
                    .filter(option => option.key !== 'none' || selectedApiModelProvider.kind === 'openai_compatible')
                    .map(option => {
                    const selected = selectedApiModelProvider.apiKeyStorage === option.key
                    return (
                      <button
                        key={option.key}
                        type="button"
                        onClick={() => updateProvider(selectedApiModelProvider.id, {
                          apiKeyStorage: option.key,
                          apiKey: option.key === 'local' ? selectedApiModelProvider.apiKey : '',
                          apiKeySet: option.key === 'local' ? selectedApiModelProvider.apiKeySet : false,
                          apiKeyMasked: option.key === 'local' ? selectedApiModelProvider.apiKeyMasked : '',
                          connectionStatus: 'untested',
                        })}
                        style={{
                          border: `1.5px solid ${selected ? 'var(--text-primary)' : 'var(--border-color)'}`,
                          borderRadius: 8,
                          background: selected ? 'var(--bg-secondary)' : 'var(--bg-primary)',
                          color: 'var(--text-primary)',
                          padding: '10px 11px',
                          textAlign: 'left',
                          cursor: 'pointer',
                        }}
                      >
                        <span style={{ display: 'block', fontSize: 12, fontWeight: 650 }}>{option.label}</span>
                        <span style={{ display: 'block', marginTop: 3, fontSize: 10, color: 'var(--text-tertiary)' }}>
                          {option.desc}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {selectedApiModelProvider.apiKeyStorage === 'local' && (
                <div data-testid="provider-key-row" style={{ display: 'flex', alignItems: 'flex-end', gap: 8, marginTop: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 650, color: 'var(--text-secondary)', marginBottom: 7 }}>
                      接入密钥
                    </div>
                    <APIKeyInput
                      value={selectedApiModelProvider.apiKeyMasked}
                      status={selectedApiModelProvider.connectionStatus}
                      onClear={() => updateProvider(selectedApiModelProvider.id, { apiKey: '', apiKeySet: false, apiKeyMasked: '', connectionStatus: 'untested' })}
                      onSave={(key) => updateProvider(selectedApiModelProvider.id, {
                        apiKey: key,
                        apiKeySet: true,
                        apiKeyMasked: maskApiKey(key),
                        connectionStatus: 'untested',
                      })}
                    />
                  </div>
                  <Button
                    size="small"
                    icon={<LinkOutlined />}
                    loading={selectedApiModelProvider.connectionStatus === 'testing'}
                    onClick={() => handleTestProvider(selectedApiModelProvider)}
                    style={{ height: 32, flexShrink: 0, borderRadius: 7, fontSize: 11 }}
                  >
                    测试连接
                  </Button>
                </div>
              )}

              {selectedApiModelProvider.apiKeyStorage === 'env' && (
                <div data-testid="provider-key-row" style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 12 }}>
                  <label style={{ display: 'block', flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 650, color: 'var(--text-secondary)', marginBottom: 7 }}>
                      环境变量名
                    </div>
                    <Input
                      value={selectedApiModelProvider.apiKeyEnvVar}
                      onChange={event => updateProvider(selectedApiModelProvider.id, {
                        apiKeyEnvVar: event.target.value,
                        apiKeySet: Boolean(event.target.value.trim()),
                        connectionStatus: 'untested',
                      })}
                      placeholder="OPENAI_API_KEY"
                      style={{ borderRadius: 8, fontSize: 12, fontFamily: 'monospace' }}
                    />
                    <div style={{ marginTop: 6, fontSize: 10, color: 'var(--text-tertiary)', lineHeight: 1.5 }}>
                      前端不会读取系统环境变量，流水线运行时会按该变量名取密钥。
                    </div>
                  </label>
                  <Button
                    size="small"
                    icon={<LinkOutlined />}
                    loading={selectedApiModelProvider.connectionStatus === 'testing'}
                    onClick={() => handleTestProvider(selectedApiModelProvider)}
                    style={{ height: 32, flexShrink: 0, marginTop: 24, borderRadius: 7, fontSize: 11 }}
                  >
                    测试连接
                  </Button>
                </div>
              )}

              {selectedApiModelProvider.apiKeyStorage === 'none' && (
                <div data-testid="provider-key-row" style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
                  <div style={{
                    flex: 1,
                    minWidth: 0,
                    padding: '9px 11px',
                    borderRadius: 8,
                    background: 'var(--bg-tertiary)',
                    color: 'var(--text-secondary)',
                    fontSize: 11,
                    lineHeight: 1.5,
                  }}>
                    当前供应商不会发送真实 API Key，适合本地网关或已在服务端处理鉴权的兼容接口。
                  </div>
                  <Button
                    size="small"
                    icon={<LinkOutlined />}
                    loading={selectedApiModelProvider.connectionStatus === 'testing'}
                    onClick={() => handleTestProvider(selectedApiModelProvider)}
                    style={{ height: 32, flexShrink: 0, borderRadius: 7, fontSize: 11 }}
                  >
                    测试连接
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <AudioProviderSettings global={global} updateGlobal={updateAudioGlobal} />

      <div className="settings-subsection" style={{
        background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 12,
        padding: '18px 20px', marginBottom: 20,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-primary)', fontSize: 14, fontWeight: 650 }}>
              <SearchOutlined style={{ color: 'var(--accent-primary)' }} /> 网页搜索
            </div>
            <div style={{ marginTop: 4, color: 'var(--text-tertiary)', fontSize: 11 }}>整理页自动补证使用；支持 Tavily、博查，或复用当前 AI 的联网搜索能力。</div>
          </div>
          <StatusBadge status={displayedSearchStatus} />
        </div>

        <div className="search-provider-options" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8, marginBottom: 14 }}>
          {([
            ['tavily', 'Tavily API', '稳定返回结构化网页来源'],
            ['bocha', '博查 API', '中文语义搜索与结构化网页来源'],
            ['default_ai', '复用当前 AI 联网', '复用当前 AI，依赖其自身联网搜索能力'],
          ] as const).map(([value, label, desc]) => {
            const selected = selectedSearchProvider === value
            return <button key={value} type="button" className="settings-option-card" onClick={() => selectSearchProvider(value)} style={{
              border: `1.5px solid ${selected ? 'var(--text-primary)' : 'var(--border-color)'}`, borderRadius: 8,
              background: selected ? 'var(--bg-primary)' : 'var(--bg-secondary)', color: 'var(--text-primary)', padding: '12px 14px', textAlign: 'left', cursor: 'pointer',
            }}><strong style={{ display: 'block', fontSize: 12 }}>{label}</strong><span style={{ display: 'block', marginTop: 3, color: 'var(--text-tertiary)', fontSize: 10 }}>{desc}</span></button>
          })}
        </div>

        {selectedSearchProvider !== 'default_ai' ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, .8fr) minmax(280px, 1.2fr)', gap: 10 }}>
            <label><span style={{ display: 'block', marginBottom: 6, color: 'var(--text-secondary)', fontSize: 11, fontWeight: 650 }}>API Base</span><Input value={selectedSearchConfig?.apiBase || SEARCH_API_BASES[selectedSearchProvider]} onChange={event => updateSearchProviderConfig({ apiBase: event.target.value, connectionStatus: 'untested' })} /></label>
            <div><span style={{ display: 'block', marginBottom: 6, color: 'var(--text-secondary)', fontSize: 11, fontWeight: 650 }}>API Key</span><APIKeyInput value={selectedSearchConfig?.apiKeyMasked || ''} status={selectedSearchConfig?.connectionStatus || 'untested'} onSave={key => updateSearchProviderConfig({ apiKey: key, apiKeySet: true, apiKeyMasked: maskApiKey(key), connectionStatus: 'untested' })} onClear={() => updateSearchProviderConfig({ apiKey: '', apiKeySet: false, apiKeyMasked: '', connectionStatus: 'untested' })} /></div>
          </div>
        ) : (
          <div style={{ padding: '10px 12px', border: '1px solid var(--border-color)', borderRadius: 8, background: 'var(--bg-primary)', color: 'var(--text-secondary)', fontSize: 11, lineHeight: 1.6 }}>
            当前目标：{selectedTargetLabel}。AI 自身联网能力：{defaultAISearchVerified ? '已验证，可直接复用' : '待验证'}。只有切换当前 AI 目标才需要重新验证；没有真实来源 URL 的回答会被拒绝。
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}><Button size="small" icon={<LinkOutlined />} loading={testingSearch} onClick={testSearchConnection}>测试搜索能力</Button></div>
      </div>

      {/* -------- Node-level Overrides -------- */}
      <div style={{
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border-color)',
        borderRadius: 12,
        padding: '18px 20px',
        marginBottom: 16,
      }}
      className="settings-subsection"
      >
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
          高级：节点级文本 AI 覆盖
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 16 }}>
          仅在整理或成稿需要不同模型时覆盖。留空字段会继承默认 AI；网页搜索和语音服务请使用上方专区。
        </div>

        {(['organize', 'draft'] as NodeOverrideStageId[]).map(stageId => (
          <NodeOverrideCard
            key={stageId}
            stageId={stageId}
            settings={settings}
            updateSettings={updateSettings}
          />
        ))}
      </div>
    </div>
  )
}
