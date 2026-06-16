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

const segmentTypes = ['opening', 'main_1', 'main_2', 'discussion', 'closing'] as const

export default function WritingLayer({
  visible,
  onClose,
  workflow,
  episodeTitle = '',
  episodeDesc = '',
  onSaveDraft,
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

  const buildWorkflowPatch = useCallback(() => {
    const cleanSegments = segments.filter(s => s.content.trim().length > 0)
    const stages = cleanSegments.map((segment, index) => ({
      id: segment.id,
      order: index + 1,
      speaker: 'Host',
      text: segment.content.trim(),
      label: segment.label,
      estimated_duration: segment.estimatedSeconds,
    }))

    return {
      selected_topic: {
        ...(workflow?.state?.selected_topic || {}),
        title,
        description: desc,
      },
      script: {
        ...(workflow?.state?.script || {}),
        title,
        description: desc,
        dialogue: cleanSegments.map(segment => ({
          speaker: 'Host',
          text: segment.content.trim(),
        })),
      },
      stages,
      writing_meta: {
        globalTone,
        updated_at: new Date().toISOString(),
      },
    }
  }, [segments, title, desc, globalTone, workflow])

  useEffect(() => {
    if (!visible) return
    const state = workflow?.state
    const sourceStages = state?.stages?.length ? state.stages : []
    const dialogue = state?.script?.dialogue || []

    if (state?.script?.title || episodeTitle) setTitle(state?.script?.title || episodeTitle)
    if (state?.script?.description || episodeDesc) setDesc(state?.script?.description || episodeDesc)

    const source = sourceStages.length > 0
      ? sourceStages.map((stage: any, index: number) => ({
          id: String(stage.id || `seg_${index + 1}`),
          label: stage.label || SEGMENT_TYPE_CONFIG[segmentTypes[index] || 'discussion'].label,
          content: String(stage.text || ''),
          estimatedSeconds: Number(stage.estimated_duration || stage.duration || estimateReadingSeconds(String(stage.text || ''))),
        }))
      : dialogue.map((line: any, index: number) => ({
          id: `seg_${index + 1}`,
          label: SEGMENT_TYPE_CONFIG[segmentTypes[index] || 'discussion'].label,
          content: String(line.text || ''),
          estimatedSeconds: estimateReadingSeconds(String(line.text || '')),
        }))

    if (source.length > 0) {
      setSegments(source.map((item: any, index: number) => {
        const type = segmentTypes[index] || 'discussion'
        return {
          id: item.id,
          type,
          label: item.label,
          content: item.content,
          tone: 'default',
          estimatedSeconds: item.estimatedSeconds,
          status: item.content.length > 0 ? 'editing' : 'draft',
          collapsed: false,
        }
      }))
      setActiveSegmentId(source[0].id)
    }
  }, [visible, workflow?.state?.episode_id])

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

  const saveVersion = useCallback(async () => {
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
    try {
      await onSaveDraft?.(buildWorkflowPatch())
      message.success({ content: '版本已保存到工作流', duration: 1.5, style: { marginTop: 60 } })
    } catch (error: any) {
      message.error({ content: `保存失败：${error?.message || String(error)}`, duration: 2, style: { marginTop: 60 } })
    }
  }, [segments, globalTone, onSaveDraft, buildWorkflowPatch])

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

  const requestAISuggestion = useCallback(async (
    role: AgentRole,
    segmentId: string,
    text: string,
    scope: CollaborationScope,
    selectionRange?: { start: number; end: number },
  ): Promise<AISuggestion> => {
    if (!window.electronAPI?.loadAllConfigs) {
      throw new Error('当前环境没有 Electron 配置接口，无法调用真实智能建议')
    }
    const configs = await window.electronAPI.loadAllConfigs()
    const cfg = configs.script || configs.research || configs.topic_selection || {}
    const apiKey = String(cfg.api_key || '').trim()
    const apiBase = String(cfg.api_base || '').trim().replace(/\/$/, '')
    const model = String(cfg.llm_model || 'gpt-4o-mini').trim()

    if (!apiKey || !apiBase) {
      throw new Error('请先在脚本/研究节点配置 API Base 与 API Key')
    }

    const roleLabel = AI_AGENTS_MAP[role]
    const response = await fetch(`${apiBase}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: cfg.temperature ?? 0.4,
        messages: [
          {
            role: 'system',
            content: '你是播客脚本文案编辑。只返回 JSON，不要输出 Markdown。JSON 字段为 suggestedText 和 reason。',
          },
          {
            role: 'user',
            content: [
              `编辑角色：${roleLabel}`,
              `强度：${aiIntensity}`,
              `作用范围：${scope}`,
              '要求：不添加未经提供的新事实；保留原意；适合作为中文播客口播稿。',
              `原文：${text}`,
            ].join('\n'),
          },
        ],
      }),
    })

    if (!response.ok) {
      throw new Error(`智能请求失败：HTTP ${response.status}`)
    }

    const data = await response.json()
    const raw = data?.choices?.[0]?.message?.content || ''
    let parsed: { suggestedText?: string; reason?: string } = {}
    try {
      const match = raw.match(/\{[\s\S]*\}/)
      parsed = JSON.parse(match ? match[0] : raw)
    } catch {
      parsed = { suggestedText: raw, reason: '模型返回非 JSON，已按纯文本建议处理' }
    }

    return {
      id: `sug_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      agentRole: role,
      segmentId,
      scope,
      intensity: aiIntensity,
      originalText: text,
      suggestedText: String(parsed.suggestedText || text),
      reason: String(parsed.reason || '已根据当前角色生成真实智能建议'),
      status: 'pending',
      timestamp: Date.now(),
      selectionRange,
    }
  }, [aiIntensity])

  const handleInvokeAgent = useCallback(async (role: AgentRole) => {
    if (!activeSegment || activeSegment.content.length < 5) {
      message.warning({ content: '请先在段落中写入一些内容', duration: 1.5, style: { marginTop: 60 } })
      return
    }

    const targetText = collaborationScope === 'selection' && selectedText
      ? selectedText
      : activeSegment.content

    // For full-text scope, generate suggestions for all non-empty segments
    if (collaborationScope === 'full') {
      try {
        const candidates = segments
        .filter(s => s.content.length >= 5)
        const newSuggestions = await Promise.all(
          candidates.map(s => requestAISuggestion(role, s.id, s.content, 'full'))
        )
        setSuggestions(prev => [...newSuggestions, ...prev])
        message.info({
          content: `${AI_AGENTS_MAP[role]} 已对全文 ${newSuggestions.length} 个段落生成真实智能建议`,
          duration: 2,
          style: { marginTop: 60 },
        })
      } catch (error: any) {
        message.error({ content: error?.message || String(error), duration: 2.5, style: { marginTop: 60 } })
      }
      return
    }

    try {
      const selectionRange = collaborationScope === 'selection' && selectedText
        ? { start: activeSegment.content.indexOf(selectedText), end: activeSegment.content.indexOf(selectedText) + selectedText.length }
        : undefined
      const suggestion = await requestAISuggestion(role, activeSegmentId, targetText, collaborationScope, selectionRange)
      setSuggestions(prev => [suggestion, ...prev])
      message.info({
        content: `${AI_AGENTS_MAP[role]} 已生成真实智能建议`,
        duration: 1.5,
        style: { marginTop: 60 },
      })
    } catch (error: any) {
      message.error({ content: error?.message || String(error), duration: 2.5, style: { marginTop: 60 } })
    }
  }, [activeSegment, activeSegmentId, collaborationScope, selectedText, segments, requestAISuggestion])

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

  const handleProceed = useCallback(async () => {
    try {
      await onProceedToProduction?.(buildWorkflowPatch())
    } catch (error: any) {
      message.error({ content: `进入制作失败：${error?.message || String(error)}`, duration: 2, style: { marginTop: 60 } })
    }
  }, [buildWorkflowPatch, onProceedToProduction])

  if (!visible) return null

  // ============================================================
  // Render
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
            <Tooltip title="撤销上次智能修改">
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

          {/* 智能建议统计 */}
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

        {/* ===== RIGHT: 智能协作面板 ===== */}
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
