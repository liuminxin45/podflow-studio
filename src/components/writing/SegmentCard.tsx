import { useState, useRef, useEffect } from 'react'
import { Input, Button } from 'antd'
import {
  CheckCircleFilled,
  CheckCircleOutlined,
  DownOutlined,
  UpOutlined,
} from '../../icons/antdCompat'
import type { SegmentCharacterTarget, WritingSegment, SegmentTone } from './types'
import {
  SEGMENT_TYPE_CONFIG,
  SEGMENT_TONES,
  formatDuration,
  getSegmentHints,
} from './types'

const { TextArea } = Input
interface SegmentCardProps {
  segment: WritingSegment
  isActive: boolean
  allSegments: WritingSegment[]
  characterTarget?: SegmentCharacterTarget
  optimizing?: boolean
  optimizeDisabledReason?: string
  onOptimize?: () => void
  onSelect: () => void
  onLabelChange: (label: string) => void
  onContentChange: (content: string) => void
  onToneChange: (tone: SegmentTone) => void
  onCompletionChange: (isCompleted: boolean) => void
  onCollapse: () => void
}

export default function SegmentCard({
  segment,
  isActive,
  allSegments,
  characterTarget,
  optimizing = false,
  optimizeDisabledReason,
  onOptimize,
  onSelect,
  onLabelChange,
  onContentChange,
  onToneChange,
  onCompletionChange,
  onCollapse,
}: SegmentCardProps) {
  const PLACEHOLDER_BY_TYPE: Partial<Record<WritingSegment['type'], string>> = {
    opening: '在这里写下开场白…\n\n可以用一句导语快速建立主题期待。',
    quick_news: '在这里写快讯…\n\n短、密、直接给出关键信息，避免展开成长分析。',
    deep_dive: '在这里写深度解读…\n\n讲清发生了什么、关键事实、为什么重要和可能影响。',
    closing: '总结核心观点，留下回味…\n\n可以给听众一个思考的问题或行动建议。',
  }

  const cfg = SEGMENT_TYPE_CONFIG[segment.type]
  const hints = getSegmentHints(segment, allSegments, characterTarget)
  const characterCount = segment.content.replace(/\s/g, '').length
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

  const currentToneLabel = SEGMENT_TONES.find(t => t.key === segment.tone)?.label || '使用节目默认'

  return (
    <div
      onClick={onSelect}
      className={`writing-segment-card ${isActive ? 'is-active' : ''}`}
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
      <div className="writing-segment-header" style={{
        padding: '10px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: isActive ? `${cfg.color}06` : 'transparent',
        borderBottom: segment.collapsed ? 'none' : '1px solid var(--border-light)',
        transition: 'background 0.2s ease',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', minWidth: 0, flex: 1, marginRight: 12 }}>
          <Input
            aria-label={`段落标题：${segment.label || cfg.label}`}
            value={segment.label}
            placeholder={cfg.label}
            variant="borderless"
            onClick={event => event.stopPropagation()}
            onChange={event => onLabelChange(event.target.value)}
            onBlur={() => {
              if (!segment.label.trim()) onLabelChange(cfg.label)
            }}
            style={{ minWidth: 0, padding: 0, fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
            约 {formatDuration(segment.estimatedSeconds)}
          </span>
          <button
            type="button"
            className={`writing-completion-button ${segment.isCompleted ? 'is-completed' : ''}`}
            disabled={!segment.content.trim()}
            title={segment.content.trim() ? (segment.isCompleted ? '取消完成标记' : '标记完成') : '先写入内容后再标记完成'}
            aria-label={segment.isCompleted ? '取消完成标记' : '标记完成'}
            onClick={(event) => {
              event.stopPropagation()
              onCompletionChange(!segment.isCompleted)
            }}
          >
            {segment.isCompleted ? <CheckCircleFilled /> : <CheckCircleOutlined />}
            <span>{segment.isCompleted ? '已完成' : '标记完成'}</span>
          </button>
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
        <div className="writing-segment-body" style={{ animation: 'writingExpand 0.2s ease-out' }}>
          {/* Writing area */}
          <TextArea
            className="writing-segment-editor"
            ref={textAreaRef as any}
            value={segment.content}
            onChange={e => onContentChange(e.target.value)}
            placeholder={
              PLACEHOLDER_BY_TYPE[segment.type] ||
              '在这里写下你的想法…'
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
            <div className="writing-rhythm-hints" style={{
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
                  lineHeight: 1.5,
                }}>
                  {hint}
                </div>
              ))}
            </div>
          )}

          {/* Bottom toolbar */}
          <div className="writing-segment-toolbar" style={{
            marginTop: 10,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
          }}>
            {/* Left: tone selector */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {segment.type === 'quick_news' && onOptimize && (
                <button
                  type="button"
                  className="writing-quick-optimize"
                  disabled={optimizing || Boolean(optimizeDisabledReason)}
                  title={optimizeDisabledReason || '只使用本条绑定的事实卡优化正文'}
                  onClick={(event) => {
                    event.stopPropagation()
                    onOptimize()
                  }}
                >
                  {optimizing ? '正在优化…' : '优化这条快讯'}
                </button>
              )}
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
                  {currentToneLabel}
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

            </div>

            {/* Right: char count */}
            <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
              {characterCount} 字
              {characterTarget ? ` · 建议 ${characterTarget.min}–${characterTarget.max} 字` : ''}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
