import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import { Button, Tooltip, message } from 'antd'
import {
  CloseOutlined,
  SoundOutlined,
  AudioOutlined,
  PlayCircleOutlined,
  PauseCircleOutlined,
  StepForwardOutlined,
  StepBackwardOutlined,
  RedoOutlined,
  UndoOutlined,
  DeleteOutlined,
  DownloadOutlined,
  CheckCircleOutlined,
  RocketOutlined,
  CaretRightOutlined,
  ScissorOutlined,
  ThunderboltOutlined,
  PlusOutlined,
} from '@ant-design/icons'

// ============================================================
// Types
// ============================================================

type StudioMode = 'ai' | 'recording'
type VoiceStyle = 'natural' | 'steady' | 'deep' | 'relaxed' | 'warm' | 'energetic'
type EmotionLevel = 'subtle' | 'moderate' | 'expressive'
type SpeedLevel = 'slower' | 'normal' | 'faster'
type PauseStyle = 'minimal' | 'natural' | 'dramatic'
type BGMStyle = 'news' | 'interview' | 'latenight' | 'none'
type BGMVolume = 'whisper' | 'background' | 'companion'
type ExpressionTone = 'firm' | 'friendly' | 'calm'

type SegmentRecordingStatus = 'empty' | 'recording' | 'recorded' | 'playing'
type EditActionType = 'delete_selection' | 'trim_edges' | 'compress_pauses' | 'clean_silence' | 'remove_noise'
type TransitionStyle = 'fade' | 'crossfade' | 'musical' | 'silence'
type IntroOutroTemplate = 'professional' | 'casual' | 'minimal' | 'cinematic'
type RightTab = 'voice' | 'atmosphere' | 'editing'

interface TimelineSelection {
  startPos: number
  endPos: number
}

interface EditHistoryEntry {
  id: string
  action: string
  timestamp: number
  description: string
}

interface MusicInsertItem {
  id: string
  segmentId: string
  position: 'before' | 'after'
  style: TransitionStyle
}

interface SegmentBGMOverride {
  segmentId: string
  style: string
  volume: BGMVolume
}

interface ScriptSegment {
  id: string
  label: string
  icon: string
  color: string
  content: string
  estimatedSeconds: number
}

interface RecordingSegment {
  segmentId: string
  status: SegmentRecordingStatus
  durationSeconds: number
  waveformData: number[]
}

interface Props {
  visible: boolean
  onClose: () => void
  episodeTitle?: string
  onProceedToPublish?: () => void
}

// ============================================================
// Constants
// ============================================================

const VOICE_STYLES: Array<{ key: VoiceStyle; label: string; desc: string; icon: string }> = [
  { key: 'natural', label: '自然', desc: '日常对话感，真实亲切', icon: '🗣️' },
  { key: 'steady', label: '稳重', desc: '沉稳有力，像资深主播', icon: '🎙️' },
  { key: 'deep', label: '深度', desc: '低沉磁性，引人深思', icon: '🌊' },
  { key: 'relaxed', label: '轻松', desc: '慵懒随意，像深夜电台', icon: '☕' },
  { key: 'warm', label: '温暖', desc: '柔和关怀，让人安心', icon: '🌅' },
  { key: 'energetic', label: '活力', desc: '充满激情，富有感染力', icon: '⚡' },
]

const EMOTION_LEVELS: Array<{ key: EmotionLevel; label: string; desc: string }> = [
  { key: 'subtle', label: '克制', desc: '平稳内敛' },
  { key: 'moderate', label: '适中', desc: '自然流露' },
  { key: 'expressive', label: '丰富', desc: '情感饱满' },
]

const SPEED_LEVELS: Array<{ key: SpeedLevel; label: string }> = [
  { key: 'slower', label: '稍慢' },
  { key: 'normal', label: '正常' },
  { key: 'faster', label: '稍快' },
]

const PAUSE_STYLES: Array<{ key: PauseStyle; label: string; desc: string }> = [
  { key: 'minimal', label: '紧凑', desc: '段落间几乎不停顿' },
  { key: 'natural', label: '自然', desc: '像正常说话一样' },
  { key: 'dramatic', label: '留白', desc: '适当留出思考空间' },
]

const BGM_STYLES: Array<{ key: BGMStyle; label: string; icon: string; desc: string }> = [
  { key: 'news', label: '新闻风', icon: '📰', desc: '节奏明快，信息感强' },
  { key: 'interview', label: '访谈风', icon: '🎤', desc: '轻柔铺底，不抢注意力' },
  { key: 'latenight', label: '深夜电台', icon: '🌙', desc: '舒缓悠远，氛围感十足' },
  { key: 'none', label: '无音乐', icon: '🔇', desc: '纯人声，干净直接' },
]

const BGM_VOLUMES: Array<{ key: BGMVolume; label: string }> = [
  { key: 'whisper', label: '极轻' },
  { key: 'background', label: '铺底' },
  { key: 'companion', label: '陪伴' },
]

const EXPRESSION_TONES: Array<{ key: ExpressionTone; label: string; icon: string }> = [
  { key: 'firm', label: '更坚定', icon: '💪' },
  { key: 'friendly', label: '更亲切', icon: '🤗' },
  { key: 'calm', label: '更冷静', icon: '🧊' },
]

const QUICK_EDIT_ACTIONS: Array<{ key: EditActionType; label: string; icon: string; desc: string; color: string }> = [
  { key: 'trim_edges', label: '裁掉多余', icon: '✂️', desc: '去除开头结尾的空白', color: '#8b5cf6' },
  { key: 'compress_pauses', label: '缩短停顿', icon: '⏩', desc: '把过长的沉默变紧凑', color: '#f59e0b' },
  { key: 'clean_silence', label: '清理空白', icon: '🧹', desc: '自动去除无声片段', color: '#10b981' },
  { key: 'remove_noise', label: '去除杂音', icon: '✨', desc: '让声音更干净清晰', color: '#2563eb' },
]

const TRANSITION_STYLES: Array<{ key: TransitionStyle; label: string; icon: string; desc: string }> = [
  { key: 'fade', label: '淡入淡出', icon: '🌅', desc: '柔和过渡' },
  { key: 'crossfade', label: '交叉融合', icon: '🔀', desc: '前后声音融合' },
  { key: 'musical', label: '音乐过渡', icon: '🎵', desc: '用一小段旋律衔接' },
  { key: 'silence', label: '自然留白', icon: '💭', desc: '短暂的安静' },
]

const INTRO_TEMPLATES: Array<{ key: IntroOutroTemplate; label: string; icon: string; desc: string; duration: string }> = [
  { key: 'professional', label: '专业范', icon: '🏢', desc: '新闻播报感开场', duration: '5秒' },
  { key: 'casual', label: '轻松聊', icon: '☕', desc: '朋友闲聊的氛围', duration: '4秒' },
  { key: 'minimal', label: '极简风', icon: '🎯', desc: '干净利落，直入主题', duration: '3秒' },
  { key: 'cinematic', label: '电影感', icon: '🎬', desc: '有故事氛围的开场', duration: '6秒' },
]

const SEGMENT_BGM_OPTIONS: Array<{ key: string; label: string; icon: string }> = [
  { key: 'same', label: '跟随全局', icon: '🔗' },
  { key: 'tension', label: '紧张感', icon: '⚡' },
  { key: 'warm', label: '温暖', icon: '🌅' },
  { key: 'reflective', label: '沉思', icon: '💭' },
  { key: 'none', label: '纯人声', icon: '🔇' },
]

const DEMO_SEGMENTS: ScriptSegment[] = [
  { id: 'seg_opening', label: '开场', icon: '🎬', color: '#f59e0b', content: '欢迎来到本期节目，今天我们来聊一个很多人都在关注的话题…', estimatedSeconds: 90 },
  { id: 'seg_main1', label: '主线一', icon: '📌', color: '#2563eb', content: '首先，让我们从最核心的问题说起…', estimatedSeconds: 180 },
  { id: 'seg_main2', label: '主线二', icon: '📌', color: '#8b5cf6', content: '接下来，我想从另一个角度来看这件事…', estimatedSeconds: 180 },
  { id: 'seg_discuss', label: '延伸讨论', icon: '💬', color: '#06b6d4', content: '说到这里，其实还有一个很值得思考的点…', estimatedSeconds: 150 },
  { id: 'seg_closing', label: '结尾', icon: '🎤', color: '#10b981', content: '好了，今天就聊到这里。希望这期节目能给你一些新的思考…', estimatedSeconds: 60 },
]

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}

function generateWaveform(length: number): number[] {
  return Array.from({ length }, () => 0.15 + Math.random() * 0.7)
}

// ============================================================
// Sub-components
// ============================================================

function ModeSwitch({ mode, onChange }: { mode: StudioMode; onChange: (m: StudioMode) => void }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center',
      background: 'var(--bg-tertiary)', borderRadius: 10, padding: 3,
      border: '1px solid var(--border-color)',
    }}>
      <button
        onClick={() => onChange('ai')}
        className="sound-studio-mode-btn"
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '5px 16px', borderRadius: 8, border: 'none',
          fontSize: 13, fontWeight: mode === 'ai' ? 600 : 400, cursor: 'pointer',
          background: mode === 'ai' ? 'var(--bg-secondary)' : 'transparent',
          color: mode === 'ai' ? 'var(--accent-primary)' : 'var(--text-tertiary)',
          boxShadow: mode === 'ai' ? 'var(--shadow-sm)' : 'none',
          transition: 'all 0.25s cubic-bezier(0.25, 0.8, 0.25, 1)',
        }}
      >
        <SoundOutlined /> 智能声音
      </button>
      <button
        onClick={() => onChange('recording')}
        className="sound-studio-mode-btn"
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '5px 16px', borderRadius: 8, border: 'none',
          fontSize: 13, fontWeight: mode === 'recording' ? 600 : 400, cursor: 'pointer',
          background: mode === 'recording' ? 'var(--bg-secondary)' : 'transparent',
          color: mode === 'recording' ? '#ef4444' : 'var(--text-tertiary)',
          boxShadow: mode === 'recording' ? 'var(--shadow-sm)' : 'none',
          transition: 'all 0.25s cubic-bezier(0.25, 0.8, 0.25, 1)',
        }}
      >
        <AudioOutlined /> 我的声音
      </button>
    </div>
  )
}

