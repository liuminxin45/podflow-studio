import { useState, useRef, useEffect } from 'react'
import { Input, Button, Tag } from 'antd'
import {
  CheckCircleOutlined,
  HolderOutlined,
  DownOutlined,
  UpOutlined,
} from '../../icons/antdCompat'
import type { WritingSegment, SegmentTone, SegmentStatus, WritingSourceReference } from './types'
import {
  SEGMENT_TYPE_CONFIG,
  SEGMENT_TONES,
  STATUS_CONFIG,
  formatDuration,
  getSegmentHints,
} from './types'

const { TextArea } = Input
const STATUS_OPTIONS: SegmentStatus[] = ['draft', 'editing', 'polished']

interface SegmentCardProps {
  segment: WritingSegment
  isActive: boolean
  totalSeconds: number
  allSegments: WritingSegment[]
  onSelect: () => void
  onContentChange: (content: string) => void
  onToneChange: (tone: SegmentTone) => void
  onStatusChange: (status: SegmentStatus) => void
  onCollapse: () => void
  onTextSelect: (text: string) => void
  onSourceReferencesChange?: (refs: WritingSourceReference[]) => void
  promptOverride?: string
  onPromptOverrideChange?: (value: string) => void
  onRegenerateAIDraft?: () => void
  aiRegenerating?: boolean
  aiGenerationStatus?: 'idle' | 'generating' | 'success' | 'error'
  onDragStart: () => void
  onDragOver: (e: React.DragEvent) => void
  onDrop: () => void
}

