import { useState, useCallback } from 'react'
import { Button, Input, Tooltip, message } from 'antd'
import {
  CheckOutlined,
  CloseCircleOutlined,
  LoadingOutlined,
  RightOutlined,
  LinkOutlined,
  SearchOutlined,
  FileTextOutlined,
  BulbOutlined,
  SafetyCertificateOutlined,
  SoundOutlined,
  LockOutlined,
  EyeInvisibleOutlined,
  EyeOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons'
import type {
  AppSettings,
  APIConnectionStatus,
  StageId,
  NodeCapabilityType,
  NodeOverrideMode,
  TextMode,
  CostQualityBalance,
} from '../types/settings'

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
  compliance: { label: '合规审查', icon: <SafetyCertificateOutlined />, color: '#f59e0b' },
  audio: { label: '语音生成', icon: <SoundOutlined />, color: '#ef4444' },
}

const STAGE_META: Record<StageId, { label: string; icon: string; desc: string; defaultCap: NodeCapabilityType }> = {
  discover: { label: '发现层', icon: '🔍', desc: '搜索与信息获取', defaultCap: 'search' },
  organize: { label: '整理层', icon: '📋', desc: '素材整理与分类', defaultCap: 'text' },
  ideate: { label: '构思层', icon: '💡', desc: '选题与结构构思', defaultCap: 'reasoning' },
  write: { label: '写作层', icon: '✍️', desc: '内容撰写与润色', defaultCap: 'text' },
  produce: { label: '声音制作层', icon: '🎙️', desc: 'AI 语音生成', defaultCap: 'audio' },
  publish: { label: '发布层', icon: '🚀', desc: '合规检查与发布', defaultCap: 'compliance' },
}

const GLOBAL_CAPS: { key: 'text' | 'search' | 'audio'; label: string; icon: React.ReactNode; desc: string }[] = [
  { key: 'text', label: '文本与推理能力', icon: <FileTextOutlined />, desc: '支持文本理解、深度推理、合规审查等' },
  { key: 'search', label: '信息获取能力', icon: <SearchOutlined />, desc: '支持新闻搜索、数据抓取、实时查询' },
  { key: 'audio', label: '音频生成能力', icon: <SoundOutlined />, desc: '支持 AI 语音合成、音色选择' },
]

// ============================================================
// Connection Status Badge
// ============================================================

function StatusBadge({ status }: { status: APIConnectionStatus }) {
  const configs: Record<APIConnectionStatus, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
    untested: { label: '未配置', color: 'var(--text-tertiary)', bg: 'var(--bg-tertiary)', icon: null },
    testing: { label: '检测中...', color: 'var(--accent-primary)', bg: 'var(--accent-light)', icon: <LoadingOutlined spin /> },
    connected: { label: '已连接', color: 'var(--success-color)', bg: 'var(--success-bg)', icon: <CheckOutlined /> },
    failed: { label: '连接失败', color: 'var(--error-color)', bg: 'var(--error-bg)', icon: <CloseCircleOutlined /> },
  }
  const c = configs[status]
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      fontSize: 11,
      fontWeight: 500,
      color: c.color,
      background: c.bg,
      padding: '2px 8px',
      borderRadius: 6,
    }}>
      {c.icon}
      {c.label}
    </span>
  )
}

// ============================================================
// API Key Input with masking
// ============================================================

