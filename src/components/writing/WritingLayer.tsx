import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { Input, Button, message, Popconfirm } from 'antd'
import { CheckCircleFilled, DeleteOutlined, PlusOutlined } from '../../icons/antdCompat'
import type {
  SegmentTone,
  WritingSegment,
  WritingLayerProps,
} from './types'
import {
  SEGMENT_TYPE_CONFIG,
  formatDuration,
  estimateReadingSeconds,
} from './types'
import SegmentCard from './SegmentCard'
import StageHeader from '../StageHeader'
import { CONTENT_LAYOUTS, createDefaultWritingSegments } from './layout'
import { optimizeQuickNews } from '../../services/writing/quickNewsOptimizer'
import { resolveMorningNewsProfile } from '../../services/writing/morningNewsProfile'
import { settingsRepository } from '../../services/settings/repository'
import './writing.css'

// ============================================================
// Main Component
// ============================================================

const segmentTypes = CONTENT_LAYOUTS.news_brief.seeds.map(seed => seed.type)

function moveSegment<T>(items: T[], fromIndex: number, toIndex: number): T[] {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= items.length || toIndex >= items.length) return items
  const next = [...items]
  const [moved] = next.splice(fromIndex, 1)
  if (moved === undefined) return items
  next.splice(toIndex, 0, moved)
  return next
}

function normalizeWritingSegmentType(type: unknown, index: number): WritingSegment['type'] {
  const value = String(type || '')
  if (['opening', 'quick_news', 'deep_dive', 'closing', 'custom'].includes(value)) {
    return value as WritingSegment['type']
  }
  return segmentTypes[index] || 'quick_news'
}

function normalizeScriptSegmentType(type: WritingSegment['type'], index: number, total: number): 'opening' | 'quick_news' | 'deep_dive' | 'closing' | 'custom' {
  if (type === 'opening') return 'opening'
  if (type === 'quick_news') return 'quick_news'
  if (type === 'deep_dive') return 'deep_dive'
  if (type === 'closing') return 'closing'
  if (type === 'custom') return 'custom'
  if (index === 0) return 'opening'
  if (index === total - 1) return 'closing'
  return 'quick_news'
}

function explicitSourceFactIds(segment: WritingSegment): string[] {
  return Array.from(new Set(
    (segment.sourceFactIds || []).map(id => String(id).trim()).filter(Boolean),
  ))
}

function quickNewsRequestSignature(segment: WritingSegment, allSegments: WritingSegment[]): string {
  const index = allSegments.findIndex(item => item.id === segment.id)
  const previous = index > 0 ? allSegments[index - 1] : undefined
  const next = index >= 0 ? allSegments[index + 1] : undefined
  return JSON.stringify({
    id: segment.id,
    type: segment.type,
    label: segment.label,
    content: segment.content,
    sourceFactIds: explicitSourceFactIds(segment),
    order: allSegments.map(item => item.id),
    previous: previous ? [previous.id, previous.content] : null,
    next: next ? [next.id, next.content] : null,
  })
}

