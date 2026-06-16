import { useState, useCallback, useEffect, useMemo } from 'react'
import { Button, Tooltip, message, Modal } from 'antd'
import {
  CloseOutlined,
  CheckCircleOutlined,
  RocketOutlined,
  ThunderboltOutlined,
  LinkOutlined,
  ReloadOutlined,
  DownloadOutlined,
  HistoryOutlined,
  RightOutlined,
  CheckOutlined,
  ForwardOutlined,
  ExclamationCircleOutlined,
  ClockCircleOutlined,
  SoundOutlined,
} from '@ant-design/icons'
import { AGENTS } from '../constants'
import { formatDuration } from '../utils'
import type { Workflow } from '../types/workflow'
import {
  DEFAULT_PLATFORMS,
  type AgentSuggestion,
  type PlatformStatus,
  type PublishRecord,
} from '../mocks'

type PublishPhase =
  | 'choose'
  | 'smart_step1'
  | 'smart_step2'
  | 'smart_step3'
  | 'ready'
  | 'publishing'
  | 'success'

type StepStatus = 'pending' | 'accepted' | 'skipped'

interface Props {
  visible: boolean
  onClose: () => void
  workflow?: Workflow | null
  episodeTitle?: string
  episodeDesc?: string
  episodeDuration?: number
  onRunNodes?: (nodes: string[]) => Promise<void> | void
  onOpenPath?: (targetPath: string) => Promise<{ success: boolean; error?: string }>
  onShowItemInFolder?: (targetPath: string) => Promise<{ success: boolean; error?: string }>
}


/** Small agent avatar */
function AgentAvatar({ agent, size = 32 }: { agent: typeof AGENTS[number]; size?: number }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: size * 0.3,
      background: agent.gradient,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.5, flexShrink: 0,
      boxShadow: `0 2px 8px ${agent.color}30`,
    }}>
      {agent.icon}
    </div>
  )
}

/** Platform status badge */
function PlatformBadge({ platform, compact }: { platform: PlatformStatus; compact?: boolean }) {
  const statusConfig = {
    success: { color: '#10b981', bg: '#ecfdf5', label: '已上线', icon: <CheckOutlined style={{ fontSize: 9 }} /> },
    processing: { color: '#f59e0b', bg: '#fffbeb', label: '处理中', icon: <ClockCircleOutlined style={{ fontSize: 9 }} /> },
    failed: { color: '#ef4444', bg: '#fef2f2', label: '失败', icon: <ExclamationCircleOutlined style={{ fontSize: 9 }} /> },
    unconfigured: { color: '#6b7280', bg: '#f3f4f6', label: '未配置', icon: <ExclamationCircleOutlined style={{ fontSize: 9 }} /> },
  }
  const cfg = statusConfig[platform.status]

  if (compact) {
    return (
      <Tooltip title={`${platform.name}：${cfg.label}`}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 3,
          padding: '2px 6px', borderRadius: 6,
          background: cfg.bg, fontSize: 10, color: cfg.color,
          fontWeight: 500, cursor: platform.url ? 'pointer' : 'default',
        }}
          onClick={() => { if (platform.url) window.open(platform.url, '_blank') }}
        >
          <span>{platform.icon}</span>
          {cfg.icon}
        </span>
      </Tooltip>
    )
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '10px 14px', borderRadius: 10,
      border: '1px solid var(--border-color)',
      background: 'var(--bg-secondary)',
      transition: 'all 0.2s ease',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 18 }}>{platform.icon}</span>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
            {platform.name}
          </div>
          <div style={{ fontSize: 11, color: cfg.color, display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
            {cfg.icon}
            <span>{cfg.label}</span>
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 4 }}>
        {platform.status === 'success' && platform.url && (
          <Tooltip title="在平台中查看">
            <Button type="text" size="small" icon={<LinkOutlined />}
              onClick={() => window.open(platform.url, '_blank')}
              style={{ color: 'var(--accent-primary)', fontSize: 13 }}
            />
          </Tooltip>
        )}
        {platform.status === 'failed' && (
          <Tooltip title="重试">
            <Button type="text" size="small" icon={<ReloadOutlined />}
              onClick={() => message.info({ content: `正在重试 ${platform.name}…`, duration: 1.5, style: { marginTop: 60 } })}
              style={{ color: '#ef4444', fontSize: 13 }}
            />
          </Tooltip>
        )}
      </div>
    </div>
  )
}