function APIKeyInput({ value, onSave, status }: {
  value: string
  onSave: (key: string) => void
  status: APIConnectionStatus
}) {
  const [editing, setEditing] = useState(false)
  const [inputVal, setInputVal] = useState('')
  const [showKey, setShowKey] = useState(false)

  const handleSave = () => {
    if (inputVal.trim()) {
      onSave(inputVal.trim())
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
          padding: '8px 12px',
          borderRadius: 8,
          border: '1.5px dashed var(--border-color)',
          background: 'var(--bg-tertiary)',
          cursor: 'pointer',
          fontSize: 12,
          color: 'var(--text-tertiary)',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
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
        padding: '6px 12px',
        borderRadius: 8,
        border: '1px solid var(--border-color)',
        background: 'var(--bg-secondary)',
        fontSize: 12,
      }}>
        <LockOutlined style={{ color: 'var(--success-color)', fontSize: 11 }} />
        <span style={{ color: 'var(--text-secondary)', fontFamily: 'monospace', letterSpacing: 1 }}>
          {value}
        </span>
        <div style={{ flex: 1 }} />
        <StatusBadge status={status} />
        <Button
          size="small"
          type="text"
          onClick={() => { setEditing(true); setInputVal('') }}
          style={{ fontSize: 11, color: 'var(--text-tertiary)', height: 24 }}
        >
          更换
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
        onPressEnter={handleSave}
        style={{
          flex: 1,
          borderRadius: 8,
          fontSize: 12,
          fontFamily: 'monospace',
        }}
        suffix={
          <Tooltip title={showKey ? '隐藏' : '显示'}>
            <span
              onClick={() => setShowKey(!showKey)}
              style={{ cursor: 'pointer', color: 'var(--text-tertiary)' }}
            >
              {showKey ? <EyeOutlined /> : <EyeInvisibleOutlined />}
            </span>
          </Tooltip>
        }
      />
      <Button
        size="small"
        type="primary"
        onClick={handleSave}
        disabled={!inputVal.trim()}
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

// ============================================================
// Node Override Row (expandable card)
// ============================================================

function NodeOverrideCard({ stageId, settings, updateSettings }: {
  stageId: StageId
  settings: AppSettings
  updateSettings: Props['updateSettings']
}) {
  const [expanded, setExpanded] = useState(false)
  const meta = STAGE_META[stageId]
  const nodeConfig = settings.apiConfig.nodeOverrides[stageId]
  const capLabel = CAPABILITY_LABELS[nodeConfig.capabilityType]

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
    await new Promise(r => setTimeout(r, 1500))
    const success = Math.random() > 0.2
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
      message.error({ content: `${meta.label}连接失败，请检查密钥`, duration: 3, style: { marginTop: 60 } })
    }
  }, [stageId, meta.label, updateSettings])

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
        <span style={{ fontSize: 20 }}>{meta.icon}</span>
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

          {nodeConfig.overrideMode === 'global' && (
            <div style={{
              padding: '10px 14px',
              background: 'var(--bg-tertiary)',
              borderRadius: 8,
              fontSize: 11,
              color: 'var(--text-secondary)',
              lineHeight: 1.6,
            }}>
              <BulbOutlined style={{ color: 'var(--accent-primary)', marginRight: 6 }} />
              此节点使用全局默认能力配置。如需特殊调整，可切换为「自定义配置」。
            </div>
          )}

          {nodeConfig.overrideMode === 'custom' && (
            <div style={{ animation: 'settingsFadeIn 0.25s ease' }}>
              {/* Capability mode for this node */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 8 }}>能力模式</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {([
                    { key: 'standard' as TextMode, label: '标准', desc: '快速响应' },
                    { key: 'deep' as TextMode, label: '深度', desc: '更强分析' },
                    { key: 'quality' as TextMode, label: '高质量', desc: '最佳效果' },
                  ]).map(opt => (
                    <div
                      key={opt.key}
                      onClick={() => updateSettings('apiConfig', c => ({
                        ...c,
                        nodeOverrides: {
                          ...c.nodeOverrides,
                          [stageId]: { ...c.nodeOverrides[stageId], mode: opt.key },
                        },
                      }))}
                      style={{
                        flex: 1,
                        padding: '8px 10px',
                        borderRadius: 8,
                        border: `1.5px solid ${nodeConfig.mode === opt.key ? 'var(--accent-primary)' : 'var(--border-color)'}`,
                        background: nodeConfig.mode === opt.key ? 'var(--accent-light)' : 'transparent',
                        cursor: 'pointer',
                        textAlign: 'center',
                        transition: 'all 0.15s ease',
                      }}
                      className="settings-option-card"
                    >
                      <div style={{ fontSize: 12, fontWeight: 600, color: nodeConfig.mode === opt.key ? 'var(--accent-primary)' : 'var(--text-primary)' }}>
                        {opt.label}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{opt.desc}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Balance */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 8 }}>效率偏好</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {([
                    { key: 'cost' as CostQualityBalance, label: '效率优先' },
                    { key: 'balanced' as CostQualityBalance, label: '均衡' },
                    { key: 'quality' as CostQualityBalance, label: '质量优先' },
                  ]).map(opt => (
                    <div
                      key={opt.key}
                      onClick={() => updateSettings('apiConfig', c => ({
                        ...c,
                        nodeOverrides: {
                          ...c.nodeOverrides,
                          [stageId]: { ...c.nodeOverrides[stageId], balance: opt.key },
                        },
                      }))}
                      style={{
                        flex: 1,
                        padding: '8px 10px',
                        borderRadius: 8,
                        border: `1.5px solid ${nodeConfig.balance === opt.key ? 'var(--accent-primary)' : 'var(--border-color)'}`,
                        background: nodeConfig.balance === opt.key ? 'var(--accent-light)' : 'transparent',
                        cursor: 'pointer',
                        textAlign: 'center',
                        fontSize: 12,
                        fontWeight: 500,
                        color: nodeConfig.balance === opt.key ? 'var(--accent-primary)' : 'var(--text-primary)',
                        transition: 'all 0.15s ease',
                      }}
                      className="settings-option-card"
                    >
                      {opt.label}
                    </div>
                  ))}
                </div>
              </div>

              {/* API Key for this node */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 8 }}>
                  接入密钥（可选，留空则使用全局密钥）
                </div>
                <APIKeyInput
                  value={nodeConfig.apiKeyMasked}
                  status={nodeConfig.connectionStatus}
                  onSave={(key) => {
                    const masked = key.slice(0, 4) + '····' + key.slice(-4)
                    updateSettings('apiConfig', c => ({
                      ...c,
                      nodeOverrides: {
                        ...c.nodeOverrides,
                        [stageId]: { ...c.nodeOverrides[stageId], apiKeySet: true, apiKeyMasked: masked },
                      },
                    }))
                  }}
                />
              </div>

              {/* Test connection */}
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
                测试连接
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

// ============================================================
// Main Render
// ============================================================

export default function SettingsAPIConfig({ settings, updateSettings }: Props) {
  const handleTestGlobal = useCallback(async (capKey: 'text' | 'search' | 'audio') => {
    const statusKey = `${capKey}ConnectionStatus` as const
    updateSettings('apiConfig', c => ({
      ...c,
      global: { ...c.global, [statusKey]: 'testing' as const },
    }))
    await new Promise(r => setTimeout(r, 1500))
    const success = Math.random() > 0.2
    updateSettings('apiConfig', c => ({
      ...c,
      global: { ...c.global, [statusKey]: success ? 'connected' as const : 'failed' as const },
    }))
    if (success) {
      message.success({ content: '能力连接成功', duration: 2, style: { marginTop: 60 } })
    } else {
      message.error({ content: '连接失败，请检查密钥', duration: 3, style: { marginTop: 60 } })
    }
  }, [updateSettings])

  return (
    <div style={{ animation: 'settingsContentIn 0.3s ease' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <span style={{ fontSize: 16, color: 'var(--accent-primary)' }}><ThunderboltOutlined /></span>
          <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>AI 能力与接口配置</span>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-tertiary)', paddingLeft: 24 }}>
          配置系统各环节使用的 AI 能力来源，支持全局设置与节点级独立配置
        </div>
      </div>

      {/* -------- Global Default -------- */}
      <div style={{
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border-color)',
        borderRadius: 12,
        padding: '18px 20px',
        marginBottom: 20,
      }}
      className="settings-subsection"
      >
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
          全局默认能力
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 16 }}>
          在此设置各类能力的默认接入密钥，所有节点默认使用这些配置
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {GLOBAL_CAPS.map(cap => {
            const apiKeySetKey = `${cap.key}ApiKeySet` as keyof typeof settings.apiConfig.global
            const apiKeyMaskedKey = `${cap.key}ApiKeyMasked` as keyof typeof settings.apiConfig.global
            const statusKey = `${cap.key}ConnectionStatus` as keyof typeof settings.apiConfig.global
            const isSet = settings.apiConfig.global[apiKeySetKey] as boolean
            const masked = settings.apiConfig.global[apiKeyMaskedKey] as string
            const status = settings.apiConfig.global[statusKey] as APIConnectionStatus

            return (
              <div key={cap.key} style={{
                padding: '14px 16px',
                borderRadius: 10,
                border: '1px solid var(--border-color)',
                background: 'var(--bg-primary)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <span style={{ fontSize: 14, color: 'var(--accent-primary)' }}>{cap.icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{cap.label}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{cap.desc}</div>
                  </div>
                  <StatusBadge status={status} />
                </div>

                <APIKeyInput
                  value={masked}
                  status={status}
                  onSave={(key) => {
                    const m = key.slice(0, 4) + '····' + key.slice(-4)
                    updateSettings('apiConfig', c => ({
                      ...c,
                      global: {
                        ...c.global,
                        [apiKeySetKey]: true,
                        [apiKeyMaskedKey]: m,
                      },
                    }))
                  }}
                />

                {isSet && (
                  <div style={{ marginTop: 8 }}>
                    <Button
                      size="small"
                      icon={<LinkOutlined />}
                      loading={status === 'testing'}
                      onClick={() => handleTestGlobal(cap.key)}
                      style={{ fontSize: 11, height: 26, borderRadius: 6 }}
                    >
                      测试连接
                    </Button>
                  </div>
                )}

                {status === 'failed' && (
                  <div style={{
                    marginTop: 8,
                    padding: '8px 12px',
                    background: 'var(--error-bg)',
                    borderRadius: 8,
                    fontSize: 11,
                    color: 'var(--error-color)',
                    lineHeight: 1.5,
                  }}>
                    连接未成功，请检查密钥是否正确。如问题持续，请稍后重试。
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Security hint */}
        <div style={{
          marginTop: 14,
          padding: '10px 14px',
          background: 'var(--accent-light)',
          borderRadius: 8,
          fontSize: 11,
          color: 'var(--text-secondary)',
          lineHeight: 1.6,
          display: 'flex',
          alignItems: 'flex-start',
          gap: 6,
        }}>
          <LockOutlined style={{ color: 'var(--accent-primary)', marginTop: 2 }} />
          <span>所有密钥均加密存储在本地，不会上传至任何服务器。你可以随时更换或删除。</span>
        </div>
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
          节点级能力配置
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 16 }}>
          为各创作环节单独设置 AI 能力来源。默认跟随全局配置，可按需自定义。
        </div>

        {(Object.keys(STAGE_META) as StageId[]).map(stageId => (
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
