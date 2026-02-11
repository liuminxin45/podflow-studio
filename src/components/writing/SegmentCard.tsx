import { useState, useRef, useEffect } from 'react'
import { Input, Button, Tag } from 'antd'
import {
  CheckCircleOutlined,
  HolderOutlined,
  DownOutlined,
  UpOutlined,
} from '@ant-design/icons'
import type { WritingSegment, SegmentTone, SegmentStatus } from './types'
import {
  SEGMENT_TYPE_CONFIG,
  SEGMENT_TONES,
  STATUS_CONFIG,
  formatDuration,
  getSegmentHints,
} from './types'

const { TextArea } = Input

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
  onDragStart,
  onDragOver,
  onDrop,
}: SegmentCardProps) {
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
        borderRadius: 12,
        border: `1.5px solid ${isActive ? cfg.color : 'var(--border-color)'}`,
        background: 'var(--bg-secondary)',
        overflow: 'hidden',
        transition: 'all 0.25s cubic-bezier(0.25, 0.8, 0.25, 1)',
        boxShadow: isActive ? `0 0 0 3px ${cfg.color}12, var(--shadow-md)` : 'var(--shadow-sm)',
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
            {cfg.label}
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
              segment.type === 'opening' ? '在这里写下开场白…\n\n可以用一个问题引起好奇，或直接抛出话题。' :
              segment.type === 'closing' ? '总结核心观点，留下回味…\n\n可以给听众一个思考的问题或行动建议。' :
              '在这里写下你的想法…\n\n选中文本可调用AI协作角色进行局部优化。'
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
              fontFamily: "'Inter', 'Noto Sans SC', sans-serif",
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
                  <span style={{ fontSize: 10, flexShrink: 0 }}>💡</span>
                  {hint}
                </div>
              ))}
            </div>
          )}

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
              <div ref={toneRef} style={{ position: 'relative' }}>
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
                  🎭 {currentToneLabel}
                  <DownOutlined style={{ fontSize: 8 }} />
                </button>
                {showToneMenu && (
                  <div style={{
                    position: 'absolute', left: 0, top: 30, zIndex: 100,
                    background: 'var(--bg-secondary)', borderRadius: 10,
                    border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-lg)',
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

              {/* Status toggle */}
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  const order: SegmentStatus[] = ['draft', 'editing', 'polished']
                  const idx = order.indexOf(segment.status)
                  onStatusChange(order[(idx + 1) % order.length])
                }}
                style={{
                  background: statusCfg.bg,
                  border: 'none',
                  borderRadius: 6,
                  padding: '3px 8px',
                  fontSize: 10,
                  color: statusCfg.color,
                  cursor: 'pointer',
                  fontWeight: 500,
                  transition: 'all 0.15s ease',
                }}
              >
                点击切换状态
              </button>
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