export default function WritingLayer({
  visible,
  onBackToDraft,
  workflow,
  episodeTitle = '',
  episodeDesc = '',
  embedded = false,
  headerTitle = '口播稿',
  headerLeadingActions,
  leadingPanel,
  characterTargets,
  onDraftContentChange,
  onDraftPatchChange,
  onProceedToProduction,
}: WritingLayerProps) {
  // Segments
  const [segments, setSegments] = useState<WritingSegment[]>(() => (
    createDefaultWritingSegments('news_brief')
  ))

  // Active segment
  const [activeSegmentId, setActiveSegmentId] = useState<string>('seg_opening')

  // Drag state
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null)
  const [optimizingSegmentId, setOptimizingSegmentId] = useState<string | null>(null)

  // Title editing
  const [title, setTitle] = useState(episodeTitle)
  const [desc, setDesc] = useState(episodeDesc)
  const [draftHydrated, setDraftHydrated] = useState(false)

  const segmentContentSignature = useMemo(() => (
    segments.map(segment => segment.content).join('|')
  ), [segments])

  // Update estimated seconds when content changes
  useEffect(() => {
    setSegments(prev => prev.map(s => ({
      ...s,
      estimatedSeconds: estimateReadingSeconds(s.content),
    })))
  }, [segmentContentSignature])

  // Computed values
  const totalSeconds = useMemo(() => segments.reduce((sum, s) => sum + estimateReadingSeconds(s.content), 0), [segments])
  const completedCount = useMemo(() => segments.filter(segment => segment.isCompleted).length, [segments])
  const factCards = useMemo(() => (
    Array.isArray(workflow?.state?.facts) ? workflow.state.facts : []
  ), [workflow?.state?.facts])
  const workflowVersionSignature = useMemo(() => JSON.stringify({
    episodeId: workflow?.state?.episode_id || '',
    scriptId: workflow?.state?.script?.id || '',
    editedScriptId: workflow?.state?.edited_script?.id || '',
    facts: factCards.map(fact => [
      fact.id,
      fact.title,
      fact.summary,
      fact.claim,
      fact.source_url,
      fact.source_title,
      fact.published_at,
      fact.confidence,
    ]),
  }), [factCards, workflow?.state?.edited_script?.id, workflow?.state?.episode_id, workflow?.state?.script?.id])
  const segmentsRef = useRef(segments)
  const workflowVersionRef = useRef(workflowVersionSignature)
  useEffect(() => {
    segmentsRef.current = segments
  }, [segments])
  useEffect(() => {
    workflowVersionRef.current = workflowVersionSignature
  }, [workflowVersionSignature])
  const previewSegments = useMemo(() => (
    dragIdx === null || dragOverIdx === null ? segments : moveSegment(segments, dragIdx, dragOverIdx)
  ), [dragIdx, dragOverIdx, segments])

  useEffect(() => {
    setTitle(episodeTitle)
    setDesc(episodeDesc)
  }, [episodeDesc, episodeTitle])

  const buildWorkflowPatch = useCallback(() => {
    const cleanSegments = segments.filter(s => s.content.trim().length > 0)
    const editedSegments = cleanSegments.map((segment, index) => ({
      id: segment.id,
      type: normalizeScriptSegmentType(segment.type, index, cleanSegments.length),
      title: segment.label,
      text: segment.content.trim(),
      source_fact_ids: explicitSourceFactIds(segment),
      estimated_seconds: estimateReadingSeconds(segment.content),
      speaker: 'Host A',
      is_completed: segment.isCompleted,
    }))
    return {
      selected_topic: {
        ...(workflow?.state?.selected_topic || {}),
        title,
        description: desc,
      },
      edited_script: {
        id: workflow?.state?.edited_script?.id || `${workflow?.state?.episode_id || 'episode'}_script_edited`,
        title,
        description: desc,
        content_type: 'news_brief',
        preset_id: 'morning_news_brief',
        num_hosts: 1,
        language: 'zh-CN',
        segments: editedSegments,
        edited_from: workflow?.state?.script?.id || workflow?.state?.edited_script?.edited_from || 'script.generated',
        edit_mode: 'manual_ui',
      },
    }
  }, [segments, title, desc, workflow])

  useEffect(() => {
    if (visible && draftHydrated) onDraftPatchChange?.(buildWorkflowPatch())
  }, [buildWorkflowPatch, draftHydrated, onDraftPatchChange, visible])

  useEffect(() => {
    if (!visible) {
      setDraftHydrated(false)
      return
    }
    const editedSegments = workflow?.state?.edited_script?.segments || []
    const generatedSegments = workflow?.state?.script?.segments || []
    const titleSource = workflow?.state?.edited_script?.title || workflow?.state?.script?.title
    const descSource = workflow?.state?.edited_script?.description || workflow?.state?.script?.description

    if (titleSource) setTitle(titleSource)
    if (descSource) setDesc(descSource)

    const source = editedSegments.length > 0
      ? editedSegments.map((segment: any, index: number) => ({
          id: String(segment.id || `seg_${index + 1}`),
          type: normalizeWritingSegmentType(segment.type, index),
          label: segment.title || SEGMENT_TYPE_CONFIG[normalizeWritingSegmentType(segment.type, index)].label,
          content: String(segment.text || ''),
          sourceFactIds: Array.isArray(segment.source_fact_ids) ? segment.source_fact_ids : [],
          estimatedSeconds: estimateReadingSeconds(String(segment.text || '')),
          isCompleted: Boolean(segment.is_completed),
        }))
      : generatedSegments.length > 0
        ? generatedSegments.map((segment: any, index: number) => ({
            id: String(segment.id || `seg_${index + 1}`),
            type: normalizeWritingSegmentType(segment.type, index),
            label: segment.title || SEGMENT_TYPE_CONFIG[normalizeWritingSegmentType(segment.type, index)].label,
            content: String(segment.text || ''),
            sourceFactIds: Array.isArray(segment.source_fact_ids) ? segment.source_fact_ids : [],
            estimatedSeconds: estimateReadingSeconds(String(segment.text || '')),
            isCompleted: Boolean(segment.is_completed),
          }))
        : []

    if (source.length > 0) {
      setSegments(source.map((item: any, index: number) => {
        const type = item.type || segmentTypes[index] || 'quick_news'
        return {
          id: item.id,
          type,
          label: item.label,
          content: item.content,
          sourceFactIds: item.sourceFactIds || [],
          tone: 'default',
          estimatedSeconds: item.estimatedSeconds,
          isCompleted: Boolean(item.isCompleted),
          collapsed: false,
        }
      }))
      setActiveSegmentId(source[0].id)
    }
    setDraftHydrated(true)
  }, [
    visible,
    workflow?.state?.episode_id,
    workflow?.state?.edited_script?.description,
    workflow?.state?.edited_script?.segments,
    workflow?.state?.edited_script?.title,
    workflow?.state?.script?.description,
    workflow?.state?.script?.segments,
    workflow?.state?.script?.title,
  ])

  useEffect(() => {
    if (visible) onDraftContentChange?.(segments.some(segment => segment.content.trim().length > 0))
  }, [onDraftContentChange, segments, visible])

  // ── Segment Actions ───────────────────────────────────────

  const updateSegmentContent = useCallback((id: string, content: string) => {
    setSegments(prev => prev.map(s => {
      if (s.id === id) {
        if (s.content === content) return s
        return {
          ...s,
          content,
          estimatedSeconds: estimateReadingSeconds(content),
          isCompleted: false,
        }
      }
      return s
    }))
  }, [])

  const updateSegmentTone = useCallback((id: string, tone: SegmentTone) => {
    setSegments(prev => prev.map(s => s.id === id ? { ...s, tone } : s))
  }, [])

  const updateSegmentLabel = useCallback((id: string, label: string) => {
    setSegments(prev => prev.map(s => s.id === id ? { ...s, label } : s))
  }, [])

  const updateSegmentCompletion = useCallback((id: string, isCompleted: boolean) => {
    setSegments(prev => prev.map(s => s.id === id ? { ...s, isCompleted } : s))
  }, [])

  const handleOptimizeQuickNews = useCallback(async (id: string) => {
    const segmentIndex = segments.findIndex(segment => segment.id === id)
    const segment = segments[segmentIndex]
    if (!segment || segment.type !== 'quick_news') return

    const sourceFactIds = explicitSourceFactIds(segment)
    const requestSignature = quickNewsRequestSignature(segment, segments)
    const requestWorkflowVersion = workflowVersionSignature
    const settings = settingsRepository.load()
    const profile = resolveMorningNewsProfile(settings)
    setOptimizingSegmentId(id)
    try {
      const result = await optimizeQuickNews({
        segmentText: segment.content,
        factCards,
        sourceFactIds,
        previousSegmentText: segments[segmentIndex - 1]?.content || '',
        nextSegmentText: segments[segmentIndex + 1]?.content || '',
        targetChars: characterTargets?.quick_news || profile.quickNewsChars,
        editorialVoice: profile.editorialVoice,
        tone: segment.tone,
      })
      const latestSegments = segmentsRef.current
      const latestSegment = latestSegments.find(item => item.id === id)
      if (
        !latestSegment
        || workflowVersionRef.current !== requestWorkflowVersion
        || quickNewsRequestSignature(latestSegment, latestSegments) !== requestSignature
      ) {
        message.warning({
          content: '快讯或来源已在优化期间发生变化，本次结果未覆盖当前稿件',
          duration: 3,
          style: { marginTop: 60 },
        })
        return
      }
      setSegments(previous => {
        const currentSegment = previous.find(item => item.id === id)
        if (!currentSegment || quickNewsRequestSignature(currentSegment, previous) !== requestSignature) {
          return previous
        }
        return previous.map(item => item.id === id
          ? {
              ...item,
              label: result.title || item.label,
              content: result.suggestedText,
              sourceFactIds: result.sourceFactIds,
              estimatedSeconds: estimateReadingSeconds(result.suggestedText),
              isCompleted: false,
            }
          : item)
      })
      const boundaryNote = result.unsupportedOrUncertain.length > 0
        ? `，并处理了 ${result.unsupportedOrUncertain.length} 处无依据或不确定表述`
        : ''
      message.success({
        content: `已按${profile.editorialVoiceLabel}优化这条快讯${boundaryNote}`,
        duration: 2.5,
        style: { marginTop: 60 },
      })
    } catch (error: any) {
      message.error({
        content: `快讯优化失败：${error?.message || String(error)}`,
        duration: 3,
        style: { marginTop: 60 },
      })
    } finally {
      setOptimizingSegmentId(current => current === id ? null : current)
    }
  }, [characterTargets?.quick_news, factCards, segments, workflowVersionSignature])

  const toggleCollapse = useCallback((id: string) => {
    setSegments(prev => prev.map(s => s.id === id ? { ...s, collapsed: !s.collapsed } : s))
  }, [])

  const deleteSegment = useCallback((id: string) => {
    const segmentIndex = segments.findIndex(segment => segment.id === id)
    const nextActiveSegmentId = segments[segmentIndex + 1]?.id || segments[segmentIndex - 1]?.id || ''

    setSegments(prev => prev.filter(segment => segment.id !== id))
    setActiveSegmentId(current => current === id ? nextActiveSegmentId : current)
  }, [segments])

  // Drag & drop
  const handleDragStart = useCallback((index: number, event: React.DragEvent<HTMLButtonElement>) => {
    setDragIdx(index)
    setDragOverIdx(null)
    event.dataTransfer?.setData('text/plain', segments[index]?.id || '')
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
  }, [segments])

  const handleDragOver = useCallback((targetIdx: number, event: React.DragEvent<HTMLButtonElement>) => {
    event.preventDefault()
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
    if (dragIdx !== null && targetIdx !== dragIdx) {
      setDragOverIdx(current => current === targetIdx ? current : targetIdx)
    }
  }, [dragIdx])

  const handleDrop = useCallback((targetIdx: number) => {
    if (dragIdx === null) return
    if (dragIdx === targetIdx) {
      setDragIdx(null)
      setDragOverIdx(null)
      return
    }
    setSegments(prev => moveSegment(prev, dragIdx, targetIdx))
    setDragIdx(null)
    setDragOverIdx(null)
  }, [dragIdx])

  const handleDragEnd = useCallback(() => {
    setDragIdx(null)
    setDragOverIdx(null)
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
    <div className={`writing-layer ${embedded ? 'is-embedded' : ''}`} style={{
      position: embedded ? 'relative' : 'fixed',
      top: embedded ? 'auto' : 52,
      right: embedded ? 'auto' : 0,
      bottom: embedded ? 'auto' : 0,
      left: embedded ? 'auto' : 148,
      zIndex: embedded ? 1 : 1000,
      background: 'var(--bg-primary)',
      display: 'flex', flexDirection: 'column',
      animation: embedded ? 'none' : 'slideInRight 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
      height: embedded ? '100%' : undefined,
      minHeight: embedded ? 0 : undefined,
      border: undefined,
      borderRadius: undefined,
      overflow: embedded ? 'hidden' : undefined,
    }}>

      <StageHeader
        title={headerTitle}
        actions={headerLeadingActions}
        previous={onBackToDraft ? { onClick: onBackToDraft } : undefined}
        next={{ label: '进入制作', onClick: handleProceed }}
      />

      {/* ==================== BODY ==================== */}
      <div className="writing-workspace">

        {leadingPanel}

        {/* Structure is navigation, not another editing surface. */}
        <aside className="writing-structure-pane">
          {!leadingPanel && <div className="writing-structure-episode">
            <Input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="本期标题…"
              aria-label="本期标题"
            />
            <Input
              value={desc}
              onChange={e => setDesc(e.target.value)}
              placeholder="一句话概括…"
              aria-label="一句话概括"
            />
          </div>}

          <div className="writing-structure-title">节目结构</div>
          <nav className="writing-structure-list" aria-label="节目结构">
            {previewSegments.map((seg) => {
              const cfg = SEGMENT_TYPE_CONFIG[seg.type]
              const sourceIndex = segments.findIndex(item => item.id === seg.id)
              const structureLabel = seg.label || cfg.label
              const isActive = seg.id === activeSegmentId
              return (
                <div
                  key={seg.id}
                  className={`writing-structure-row ${isActive ? 'is-active' : ''} ${seg.isCompleted ? 'is-completed' : ''} ${dragIdx === sourceIndex ? 'is-dragging' : ''} ${dragOverIdx === sourceIndex ? 'is-drop-target' : ''}`}
                >
                  <button
                    type="button"
                    draggable
                    onDragStart={(event) => handleDragStart(sourceIndex, event)}
                    onDragOver={(event) => handleDragOver(sourceIndex, event)}
                    onDrop={() => handleDrop(sourceIndex)}
                    onDragEnd={handleDragEnd}
                    onClick={() => {
                      setActiveSegmentId(seg.id)
                      setSegments(prev => prev.map(s => s.id === seg.id ? { ...s, collapsed: false } : s))
                    }}
                    className={`writing-structure-item ${isActive ? 'is-active' : ''} ${seg.isCompleted ? 'is-completed' : ''} ${dragIdx === sourceIndex ? 'is-dragging' : ''} ${dragOverIdx === sourceIndex ? 'is-drop-target' : ''}`}
                  >
                    <span className="writing-structure-item-top">
                      <span className="writing-structure-item-label" title={structureLabel}>{structureLabel}</span>
                      <span className="writing-structure-item-meta">
                        <span>{formatDuration(seg.estimatedSeconds)}</span>
                        {seg.isCompleted && (
                          <span className="writing-completion-mark" aria-label="已完成" title="已完成">
                            <CheckCircleFilled />
                          </span>
                        )}
                      </span>
                    </span>
                  </button>
                  <Popconfirm
                    title={`删除「${structureLabel}」？`}
                    description="删除后将从本期口播稿中移除该段内容。"
                    okText="确认删除"
                    cancelText="取消"
                    onConfirm={() => deleteSegment(seg.id)}
                  >
                    <button
                      type="button"
                      className="writing-structure-delete"
                      aria-label={`删除${structureLabel}`}
                      title={`删除${structureLabel}`}
                    >
                      <DeleteOutlined />
                    </button>
                  </Popconfirm>
                </div>
              )
            })}
          </nav>

          <div className="writing-duration-summary">
            <span>预计时长</span>
            <strong>{formatDuration(totalSeconds)}</strong>
            <small>{completedCount}/{segments.length} 段已完成</small>
          </div>
        </aside>

        <main className="writing-editor-pane">
          <div className="writing-editor-scroll">
            {/* Segment Cards */}
            {segments.map((seg) => (
              <SegmentCard
                key={seg.id}
                segment={seg}
                isActive={seg.id === activeSegmentId}
                allSegments={segments}
                characterTarget={characterTargets?.[seg.type]}
                optimizing={optimizingSegmentId === seg.id}
                optimizeDisabledReason={(() => {
                  if (optimizingSegmentId && optimizingSegmentId !== seg.id) return '请等待当前快讯优化完成'
                  if (!seg.content.trim()) return '请先写入快讯正文'
                  const resolvedIds = explicitSourceFactIds(seg)
                  if (resolvedIds.length === 0) return '这条快讯没有绑定事实卡，无法安全优化'
                  if (resolvedIds.some(id => !factCards.some(fact => fact.id === id))) return '找不到这条快讯绑定的事实卡'
                  return undefined
                })()}
                onOptimize={() => void handleOptimizeQuickNews(seg.id)}
                onSelect={() => {
                  setActiveSegmentId(seg.id)
                }}
                onLabelChange={(label) => updateSegmentLabel(seg.id, label)}
                onContentChange={(content) => updateSegmentContent(seg.id, content)}
                onToneChange={(tone) => updateSegmentTone(seg.id, tone)}
                onCompletionChange={(isCompleted) => updateSegmentCompletion(seg.id, isCompleted)}
                onCollapse={() => toggleCollapse(seg.id)}
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
                  type: 'quick_news',
                  label: '自定义段落',
                  content: '',
                  sourceFactIds: [],
                  tone: 'default',
                  estimatedSeconds: 0,
                  isCompleted: false,
                  collapsed: false,
                }])
              }}
              className="writing-add-segment"
            >
              添加段落
            </Button>
          </div>
        </main>

      </div>
    </div>
  )
}
