import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import { Input, Button, Tag, Tooltip, Badge, message } from 'antd'
import {
  CloseOutlined,
  SoundOutlined,
  HistoryOutlined,
  CheckCircleOutlined,
  DownOutlined,
  PlusOutlined,
  ArrowRightOutlined,
  UndoOutlined,
} from '@ant-design/icons'
import type {
  GlobalTone,
  SegmentTone,
  SegmentStatus,
  WritingSegment,
  Version,
  AgentRole,
  AIIntensity,
  CollaborationScope,
  AISuggestion,
  WritingLayerProps,
} from './types'
import {
  GLOBAL_TONES,
  SEGMENT_TYPE_CONFIG,
  STATUS_CONFIG,
  formatDuration,
  estimateReadingSeconds,
  generateMockSuggestion,
} from './types'
import SegmentCard from './SegmentCard'
import AgentPanel from './AgentPanel'

// ============================================================
// Version Panel (slide-in)
// ============================================================

function VersionPanel({
  versions,
  currentVersionIdx,
  onRestore,
  onClose,
}: {
  versions: Version[]
  currentVersionIdx: number
  onRestore: (idx: number) => void
  onClose: () => void
}) {
  return (
    <div style={{
      position: 'absolute', right: 0, top: 0, bottom: 0, width: 320,
      background: 'var(--bg-secondary)', borderLeft: '1px solid var(--border-color)',
      boxShadow: 'var(--shadow-lg)', zIndex: 50,
      display: 'flex', flexDirection: 'column',
      animation: 'slideInRight 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
    }}>
      <div style={{
        padding: '14px 16px', borderBottom: '1px solid var(--border-color)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
          版本历史
        </span>
        <Button type="text" size="small" icon={<CloseOutlined />} onClick={onClose}
          style={{ color: 'var(--text-tertiary)' }} />
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: '12px 16px' }}>
        {versions.length === 0 ? (
          <div style={{ padding: '40px 20px', textAlign: 'center' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>📝</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4 }}>
              还没有保存的版本
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', lineHeight: 1.6 }}>
              每次重要修改后保存一个版本，方便随时回看和对比
            </div>
          </div>
        ) : (
          versions.map((v, idx) => {
            const isCurrent = idx === currentVersionIdx
            const polishedCount = v.segments.filter(s => s.status === 'polished').length
            const totalSec = v.segments.reduce((sum, s) => sum + s.estimatedSeconds, 0)
            return (
              <div
                key={v.id}
                style={{
                  padding: '12px 14px',
                  marginBottom: 8,
                  borderRadius: 10,
                  border: `1px solid ${isCurrent ? 'var(--accent-primary)' : 'var(--border-color)'}`,
                  background: isCurrent ? 'var(--accent-light)' : 'var(--bg-primary)',
                  transition: 'all 0.2s ease',
                  cursor: 'pointer',
                }}
                onClick={() => onRestore(idx)}
                onMouseEnter={e => { if (!isCurrent) e.currentTarget.style.borderColor = 'var(--border-active)' }}
                onMouseLeave={e => { if (!isCurrent) e.currentTarget.style.borderColor = isCurrent ? 'var(--accent-primary)' : 'var(--border-color)' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
                    {v.label || `版本 ${versions.length - idx}`}
                  </span>
                  {isCurrent && (
                    <Tag bordered={false} style={{ fontSize: 10, padding: '0 6px', lineHeight: '18px', borderRadius: 4, background: 'var(--accent-primary)', color: '#fff', margin: 0 }}>
                      当前
                    </Tag>
                  )}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', display: 'flex', gap: 12 }}>
                  <span>{v.timestamp}</span>
                  <span>{GLOBAL_TONES.find(t => t.key === v.globalTone)?.label}</span>
                  <span>约 {formatDuration(totalSec)}</span>
                </div>
                <div style={{ marginTop: 6, display: 'flex', gap: 4 }}>
                  {v.segments.map(s => {
                    const sc = STATUS_CONFIG[s.status]
                    return (
                      <span key={s.id} style={{
                        width: 8, height: 8, borderRadius: '50%',
                        background: sc.color,
                      }} />
                    )
                  })}
                  <span style={{ fontSize: 10, color: 'var(--text-tertiary)', marginLeft: 4 }}>
                    {polishedCount}/{v.segments.length} 已打磨
                  </span>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

// ============================================================
// Main Component
// ============================================================

export default function WritingLayer({
  visible,
  onClose,
  episodeTitle = '',
  episodeDesc = '',
  onProceedToProduction,
}: WritingLayerProps) {
  // Global tone
  const [globalTone, setGlobalTone] = useState<GlobalTone>('casual')
  const [showToneSelector, setShowToneSelector] = useState(false)
  const toneSelectorRef = useRef<HTMLDivElement>(null)

  // Segments
  const [segments, setSegments] = useState<WritingSegment[]>([
    { id: 'seg_opening', type: 'opening', label: '开场', content: '', tone: 'default', estimatedSeconds: 0, status: 'draft', collapsed: false },
    { id: 'seg_main1', type: 'main_1', label: '主线一', content: '', tone: 'default', estimatedSeconds: 0, status: 'draft', collapsed: false },
    { id: 'seg_main2', type: 'main_2', label: '主线二', content: '', tone: 'default', estimatedSeconds: 0, status: 'draft', collapsed: false },
    { id: 'seg_discuss', type: 'discussion', label: '延伸讨论', content: '', tone: 'default', estimatedSeconds: 0, status: 'draft', collapsed: false },
    { id: 'seg_closing', type: 'closing', label: '结尾', content: '', tone: 'default', estimatedSeconds: 0, status: 'draft', collapsed: false },
  ])

  // Active segment
  const [activeSegmentId, setActiveSegmentId] = useState<string>('seg_opening')

  // Versions
  const [versions, setVersions] = useState<Version[]>([])
  const [showVersions, setShowVersions] = useState(false)
  const [currentVersionIdx, setCurrentVersionIdx] = useState(-1)

  // Drag state
  const [dragIdx, setDragIdx] = useState<number | null>(null)

  // Title editing
  const [title, setTitle] = useState(episodeTitle)
  const [desc, setDesc] = useState(episodeDesc)

  // ── AI Agent State ────────────────────────────────────────
  const [aiIntensity, setAiIntensity] = useState<AIIntensity>('standard')
  const [collaborationScope, setCollaborationScope] = useState<CollaborationScope>('paragraph')
  const [suggestions, setSuggestions] = useState<AISuggestion[]>([])
  const [selectedText, setSelectedText] = useState('')
  const [agentPanelVisible, setAgentPanelVisible] = useState(true)

  // Undo stack for suggestions
  const [undoStack, setUndoStack] = useState<Array<{ segmentId: string; previousContent: string }>>([])

  // Close tone selector on outside click
  useEffect(() => {
    if (!showToneSelector) return
    const handler = (e: MouseEvent) => {
      if (toneSelectorRef.current && !toneSelectorRef.current.contains(e.target as Node)) {
        setShowToneSelector(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showToneSelector])

  // Update estimated seconds when content changes
  useEffect(() => {
    setSegments(prev => prev.map(s => ({
      ...s,
      estimatedSeconds: s.content.length > 0 ? estimateReadingSeconds(s.content) : SEGMENT_TYPE_CONFIG[s.type].defaultSeconds,
    })))
  }, [segments.map(s => s.content).join('|')])

  // Auto-switch to selection scope when text is selected
  useEffect(() => {
    if (selectedText.length > 0) {
      setCollaborationScope('selection')
    }
  }, [selectedText])

  // Computed values
  const totalSeconds = useMemo(() => segments.reduce((sum, s) => sum + s.estimatedSeconds, 0), [segments])
  const polishedCount = segments.filter(s => s.status === 'polished').length
  const activeSegment = segments.find(s => s.id === activeSegmentId)
  const currentGlobalTone = GLOBAL_TONES.find(t => t.key === globalTone)

  // ── Segment Actions ───────────────────────────────────────

  const updateSegmentContent = useCallback((id: string, content: string) => {
    setSegments(prev => prev.map(s => {
      if (s.id === id) {
        const newSec = content.length > 0 ? estimateReadingSeconds(content) : SEGMENT_TYPE_CONFIG[s.type].defaultSeconds
        return { ...s, content, estimatedSeconds: newSec, status: s.status === 'draft' && content.length > 20 ? 'editing' : s.status }
      }
      return s
    }))
  }, [])

  const updateSegmentTone = useCallback((id: string, tone: SegmentTone) => {
    setSegments(prev => prev.map(s => s.id === id ? { ...s, tone } : s))
  }, [])

  const updateSegmentStatus = useCallback((id: string, status: SegmentStatus) => {
    setSegments(prev => prev.map(s => s.id === id ? { ...s, status } : s))
  }, [])

  const toggleCollapse = useCallback((id: string) => {
    setSegments(prev => prev.map(s => s.id === id ? { ...s, collapsed: !s.collapsed } : s))
  }, [])

  // ── Version Actions ───────────────────────────────────────

  const saveVersion = useCallback(() => {
    const now = new Date()
    const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`
    const v: Version = {
      id: `v_${Date.now()}`,
      timestamp: timeStr,
      label: '',
      globalTone,
      segments: segments.map(s => ({ ...s })),
    }
    setVersions(prev => [v, ...prev])
    setCurrentVersionIdx(0)
    message.success({ content: '版本已保存', duration: 1.5, style: { marginTop: 60 } })
  }, [segments, globalTone])

  const restoreVersion = useCallback((idx: number) => {
    const v = versions[idx]
    if (!v) return
    setSegments(v.segments.map(s => ({ ...s })))
    setGlobalTone(v.globalTone)
    setCurrentVersionIdx(idx)
    message.info({ content: '已恢复到该版本', duration: 1.5, style: { marginTop: 60 } })
  }, [versions])

  // Drag & drop
  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault() }, [])
  const handleDrop = useCallback((targetIdx: number) => {
    if (dragIdx === null || dragIdx === targetIdx) return
    setSegments(prev => {
      const arr = [...prev]
      const item = arr[dragIdx]
      arr.splice(dragIdx, 1)
      arr.splice(targetIdx, 0, item)
      return arr
    })
    setDragIdx(null)
  }, [dragIdx])

  // ── AI Agent Actions ──────────────────────────────────────

  const handleInvokeAgent = useCallback((role: AgentRole) => {
    if (!activeSegment || activeSegment.content.length < 5) {
      message.warning({ content: '请先在段落中写入一些内容', duration: 1.5, style: { marginTop: 60 } })
      return
    }

    const targetText = collaborationScope === 'selection' && selectedText
      ? selectedText
      : activeSegment.content

    // For full-text scope, generate suggestions for all non-empty segments
    if (collaborationScope === 'full') {
      const newSuggestions = segments
        .filter(s => s.content.length >= 5)
        .map(s => generateMockSuggestion(role, s.id, s.content, 'full', aiIntensity))
      setSuggestions(prev => [...newSuggestions, ...prev])
      message.info({
        content: `${AI_AGENTS_MAP[role]} 已对全文 ${newSuggestions.length} 个段落生成建议`,
        duration: 2,
        style: { marginTop: 60 },
      })
      return
    }

    const suggestion = generateMockSuggestion(
      role,
      activeSegmentId,
      targetText,
      collaborationScope,
      aiIntensity,
      collaborationScope === 'selection' && selectedText
        ? { start: activeSegment.content.indexOf(selectedText), end: activeSegment.content.indexOf(selectedText) + selectedText.length }
        : undefined,
    )

    setSuggestions(prev => [suggestion, ...prev])
    message.info({
      content: `${AI_AGENTS_MAP[role]} 已生成建议`,
      duration: 1.5,
      style: { marginTop: 60 },
    })
  }, [activeSegment, activeSegmentId, collaborationScope, selectedText, aiIntensity, segments])

  const handleAcceptSuggestion = useCallback((suggestion: AISuggestion, finalText?: string) => {
    const seg = segments.find(s => s.id === suggestion.segmentId)
    if (!seg) return

    // Save to undo stack
    setUndoStack(prev => [...prev, { segmentId: seg.id, previousContent: seg.content }])

    const textToApply = finalText || suggestion.suggestedText

    if (suggestion.scope === 'selection' && suggestion.selectionRange) {
      const before = seg.content.slice(0, suggestion.selectionRange.start)
      const after = seg.content.slice(suggestion.selectionRange.end)
      updateSegmentContent(seg.id, before + textToApply + after)
    } else {
      updateSegmentContent(seg.id, textToApply)
    }

    setSuggestions(prev => prev.map(s =>
      s.id === suggestion.id ? { ...s, status: 'accepted' as const } : s
    ))
    message.success({ content: '已采纳建议', duration: 1, style: { marginTop: 60 } })
  }, [segments, updateSegmentContent])

  const handleRejectSuggestion = useCallback((suggestion: AISuggestion) => {
    setSuggestions(prev => prev.map(s =>
      s.id === suggestion.id ? { ...s, status: 'rejected' as const } : s
    ))
  }, [])

  const handleEditMoreSuggestion = useCallback((suggestion: AISuggestion) => {
    setSuggestions(prev => prev.map(s =>
      s.id === suggestion.id ? { ...s, status: 'editing' as const } : s
    ))
  }, [])

  const handleUndo = useCallback(() => {
    if (undoStack.length === 0) return
    const last = undoStack[undoStack.length - 1]
    updateSegmentContent(last.segmentId, last.previousContent)
    setUndoStack(prev => prev.slice(0, -1))
    message.info({ content: '已撤销', duration: 1, style: { marginTop: 60 } })
  }, [undoStack, updateSegmentContent])

  const handleTextSelect = useCallback((text: string) => {
    setSelectedText(text)
  }, [])

  const handleProceed = useCallback(() => {
    onProceedToProduction?.(segments, globalTone)
    onClose()
  }, [segments, globalTone, onProceedToProduction, onClose])

  if (!visible) return null

  // ============================================================
  // Render
  // ============================================================

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
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
        {/* Left: icon + title + stats */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 30, height: 30, borderRadius: 8,
            background: 'linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontSize: 15,
          }}>
            ✍️
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.3 }}>
              多智能体协作编辑空间
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', lineHeight: 1.2 }}>
              约 {formatDuration(totalSeconds)} · {polishedCount}/{segments.length} 段已打磨
              {suggestions.filter(s => s.status === 'pending').length > 0 && (
                <span style={{ color: 'var(--accent-primary)', fontWeight: 600, marginLeft: 8 }}>
                  · {suggestions.filter(s => s.status === 'pending').length} 条待处理建议
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Center: Global Tone Selector */}
        <div ref={toneSelectorRef} style={{ position: 'relative' }}>
          <button
            onClick={() => setShowToneSelector(!showToneSelector)}
            className="writing-global-tone-btn"
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)',
              borderRadius: 8, padding: '5px 14px',
              cursor: 'pointer', transition: 'all 0.2s ease',
              fontSize: 13, color: 'var(--text-primary)', fontWeight: 500,
            }}
          >
            <span style={{ fontSize: 16 }}>{currentGlobalTone?.icon}</span>
            <span>{currentGlobalTone?.label}</span>
            <DownOutlined style={{ fontSize: 9, color: 'var(--text-tertiary)' }} />
          </button>
          {showToneSelector && (
            <div style={{
              position: 'absolute', left: '50%', transform: 'translateX(-50%)',
              top: 42, zIndex: 100,
              background: 'var(--bg-secondary)', borderRadius: 14,
              border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-lg)',
              padding: 8, minWidth: 260,
              animation: 'writingToneDropIn 0.2s ease-out',
            }}>
              <div style={{ padding: '6px 12px 8px', fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 600 }}>
                整体语气
              </div>
              {GLOBAL_TONES.map(t => {
                const isActive = globalTone === t.key
                return (
                  <div
                    key={t.key}
                    onClick={() => { setGlobalTone(t.key); setShowToneSelector(false) }}
                    style={{
                      padding: '10px 14px', borderRadius: 10, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: 12,
                      background: isActive ? 'var(--accent-light)' : 'transparent',
                      border: isActive ? '1px solid var(--accent-primary)20' : '1px solid transparent',
                      transition: 'all 0.15s ease',
                      marginBottom: 2,
                    }}
                    onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--bg-tertiary)' }}
                    onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = isActive ? 'var(--accent-light)' : 'transparent' }}
                  >
                    <span style={{ fontSize: 20 }}>{t.icon}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: isActive ? 600 : 500, color: 'var(--text-primary)' }}>
                        {t.label}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 1 }}>
                        {t.desc}
                      </div>
                    </div>
                    {isActive && <CheckCircleOutlined style={{ fontSize: 14, color: 'var(--accent-primary)' }} />}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Right: actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Undo button */}
          {undoStack.length > 0 && (
            <Tooltip title="撤销上次 AI 修改">
              <Button
                type="text"
                icon={<UndoOutlined />}
                onClick={handleUndo}
                style={{ color: 'var(--warning-color)' }}
              />
            </Tooltip>
          )}
          <Tooltip title="版本历史">
            <Button
              type="text"
              icon={<HistoryOutlined />}
              onClick={() => setShowVersions(!showVersions)}
              style={{ color: showVersions ? 'var(--accent-primary)' : 'var(--text-tertiary)' }}
            >
              {versions.length > 0 && (
                <Badge count={versions.length} size="small" style={{ marginLeft: -2 }} />
              )}
            </Button>
          </Tooltip>
          <Tooltip title="保存版本">
            <Button
              type="text"
              onClick={saveVersion}
              style={{ color: 'var(--text-tertiary)', fontSize: 13 }}
            >
              💾
            </Button>
          </Tooltip>
          <Tooltip title="试听预览">
            <Button
              type="default"
              icon={<SoundOutlined />}
              style={{
                borderRadius: 8, height: 32, fontSize: 13,
                borderColor: 'var(--border-color)', color: 'var(--text-secondary)',
              }}
            >
              试听
            </Button>
          </Tooltip>
          <Button
            type="primary"
            icon={<ArrowRightOutlined />}
            onClick={handleProceed}
            style={{
              background: 'var(--accent-primary)',
              borderColor: 'var(--accent-primary)',
              borderRadius: 8, fontWeight: 600, fontSize: 13, height: 32,
            }}
          >
            进入制作
          </Button>
          <Tooltip title="返回">
            <Button type="text" icon={<CloseOutlined />} onClick={onClose}
              style={{ color: 'var(--text-tertiary)' }} />
          </Tooltip>
        </div>
      </div>

      {/* ==================== BODY ==================== */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' }}>

        {/* ===== LEFT: Structure Overview ===== */}
        <div style={{
          width: 220, flexShrink: 0,
          borderRight: '1px solid var(--border-color)',
          display: 'flex', flexDirection: 'column',
          background: 'var(--bg-secondary)',
        }}>
          {/* Episode info */}
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border-color)' }}>
            <Input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="本期标题…"
              style={{
                fontSize: 14, fontWeight: 700, border: 'none', boxShadow: 'none',
                padding: 0, background: 'transparent', color: 'var(--text-primary)',
              }}
            />
            <Input
              value={desc}
              onChange={e => setDesc(e.target.value)}
              placeholder="一句话概括…"
              style={{
                fontSize: 11, border: 'none', boxShadow: 'none',
                padding: 0, marginTop: 4, background: 'transparent', color: 'var(--text-tertiary)',
              }}
            />
          </div>

          {/* Structure nav */}
          <div style={{ padding: '8px 10px', fontSize: 10, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            节目结构
          </div>
          <div style={{ flex: 1, overflow: 'auto', padding: '0 8px' }}>
            {segments.map((seg) => {
              const cfg = SEGMENT_TYPE_CONFIG[seg.type]
              const statusCfg = STATUS_CONFIG[seg.status]
              const isActive = seg.id === activeSegmentId
              const segSuggestions = suggestions.filter(s => s.segmentId === seg.id && s.status === 'pending').length
              return (
                <div
                  key={seg.id}
                  onClick={() => {
                    setActiveSegmentId(seg.id)
                    setSegments(prev => prev.map(s => s.id === seg.id ? { ...s, collapsed: false } : s))
                    setSelectedText('')
                  }}
                  style={{
                    padding: '9px 10px',
                    marginBottom: 2,
                    borderRadius: 8,
                    cursor: 'pointer',
                    background: isActive ? `${cfg.color}08` : 'transparent',
                    borderLeft: `3px solid ${isActive ? cfg.color : 'transparent'}`,
                    transition: 'all 0.2s ease',
                  }}
                  onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--bg-tertiary)' }}
                  onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = isActive ? `${cfg.color}08` : 'transparent' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                    <span style={{ fontSize: 12 }}>{cfg.icon}</span>
                    <span style={{ fontSize: 12, fontWeight: isActive ? 600 : 500, color: 'var(--text-primary)', flex: 1 }}>
                      {cfg.label}
                    </span>
                    {segSuggestions > 0 && (
                      <span style={{
                        background: 'var(--accent-primary)',
                        color: '#fff',
                        fontSize: 8,
                        width: 14, height: 14,
                        borderRadius: '50%',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontWeight: 700, flexShrink: 0,
                      }}>
                        {segSuggestions}
                      </span>
                    )}
                    <span style={{
                      width: 6, height: 6, borderRadius: '50%',
                      background: statusCfg.color, flexShrink: 0,
                    }} />
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-tertiary)', paddingLeft: 18 }}>
                    {seg.content.length > 0 ? `${seg.content.slice(0, 20)}…` : '未开始'}
                    <span style={{ marginLeft: 6 }}>· {formatDuration(seg.estimatedSeconds)}</span>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Total duration */}
          <div style={{
            padding: '12px 16px', borderTop: '1px solid var(--border-color)',
            background: 'var(--bg-tertiary)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)' }}>
                预计总时长
              </span>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                {formatDuration(totalSeconds)}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 2, height: 6, borderRadius: 3, overflow: 'hidden' }}>
              {segments.map(seg => {
                const cfg = SEGMENT_TYPE_CONFIG[seg.type]
                const pct = totalSeconds > 0 ? (seg.estimatedSeconds / totalSeconds) * 100 : 20
                return (
                  <div key={seg.id} style={{
                    width: `${pct}%`, height: '100%',
                    background: cfg.color, borderRadius: 2,
                    opacity: seg.content.length > 0 ? 1 : 0.3,
                    transition: 'all 0.3s ease',
                  }} />
                )
              })}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 9, color: 'var(--text-tertiary)' }}>
              {segments.map(seg => (
                <span key={seg.id}>{SEGMENT_TYPE_CONFIG[seg.type].icon}</span>
              ))}
            </div>
          </div>

          {/* AI Stats Summary */}
          <div style={{
            padding: '8px 16px',
            borderTop: '1px solid var(--border-color)',
            background: 'var(--bg-secondary)',
          }}>
            <div style={{ fontSize: 10, color: 'var(--text-tertiary)', display: 'flex', justifyContent: 'space-between' }}>
              <span>已采纳 {suggestions.filter(s => s.status === 'accepted').length}</span>
              <span>已忽略 {suggestions.filter(s => s.status === 'rejected').length}</span>
              <span>待处理 {suggestions.filter(s => s.status === 'pending').length}</span>
            </div>
          </div>
        </div>

        {/* ===== CENTER: Writing Area ===== */}
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          background: 'var(--bg-primary)', minWidth: 0,
        }}>
          <div style={{
            flex: 1, overflow: 'auto', padding: '20px 32px',
            maxWidth: 800, margin: '0 auto', width: '100%',
          }}>
            {/* Welcome / empty state */}
            {segments.every(s => s.content.length === 0) && (
              <div style={{
                padding: '32px 24px', marginBottom: 20,
                borderRadius: 14, background: 'var(--bg-secondary)',
                border: '1px solid var(--border-color)',
                textAlign: 'center',
                animation: 'fadeIn 0.5s ease',
              }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>✍️</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
                  多智能体协作编辑空间
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.8, maxWidth: 460, margin: '0 auto' }}>
                  这是你的专业编辑室，不是生成器。
                  <br />
                  系统搭好了节目骨架，你可以从任意一段开始写作。
                  <br />
                  右侧面板有五位 AI 协作角色待命——
                  <br />
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                    ✨ 润色官 · 🎭 风格师 · 🧠 逻辑师 · ✂️ 裁剪师 · 🎯 开场结尾官
                  </span>
                  <br />
                  <span style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>
                    它们只提建议，所有修改需你手动确认。表达权始终在你。
                  </span>
                </div>
              </div>
            )}

            {/* Segment Cards */}
            {segments.map((seg, idx) => (
              <SegmentCard
                key={seg.id}
                segment={seg}
                isActive={seg.id === activeSegmentId}
                totalSeconds={totalSeconds}
                allSegments={segments}
                onSelect={() => {
                  setActiveSegmentId(seg.id)
                  setSelectedText('')
                }}
                onContentChange={(content) => updateSegmentContent(seg.id, content)}
                onToneChange={(tone) => updateSegmentTone(seg.id, tone)}
                onStatusChange={(status) => updateSegmentStatus(seg.id, status)}
                onCollapse={() => toggleCollapse(seg.id)}
                onTextSelect={handleTextSelect}
                onDragStart={() => setDragIdx(idx)}
                onDragOver={handleDragOver}
                onDrop={() => handleDrop(idx)}
              />
            ))}

            {/* Add custom segment */}
            <Button
              type="dashed"
              block
              icon={<PlusOutlined />}
              onClick={() => {
                const id = `seg_custom_${Date.now()}`
                setSegments(prev => [...prev, {
                  id,
                  type: 'discussion',
                  label: '自定义段落',
                  content: '',
                  tone: 'default',
                  estimatedSeconds: 0,
                  status: 'draft',
                  collapsed: false,
                }])
              }}
              style={{
                borderRadius: 10, height: 44,
                color: 'var(--text-tertiary)',
                borderColor: 'var(--border-color)',
                fontSize: 12, marginBottom: 24,
              }}
            >
              添加段落
            </Button>
          </div>
        </div>

        {/* ===== RIGHT: AI Agent Panel ===== */}
        <AgentPanel
          activeSegment={activeSegment}
          suggestions={suggestions}
          intensity={aiIntensity}
          scope={collaborationScope}
          selectedText={selectedText}
          onIntensityChange={setAiIntensity}
          onScopeChange={setCollaborationScope}
          onInvokeAgent={handleInvokeAgent}
          onAcceptSuggestion={handleAcceptSuggestion}
          onRejectSuggestion={handleRejectSuggestion}
          onEditMoreSuggestion={handleEditMoreSuggestion}
          panelVisible={agentPanelVisible}
          onTogglePanel={() => setAgentPanelVisible(!agentPanelVisible)}
        />

        {/* ===== VERSION PANEL (slide-in) ===== */}
        {showVersions && (
          <VersionPanel
            versions={versions}
            currentVersionIdx={currentVersionIdx}
            onRestore={restoreVersion}
            onClose={() => setShowVersions(false)}
          />
        )}
      </div>
    </div>
  )
}

// Agent label lookup for messages
const AI_AGENTS_MAP: Record<AgentRole, string> = {
  clarity_editor: '✨ 表达润色官',
  tone_stylist: '🎭 风格塑造师',
  argument_enhancer: '🧠 逻辑强化师',
  conciseness_coach: '✂️ 精简裁剪师',
  hook_designer: '🎯 开场结尾优化官',
}