export default function SegmentCard({
  segment,
  isActive,
  totalSeconds,
  allSegments,
  onSelect,
  onContentChange,
  onToneChange,
  onStatusChange,
  onCollapse,
  onTextSelect,
  onSourceReferencesChange,
  promptOverride,
  onPromptOverrideChange,
  onRegenerateAIDraft,
  aiRegenerating,
  aiGenerationStatus = 'idle',
  onDragStart,
  onDragOver,
  onDrop,
}: SegmentCardProps) {
  const PLACEHOLDER_BY_TYPE: Partial<Record<WritingSegment['type'], string>> = {
    opening: '在这里写下开场白…\n\n可以用一句导语快速建立主题期待。',
    mainline: '在这里展开主线…\n\n建议给出核心事实、观点与过渡。',
    news_item: '在这里写新闻播报…\n\n可按“事件-关键信息-影响”组织。',
    closing: '总结核心观点，留下回味…\n\n可以给听众一个思考的问题或行动建议。',
  }

  const cfg = SEGMENT_TYPE_CONFIG[segment.type]
  const statusCfg = STATUS_CONFIG[segment.status]
  const hints = getSegmentHints(segment, totalSeconds, allSegments)
  const [showToneMenu, setShowToneMenu] = useState(false)
  const toneRef = useRef<HTMLDivElement>(null)
  const textAreaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!showToneMenu) return
    const handler = (e: MouseEvent) => {
      if (toneRef.current && !toneRef.current.contains(e.target as Node)) {
        setShowToneMenu(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showToneMenu])

  const handleMouseUp = () => {
    const selection = window.getSelection()
    if (selection && selection.toString().trim().length > 0) {
      onTextSelect(selection.toString().trim())
    }
  }

  const currentToneLabel = SEGMENT_TONES.find(t => t.key === segment.tone)?.label || '跟随全局'
  const sourceLines = (segment.sourceReferences || []).map((ref) => ref.title).filter(Boolean).join('\n')
  const PROMPT_TEMPLATES: Array<{ key: string; label: string; value: string }> = [
    { key: 'conversational', label: '更口语', value: '请改写为更口语、更自然的表达，像在和听众聊天。' },
    { key: 'concise', label: '更短句', value: '请使用更短句和更快节奏，减少长句与重复修饰。' },
    { key: 'data_driven', label: '更数据化', value: '请增加关键数据/事实锚点，保留来源语义，表达更客观。' },
  ]

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onClick={onSelect}
      className="writing-segment-card"
      style={{
        marginBottom: 12,
        position: 'relative',
        zIndex: showToneMenu ? 20 : 1,
        borderRadius: 12,
        border: `1.5px solid ${isActive ? cfg.color : 'var(--border-color)'}`,
        background: 'var(--bg-secondary)',
        overflow: showToneMenu ? 'visible' : 'hidden',
        transition: 'all 0.25s cubic-bezier(0.25, 0.8, 0.25, 1)',
        boxShadow: isActive ? `0 0 0 3px ${cfg.color}12, var(--shadow-soft)` : 'var(--shadow-sm)',
        animation: 'writingCardIn 0.3s ease-out',
      }}
    >
      {/* Card Header */}
      <div style={{
        padding: '10px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: isActive ? `${cfg.color}06` : 'transparent',
        borderBottom: segment.collapsed ? 'none' : '1px solid var(--border-light)',
        cursor: 'grab',
        transition: 'background 0.2s ease',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <HolderOutlined style={{ color: 'var(--text-tertiary)', fontSize: 11 }} />
          <span style={{ fontSize: 15 }}>{cfg.icon}</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
            {segment.label || cfg.label}
          </span>
          <Tag bordered={false} style={{
            fontSize: 10, padding: '0 6px', lineHeight: '18px', borderRadius: 4,
            background: statusCfg.bg, color: statusCfg.color, margin: 0, fontWeight: 500,
          }}>
            {statusCfg.label}
          </Tag>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
            约 {formatDuration(segment.estimatedSeconds)}
          </span>
          <Button
            type="text" size="small"
            icon={segment.collapsed ? <DownOutlined /> : <UpOutlined />}
            onClick={(e) => { e.stopPropagation(); onCollapse() }}
            style={{ height: 22, width: 22, color: 'var(--text-tertiary)' }}
          />
        </div>
      </div>

      {/* Card Body (collapsible) */}
      {!segment.collapsed && (
        <div style={{ padding: '12px 16px', animation: 'writingExpand 0.2s ease-out' }}>
          {/* Writing area */}
          <TextArea
            ref={textAreaRef as any}
            value={segment.content}
            onChange={e => onContentChange(e.target.value)}
            onMouseUp={handleMouseUp}
            placeholder={
              PLACEHOLDER_BY_TYPE[segment.type] ||
              '在这里写下你的想法…\n\n选中文本可调用智能协作角色进行局部优化。'
            }
            autoSize={{ minRows: 4, maxRows: 16 }}
            style={{
              fontSize: 14,
              lineHeight: 1.8,
              border: 'none',
              boxShadow: 'none',
              background: 'transparent',
              color: 'var(--text-primary)',
              resize: 'none',
              padding: '8px 4px',
              fontFamily: "var(--font-ui)",
            }}
          />

          {/* Rhythm hints */}
          {hints.length > 0 && (
            <div style={{
              marginTop: 8,
              padding: '8px 12px',
              borderRadius: 8,
              background: 'var(--warning-bg)',
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }}>
              {hints.map((hint, i) => (
                <div key={i} style={{
                  fontSize: 11,
                  color: 'var(--warning-color)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  lineHeight: 1.5,
                }}>
                  <span style={{ fontSize: 10, flexShrink: 0 }}>想</span>
                  {hint}
                </div>
              ))}
            </div>
          )}

          {segment.type === 'news_item' && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                来源清单（每行一条）
              </div>
              <TextArea
                value={sourceLines}
                onChange={(e) => {
                  const refs = e.target.value
                    .split('\n')
                    .map((line) => line.trim())
                    .filter(Boolean)
                    .map((title) => ({ title }))
                  onSourceReferencesChange?.(refs)
                }}
                placeholder="例如：新华社｜国家统计局月度数据发布"
                autoSize={{ minRows: 1, maxRows: 4 }}
                style={{
                  fontSize: 11,
                  borderRadius: 8,
                  background: 'var(--bg-tertiary)',
                  borderColor: 'var(--border-color)',
                }}
              />
            </div>
          )}

          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
              段落 AI Prompt
            </div>
            <TextArea
              value={promptOverride || ''}
              onChange={(e) => onPromptOverrideChange?.(e.target.value)}
              placeholder="可选：对当前段落追加风格、结构、事实要求..."
              autoSize={{ minRows: 1, maxRows: 4 }}
              style={{
                fontSize: 11,
                borderRadius: 8,
                background: 'var(--bg-tertiary)',
                borderColor: 'var(--border-color)',
              }}
            />
            <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {PROMPT_TEMPLATES.map((tpl) => (
                <Button
                  key={tpl.key}
                  size="small"
                  onClick={() => onPromptOverrideChange?.(tpl.value)}
                  style={{ borderRadius: 999, fontSize: 10, height: 22, padding: '0 10px' }}
                >
                  {tpl.label}
                </Button>
              ))}
            </div>
            <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <Button
                size="small"
                onClick={onRegenerateAIDraft}
                loading={aiRegenerating}
                disabled={!onRegenerateAIDraft}
                style={{ borderRadius: 6, fontSize: 11 }}
              >
                重新生成本段
              </Button>
              <span style={{ fontSize: 10, color: aiGenerationStatus === 'error' ? 'var(--warning-color)' : 'var(--text-tertiary)' }}>
                {aiGenerationStatus === 'generating' && 'AI 生成中...'}
                {aiGenerationStatus === 'success' && '已更新'}
                {aiGenerationStatus === 'error' && '生成失败'}
                {aiGenerationStatus === 'idle' && '未生成'}
              </span>
            </div>
          </div>

          {/* Bottom toolbar */}
          <div style={{
            marginTop: 10,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
          }}>
            {/* Left: tone selector + status */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {/* Tone selector */}
              <div ref={toneRef} style={{ position: 'relative', zIndex: showToneMenu ? 30 : 1 }}>
                <button
                  onClick={(e) => { e.stopPropagation(); setShowToneMenu(!showToneMenu) }}
                  className="writing-tone-btn"
                  style={{
                    background: segment.tone !== 'default' ? `${cfg.color}10` : 'var(--bg-tertiary)',
                    border: `1px solid ${segment.tone !== 'default' ? `${cfg.color}30` : 'var(--border-color)'}`,
                    borderRadius: 6,
                    padding: '3px 10px',
                    fontSize: 11,
                    color: segment.tone !== 'default' ? cfg.color : 'var(--text-secondary)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    transition: 'all 0.15s ease',
                    fontWeight: 500,
                  }}
                >
                  风 {currentToneLabel}
                  <DownOutlined style={{ fontSize: 8 }} />
                </button>
                {showToneMenu && (
                  <div style={{
                    position: 'absolute', left: 0, top: 30, zIndex: 40,
                    background: 'var(--bg-secondary)', borderRadius: 10,
                    border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-soft)',
                    padding: 4, minWidth: 140,
                    animation: 'fadeIn 0.15s ease',
                  }}>
                    {SEGMENT_TONES.map(t => {
                      const active = segment.tone === t.key
                      return (
                        <div
                          key={t.key}
                          onClick={(e) => { e.stopPropagation(); onToneChange(t.key); setShowToneMenu(false) }}
                          style={{
                            padding: '7px 12px', borderRadius: 6, cursor: 'pointer',
                            fontSize: 12, color: 'var(--text-primary)',
                            background: active ? 'var(--bg-tertiary)' : 'transparent',
                            fontWeight: active ? 600 : 400,
                            transition: 'background 0.15s ease',
                          }}
                          onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--bg-tertiary)' }}
                          onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}
                        >
                          {t.label}
                          {active && <CheckCircleOutlined style={{ fontSize: 10, color: 'var(--accent-primary)', marginLeft: 8 }} />}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Status selector */}
              <select
                value={segment.status}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => onStatusChange(e.target.value as SegmentStatus)}
                style={{
                  background: statusCfg.bg,
                  border: `1px solid ${statusCfg.color}33`,
                  borderRadius: 6,
                  padding: '3px 8px',
                  fontSize: 10,
                  color: statusCfg.color,
                  cursor: 'pointer',
                  fontWeight: 500,
                  transition: 'all 0.15s ease',
                  outline: 'none',
                }}
              >
                {STATUS_OPTIONS.map(status => (
                  <option key={status} value={status}>
                    {STATUS_CONFIG[status].label}
                  </option>
                ))}
              </select>
            </div>

            {/* Right: char count */}
            <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
              {segment.content.length} 字
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