/** A single suggestion card inside an agent step */
function SuggestionCard({
  suggestion,
  agentColor,
  agentLightBg,
}: {
  suggestion: AgentSuggestion
  agentColor: string
  agentLightBg: string
}) {
  return (
    <div style={{
      padding: '14px 16px', borderRadius: 12,
      border: '1px solid var(--border-color)',
      background: 'var(--bg-secondary)',
      marginBottom: 10,
      animation: 'publishSuggestionIn 0.35s ease-out',
    }}>
      <div style={{
        fontSize: 13, fontWeight: 600, color: 'var(--text-primary)',
        marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <span style={{
          width: 6, height: 6, borderRadius: '50%',
          background: agentColor, flexShrink: 0,
        }} />
        {suggestion.title}
      </div>
      <div style={{
        fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7,
        marginBottom: suggestion.before ? 12 : 0,
      }}>
        {suggestion.description}
      </div>

      {suggestion.before && suggestion.after && (
        <div style={{
          display: 'flex', gap: 10, marginTop: 4,
        }}>
          {/* Before */}
          <div style={{
            flex: 1, padding: '10px 12px', borderRadius: 8,
            background: 'var(--bg-tertiary)',
            border: '1px solid var(--border-color)',
          }}>
            <div style={{
              fontSize: 10, fontWeight: 600, color: 'var(--text-tertiary)',
              marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5,
            }}>
              当前
            </div>
            <div style={{
              fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6,
              textDecoration: 'line-through', opacity: 0.6,
            }}>
              {suggestion.before}
            </div>
          </div>
          {/* After */}
          <div style={{
            flex: 1, padding: '10px 12px', borderRadius: 8,
            background: agentLightBg,
            border: `1px solid ${agentColor}25`,
          }}>
            <div style={{
              fontSize: 10, fontWeight: 600, color: agentColor,
              marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5,
            }}>
              建议
            </div>
            <div style={{
              fontSize: 12, color: 'var(--text-primary)', lineHeight: 1.6,
              fontWeight: 500,
            }}>
              {suggestion.after}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================================
// Main Component
// ============================================================

export default function PublishLayer({
  visible,
  onClose,
  workflow,
  episodeTitle = '',
  episodeDesc = '',
  episodeDuration = 920,
  onRunNodes,
  onOpenPath,
  onShowItemInFolder,
}: Props) {
  // ── Core state ──────────────────────────────────────────
  const [phase, setPhase] = useState<PublishPhase>('choose')
  const [quickConfirmVisible, setQuickConfirmVisible] = useState(false)
  const [publishProgress, setPublishProgress] = useState(0)

  // Smart publish step statuses
  const [step1Status, setStep1Status] = useState<StepStatus>('pending')
  const [step2Status, setStep2Status] = useState<StepStatus>('pending')
  const [step3Status, setStep3Status] = useState<StepStatus>('pending')

  // Platform statuses (for current publish)
  const [currentPlatforms, setCurrentPlatforms] = useState<PlatformStatus[]>([])

  // History
  const [historyExpanded, setHistoryExpanded] = useState(false)
  const finalAudioPath = workflow?.state?.final_audio_path || ''
  const rssPath = workflow?.state?.rss_path || ''
  const publishDir = workflow?.state?.storage_info?.base_dir || ''
  const reviewSummary = workflow?.state?.review_summary || {}
  const reviewChecks = Array.isArray(reviewSummary.checks) ? reviewSummary.checks : []
  const scriptTitle = workflow?.state?.script?.title || episodeTitle || '未命名节目'
  const scriptDesc = workflow?.state?.script?.description || episodeDesc || ''
  const stageCount = Array.isArray(workflow?.state?.stages) ? workflow.state.stages.length : 0

  const contentSuggestions = useMemo<AgentSuggestion[]>(() => [
    {
      id: 'content-title',
      title: workflow?.state?.script?.title ? '节目标题已写入脚本' : '缺少节目标题',
      description: workflow?.state?.script?.title
        ? `当前标题：${scriptTitle}`
        : '发布前请在写作层保存标题，否则 RSS 会使用默认标题。',
    },
    {
      id: 'content-script',
      title: stageCount > 0 ? `脚本段落已就绪：${stageCount} 段` : '缺少脚本段落',
      description: stageCount > 0
        ? `发布将使用 workflow.state.stages 中的 ${stageCount} 个真实段落。简介：${scriptDesc || '未填写'}`
        : '请先在写作层保存脚本段落，或通过工作流生成 stages。',
    },
  ], [scriptDesc, scriptTitle, stageCount, workflow?.state?.script?.title])

  const distributionSuggestions = useMemo<AgentSuggestion[]>(() => [
    {
      id: 'distribution-audio',
      title: finalAudioPath ? '成品音频已生成' : '尚未生成成品音频',
      description: finalAudioPath
        ? `音频路径：${finalAudioPath}`
        : '发布节点需要 final_audio_path，请先在声音工作台完成音频生成。',
    },
    {
      id: 'distribution-platforms',
      title: '多平台发布未配置凭据',
      description: '当前只执行真实本地导出与 RSS 生成；Apple Podcasts、Spotify、小宇宙、喜马拉雅会显示为未配置，不会标记成功。',
    },
  ], [finalAudioPath])

  const riskSuggestions = useMemo<AgentSuggestion[]>(() => {
    if (!reviewChecks.length) {
      return [{
        id: 'risk-review-pending',
        title: '尚未运行发布前检查',
        description: '点击发布时会先执行 review 节点，并用 review_summary 作为发布前检查来源。',
      }]
    }

    return reviewChecks.map((check: any, index: number) => ({
      id: `risk-${index}`,
      title: check.level === 'pass' ? '检查通过' : check.level === 'warning' ? '检查警告' : '检查失败',
      description: String(check.message || ''),
    }))
  }, [reviewChecks])

  const publishHistory = useMemo<PublishRecord[]>(() => {
    const publishStatus = workflow?.state?.publish_status
    if (!publishStatus?.rss_generated && !rssPath && !publishDir) return []

    const publishedAt = publishStatus?.published_at
      ? new Date(publishStatus.published_at).toLocaleString('zh-CN', { hour12: false })
      : new Date().toLocaleString('zh-CN', { hour12: false })

    return [{
      id: workflow?.id || workflow?.state?.episode_id || 'current',
      title: scriptTitle,
      publishedAt,
      method: 'smart',
      suggestionsAccepted: [step1Status, step2Status, step3Status].filter(status => status === 'accepted').length,
      suggestionsTotal: 3,
      platforms: [
        { id: 'local', name: '本地目录', icon: '📁', status: publishDir ? 'success' : 'failed', url: publishDir || undefined },
        { id: 'rss', name: 'RSS', icon: '🔗', status: rssPath ? 'success' : 'failed', url: rssPath || undefined },
        ...DEFAULT_PLATFORMS.map(platform => ({ ...platform, status: 'unconfigured' as const })),
      ],
    }]
  }, [
    publishDir,
    rssPath,
    scriptTitle,
    step1Status,
    step2Status,
    step3Status,
    workflow?.id,
    workflow?.state?.episode_id,
    workflow?.state?.publish_status,
  ])

  // ── Computed ─────────────────────────────────────────────
  // ── Step progression ────────────────────────────────────
  const handleStep1Accept = useCallback(() => {
    setStep1Status('accepted')
    setTimeout(() => setPhase('smart_step2'), 400)
  }, [])

  const handleStep1Skip = useCallback(() => {
    setStep1Status('skipped')
    setTimeout(() => setPhase('smart_step2'), 300)
  }, [])

  const handleStep2Accept = useCallback(() => {
    setStep2Status('accepted')
    setTimeout(() => setPhase('smart_step3'), 400)
  }, [])

  const handleStep2Skip = useCallback(() => {
    setStep2Status('skipped')
    setTimeout(() => setPhase('smart_step3'), 300)
  }, [])

  const handleStep3Accept = useCallback(() => {
    setStep3Status('accepted')
    setTimeout(() => setPhase('ready'), 400)
  }, [])

  const handleStep3Skip = useCallback(() => {
    setStep3Status('skipped')
    setTimeout(() => setPhase('ready'), 300)
  }, [])

  // ── Publish action ──────────────────────────────────────
  const doPublish = useCallback(async (method: 'smart' | 'quick') => {
    if (!onRunNodes) {
      message.error({ content: '当前环境没有节点执行接口', duration: 2, style: { marginTop: 60 } })
      return
    }
    if (!workflow?.state?.final_audio_path) {
      message.warning({ content: '请先在声音工作台生成成品音频', duration: 2, style: { marginTop: 60 } })
      return
    }

    void method
    setPhase('publishing')
    setPublishProgress(0)
    setQuickConfirmVisible(false)

    try {
      setPublishProgress(35)
      await onRunNodes(['review', 'publish'])
      setPublishProgress(100)
      setCurrentPlatforms(DEFAULT_PLATFORMS.map(p => ({ ...p, status: 'unconfigured' as const })))
      setPhase('success')
      message.success({ content: '发布检查与本地/RSS 导出完成', duration: 2, style: { marginTop: 60 } })
    } catch (error: any) {
      setPhase('ready')
      message.error({ content: `发布失败：${error?.message || String(error)}`, duration: 2.5, style: { marginTop: 60 } })
    }
  }, [onRunNodes, workflow?.state?.final_audio_path])

  // ── Reset on visibility ─────────────────────────────────
  useEffect(() => {
    if (visible) {
      setPhase('choose')
      setStep1Status('pending')
      setStep2Status('pending')
      setStep3Status('pending')
      setPublishProgress(0)
      setCurrentPlatforms([])
      setQuickConfirmVisible(false)
    }
  }, [visible])

  if (!visible) return null

  // ============================================================
  // Render: Step indicator (left sidebar)
  // ============================================================
  const renderStepIndicator = () => {
    const steps = [
      { key: 'step1', label: '内容优化', agent: AGENTS[0], status: step1Status, phase: 'smart_step1' },
      { key: 'step2', label: '传播策略', agent: AGENTS[1], status: step2Status, phase: 'smart_step2' },
      { key: 'step3', label: '风险检查', agent: AGENTS[2], status: step3Status, phase: 'smart_step3' },
    ]

    const isSmartFlow = phase.startsWith('smart_') || phase === 'ready'

    return (
      <div style={{
        padding: '16px 16px 12px', borderBottom: '1px solid var(--border-color)',
      }}>
        <div style={{
          fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)',
          textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12,
        }}>
          智能审查进度
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {steps.map((step, i) => {
            const isCurrent = phase === step.phase
            const isDone = step.status !== 'pending'
            const isActive = isSmartFlow && (isCurrent || isDone)

            return (
              <div key={step.key} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 10px', borderRadius: 10,
                background: isCurrent ? step.agent.lightBg : 'transparent',
                border: isCurrent ? `1px solid ${step.agent.color}20` : '1px solid transparent',
                transition: 'all 0.3s ease',
                opacity: isActive || phase === 'choose' ? 1 : 0.4,
              }}>
                {/* Step number / status */}
                <div style={{
                  width: 24, height: 24, borderRadius: 8,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 600, flexShrink: 0,
                  background: isDone
                    ? step.status === 'accepted' ? step.agent.color : 'var(--bg-tertiary)'
                    : isCurrent ? step.agent.lightBg : 'var(--bg-tertiary)',
                  color: isDone
                    ? step.status === 'accepted' ? '#fff' : 'var(--text-tertiary)'
                    : isCurrent ? step.agent.color : 'var(--text-tertiary)',
                  border: isCurrent && !isDone ? `1.5px solid ${step.agent.color}` : 'none',
                  transition: 'all 0.3s ease',
                }}>
                  {isDone
                    ? step.status === 'accepted' ? <CheckOutlined style={{ fontSize: 10 }} /> : <ForwardOutlined style={{ fontSize: 10 }} />
                    : i + 1
                  }
                </div>

                {/* Label */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 12, fontWeight: isCurrent ? 600 : 500,
                    color: isCurrent ? step.agent.color : isDone ? 'var(--text-primary)' : 'var(--text-secondary)',
                    transition: 'color 0.3s ease',
                  }}>
                    {step.label}
                  </div>
                  {isDone && (
                    <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 1 }}>
                      {step.status === 'accepted' ? '已采纳' : '已跳过'}
                    </div>
                  )}
                </div>

                {/* Agent emoji */}
                <span style={{ fontSize: 14, opacity: isActive ? 1 : 0.3 }}>
                  {step.agent.icon}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // ============================================================
  // Render: Episode preview card
  // ============================================================
  const renderEpisodePreview = () => (
    <div style={{
      padding: '16px', borderBottom: '1px solid var(--border-color)',
    }}>
      {/* Cover visual */}
      <div style={{
        width: '100%', aspectRatio: '16/9', borderRadius: 12,
        background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 40%, #4c1d95 100%)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: 14, position: 'relative', overflow: 'hidden',
      }}>
        {/* Decorative elements */}
        <div style={{
          position: 'absolute', top: -20, right: -20,
          width: 80, height: 80, borderRadius: '50%',
          background: 'rgba(255,255,255,0.05)',
        }} />
        <div style={{
          position: 'absolute', bottom: -10, left: -10,
          width: 60, height: 60, borderRadius: '50%',
          background: 'rgba(255,255,255,0.03)',
        }} />
        <div style={{ textAlign: 'center', zIndex: 1 }}>
          <div style={{ fontSize: 32, marginBottom: 6 }}>🎙️</div>
          <div style={{
            fontSize: 11, color: 'rgba(255,255,255,0.7)',
            fontWeight: 500, letterSpacing: 0.5,
          }}>
            EPISODE READY
          </div>
        </div>
      </div>

      {/* Episode info */}
      <div style={{
        fontSize: 15, fontWeight: 700, color: 'var(--text-primary)',
        lineHeight: 1.4, marginBottom: 6,
      }}>
        {episodeTitle || '未命名节目'}
      </div>
      {episodeDesc && (
        <div style={{
          fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6,
          marginBottom: 10,
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}>
          {episodeDesc}
        </div>
      )}

      {/* Stats */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {[
          { icon: <ClockCircleOutlined />, label: formatDuration(episodeDuration) },
          { icon: <SoundOutlined />, label: '音频就绪' },
        ].map((stat, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 5,
            fontSize: 11, color: 'var(--text-tertiary)',
          }}>
            <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{stat.icon}</span>
            {stat.label}
          </div>
        ))}
      </div>
    </div>
  )

  // ============================================================
  // Render: Publish history
  // ============================================================
  const renderHistory = () => (
    <div style={{ padding: '12px 16px', flex: 1, overflow: 'auto' }}>
      <button
        onClick={() => setHistoryExpanded(!historyExpanded)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          width: '100%', background: 'none', border: 'none', cursor: 'pointer',
          padding: '4px 0', marginBottom: 8,
        }}
      >
        <span style={{
          fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)',
          textTransform: 'uppercase', letterSpacing: 0.5,
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <HistoryOutlined style={{ fontSize: 11 }} />
          发布记录
          <span style={{
            background: 'var(--bg-tertiary)', borderRadius: 4,
            padding: '0 5px', fontSize: 10,
          }}>
            {publishHistory.length}
          </span>
        </span>
        <RightOutlined style={{
          fontSize: 9, color: 'var(--text-tertiary)',
          transform: historyExpanded ? 'rotate(90deg)' : 'none',
          transition: 'transform 0.2s ease',
        }} />
      </button>

      {historyExpanded && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, animation: 'fadeIn 0.2s ease' }}>
          {publishHistory.length === 0 && (
            <div style={{
              padding: '10px 12px',
              borderRadius: 10,
              border: '1px solid var(--border-color)',
              background: 'var(--bg-primary)',
              fontSize: 11,
              color: 'var(--text-tertiary)',
              lineHeight: 1.6,
            }}>
              暂无本地发布记录。完成一次本地/RSS 导出后会显示在这里。
            </div>
          )}
          {publishHistory.map(record => (
            <div key={record.id} style={{
              padding: '10px 12px', borderRadius: 10,
              border: '1px solid var(--border-color)',
              background: 'var(--bg-primary)',
              transition: 'all 0.2s ease',
            }}>
              <div style={{
                fontSize: 12, fontWeight: 600, color: 'var(--text-primary)',
                marginBottom: 4, lineHeight: 1.4,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {record.title}
              </div>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6,
                fontSize: 10, color: 'var(--text-tertiary)', marginBottom: 6,
              }}>
                <span>{record.publishedAt}</span>
                <span>·</span>
                <span style={{
                  padding: '0 5px', borderRadius: 4,
                  background: record.method === 'smart' ? '#eff6ff' : 'var(--bg-tertiary)',
                  color: record.method === 'smart' ? '#2563eb' : 'var(--text-tertiary)',
                  fontWeight: 500,
                }}>
                  {record.method === 'smart' ? '智能' : '快速'}
                </span>
                {record.method === 'smart' && (
                  <>
                    <span>·</span>
                    <span>采纳 {record.suggestionsAccepted}/{record.suggestionsTotal}</span>
                  </>
                )}
              </div>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {record.platforms.map(p => (
                  <PlatformBadge key={p.id} platform={p} compact />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {!historyExpanded && publishHistory.length > 0 && (
        <div style={{
          fontSize: 11, color: 'var(--text-tertiary)', lineHeight: 1.6,
          padding: '4px 0',
        }}>
          最近：{publishHistory[0].title}
        </div>
      )}
    </div>
  )

  // ============================================================
  // Render: Choose phase (dual-track entry)
  // ============================================================
  const renderChoosePhase = () => (
    <div style={{
      flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 40,
    }}>
      <div style={{ maxWidth: 720, width: '100%' }}>
        {/* Hero text */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>🚀</div>
          <div style={{
            fontSize: 22, fontWeight: 700, color: 'var(--text-primary)',
            marginBottom: 8,
          }}>
            准备好发布了
          </div>
          <div style={{
            fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6,
          }}>
            你的节目已经制作完成。选择发布方式，让世界听到你的声音。
          </div>
        </div>

        {/* Two path cards */}
        <div style={{ display: 'flex', gap: 20 }}>
          {/* Smart Publish Card */}
          <div
            className="publish-path-card"
            onClick={() => {
              setPhase('smart_step1')
            }}
            style={{
              flex: 1, padding: '28px 24px', borderRadius: 16,
              border: '2px solid var(--accent-primary)',
              background: 'var(--bg-secondary)',
              cursor: 'pointer',
              transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
              boxShadow: '0 4px 20px rgba(37, 99, 235, 0.1)',
              animation: 'publishCardIn 0.5s ease-out',
            }}
          >
            <div style={{
              width: 48, height: 48, borderRadius: 14,
              background: 'linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 22, marginBottom: 16,
              boxShadow: '0 4px 12px rgba(37, 99, 235, 0.2)',
            }}>
              🧭
            </div>
            <div style={{
              fontSize: 18, fontWeight: 700, color: 'var(--text-primary)',
              marginBottom: 8,
            }}>
              智能发布
            </div>
            <div style={{
              fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7,
              marginBottom: 20,
            }}>
              智能编辑团队帮你优化标题、分析传播策略、检查风险。
              <br />每一步都可以跳过，最终决定权在你。
            </div>

            {/* Agent row */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
              {AGENTS.map(agent => (
                <div key={agent.key} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <AgentAvatar agent={agent} size={24} />
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 500 }}>
                    {agent.name}
                  </span>
                </div>
              ))}
            </div>

            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              fontSize: 13, fontWeight: 600, color: 'var(--accent-primary)',
            }}>
              开始智能审查
              <RightOutlined style={{ fontSize: 11 }} />
            </div>

            {/* Recommended badge */}
            <div style={{
              position: 'absolute' as any, top: -1, right: 20,
              background: 'var(--accent-primary)', color: '#fff',
              fontSize: 10, fontWeight: 600,
              padding: '3px 10px', borderRadius: '0 0 8px 8px',
              letterSpacing: 0.3,
            }}>
              推荐
            </div>
          </div>

          {/* Quick Publish Card */}
          <div
            className="publish-path-card"
            onClick={() => setQuickConfirmVisible(true)}
            style={{
              flex: 1, padding: '28px 24px', borderRadius: 16,
              border: '1.5px solid var(--border-color)',
              background: 'var(--bg-secondary)',
              cursor: 'pointer',
              transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
              animation: 'publishCardIn 0.5s ease-out 0.1s both',
            }}
          >
            <div style={{
              width: 48, height: 48, borderRadius: 14,
              background: 'var(--bg-tertiary)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 22, marginBottom: 16,
            }}>
              ⚡
            </div>
            <div style={{
              fontSize: 18, fontWeight: 700, color: 'var(--text-primary)',
              marginBottom: 8,
            }}>
              快速发布
            </div>
            <div style={{
              fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7,
              marginBottom: 20,
            }}>
              跳过所有检查项确认，直接执行本地导出与 RSS 生成。
              <br />未配置凭据的平台仍会保持未配置状态。
            </div>

            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)',
            }}>
              直接发布
              <ThunderboltOutlined style={{ fontSize: 12 }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )

  // ============================================================
  // Render: Smart publish step (generic)
  // ============================================================
  const renderSmartStep = (
    stepNum: number,
    agent: typeof AGENTS[number],
    suggestions: AgentSuggestion[],
    onAccept: () => void,
    onSkip: () => void,
  ) => (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      overflow: 'auto', padding: '32px 40px',
    }}>
      <div style={{ maxWidth: 640, width: '100%', margin: '0 auto' }}>
        {/* Agent header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 14,
          marginBottom: 8,
          animation: 'publishAgentIn 0.4s ease-out',
        }}>
          <AgentAvatar agent={agent} size={44} />
          <div>
            <div style={{
              fontSize: 18, fontWeight: 700, color: 'var(--text-primary)',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              {agent.name}
              <span style={{
                fontSize: 10, fontWeight: 500, color: agent.color,
                background: agent.lightBg, padding: '2px 8px', borderRadius: 6,
              }}>
                步骤 {stepNum}/3
              </span>
            </div>
            <div style={{
              fontSize: 13, color: 'var(--text-secondary)', marginTop: 3,
            }}>
              {agent.role}
            </div>
          </div>
        </div>

        {/* Divider */}
        <div style={{
          height: 1, background: 'var(--border-color)',
          margin: '20px 0 24px',
        }} />

        {/* Suggestions */}
        <div style={{ marginBottom: 28 }}>
          <div style={{
            fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)',
            marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6,
          }}>
            {agent.icon} 当前检查项
          </div>
          {suggestions.map(s => (
            <SuggestionCard
              key={s.id}
              suggestion={s}
              agentColor={agent.color}
              agentLightBg={agent.lightBg}
            />
          ))}
        </div>

        {/* Action buttons */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '20px 0', borderTop: '1px solid var(--border-color)',
          animation: 'publishActionsIn 0.4s ease-out 0.2s both',
        }}>
          <Button
            type="primary"
            icon={<CheckCircleOutlined />}
            onClick={onAccept}
            size="large"
            style={{
              background: agent.color,
              borderColor: agent.color,
              borderRadius: 10, fontWeight: 600, fontSize: 14,
              height: 44, paddingLeft: 20, paddingRight: 20,
              boxShadow: `0 4px 12px ${agent.color}25`,
            }}
          >
            采纳建议
          </Button>
          <Button
            onClick={onSkip}
            size="large"
            style={{
              borderRadius: 10, fontWeight: 500, fontSize: 14,
              height: 44, color: 'var(--text-secondary)',
              borderColor: 'var(--border-color)',
            }}
          >
            跳过这一步
          </Button>
          <div style={{ flex: 1 }} />
          <span style={{
            fontSize: 11, color: 'var(--text-tertiary)',
          }}>
            跳过不会影响发布
          </span>
        </div>
      </div>
    </div>
  )

  // ============================================================
  // Render: Ready to publish
  // ============================================================
  const renderReadyPhase = () => {
    const summary = [
      { agent: AGENTS[0], status: step1Status },
      { agent: AGENTS[1], status: step2Status },
      { agent: AGENTS[2], status: step3Status },
    ]

    return (
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 40,
      }}>
        <div style={{
          maxWidth: 520, width: '100%', textAlign: 'center',
          animation: 'publishReadyIn 0.5s ease-out',
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
          <div style={{
            fontSize: 22, fontWeight: 700, color: 'var(--text-primary)',
            marginBottom: 8,
          }}>
            审查完成，准备发布
          </div>
          <div style={{
            fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6,
            marginBottom: 32,
          }}>
            所有审查步骤已完成。确认无误后，点击发布。
          </div>

          {/* Summary */}
          <div style={{
            display: 'flex', gap: 12, marginBottom: 32,
            justifyContent: 'center',
          }}>
            {summary.map(({ agent, status }) => (
              <div key={agent.key} style={{
                padding: '12px 16px', borderRadius: 12,
                border: '1px solid var(--border-color)',
                background: 'var(--bg-secondary)',
                display: 'flex', alignItems: 'center', gap: 8,
                minWidth: 140,
              }}>
                <AgentAvatar agent={agent} size={28} />
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
                    {agent.name}
                  </div>
                  <div style={{
                    fontSize: 11,
                    color: status === 'accepted' ? agent.color : 'var(--text-tertiary)',
                    fontWeight: 500,
                  }}>
                    {status === 'accepted' ? '已采纳' : '已跳过'}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Publish button */}
          <Button
            type="primary"
            icon={<RocketOutlined />}
            size="large"
            onClick={() => doPublish('smart')}
            className="publish-main-btn"
            style={{
              background: 'linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)',
              borderColor: 'transparent',
              borderRadius: 12, fontWeight: 700, fontSize: 16,
              height: 52, paddingLeft: 32, paddingRight: 32,
              boxShadow: '0 4px 20px rgba(37, 99, 235, 0.3)',
            }}
          >
            发布到所有平台
          </Button>
        </div>
      </div>
    )
  }

  // ============================================================
  // Render: Publishing progress
  // ============================================================
  const renderPublishingPhase = () => (
    <div style={{
      flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 40,
    }}>
      <div style={{
        maxWidth: 480, width: '100%', textAlign: 'center',
        animation: 'publishProgressIn 0.5s ease-out',
      }}>
        {/* Animated icon */}
        <div style={{
          width: 80, height: 80, borderRadius: 20,
          background: 'linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 24px',
          fontSize: 36,
          animation: 'publishingPulse 2s ease-in-out infinite',
          boxShadow: '0 8px 30px rgba(37, 99, 235, 0.25)',
        }}>
          🚀
        </div>

        <div style={{
          fontSize: 20, fontWeight: 700, color: 'var(--text-primary)',
          marginBottom: 8,
        }}>
          正在发布…
        </div>
        <div style={{
          fontSize: 13, color: 'var(--text-secondary)', marginBottom: 32,
        }}>
          正在将节目推送到各平台，请稍候
        </div>

        {/* Progress bar */}
        <div style={{
          width: '100%', height: 6, borderRadius: 3,
          background: 'var(--bg-tertiary)',
          overflow: 'hidden', marginBottom: 12,
        }}>
          <div style={{
            height: '100%', borderRadius: 3,
            background: 'linear-gradient(90deg, #2563eb, #7c3aed)',
            width: `${publishProgress}%`,
            transition: 'width 0.4s ease',
          }} />
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-tertiary)', fontFamily: 'monospace' }}>
          {Math.round(publishProgress)}%
        </div>
      </div>
    </div>
  )

  // ============================================================
  // Render: Success
  // ============================================================
  const renderSuccessPhase = () => (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      overflow: 'auto', padding: '32px 40px',
    }}>
      <div style={{
        maxWidth: 600, width: '100%', margin: '0 auto',
        animation: 'publishSuccessIn 0.6s cubic-bezier(0.16, 1, 0.3, 1)',
      }}>
        {/* Celebration header */}
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <div style={{
            fontSize: 56, marginBottom: 16,
            animation: 'publishCelebrate 0.6s ease-out 0.2s both',
          }}>
            🎉
          </div>
          <div style={{
            fontSize: 24, fontWeight: 700, color: 'var(--text-primary)',
            marginBottom: 8,
          }}>
            本地发布完成
          </div>
          <div style={{
            fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6,
          }}>
            「{episodeTitle || '未命名节目'}」已导出到本地发布目录，并生成 RSS 文件。
          </div>
        </div>

        <div style={{
          marginBottom: 28,
          padding: 16,
          borderRadius: 12,
          border: '1px solid var(--border-color)',
          background: 'var(--bg-secondary)',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>本地产物</div>
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', wordBreak: 'break-all' }}>音频：{finalAudioPath || '未生成'}</div>
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', wordBreak: 'break-all' }}>RSS：{rssPath || '未生成'}</div>
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', wordBreak: 'break-all' }}>目录：{publishDir || '未生成'}</div>
        </div>

        {/* Platform statuses */}
        <div style={{ marginBottom: 28 }}>
          <div style={{
            fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)',
            marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6,
          }}>
            📡 平台状态
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {currentPlatforms.map(p => (
              <PlatformBadge key={p.id} platform={p} />
            ))}
          </div>
        </div>

        {/* Actions */}
        <div style={{
          display: 'flex', gap: 10, justifyContent: 'center',
          padding: '20px 0', borderTop: '1px solid var(--border-color)',
        }}>
          <Button
            icon={<DownloadOutlined />}
            onClick={async () => {
              if (!finalAudioPath) {
                message.warning({ content: '还没有成品音频', duration: 2, style: { marginTop: 60 } })
                return
              }
              const result = await onShowItemInFolder?.(finalAudioPath)
              if (!result?.success) message.error({ content: result?.error || '定位音频失败', duration: 2, style: { marginTop: 60 } })
            }}
            style={{
              borderRadius: 10, fontWeight: 500, fontSize: 13,
              height: 40, borderColor: 'var(--border-color)',
              color: 'var(--text-secondary)',
            }}
          >
            下载音频
          </Button>
          <Button
            icon={<LinkOutlined />}
            onClick={async () => {
              const target = rssPath || publishDir
              if (!target) {
                message.warning({ content: '还没有发布产物', duration: 2, style: { marginTop: 60 } })
                return
              }
              const result = await onOpenPath?.(target)
              if (!result?.success) message.error({ content: result?.error || '打开发布产物失败', duration: 2, style: { marginTop: 60 } })
            }}
            style={{
              borderRadius: 10, fontWeight: 500, fontSize: 13,
              height: 40, borderColor: 'var(--border-color)',
              color: 'var(--text-secondary)',
            }}
          >
            打开 RSS
          </Button>
          <Button
            type="primary"
            onClick={onClose}
            style={{
              borderRadius: 10, fontWeight: 600, fontSize: 13,
              height: 40, background: 'var(--accent-primary)',
              borderColor: 'var(--accent-primary)',
            }}
          >
            完成，返回工作台
          </Button>
        </div>

        {/* Encouragement */}
        <div style={{
          textAlign: 'center', padding: '24px 0 12px',
        }}>
          <div style={{
            fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.6,
            fontStyle: 'italic',
          }}>
            每一期节目，都是你和世界的一次对话。
          </div>
        </div>
      </div>
    </div>
  )

  // ============================================================
  // Render: Main layout
  // ============================================================
  return (
    <div style={{
      position: 'fixed', top: 52, right: 0, bottom: 0, left: 148, zIndex: 1000,
      background: 'var(--bg-primary)',
      display: 'flex', flexDirection: 'column',
      animation: 'slideInRight 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
    }}>
      {/* ==================== TOP BAR ==================== */}
      <div style={{
        height: 52, borderBottom: '1px solid var(--border-color)',
        background: 'var(--bg-secondary)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 20px', flexShrink: 0,
      }}>
        {/* Left: icon + title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 30, height: 30, borderRadius: 8,
            background: 'linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontSize: 15,
          }}>
            🚀
          </div>
          <div>
            <div style={{
              fontSize: 14, fontWeight: 700, color: 'var(--text-primary)',
              lineHeight: 1.3,
            }}>
              发布中心
            </div>
            <div style={{
              fontSize: 11, color: 'var(--text-tertiary)', lineHeight: 1.2,
            }}>
              {phase === 'choose' && '选择发布方式'}
              {phase === 'smart_step1' && '步骤 1/3 · 内容优化'}
              {phase === 'smart_step2' && '步骤 2/3 · 传播策略'}
              {phase === 'smart_step3' && '步骤 3/3 · 风险检查'}
              {phase === 'ready' && '审查完成 · 准备发布'}
              {phase === 'publishing' && '发布中…'}
              {phase === 'success' && '已发布'}
            </div>
          </div>
        </div>

        {/* Right: quick publish + close */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Quick publish shortcut (visible during smart flow) */}
          {(phase.startsWith('smart_') || phase === 'ready') && (
            <Tooltip title="跳过所有步骤，直接发布">
              <Button
                icon={<ThunderboltOutlined />}
                onClick={() => setQuickConfirmVisible(true)}
                style={{
                  borderRadius: 8, fontWeight: 500, fontSize: 12, height: 32,
                  color: 'var(--text-secondary)', borderColor: 'var(--border-color)',
                }}
              >
                快速发布
              </Button>
            </Tooltip>
          )}
          {phase !== 'publishing' && (
            <Tooltip title="返回">
              <Button type="text" icon={<CloseOutlined />} onClick={onClose}
                style={{ color: 'var(--text-tertiary)' }} />
            </Tooltip>
          )}
        </div>
      </div>

      {/* ==================== BODY ==================== */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* ===== LEFT SIDEBAR ===== */}
        <div style={{
          width: 300, flexShrink: 0,
          borderRight: '1px solid var(--border-color)',
          display: 'flex', flexDirection: 'column',
          background: 'var(--bg-secondary)',
        }}>
          {renderEpisodePreview()}

          {/* Step indicator (only during smart flow) */}
          {(phase.startsWith('smart_') || phase === 'ready') && renderStepIndicator()}

          {/* History */}
          {renderHistory()}
        </div>

        {/* ===== MAIN CONTENT ===== */}
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          overflow: 'hidden', background: 'var(--bg-primary)',
        }}>
          {phase === 'choose' && renderChoosePhase()}

          {phase === 'smart_step1' && renderSmartStep(
            1, AGENTS[0], contentSuggestions,
            handleStep1Accept, handleStep1Skip,
          )}

          {phase === 'smart_step2' && renderSmartStep(
            2, AGENTS[1], distributionSuggestions,
            handleStep2Accept, handleStep2Skip,
          )}

          {phase === 'smart_step3' && renderSmartStep(
            3, AGENTS[2], riskSuggestions,
            handleStep3Accept, handleStep3Skip,
          )}

          {phase === 'ready' && renderReadyPhase()}
          {phase === 'publishing' && renderPublishingPhase()}
          {phase === 'success' && renderSuccessPhase()}
        </div>
      </div>

      {/* ==================== QUICK PUBLISH MODAL ==================== */}
      <Modal
        open={quickConfirmVisible}
        onCancel={() => setQuickConfirmVisible(false)}
        footer={null}
        width={420}
        centered
        closable={false}
        styles={{ body: { padding: 0 } }}
      >
        <div style={{ padding: '28px 24px', textAlign: 'center' }}>
          <div style={{
            width: 56, height: 56, borderRadius: 16,
            background: 'var(--bg-tertiary)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px', fontSize: 28,
          }}>
            ⚡
          </div>
          <div style={{
            fontSize: 18, fontWeight: 700, color: 'var(--text-primary)',
            marginBottom: 8,
          }}>
            确认快速发布？
          </div>
          <div style={{
            fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7,
            marginBottom: 24,
          }}>
            快速发布将跳过所有智能建议，直接将节目发送到所有平台。
            <br />发布后内容无法撤回。
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <Button
              onClick={() => setQuickConfirmVisible(false)}
              style={{
                borderRadius: 10, fontWeight: 500, fontSize: 13,
                height: 40, minWidth: 100,
                borderColor: 'var(--border-color)', color: 'var(--text-secondary)',
              }}
            >
              再想想
            </Button>
            <Button
              type="primary"
              icon={<RocketOutlined />}
              onClick={() => doPublish('quick')}
              style={{
                borderRadius: 10, fontWeight: 600, fontSize: 13,
                height: 40, minWidth: 140,
                background: 'var(--accent-primary)',
                borderColor: 'var(--accent-primary)',
              }}
            >
              确认发布
            </Button>
          </div>
        </div>
      </Modal>

      {/* ==================== PUBLISHING PROGRESS BAR (top) ==================== */}
      {phase === 'publishing' && (
        <div style={{
          position: 'absolute', top: 52, left: 0, right: 0, height: 3,
          background: 'var(--bg-tertiary)', zIndex: 50,
        }}>
          <div style={{
            height: '100%',
            width: `${publishProgress}%`,
            background: 'linear-gradient(90deg, #2563eb, #7c3aed)',
            transition: 'width 0.4s ease',
            borderRadius: '0 2px 2px 0',
          }} />
        </div>
      )}
    </div>
  )
}