function WaveformBar({ data, color, isPlaying, progress }: {
  data: number[]
  color: string
  isPlaying: boolean
  progress: number
}) {
  const barCount = data.length
  const playedBars = Math.floor(progress * barCount)
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 1.5, height: 40,
      padding: '0 4px',
    }}>
      {data.map((h, i) => (
        <div
          key={i}
          style={{
            flex: 1,
            height: `${h * 100}%`,
            minHeight: 3,
            borderRadius: 2,
            background: i < playedBars ? color : `${color}30`,
            transition: isPlaying ? 'background 0.1s' : 'background 0.3s',
          }}
        />
      ))}
    </div>
  )
}

function EnhancedTimeline({ segments, totalDuration, activeId, playheadPosition, onSeek, selection, onSelectionChange, bgmStyle, musicInserts, enableIntro, enableOutro }: {
  segments: ScriptSegment[]
  totalDuration: number
  activeId: string
  playheadPosition: number
  onSeek: (pos: number) => void
  selection: TimelineSelection | null
  onSelectionChange: (sel: TimelineSelection | null) => void
  bgmStyle: BGMStyle
  musicInserts: MusicInsertItem[]
  enableIntro: boolean
  enableOutro: boolean
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const isDragging = useRef(false)
  const dragStart = useRef(0)
  const voiceWave = useMemo(() => generateWaveform(240), [])
  const bgmWave = useMemo(() => generateWaveform(240).map(v => v * 0.5 + 0.1), [])

  const posFromEvent = (e: React.MouseEvent) => {
    if (!containerRef.current) return 0
    const rect = containerRef.current.getBoundingClientRect()
    return Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return
    const pos = posFromEvent(e)
    isDragging.current = true
    dragStart.current = pos
    onSelectionChange(null)
    onSeek(pos)
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging.current) return
    const pos = posFromEvent(e)
    const s = Math.min(dragStart.current, pos)
    const end = Math.max(dragStart.current, pos)
    if (Math.abs(end - s) > 0.005) {
      onSelectionChange({ startPos: s, endPos: end })
    }
  }

  const handleMouseUp = () => { isDragging.current = false }

  let accumulatedTime = 0
  const segmentRanges = segments.map(seg => {
    const start = accumulatedTime / totalDuration
    accumulatedTime += seg.estimatedSeconds
    const end = accumulatedTime / totalDuration
    return { ...seg, start, end }
  })

  const hasInsertAt = (segId: string, pos: 'before' | 'after') =>
    musicInserts.some(m => m.segmentId === segId && m.position === pos)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {/* Voice Track Label + Waveform */}
      <div style={{ display: 'flex', alignItems: 'stretch' }}>
        <div style={{
          width: 52, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 9, fontWeight: 600, color: 'var(--text-tertiary)',
          borderRight: '1px solid var(--border-light)', background: 'var(--bg-tertiary)',
          borderRadius: '12px 0 0 0', letterSpacing: 0.3,
        }}>
          人声
        </div>
        <div
          ref={containerRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          style={{
            position: 'relative', flex: 1, height: 72,
            background: 'var(--bg-secondary)',
            borderRadius: '0 12px 0 0',
            border: '1px solid var(--border-color)', borderLeft: 'none',
            overflow: 'hidden', cursor: 'crosshair',
            userSelect: 'none',
          }}
        >
          {/* Segment backgrounds */}
          {segmentRanges.map(seg => (
            <div key={seg.id} style={{
              position: 'absolute',
              left: `${seg.start * 100}%`, width: `${(seg.end - seg.start) * 100}%`,
              top: 0, bottom: 0,
              background: seg.id === activeId ? `${seg.color}0c` : 'transparent',
              borderRight: '1px dashed var(--border-light)',
              transition: 'background 0.3s ease',
            }}>
              <div style={{
                position: 'absolute', top: 3, left: 5,
                fontSize: 8, color: seg.color, fontWeight: 600, opacity: 0.7,
                whiteSpace: 'nowrap',
              }}>
                {seg.icon} {seg.label}
              </div>
              {/* Transition music markers */}
              {hasInsertAt(seg.id, 'before') && (
                <div style={{
                  position: 'absolute', left: -1, top: 0, bottom: 0, width: 3,
                  background: `linear-gradient(180deg, #f59e0b 0%, transparent 100%)`,
                  zIndex: 3,
                }} />
              )}
            </div>
          ))}

          {/* Selection highlight */}
          {selection && (
            <div className="timeline-selection-highlight" style={{
              position: 'absolute',
              left: `${selection.startPos * 100}%`,
              width: `${(selection.endPos - selection.startPos) * 100}%`,
              top: 0, bottom: 0,
              background: 'rgba(37,99,235,0.12)',
              borderLeft: '2px solid var(--accent-primary)',
              borderRight: '2px solid var(--accent-primary)',
              zIndex: 3,
              animation: 'timelineSelectionIn 0.15s ease-out',
            }}>
              <div style={{
                position: 'absolute', top: 2, left: '50%', transform: 'translateX(-50%)',
                fontSize: 8, color: 'var(--accent-primary)', fontWeight: 700,
                background: 'var(--accent-light)', padding: '1px 6px', borderRadius: 4,
                whiteSpace: 'nowrap',
              }}>
                {formatTime(Math.round((selection.endPos - selection.startPos) * totalDuration))}
              </div>
            </div>
          )}

          {/* Voice waveform bars */}
          <div style={{
            position: 'absolute', left: 0, right: 0, top: 16, bottom: 6,
            display: 'flex', alignItems: 'center', gap: 0.8, padding: '0 6px',
          }}>
            {voiceWave.map((h, i) => {
              const pos = i / voiceWave.length
              const seg = segmentRanges.find(s => pos >= s.start && pos < s.end)
              const c = seg?.color || '#9ca3af'
              const isPlayed = pos < playheadPosition
              const inSelection = selection && pos >= selection.startPos && pos <= selection.endPos
              return (
                <div key={i} style={{
                  flex: 1, height: `${h * 100}%`, minHeight: 2, borderRadius: 1,
                  background: inSelection ? 'var(--accent-primary)' : isPlayed ? c : `${c}25`,
                  opacity: inSelection ? 0.8 : 1,
                  transition: 'background 0.1s',
                }} />
              )
            })}
          </div>

          {/* Intro/Outro markers */}
          {enableIntro && (
            <div style={{
              position: 'absolute', left: 0, top: 0, bottom: 0, width: '2.5%',
              background: 'linear-gradient(90deg, rgba(16,185,129,0.15) 0%, transparent 100%)',
              borderRight: '1px dashed #10b981',
              zIndex: 1,
            }}>
              <div style={{
                position: 'absolute', bottom: 2, left: 3,
                fontSize: 7, color: '#10b981', fontWeight: 600,
              }}>
                片头
              </div>
            </div>
          )}
          {enableOutro && (
            <div style={{
              position: 'absolute', right: 0, top: 0, bottom: 0, width: '2%',
              background: 'linear-gradient(270deg, rgba(16,185,129,0.15) 0%, transparent 100%)',
              borderLeft: '1px dashed #10b981',
              zIndex: 1,
            }}>
              <div style={{
                position: 'absolute', bottom: 2, right: 3,
                fontSize: 7, color: '#10b981', fontWeight: 600,
              }}>
                片尾
              </div>
            </div>
          )}

          {/* Playhead */}
          <div style={{
            position: 'absolute',
            left: `${playheadPosition * 100}%`,
            top: 0, bottom: 0, width: 2,
            background: 'var(--accent-primary)',
            boxShadow: '0 0 6px rgba(37,99,235,0.4)',
            transition: 'left 0.1s linear',
            zIndex: 5,
          }}>
            <div style={{
              position: 'absolute', top: -3, left: -5,
              width: 12, height: 12, borderRadius: '50%',
              background: 'var(--accent-primary)',
              border: '2px solid #fff',
              boxShadow: 'var(--shadow-sm)',
              cursor: 'grab',
            }} />
          </div>
        </div>
      </div>

      {/* BGM Track */}
      {bgmStyle !== 'none' && (
        <div style={{ display: 'flex', alignItems: 'stretch' }}>
          <div style={{
            width: 52, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 9, fontWeight: 600, color: 'var(--text-tertiary)',
            borderRight: '1px solid var(--border-light)', background: 'var(--bg-tertiary)',
            borderRadius: '0 0 0 12px', letterSpacing: 0.3,
          }}>
            音乐
          </div>
          <div style={{
            flex: 1, height: 28, position: 'relative',
            background: 'var(--bg-primary)',
            border: '1px solid var(--border-color)', borderTop: 'none', borderLeft: 'none',
            borderRadius: '0 0 12px 0',
            overflow: 'hidden',
          }}>
            {/* BGM waveform - subtle */}
            <div style={{
              position: 'absolute', left: 0, right: 0, top: 4, bottom: 4,
              display: 'flex', alignItems: 'center', gap: 0.5, padding: '0 6px',
              opacity: 0.6,
            }}>
              {bgmWave.map((h, i) => {
                const pos = i / bgmWave.length
                const isPlayed = pos < playheadPosition
                return (
                  <div key={i} style={{
                    flex: 1, height: `${h * 100}%`, minHeight: 1, borderRadius: 1,
                    background: isPlayed ? '#10b981' : '#10b98130',
                    transition: 'background 0.1s',
                  }} />
                )
              })}
            </div>
            {/* Playhead shadow on BGM track */}
            <div style={{
              position: 'absolute',
              left: `${playheadPosition * 100}%`,
              top: 0, bottom: 0, width: 1,
              background: 'var(--accent-primary)',
              opacity: 0.5,
              transition: 'left 0.1s linear',
            }} />
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================================
// Recording Segment Card
// ============================================================

function RecordingSegmentCard({
  segment,
  recording,
  isActive,
  onSelect,
  onRecord,
  onStop,
  onReRecord,
  onDelete,
  onPlay,
}: {
  segment: ScriptSegment
  recording: RecordingSegment
  isActive: boolean
  onSelect: () => void
  onRecord: () => void
  onStop: () => void
  onReRecord: () => void
  onDelete: () => void
  onPlay: () => void
}) {
  const statusConfig: Record<SegmentRecordingStatus, { label: string; color: string; bg: string }> = {
    empty: { label: '未录制', color: '#9ca3af', bg: '#f3f4f6' },
    recording: { label: '录制中', color: '#ef4444', bg: '#fef2f2' },
    recorded: { label: '已录制', color: '#10b981', bg: '#ecfdf5' },
    playing: { label: '播放中', color: '#2563eb', bg: '#eff6ff' },
  }
  const st = statusConfig[recording.status]

  return (
    <div
      onClick={onSelect}
      className="sound-studio-rec-card"
      style={{
        marginBottom: 8,
        borderRadius: 10,
        border: `1.5px solid ${isActive ? segment.color : 'var(--border-color)'}`,
        background: 'var(--bg-secondary)',
        overflow: 'hidden',
        transition: 'all 0.25s cubic-bezier(0.25, 0.8, 0.25, 1)',
        boxShadow: isActive ? `0 0 0 3px ${segment.color}12, var(--shadow-md)` : 'var(--shadow-sm)',
        animation: 'soundStudioCardIn 0.3s ease-out',
        cursor: 'pointer',
      }}
    >
      {/* Header */}
      <div style={{
        padding: '8px 12px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: isActive ? `${segment.color}06` : 'transparent',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 13 }}>{segment.icon}</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
            {segment.label}
          </span>
          <span style={{
            fontSize: 10, padding: '1px 6px', borderRadius: 4,
            background: st.bg, color: st.color, fontWeight: 500,
          }}>
            {st.label}
          </span>
        </div>
        <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
          {recording.durationSeconds > 0 ? formatTime(recording.durationSeconds) : `约 ${formatTime(segment.estimatedSeconds)}`}
        </span>
      </div>

      {/* Script preview */}
      <div style={{
        padding: '6px 12px',
        fontSize: 11, color: 'var(--text-tertiary)',
        lineHeight: 1.5,
        borderTop: '1px solid var(--border-light)',
        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
        overflow: 'hidden',
      }}>
        {segment.content || '暂无稿件内容'}
      </div>

      {/* Waveform & actions (if recorded or recording) */}
      {(recording.status === 'recorded' || recording.status === 'recording' || recording.status === 'playing') && (
        <div style={{ padding: '4px 12px 8px' }}>
          <WaveformBar
            data={recording.waveformData}
            color={recording.status === 'recording' ? '#ef4444' : segment.color}
            isPlaying={recording.status === 'playing'}
            progress={recording.status === 'playing' ? 0.6 : recording.status === 'recording' ? 1 : 0}
          />
        </div>
      )}

      {/* Action buttons */}
      {isActive && (
        <div style={{
          padding: '6px 12px 10px',
          display: 'flex', alignItems: 'center', gap: 6,
          borderTop: '1px solid var(--border-light)',
          animation: 'soundStudioActionsIn 0.2s ease-out',
        }}>
          {recording.status === 'empty' && (
            <Button
              size="small" type="primary" danger
              icon={<AudioOutlined />}
              onClick={(e) => { e.stopPropagation(); onRecord() }}
              style={{ borderRadius: 6, fontSize: 11, height: 26 }}
            >
              开始录制
            </Button>
          )}
          {recording.status === 'recording' && (
            <Button
              size="small" type="primary" danger
              icon={<PauseCircleOutlined />}
              onClick={(e) => { e.stopPropagation(); onStop() }}
              style={{ borderRadius: 6, fontSize: 11, height: 26, animation: 'soundStudioPulse 1.5s ease-in-out infinite' }}
            >
              停止录制
            </Button>
          )}
          {(recording.status === 'recorded' || recording.status === 'playing') && (
            <>
              <Button
                size="small" type="text"
                icon={<CaretRightOutlined />}
                onClick={(e) => { e.stopPropagation(); onPlay() }}
                style={{ borderRadius: 6, fontSize: 11, height: 26, color: 'var(--accent-primary)' }}
              >
                试听
              </Button>
              <Button
                size="small" type="text"
                icon={<RedoOutlined />}
                onClick={(e) => { e.stopPropagation(); onReRecord() }}
                style={{ borderRadius: 6, fontSize: 11, height: 26, color: 'var(--warning-color)' }}
              >
                重录
              </Button>
              <Button
                size="small" type="text" danger
                icon={<DeleteOutlined />}
                onClick={(e) => { e.stopPropagation(); onDelete() }}
                style={{ borderRadius: 6, fontSize: 11, height: 26 }}
              >
                删除
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ============================================================
// Completion Overlay
// ============================================================

function CompletionOverlay({
  title,
  totalDuration,
  onListen,
  onDownload,
  onPublish,
  onBack,
}: {
  title: string
  totalDuration: number
  onListen: () => void
  onDownload: () => void
  onPublish: () => void
  onBack: () => void
}) {
  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 100,
      background: 'rgba(249,250,251,0.96)',
      backdropFilter: 'blur(12px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      animation: 'fadeIn 0.4s ease',
    }}>
      <div style={{
        width: 480, textAlign: 'center',
        animation: 'soundStudioCompletionIn 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
      }}>
        {/* Cover artwork placeholder */}
        <div style={{
          width: 200, height: 200, borderRadius: 24,
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          margin: '0 auto 28px', boxShadow: '0 20px 40px rgba(102,126,234,0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          position: 'relative', overflow: 'hidden',
        }}>
          <div style={{
            position: 'absolute', inset: 0,
            background: 'radial-gradient(circle at 30% 30%, rgba(255,255,255,0.15) 0%, transparent 60%)',
          }} />
          <span style={{ fontSize: 56, filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.2))' }}>🎧</span>
        </div>

        {/* Title */}
        <div style={{
          fontSize: 24, fontWeight: 800, color: 'var(--text-primary)',
          marginBottom: 8, lineHeight: 1.3,
        }}>
          作品已完成
        </div>
        <div style={{
          fontSize: 15, color: 'var(--text-secondary)', marginBottom: 6,
          fontWeight: 500,
        }}>
          {title || '未命名节目'}
        </div>
        <div style={{
          fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 32,
        }}>
          总时长 {formatTime(totalDuration)} · 高品质音频
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginBottom: 20 }}>
          <Button
            size="large"
            icon={<PlayCircleOutlined />}
            onClick={onListen}
            style={{
              borderRadius: 12, height: 48, paddingInline: 28,
              fontSize: 14, fontWeight: 600,
              borderColor: 'var(--border-color)',
            }}
          >
            完整试听
          </Button>
          <Button
            size="large"
            icon={<DownloadOutlined />}
            onClick={onDownload}
            style={{
              borderRadius: 12, height: 48, paddingInline: 28,
              fontSize: 14, fontWeight: 600,
              borderColor: 'var(--border-color)',
            }}
          >
            下载音频
          </Button>
        </div>
        <Button
          type="primary"
          size="large"
          icon={<RocketOutlined />}
          onClick={onPublish}
          style={{
            borderRadius: 12, height: 52, paddingInline: 40,
            fontSize: 15, fontWeight: 700,
            background: 'linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)',
            border: 'none',
            boxShadow: '0 8px 24px rgba(37,99,235,0.3)',
          }}
        >
          进入发布
        </Button>
        <div style={{ marginTop: 16 }}>
          <Button type="link" onClick={onBack} style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>
            返回继续调整
          </Button>
        </div>
      </div>
    </div>
  )
}

// ============================================================
// Main Component
// ============================================================

export default function SoundStudio({
  visible,
  onClose,
  episodeTitle = '',
  onProceedToPublish,
}: Props) {
  // Mode
  const [mode, setMode] = useState<StudioMode>('ai')

  // AI voice settings
  const [voiceStyle, setVoiceStyle] = useState<VoiceStyle>('natural')
  const [emotionLevel, setEmotionLevel] = useState<EmotionLevel>('moderate')
  const [speedLevel, setSpeedLevel] = useState<SpeedLevel>('normal')
  const [pauseStyle, setPauseStyle] = useState<PauseStyle>('natural')
  const [expressionTone, setExpressionTone] = useState<ExpressionTone | null>(null)

  // BGM & atmosphere
  const [bgmStyle, setBgmStyle] = useState<BGMStyle>('interview')
  const [bgmVolume, setBgmVolume] = useState<BGMVolume>('background')
  const [enableIntro, setEnableIntro] = useState(true)
  const [enableOutro, setEnableOutro] = useState(true)

  // Playback
  const [isPlaying, setIsPlaying] = useState(false)
  const [playheadPosition, setPlayheadPosition] = useState(0)
  const [activeSegmentId, setActiveSegmentId] = useState('seg_opening')
  const playIntervalRef = useRef<number | null>(null)

  // Recording mode state
  const [recordings, setRecordings] = useState<Record<string, RecordingSegment>>(() => {
    const init: Record<string, RecordingSegment> = {}
    DEMO_SEGMENTS.forEach(seg => {
      init[seg.id] = { segmentId: seg.id, status: 'empty', durationSeconds: 0, waveformData: [] }
    })
    return init
  })

  // Generation & completion
  const [isGenerating, setIsGenerating] = useState(false)
  const [showCompletion, setShowCompletion] = useState(false)
  const [generationProgress, setGenerationProgress] = useState(0)

  // Right panel tab
  const [rightTab, setRightTab] = useState<RightTab>('voice')

  // ── Editing state ────────────────────────────────────────
  const [timelineSelection, setTimelineSelection] = useState<TimelineSelection | null>(null)
  const [editHistory, setEditHistory] = useState<EditHistoryEntry[]>([])
  const [editHistoryIndex, setEditHistoryIndex] = useState(-1)
  const [musicInserts, setMusicInserts] = useState<MusicInsertItem[]>([])
  const [segmentBGMOverrides, setSegmentBGMOverrides] = useState<Record<string, SegmentBGMOverride>>({})
  const [introTemplate, setIntroTemplate] = useState<IntroOutroTemplate>('casual')
  const [outroTemplate, setOutroTemplate] = useState<IntroOutroTemplate>('minimal')
  const [transitionStyle, setTransitionStyle] = useState<TransitionStyle>('fade')

  // Computed
  const segments = DEMO_SEGMENTS
  const totalDuration = useMemo(() => segments.reduce((sum, s) => sum + s.estimatedSeconds, 0), [segments])
  const activeSegment = segments.find(s => s.id === activeSegmentId)

  // Recording counts
  const recordedCount = Object.values(recordings).filter(r => r.status === 'recorded').length

  // ── Playback simulation ────────────────────────────────
  const togglePlay = useCallback(() => {
    if (isPlaying) {
      setIsPlaying(false)
      if (playIntervalRef.current) clearInterval(playIntervalRef.current)
    } else {
      setIsPlaying(true)
      playIntervalRef.current = window.setInterval(() => {
        setPlayheadPosition(prev => {
          if (prev >= 1) {
            setIsPlaying(false)
            if (playIntervalRef.current) clearInterval(playIntervalRef.current)
            return 0
          }
          return prev + 0.002
        })
      }, 100)
    }
  }, [isPlaying])

  useEffect(() => {
    return () => {
      if (playIntervalRef.current) clearInterval(playIntervalRef.current)
    }
  }, [])

  // ── Preview segment ────────────────────────────────────
  const previewSegment = useCallback((segId: string) => {
    const seg = segments.find(s => s.id === segId)
    if (!seg) return
    let accumulated = 0
    for (const s of segments) {
      if (s.id === segId) break
      accumulated += s.estimatedSeconds
    }
    setPlayheadPosition(accumulated / totalDuration)
    setActiveSegmentId(segId)
    message.info({ content: `试听：${seg.label}`, duration: 1.5, style: { marginTop: 60 } })
  }, [segments, totalDuration])

  // ── Recording actions ──────────────────────────────────
  const startRecording = useCallback((segId: string) => {
    setRecordings(prev => ({
      ...prev,
      [segId]: { ...prev[segId], status: 'recording', waveformData: generateWaveform(50) },
    }))
    message.info({ content: '🎙️ 开始录制…', duration: 1.5, style: { marginTop: 60 } })
    // Simulate recording for 3 seconds
    setTimeout(() => {
      setRecordings(prev => ({
        ...prev,
        [segId]: { ...prev[segId], status: 'recorded', durationSeconds: 45, waveformData: generateWaveform(50) },
      }))
      message.success({ content: '录制完成', duration: 1.5, style: { marginTop: 60 } })
    }, 3000)
  }, [])

  const stopRecording = useCallback((segId: string) => {
    setRecordings(prev => ({
      ...prev,
      [segId]: { ...prev[segId], status: 'recorded', durationSeconds: 30, waveformData: generateWaveform(50) },
    }))
  }, [])

  const reRecord = useCallback((segId: string) => {
    setRecordings(prev => ({
      ...prev,
      [segId]: { ...prev[segId], status: 'empty', durationSeconds: 0, waveformData: [] },
    }))
  }, [])

  const deleteRecording = useCallback((segId: string) => {
    setRecordings(prev => ({
      ...prev,
      [segId]: { segmentId: segId, status: 'empty', durationSeconds: 0, waveformData: [] },
    }))
  }, [])

  const playRecording = useCallback((segId: string) => {
    setRecordings(prev => ({
      ...prev,
      [segId]: { ...prev[segId], status: 'playing' },
    }))
    setTimeout(() => {
      setRecordings(prev => ({
        ...prev,
        [segId]: { ...prev[segId], status: 'recorded' },
      }))
    }, 2000)
  }, [])

  // ── Generate final audio ───────────────────────────────
  const handleGenerate = useCallback(() => {
    setIsGenerating(true)
    setGenerationProgress(0)
    const interval = setInterval(() => {
      setGenerationProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval)
          setIsGenerating(false)
          setShowCompletion(true)
          return 100
        }
        return prev + 2
      })
    }, 80)
  }, [])

  // ── Editing actions ──────────────────────────────────────
  const performEdit = useCallback((action: EditActionType, desc: string) => {
    const entry: EditHistoryEntry = {
      id: `edit_${Date.now()}`,
      action,
      timestamp: Date.now(),
      description: desc,
    }
    setEditHistory(prev => {
      const trimmed = prev.slice(0, editHistoryIndex + 1)
      return [...trimmed, entry]
    })
    setEditHistoryIndex(prev => prev + 1)
    setTimelineSelection(null)
    message.success({ content: `✅ ${desc}`, duration: 2, style: { marginTop: 60 } })
  }, [editHistoryIndex])

  const handleUndo = useCallback(() => {
    if (editHistoryIndex < 0) return
    const entry = editHistory[editHistoryIndex]
    setEditHistoryIndex(prev => prev - 1)
    message.info({ content: `↩️ 已撤销：${entry.description}`, duration: 1.5, style: { marginTop: 60 } })
  }, [editHistoryIndex, editHistory])

  const handleRedo = useCallback(() => {
    if (editHistoryIndex >= editHistory.length - 1) return
    const entry = editHistory[editHistoryIndex + 1]
    setEditHistoryIndex(prev => prev + 1)
    message.info({ content: `↪️ 已重做：${entry.description}`, duration: 1.5, style: { marginTop: 60 } })
  }, [editHistoryIndex, editHistory])

  const handleDeleteSelection = useCallback(() => {
    if (!timelineSelection) return
    performEdit('delete_selection', '删除选中片段')
  }, [timelineSelection, performEdit])

  const handleAddMusicInsert = useCallback((segId: string, position: 'before' | 'after') => {
    const exists = musicInserts.some(m => m.segmentId === segId && m.position === position)
    if (exists) {
      setMusicInserts(prev => prev.filter(m => !(m.segmentId === segId && m.position === position)))
      message.info({ content: '已移除过渡音乐', duration: 1.5, style: { marginTop: 60 } })
    } else {
      setMusicInserts(prev => [...prev, { id: `mi_${Date.now()}`, segmentId: segId, position, style: transitionStyle }])
      message.success({ content: '🎵 已添加过渡音乐', duration: 1.5, style: { marginTop: 60 } })
    }
  }, [musicInserts, transitionStyle])

  const handleSegmentBGMChange = useCallback((segId: string, style: string) => {
    if (style === 'same') {
      setSegmentBGMOverrides(prev => {
        const next = { ...prev }
        delete next[segId]
        return next
      })
    } else {
      setSegmentBGMOverrides(prev => ({
        ...prev,
        [segId]: { segmentId: segId, style, volume: bgmVolume },
      }))
    }
  }, [bgmVolume])

  // ── Mode change ────────────────────────────────────────
  const handleModeChange = useCallback((newMode: StudioMode) => {
    setMode(newMode)
    setRightTab('voice')
    const modeLabel = newMode === 'ai' ? '智能声音模式' : '真人录音模式'
    message.info({
      content: `已切换到${modeLabel}`,
      duration: 1.5,
      style: { marginTop: 60 },
      icon: newMode === 'ai' ? <SoundOutlined style={{ color: 'var(--accent-primary)' }} /> : <AudioOutlined style={{ color: '#ef4444' }} />,
    })
  }, [])

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
        {/* Left: icon + title + mode indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 30, height: 30, borderRadius: 8,
            background: mode === 'ai'
              ? 'linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)'
              : 'linear-gradient(135deg, #ef4444 0%, #f59e0b 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontSize: 15,
            transition: 'background 0.3s ease',
          }}>
            {mode === 'ai' ? '🤖' : '🎙️'}
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.3 }}>
              声音工作台
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', lineHeight: 1.2 }}>
              {formatTime(totalDuration)} · {segments.length} 段
            </div>
          </div>
        </div>

        {/* Center: Mode Switch */}
        <ModeSwitch mode={mode} onChange={handleModeChange} />

        {/* Right: actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Button
            type="primary"
            icon={isGenerating ? undefined : <CheckCircleOutlined />}
            onClick={handleGenerate}
            disabled={isGenerating}
            style={{
              background: isGenerating ? 'var(--bg-tertiary)' : 'var(--accent-primary)',
              borderColor: isGenerating ? 'var(--border-color)' : 'var(--accent-primary)',
              borderRadius: 8, fontWeight: 600, fontSize: 13, height: 32,
              color: isGenerating ? 'var(--text-tertiary)' : '#fff',
            }}
          >
            {isGenerating ? `生成中 ${generationProgress}%` : '生成音频'}
          </Button>
          <Tooltip title="返回">
            <Button type="text" icon={<CloseOutlined />} onClick={onClose}
              style={{ color: 'var(--text-tertiary)' }} />
          </Tooltip>
        </div>
      </div>

      {/* ==================== BODY ==================== */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' }}>

        {/* ===== LEFT: Script Structure ===== */}
        <div style={{
          width: 260, flexShrink: 0,
          borderRight: '1px solid var(--border-color)',
          display: 'flex', flexDirection: 'column',
          background: 'var(--bg-secondary)',
        }}>
          {/* Episode info */}
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border-color)' }}>
            <div style={{
              fontSize: 14, fontWeight: 700, color: 'var(--text-primary)',
              marginBottom: 4, lineHeight: 1.3,
            }}>
              {episodeTitle || '未命名节目'}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
              {mode === 'ai' ? '使用智能声音制作' : `已录制 ${recordedCount}/${segments.length} 段`}
            </div>
          </div>

          {/* Segments nav header */}
          <div style={{
            padding: '8px 14px', fontSize: 10, fontWeight: 600,
            color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.5,
          }}>
            稿件结构
          </div>

          {/* Segments list */}
          <div style={{ flex: 1, overflow: 'auto', padding: '0 8px' }}>
            {mode === 'ai' ? (
              // AI mode: simple segment navigation
              segments.map(seg => {
                const isActive = seg.id === activeSegmentId
                return (
                  <div
                    key={seg.id}
                    onClick={() => { setActiveSegmentId(seg.id); previewSegment(seg.id) }}
                    style={{
                      padding: '9px 10px', marginBottom: 2, borderRadius: 8,
                      cursor: 'pointer',
                      background: isActive ? `${seg.color}08` : 'transparent',
                      borderLeft: `3px solid ${isActive ? seg.color : 'transparent'}`,
                      transition: 'all 0.2s ease',
                    }}
                    onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--bg-tertiary)' }}
                    onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = isActive ? `${seg.color}08` : 'transparent' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                      <span style={{ fontSize: 12 }}>{seg.icon}</span>
                      <span style={{ fontSize: 12, fontWeight: isActive ? 600 : 500, color: 'var(--text-primary)', flex: 1 }}>
                        {seg.label}
                      </span>
                      <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
                        {formatTime(seg.estimatedSeconds)}
                      </span>
                    </div>
                    <div style={{
                      fontSize: 10, color: 'var(--text-tertiary)', paddingLeft: 18,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {seg.content.slice(0, 30)}…
                    </div>
                  </div>
                )
              })
            ) : (
              // Recording mode: recording segment cards
              segments.map(seg => (
                <RecordingSegmentCard
                  key={seg.id}
                  segment={seg}
                  recording={recordings[seg.id]}
                  isActive={seg.id === activeSegmentId}
                  onSelect={() => setActiveSegmentId(seg.id)}
                  onRecord={() => startRecording(seg.id)}
                  onStop={() => stopRecording(seg.id)}
                  onReRecord={() => reRecord(seg.id)}
                  onDelete={() => deleteRecording(seg.id)}
                  onPlay={() => playRecording(seg.id)}
                />
              ))
            )}
          </div>

          {/* Duration bar */}
          <div style={{
            padding: '12px 14px', borderTop: '1px solid var(--border-color)',
            background: 'var(--bg-tertiary)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)' }}>
                预计总时长
              </span>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                {formatTime(totalDuration)}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 2, height: 6, borderRadius: 3, overflow: 'hidden' }}>
              {segments.map(seg => {
                const pct = totalDuration > 0 ? (seg.estimatedSeconds / totalDuration) * 100 : 20
                return (
                  <div key={seg.id} style={{
                    width: `${pct}%`, height: '100%',
                    background: seg.color, borderRadius: 2,
                    opacity: seg.id === activeSegmentId ? 1 : 0.4,
                    transition: 'opacity 0.3s ease',
                  }} />
                )
              })}
            </div>
          </div>
        </div>

        {/* ===== CENTER: Timeline & Playback ===== */}
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          background: 'var(--bg-primary)', minWidth: 0,
        }}>
          {/* Center content area */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '24px 32px', overflow: 'auto' }}>

            {/* Empty state / Welcome */}
            {!isGenerating && !showCompletion && (
              <div style={{
                flex: 1, display: 'flex', flexDirection: 'column',
                justifyContent: 'center', alignItems: 'center',
                maxWidth: 560, margin: '0 auto', width: '100%',
              }}>
                {/* Main visual */}
                <div style={{
                  width: 100, height: 100, borderRadius: 24,
                  background: mode === 'ai'
                    ? 'linear-gradient(135deg, #eff6ff 0%, #ede9fe 100%)'
                    : 'linear-gradient(135deg, #fef2f2 0%, #fffbeb 100%)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  marginBottom: 24,
                  border: '1px solid var(--border-color)',
                }}>
                  <span style={{ fontSize: 44 }}>
                    {mode === 'ai' ? '🎧' : '🎙️'}
                  </span>
                </div>

                <div style={{
                  fontSize: 18, fontWeight: 700, color: 'var(--text-primary)',
                  marginBottom: 8, textAlign: 'center',
                }}>
                  {mode === 'ai' ? '你的录音室已准备就绪' : '准备好录制你的声音了'}
                </div>
                <div style={{
                  fontSize: 13, color: 'var(--text-secondary)', textAlign: 'center',
                  lineHeight: 1.8, marginBottom: 32, maxWidth: 420,
                }}>
                  {mode === 'ai' ? (
                    <>
                      在右侧选择你喜欢的声音风格，调整节奏和情绪，
                      <br />然后点击试听感受效果。满意之后，一键生成完整音频。
                    </>
                  ) : (
                    <>
                      左侧是你的稿件结构，逐段录制你的声音。
                      <br />每一段都可以重录，直到满意为止。不需要一次完美。
                    </>
                  )}
                </div>

                {/* Quick action */}
                {mode === 'ai' && activeSegment && (
                  <Button
                    icon={<CaretRightOutlined />}
                    onClick={togglePlay}
                    style={{
                      borderRadius: 12, height: 44, paddingInline: 28,
                      fontSize: 14, fontWeight: 600,
                      borderColor: 'var(--accent-primary)',
                      color: 'var(--accent-primary)',
                    }}
                  >
                    试听「{activeSegment.label}」
                  </Button>
                )}
                {mode === 'recording' && (
                  <Button
                    icon={<AudioOutlined />}
                    type="primary"
                    danger
                    onClick={() => startRecording(activeSegmentId)}
                    style={{
                      borderRadius: 12, height: 44, paddingInline: 28,
                      fontSize: 14, fontWeight: 600,
                    }}
                  >
                    录制「{activeSegment?.label || '开场'}」
                  </Button>
                )}
              </div>
            )}

            {/* Generation progress */}
            {isGenerating && (
              <div style={{
                flex: 1, display: 'flex', flexDirection: 'column',
                justifyContent: 'center', alignItems: 'center',
                animation: 'fadeIn 0.3s ease',
              }}>
                <div style={{
                  width: 80, height: 80, borderRadius: 20,
                  background: 'linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  marginBottom: 24,
                  animation: 'soundStudioPulse 2s ease-in-out infinite',
                }}>
                  <span style={{ fontSize: 36, filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.2))' }}>🎵</span>
                </div>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
                  正在制作你的播客…
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 24 }}>
                  {generationProgress < 30 ? '解析稿件内容…' :
                   generationProgress < 60 ? '生成语音轨道…' :
                   generationProgress < 85 ? '混合背景音乐…' :
                   '最终渲染中…'}
                </div>
                {/* Progress bar */}
                <div style={{
                  width: 320, height: 6, borderRadius: 3,
                  background: 'var(--bg-tertiary)', overflow: 'hidden',
                }}>
                  <div style={{
                    width: `${generationProgress}%`, height: '100%',
                    borderRadius: 3,
                    background: 'linear-gradient(90deg, #2563eb, #7c3aed)',
                    transition: 'width 0.3s ease',
                  }} />
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 8 }}>
                  {generationProgress}%
                </div>
              </div>
            )}
          </div>

          {/* ===== TIMELINE BAR ===== */}
          <div style={{
            borderTop: '1px solid var(--border-color)',
            background: 'var(--bg-secondary)',
            padding: '10px 24px 14px',
          }}>
            {/* Playback + Edit toolbar */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              marginBottom: 10,
            }}>
              {/* Left: undo/redo + edit count */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <Tooltip title="撤销">
                  <Button type="text" size="small"
                    icon={<UndoOutlined />}
                    onClick={handleUndo}
                    disabled={editHistoryIndex < 0}
                    style={{ color: editHistoryIndex >= 0 ? 'var(--text-secondary)' : 'var(--text-tertiary)', fontSize: 13 }}
                  />
                </Tooltip>
                <Tooltip title="重做">
                  <Button type="text" size="small"
                    icon={<RedoOutlined />}
                    onClick={handleRedo}
                    disabled={editHistoryIndex >= editHistory.length - 1}
                    style={{ color: editHistoryIndex < editHistory.length - 1 ? 'var(--text-secondary)' : 'var(--text-tertiary)', fontSize: 13 }}
                  />
                </Tooltip>
                {editHistory.length > 0 && (
                  <span style={{
                    fontSize: 9, color: 'var(--text-tertiary)', marginLeft: 4,
                    background: 'var(--bg-tertiary)', padding: '1px 6px', borderRadius: 4,
                  }}>
                    {editHistoryIndex + 1} 次修改
                  </span>
                )}
              </div>

              {/* Center: playback controls */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <Tooltip title="上一段">
                  <Button type="text" size="small"
                    icon={<StepBackwardOutlined />}
                    onClick={() => {
                      const idx = segments.findIndex(s => s.id === activeSegmentId)
                      if (idx > 0) { setActiveSegmentId(segments[idx - 1].id); previewSegment(segments[idx - 1].id) }
                    }}
                    style={{ color: 'var(--text-tertiary)', fontSize: 15 }}
                  />
                </Tooltip>
                <Button
                  type="text"
                  onClick={togglePlay}
                  style={{
                    width: 36, height: 36, borderRadius: '50%',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'var(--accent-primary)', color: '#fff',
                    boxShadow: '0 4px 12px rgba(37,99,235,0.3)',
                    fontSize: 16,
                  }}
                  icon={isPlaying ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
                />
                <Tooltip title="下一段">
                  <Button type="text" size="small"
                    icon={<StepForwardOutlined />}
                    onClick={() => {
                      const idx = segments.findIndex(s => s.id === activeSegmentId)
                      if (idx < segments.length - 1) { setActiveSegmentId(segments[idx + 1].id); previewSegment(segments[idx + 1].id) }
                    }}
                    style={{ color: 'var(--text-tertiary)', fontSize: 15 }}
                  />
                </Tooltip>
                <span style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: 'monospace', minWidth: 76 }}>
                  {formatTime(playheadPosition * totalDuration)} / {formatTime(totalDuration)}
                </span>
              </div>

              {/* Right: selection actions */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                {timelineSelection && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, animation: 'soundStudioActionsIn 0.2s ease-out' }}>
                    <Tooltip title="删除选中片段">
                      <Button type="text" size="small" danger
                        icon={<DeleteOutlined />}
                        onClick={handleDeleteSelection}
                        style={{ fontSize: 13 }}
                      />
                    </Tooltip>
                    <Tooltip title="取消选择">
                      <Button type="text" size="small"
                        icon={<CloseOutlined />}
                        onClick={() => setTimelineSelection(null)}
                        style={{ color: 'var(--text-tertiary)', fontSize: 11 }}
                      />
                    </Tooltip>
                  </div>
                )}
                <Tooltip title="轻剪辑">
                  <Button type="text" size="small"
                    icon={<ScissorOutlined />}
                    onClick={() => setRightTab('editing')}
                    style={{
                      color: rightTab === 'editing' ? 'var(--accent-primary)' : 'var(--text-tertiary)',
                      fontSize: 14,
                    }}
                  />
                </Tooltip>
              </div>
            </div>

            {/* Enhanced dual-track timeline */}
            <EnhancedTimeline
              segments={segments}
              totalDuration={totalDuration}
              activeId={activeSegmentId}
              playheadPosition={playheadPosition}
              onSeek={setPlayheadPosition}
              selection={timelineSelection}
              onSelectionChange={setTimelineSelection}
              bgmStyle={bgmStyle}
              musicInserts={musicInserts}
              enableIntro={enableIntro}
              enableOutro={enableOutro}
            />
          </div>
        </div>

        {/* ===== RIGHT: Voice & Atmosphere Controls ===== */}
        <div style={{
          width: 300, flexShrink: 0,
          borderLeft: '1px solid var(--border-color)',
          display: 'flex', flexDirection: 'column',
          background: 'var(--bg-secondary)',
        }}>
          {/* Right panel tabs */}
          <div style={{
            display: 'flex', borderBottom: '1px solid var(--border-color)',
          }}>
            {([
              { key: 'voice' as const, label: mode === 'ai' ? '🎭 声音' : '🎙️ 录音' },
              { key: 'atmosphere' as const, label: '🎶 氛围' },
              { key: 'editing' as const, label: '✂️ 轻剪辑' },
            ]).map(tab => (
              <button
                key={tab.key}
                onClick={() => setRightTab(tab.key)}
                style={{
                  flex: 1, background: 'none', border: 'none',
                  padding: '10px 12px', fontSize: 12, cursor: 'pointer',
                  color: rightTab === tab.key ? 'var(--accent-primary)' : 'var(--text-tertiary)',
                  fontWeight: rightTab === tab.key ? 600 : 400,
                  borderBottom: rightTab === tab.key ? '2px solid var(--accent-primary)' : '2px solid transparent',
                  transition: 'all 0.2s ease',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Right panel content */}
          <div style={{ flex: 1, overflow: 'auto', padding: '14px 16px' }}>
            {rightTab === 'voice' && mode === 'ai' && (
              <div style={{ animation: 'fadeIn 0.2s ease' }}>
                {/* Voice Style Selection */}
                <div style={{ marginBottom: 20 }}>
                  <div style={{
                    fontSize: 12, fontWeight: 600, color: 'var(--text-primary)',
                    marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6,
                  }}>
                    <span>声音性格</span>
                    <span style={{ fontSize: 10, color: 'var(--text-tertiary)', fontWeight: 400 }}>
                      选择最贴近你想要的表达
                    </span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                    {VOICE_STYLES.map(v => {
                      const isActive = voiceStyle === v.key
                      return (
                        <button
                          key={v.key}
                          onClick={() => setVoiceStyle(v.key)}
                          className="sound-studio-voice-btn"
                          style={{
                            padding: '10px 12px', borderRadius: 10,
                            border: `1.5px solid ${isActive ? 'var(--accent-primary)' : 'var(--border-color)'}`,
                            background: isActive ? 'var(--accent-light)' : 'var(--bg-primary)',
                            cursor: 'pointer', textAlign: 'left',
                            transition: 'all 0.2s ease',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                            <span style={{ fontSize: 16 }}>{v.icon}</span>
                            <span style={{
                              fontSize: 12, fontWeight: isActive ? 600 : 500,
                              color: isActive ? 'var(--accent-primary)' : 'var(--text-primary)',
                            }}>
                              {v.label}
                            </span>
                          </div>
                          <div style={{ fontSize: 10, color: 'var(--text-tertiary)', lineHeight: 1.4 }}>
                            {v.desc}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Emotion Level */}
                <div style={{ marginBottom: 20 }}>
                  <div style={{
                    fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 10,
                  }}>
                    情绪浓度
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {EMOTION_LEVELS.map(e => {
                      const isActive = emotionLevel === e.key
                      return (
                        <button
                          key={e.key}
                          onClick={() => setEmotionLevel(e.key)}
                          style={{
                            flex: 1, padding: '8px 6px', borderRadius: 8,
                            border: `1.5px solid ${isActive ? 'var(--accent-primary)' : 'var(--border-color)'}`,
                            background: isActive ? 'var(--accent-light)' : 'var(--bg-primary)',
                            cursor: 'pointer', textAlign: 'center',
                            transition: 'all 0.2s ease',
                          }}
                        >
                          <div style={{
                            fontSize: 12, fontWeight: isActive ? 600 : 500,
                            color: isActive ? 'var(--accent-primary)' : 'var(--text-primary)',
                            marginBottom: 2,
                          }}>
                            {e.label}
                          </div>
                          <div style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>
                            {e.desc}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Speed */}
                <div style={{ marginBottom: 20 }}>
                  <div style={{
                    fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 10,
                  }}>
                    语速
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {SPEED_LEVELS.map(s => {
                      const isActive = speedLevel === s.key
                      return (
                        <button
                          key={s.key}
                          onClick={() => setSpeedLevel(s.key)}
                          style={{
                            flex: 1, padding: '8px 6px', borderRadius: 8,
                            border: `1.5px solid ${isActive ? 'var(--accent-primary)' : 'var(--border-color)'}`,
                            background: isActive ? 'var(--accent-light)' : 'var(--bg-primary)',
                            cursor: 'pointer', textAlign: 'center',
                            transition: 'all 0.2s ease',
                            fontSize: 12, fontWeight: isActive ? 600 : 500,
                            color: isActive ? 'var(--accent-primary)' : 'var(--text-primary)',
                          }}
                        >
                          {s.label}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Pause style */}
                <div style={{ marginBottom: 20 }}>
                  <div style={{
                    fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 10,
                  }}>
                    停顿节奏
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {PAUSE_STYLES.map(p => {
                      const isActive = pauseStyle === p.key
                      return (
                        <button
                          key={p.key}
                          onClick={() => setPauseStyle(p.key)}
                          style={{
                            flex: 1, padding: '8px 6px', borderRadius: 8,
                            border: `1.5px solid ${isActive ? 'var(--accent-primary)' : 'var(--border-color)'}`,
                            background: isActive ? 'var(--accent-light)' : 'var(--bg-primary)',
                            cursor: 'pointer', textAlign: 'center',
                            transition: 'all 0.2s ease',
                          }}
                        >
                          <div style={{
                            fontSize: 12, fontWeight: isActive ? 600 : 500,
                            color: isActive ? 'var(--accent-primary)' : 'var(--text-primary)',
                            marginBottom: 2,
                          }}>
                            {p.label}
                          </div>
                          <div style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>
                            {p.desc}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Expression tone */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{
                    fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 10,
                  }}>
                    表达倾向
                    <span style={{ fontSize: 10, color: 'var(--text-tertiary)', fontWeight: 400, marginLeft: 6 }}>
                      可选
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {EXPRESSION_TONES.map(t => {
                      const isActive = expressionTone === t.key
                      return (
                        <button
                          key={t.key}
                          onClick={() => setExpressionTone(isActive ? null : t.key)}
                          style={{
                            flex: 1, padding: '8px 6px', borderRadius: 8,
                            border: `1.5px solid ${isActive ? '#8b5cf6' : 'var(--border-color)'}`,
                            background: isActive ? '#f5f3ff' : 'var(--bg-primary)',
                            cursor: 'pointer', textAlign: 'center',
                            transition: 'all 0.2s ease',
                            fontSize: 12, fontWeight: isActive ? 600 : 500,
                            color: isActive ? '#8b5cf6' : 'var(--text-primary)',
                          }}
                        >
                          <span style={{ marginRight: 4 }}>{t.icon}</span>
                          {t.label}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Preview hint */}
                <div style={{
                  padding: '12px 14px', borderRadius: 10,
                  background: 'var(--bg-primary)', border: '1px solid var(--border-color)',
                }}>
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)', lineHeight: 1.6 }}>
                    💡 点击左侧段落或下方播放按钮即时试听效果。每次调整都可以立刻听到变化。
                  </div>
                </div>
              </div>
            )}

            {rightTab === 'voice' && mode === 'recording' && (
              <div style={{ animation: 'fadeIn 0.2s ease' }}>
                {/* Recording guidance */}
                <div style={{
                  padding: '16px', borderRadius: 12,
                  background: 'linear-gradient(135deg, #fef2f2 0%, #fffbeb 100%)',
                  border: '1px solid #fecaca',
                  marginBottom: 16,
                }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#991b1b', marginBottom: 6 }}>
                    🎙️ 录音提示
                  </div>
                  <div style={{ fontSize: 11, color: '#92400e', lineHeight: 1.7 }}>
                    <div style={{ marginBottom: 4 }}>• 找一个安静的环境</div>
                    <div style={{ marginBottom: 4 }}>• 保持和麦克风的距离</div>
                    <div style={{ marginBottom: 4 }}>• 不满意随时可以重录</div>
                    <div>• 按照左侧稿件逐段录制</div>
                  </div>
                </div>

                {/* Current segment info */}
                {activeSegment && (
                  <div style={{
                    padding: '12px 14px', borderRadius: 10,
                    background: 'var(--bg-primary)', border: '1px solid var(--border-color)',
                    marginBottom: 16,
                  }}>
                    <div style={{
                      fontSize: 12, fontWeight: 600, color: 'var(--text-primary)',
                      marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6,
                    }}>
                      <span>{activeSegment.icon}</span>
                      当前段落：{activeSegment.label}
                    </div>
                    <div style={{
                      fontSize: 11, color: 'var(--text-tertiary)', lineHeight: 1.7,
                      background: 'var(--bg-tertiary)', borderRadius: 8, padding: '10px 12px',
                    }}>
                      {activeSegment.content}
                    </div>
                  </div>
                )}

                {/* Recording progress */}
                <div style={{
                  padding: '12px 14px', borderRadius: 10,
                  background: 'var(--bg-primary)', border: '1px solid var(--border-color)',
                }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>
                    录制进度
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {segments.map(seg => {
                      const rec = recordings[seg.id]
                      return (
                        <Tooltip key={seg.id} title={`${seg.label}: ${rec.status === 'recorded' ? '已完成' : '未录制'}`}>
                          <div style={{
                            flex: 1, height: 8, borderRadius: 4,
                            background: rec.status === 'recorded' ? seg.color : `${seg.color}20`,
                            transition: 'background 0.3s ease',
                          }} />
                        </Tooltip>
                      )
                    })}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 6 }}>
                    {recordedCount}/{segments.length} 段已完成
                  </div>
                </div>
              </div>
            )}

            {rightTab === 'atmosphere' && (
              <div style={{ animation: 'fadeIn 0.2s ease' }}>
                {/* BGM Style */}
                <div style={{ marginBottom: 20 }}>
                  <div style={{
                    fontSize: 12, fontWeight: 600, color: 'var(--text-primary)',
                    marginBottom: 10,
                  }}>
                    背景音风格
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {BGM_STYLES.map(b => {
                      const isActive = bgmStyle === b.key
                      return (
                        <button
                          key={b.key}
                          onClick={() => setBgmStyle(b.key)}
                          className="sound-studio-bgm-btn"
                          style={{
                            padding: '10px 14px', borderRadius: 10,
                            border: `1.5px solid ${isActive ? 'var(--accent-primary)' : 'var(--border-color)'}`,
                            background: isActive ? 'var(--accent-light)' : 'var(--bg-primary)',
                            cursor: 'pointer', textAlign: 'left',
                            transition: 'all 0.2s ease',
                            display: 'flex', alignItems: 'center', gap: 10,
                          }}
                        >
                          <span style={{ fontSize: 20 }}>{b.icon}</span>
                          <div>
                            <div style={{
                              fontSize: 12, fontWeight: isActive ? 600 : 500,
                              color: isActive ? 'var(--accent-primary)' : 'var(--text-primary)',
                            }}>
                              {b.label}
                            </div>
                            <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
                              {b.desc}
                            </div>
                          </div>
                          {isActive && (
                            <CheckCircleOutlined style={{
                              marginLeft: 'auto', color: 'var(--accent-primary)', fontSize: 14,
                            }} />
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* BGM Volume */}
                {bgmStyle !== 'none' && (
                  <div style={{ marginBottom: 20, animation: 'fadeIn 0.2s ease' }}>
                    <div style={{
                      fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 10,
                    }}>
                      音乐音量
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {BGM_VOLUMES.map(v => {
                        const isActive = bgmVolume === v.key
                        return (
                          <button
                            key={v.key}
                            onClick={() => setBgmVolume(v.key)}
                            style={{
                              flex: 1, padding: '8px 6px', borderRadius: 8,
                              border: `1.5px solid ${isActive ? 'var(--accent-primary)' : 'var(--border-color)'}`,
                              background: isActive ? 'var(--accent-light)' : 'var(--bg-primary)',
                              cursor: 'pointer', textAlign: 'center',
                              transition: 'all 0.2s ease',
                              fontSize: 12, fontWeight: isActive ? 600 : 500,
                              color: isActive ? 'var(--accent-primary)' : 'var(--text-primary)',
                            }}
                          >
                            {v.label}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Intro / Outro */}
                <div style={{ marginBottom: 20 }}>
                  <div style={{
                    fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 10,
                  }}>
                    片头片尾
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => setEnableIntro(!enableIntro)}
                      style={{
                        flex: 1, padding: '10px', borderRadius: 10,
                        border: `1.5px solid ${enableIntro ? '#10b981' : 'var(--border-color)'}`,
                        background: enableIntro ? '#ecfdf5' : 'var(--bg-primary)',
                        cursor: 'pointer', textAlign: 'center',
                        transition: 'all 0.2s ease',
                      }}
                    >
                      <div style={{
                        fontSize: 18, marginBottom: 4,
                      }}>
                        🎬
                      </div>
                      <div style={{
                        fontSize: 12, fontWeight: enableIntro ? 600 : 500,
                        color: enableIntro ? '#10b981' : 'var(--text-primary)',
                      }}>
                        片头
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
                        {enableIntro ? '已开启' : '已关闭'}
                      </div>
                    </button>
                    <button
                      onClick={() => setEnableOutro(!enableOutro)}
                      style={{
                        flex: 1, padding: '10px', borderRadius: 10,
                        border: `1.5px solid ${enableOutro ? '#10b981' : 'var(--border-color)'}`,
                        background: enableOutro ? '#ecfdf5' : 'var(--bg-primary)',
                        cursor: 'pointer', textAlign: 'center',
                        transition: 'all 0.2s ease',
                      }}
                    >
                      <div style={{
                        fontSize: 18, marginBottom: 4,
                      }}>
                        🎵
                      </div>
                      <div style={{
                        fontSize: 12, fontWeight: enableOutro ? 600 : 500,
                        color: enableOutro ? '#10b981' : 'var(--text-primary)',
                      }}>
                        片尾
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
                        {enableOutro ? '已开启' : '已关闭'}
                      </div>
                    </button>
                  </div>
                </div>

                {/* Preview overlay hint */}
                <div style={{
                  padding: '12px 14px', borderRadius: 10,
                  background: 'var(--bg-primary)', border: '1px solid var(--border-color)',
                }}>
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)', lineHeight: 1.6 }}>
                    🎧 试听时会叠加背景音效果，让你预览最终成品的氛围。
                  </div>
                </div>
              </div>
            )}

            {/* ════════════ EDITING TAB ════════════ */}
            {rightTab === 'editing' && (
              <div style={{ animation: 'fadeIn 0.2s ease' }}>

                {/* ── Quick Edit Actions ── */}
                <div style={{ marginBottom: 20 }}>
                  <div style={{
                    fontSize: 12, fontWeight: 600, color: 'var(--text-primary)',
                    marginBottom: 4,
                  }}>
                    一键优化
                  </div>
                  <div style={{
                    fontSize: 10, color: 'var(--text-tertiary)', marginBottom: 10, lineHeight: 1.5,
                  }}>
                    点击即可自动处理，所有操作均可撤销
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {QUICK_EDIT_ACTIONS.map(action => (
                      <button
                        key={action.key}
                        onClick={() => performEdit(action.key, action.label)}
                        className="sound-studio-edit-action-btn"
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          padding: '10px 12px', borderRadius: 10,
                          border: '1.5px solid var(--border-color)',
                          background: 'var(--bg-primary)',
                          cursor: 'pointer', textAlign: 'left',
                          transition: 'all 0.2s ease',
                        }}
                      >
                        <div style={{
                          width: 32, height: 32, borderRadius: 8,
                          background: `${action.color}12`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 16, flexShrink: 0,
                        }}>
                          {action.icon}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
                            {action.label}
                          </div>
                          <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
                            {action.desc}
                          </div>
                        </div>
                        <ThunderboltOutlined style={{ color: action.color, fontSize: 13, opacity: 0.7 }} />
                      </button>
                    ))}
                  </div>
                </div>

                {/* ── Selection-based editing hint ── */}
                <div style={{
                  padding: '10px 12px', borderRadius: 10,
                  background: 'var(--accent-light)',
                  border: '1px solid var(--border-active)',
                  marginBottom: 20,
                }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--accent-primary)', marginBottom: 4 }}>
                    ✂️ 选区编辑
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                    {timelineSelection
                      ? `已选中 ${formatTime(Math.round((timelineSelection.endPos - timelineSelection.startPos) * totalDuration))} 的片段，可以删除或替换`
                      : '在时间轴上拖动选中片段，即可删除不想要的部分'}
                  </div>
                  {timelineSelection && (
                    <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                      <Button size="small" danger type="primary"
                        icon={<DeleteOutlined />}
                        onClick={handleDeleteSelection}
                        style={{ borderRadius: 6, fontSize: 11, height: 26 }}
                      >
                        删除选中
                      </Button>
                      <Button size="small" type="text"
                        onClick={() => setTimelineSelection(null)}
                        style={{ borderRadius: 6, fontSize: 11, height: 26, color: 'var(--text-tertiary)' }}
                      >
                        取消
                      </Button>
                    </div>
                  )}
                </div>

                {/* ── Transition Music ── */}
                <div style={{ marginBottom: 20 }}>
                  <div style={{
                    fontSize: 12, fontWeight: 600, color: 'var(--text-primary)',
                    marginBottom: 4,
                  }}>
                    段落过渡
                  </div>
                  <div style={{
                    fontSize: 10, color: 'var(--text-tertiary)', marginBottom: 10, lineHeight: 1.5,
                  }}>
                    在段落之间添加衔接，让节目更流畅
                  </div>

                  {/* Transition style selector */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, marginBottom: 10 }}>
                    {TRANSITION_STYLES.map(ts => {
                      const isActive = transitionStyle === ts.key
                      return (
                        <button
                          key={ts.key}
                          onClick={() => setTransitionStyle(ts.key)}
                          style={{
                            padding: '6px 8px', borderRadius: 8,
                            border: `1.5px solid ${isActive ? 'var(--accent-primary)' : 'var(--border-color)'}`,
                            background: isActive ? 'var(--accent-light)' : 'var(--bg-primary)',
                            cursor: 'pointer', textAlign: 'center',
                            transition: 'all 0.2s ease',
                          }}
                        >
                          <div style={{ fontSize: 14, marginBottom: 2 }}>{ts.icon}</div>
                          <div style={{
                            fontSize: 10, fontWeight: isActive ? 600 : 500,
                            color: isActive ? 'var(--accent-primary)' : 'var(--text-primary)',
                          }}>
                            {ts.label}
                          </div>
                        </button>
                      )
                    })}
                  </div>

                  {/* Add transition between segments */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    {segments.slice(0, -1).map((seg, i) => {
                      const nextSeg = segments[i + 1]
                      const hasInsert = musicInserts.some(m => m.segmentId === nextSeg.id && m.position === 'before')
                      return (
                        <button
                          key={seg.id}
                          onClick={() => handleAddMusicInsert(nextSeg.id, 'before')}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 8,
                            padding: '6px 10px', borderRadius: 8,
                            border: `1px solid ${hasInsert ? '#f59e0b' : 'var(--border-color)'}`,
                            background: hasInsert ? '#fffbeb' : 'var(--bg-primary)',
                            cursor: 'pointer', textAlign: 'left',
                            transition: 'all 0.2s ease',
                            fontSize: 10,
                          }}
                        >
                          <span style={{ color: seg.color, fontWeight: 600 }}>{seg.icon}</span>
                          <span style={{ color: 'var(--text-tertiary)' }}>→</span>
                          <span style={{ color: nextSeg.color, fontWeight: 600 }}>{nextSeg.icon}</span>
                          <span style={{
                            flex: 1, color: hasInsert ? '#92400e' : 'var(--text-tertiary)',
                          }}>
                            {seg.label} → {nextSeg.label}
                          </span>
                          {hasInsert
                            ? <span style={{ fontSize: 9, color: '#f59e0b', fontWeight: 600 }}>🎵 已添加</span>
                            : <PlusOutlined style={{ color: 'var(--text-tertiary)', fontSize: 10 }} />
                          }
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* ── Intro/Outro Templates ── */}
                <div style={{ marginBottom: 20 }}>
                  <div style={{
                    fontSize: 12, fontWeight: 600, color: 'var(--text-primary)',
                    marginBottom: 10,
                  }}>
                    片头片尾模板
                  </div>
                  {enableIntro && (
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                        🎬 片头风格
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                        {INTRO_TEMPLATES.map(tmpl => {
                          const isActive = introTemplate === tmpl.key
                          return (
                            <button
                              key={tmpl.key}
                              onClick={() => setIntroTemplate(tmpl.key)}
                              style={{
                                padding: '8px 6px', borderRadius: 8,
                                border: `1.5px solid ${isActive ? '#10b981' : 'var(--border-color)'}`,
                                background: isActive ? '#ecfdf5' : 'var(--bg-primary)',
                                cursor: 'pointer', textAlign: 'center',
                                transition: 'all 0.2s ease',
                              }}
                            >
                              <div style={{ fontSize: 16, marginBottom: 2 }}>{tmpl.icon}</div>
                              <div style={{
                                fontSize: 10, fontWeight: isActive ? 600 : 500,
                                color: isActive ? '#10b981' : 'var(--text-primary)',
                              }}>
                                {tmpl.label}
                              </div>
                              <div style={{ fontSize: 8, color: 'var(--text-tertiary)' }}>
                                {tmpl.duration}
                              </div>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}
                  {enableOutro && (
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                        🎵 片尾风格
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                        {INTRO_TEMPLATES.map(tmpl => {
                          const isActive = outroTemplate === tmpl.key
                          return (
                            <button
                              key={tmpl.key}
                              onClick={() => setOutroTemplate(tmpl.key)}
                              style={{
                                padding: '8px 6px', borderRadius: 8,
                                border: `1.5px solid ${isActive ? '#10b981' : 'var(--border-color)'}`,
                                background: isActive ? '#ecfdf5' : 'var(--bg-primary)',
                                cursor: 'pointer', textAlign: 'center',
                                transition: 'all 0.2s ease',
                              }}
                            >
                              <div style={{ fontSize: 16, marginBottom: 2 }}>{tmpl.icon}</div>
                              <div style={{
                                fontSize: 10, fontWeight: isActive ? 600 : 500,
                                color: isActive ? '#10b981' : 'var(--text-primary)',
                              }}>
                                {tmpl.label}
                              </div>
                              <div style={{ fontSize: 8, color: 'var(--text-tertiary)' }}>
                                {tmpl.duration}
                              </div>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}
                  {!enableIntro && !enableOutro && (
                    <div style={{
                      padding: '10px 12px', borderRadius: 8,
                      background: 'var(--bg-tertiary)', fontSize: 10, color: 'var(--text-tertiary)',
                      textAlign: 'center',
                    }}>
                      在「氛围」面板中开启片头片尾
                    </div>
                  )}
                </div>

                {/* ── Segment-level BGM ── */}
                <div style={{ marginBottom: 20 }}>
                  <div style={{
                    fontSize: 12, fontWeight: 600, color: 'var(--text-primary)',
                    marginBottom: 4,
                  }}>
                    段落音乐
                  </div>
                  <div style={{
                    fontSize: 10, color: 'var(--text-tertiary)', marginBottom: 10, lineHeight: 1.5,
                  }}>
                    为不同段落设置不同的背景氛围
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {segments.map(seg => {
                      const override = segmentBGMOverrides[seg.id]
                      const currentStyle = override?.style || 'same'
                      return (
                        <div key={seg.id} style={{
                          padding: '8px 10px', borderRadius: 8,
                          border: '1px solid var(--border-color)',
                          background: override ? `${seg.color}06` : 'var(--bg-primary)',
                        }}>
                          <div style={{
                            display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6,
                          }}>
                            <span style={{ fontSize: 11 }}>{seg.icon}</span>
                            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)', flex: 1 }}>
                              {seg.label}
                            </span>
                          </div>
                          <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                            {SEGMENT_BGM_OPTIONS.map(opt => (
                              <button
                                key={opt.key}
                                onClick={() => handleSegmentBGMChange(seg.id, opt.key)}
                                style={{
                                  padding: '3px 8px', borderRadius: 6,
                                  border: `1px solid ${currentStyle === opt.key ? seg.color : 'var(--border-color)'}`,
                                  background: currentStyle === opt.key ? `${seg.color}12` : 'var(--bg-secondary)',
                                  cursor: 'pointer',
                                  fontSize: 9, fontWeight: currentStyle === opt.key ? 600 : 400,
                                  color: currentStyle === opt.key ? seg.color : 'var(--text-tertiary)',
                                  transition: 'all 0.15s ease',
                                }}
                              >
                                {opt.icon} {opt.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* ── Edit History ── */}
                {editHistory.length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{
                      fontSize: 12, fontWeight: 600, color: 'var(--text-primary)',
                      marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    }}>
                      <span>修改记录</span>
                      <span style={{
                        fontSize: 9, color: 'var(--text-tertiary)',
                        background: 'var(--bg-tertiary)', padding: '1px 6px', borderRadius: 4,
                      }}>
                        {editHistoryIndex + 1} / {editHistory.length}
                      </span>
                    </div>
                    <div style={{
                      maxHeight: 120, overflow: 'auto',
                      borderRadius: 8, border: '1px solid var(--border-color)',
                    }}>
                      {editHistory.slice().reverse().map((entry, i) => {
                        const realIdx = editHistory.length - 1 - i
                        const isCurrent = realIdx === editHistoryIndex
                        const isUndone = realIdx > editHistoryIndex
                        return (
                          <div key={entry.id} style={{
                            padding: '6px 10px', fontSize: 10,
                            borderBottom: '1px solid var(--border-light)',
                            color: isUndone ? 'var(--text-tertiary)' : 'var(--text-secondary)',
                            background: isCurrent ? 'var(--accent-light)' : 'transparent',
                            textDecoration: isUndone ? 'line-through' : 'none',
                            opacity: isUndone ? 0.5 : 1,
                          }}>
                            {entry.description}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Editing hint */}
                <div style={{
                  padding: '12px 14px', borderRadius: 10,
                  background: 'var(--bg-primary)', border: '1px solid var(--border-color)',
                }}>
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)', lineHeight: 1.6 }}>
                    💡 所有修改都可以用 ↩️ 撤销。放心尝试，直到满意为止。
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ===== COMPLETION OVERLAY ===== */}
        {showCompletion && (
          <CompletionOverlay
            title={episodeTitle}
            totalDuration={totalDuration}
            onListen={() => {
              message.info({ content: '正在播放完整音频…', duration: 2, style: { marginTop: 60 } })
            }}
            onDownload={() => {
              message.success({ content: '音频已开始下载', duration: 2, style: { marginTop: 60 } })
            }}
            onPublish={() => {
              setShowCompletion(false)
              onProceedToPublish?.()
            }}
            onBack={() => setShowCompletion(false)}
          />
        )}
      </div>

      {/* ===== GENERATION PROGRESS BAR (top overlay) ===== */}
      {isGenerating && (
        <div style={{
          position: 'absolute', top: 52, left: 0, right: 0, height: 3,
          background: 'var(--bg-tertiary)', zIndex: 50,
        }}>
          <div style={{
            height: '100%',
            width: `${generationProgress}%`,
            background: 'linear-gradient(90deg, #2563eb, #7c3aed)',
            transition: 'width 0.3s ease',
            borderRadius: '0 2px 2px 0',
          }} />
        </div>
      )}
    </div>
  )
}
