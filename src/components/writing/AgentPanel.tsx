import { useState } from 'react'
import { Button, Tooltip } from 'antd'
import {
  DownOutlined,
  UpOutlined,
  EyeInvisibleOutlined,
  EyeOutlined,
} from '@ant-design/icons'
import type {
  AgentRole,
  AIIntensity,
  CollaborationScope,
  AISuggestion,
  WritingSegment,
} from './types'
import {
  AI_AGENTS,
  AI_INTENSITY_CONFIG,
  COLLABORATION_SCOPE_CONFIG,
  SEGMENT_TYPE_CONFIG,
  formatDuration,
} from './types'
import SuggestionCard from './SuggestionCard'

interface AgentPanelProps {
  activeSegment: WritingSegment | undefined
  suggestions: AISuggestion[]
  intensity: AIIntensity
  scope: CollaborationScope
  selectedText: string
  onIntensityChange: (intensity: AIIntensity) => void
  onScopeChange: (scope: CollaborationScope) => void
  onInvokeAgent: (role: AgentRole) => void
  onAcceptSuggestion: (suggestion: AISuggestion, finalText?: string) => void
  onRejectSuggestion: (suggestion: AISuggestion) => void
  onEditMoreSuggestion: (suggestion: AISuggestion) => void
  panelVisible: boolean
  onTogglePanel: () => void
}

export default function AgentPanel({
  activeSegment,
  suggestions,
  intensity,
  scope,
  selectedText,
  onIntensityChange,
  onScopeChange,
  onInvokeAgent,
  onAcceptSuggestion,
  onRejectSuggestion,
  onEditMoreSuggestion,
  panelVisible,
  onTogglePanel,
}: AgentPanelProps) {
  const [expandedAgents, setExpandedAgents] = useState<Set<AgentRole>>(new Set())

  const toggleAgent = (role: AgentRole) => {
    setExpandedAgents(prev => {
      const next = new Set(prev)
      if (next.has(role)) next.delete(role)
      else next.add(role)
      return next
    })
  }

  // Filter pending suggestions for active segment
  const activeSuggestions = suggestions.filter(
    s => s.status === 'pending' || s.status === 'editing'
  )

  if (!panelVisible) {
    return (
      <div style={{
        width: 36,
        flexShrink: 0,
        borderLeft: '1px solid var(--border-color)',
        background: 'var(--bg-secondary)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        paddingTop: 12,
      }}>
        <Tooltip title="展开 AI 协作面板" placement="left">
          <Button
            type="text"
            size="small"
            icon={<EyeOutlined />}
            onClick={onTogglePanel}
            style={{ color: 'var(--text-tertiary)', fontSize: 13 }}
          />
        </Tooltip>
        {/* Vertical agent icons */}
        <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {AI_AGENTS.map(agent => (
            <Tooltip key={agent.role} title={agent.label} placement="left">
              <span style={{ fontSize: 14, cursor: 'default', opacity: 0.5 }}>
                {agent.icon}
              </span>
            </Tooltip>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div style={{
      width: 320,
      flexShrink: 0,
      borderLeft: '1px solid var(--border-color)',
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--bg-secondary)',
      animation: 'slideInRight 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
    }}>
      {/* Panel Header */}
      <div style={{
        padding: '10px 14px',
        borderBottom: '1px solid var(--border-color)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
          🤖 AI 协作面板
        </span>
        <Tooltip title="隐藏面板">
          <Button
            type="text"
            size="small"
            icon={<EyeInvisibleOutlined />}
            onClick={onTogglePanel}
            style={{ color: 'var(--text-tertiary)' }}
          />
        </Tooltip>
      </div>

      {/* Intensity & Scope Controls */}
      <div style={{
        padding: '10px 14px',
        borderBottom: '1px solid var(--border-light)',
        background: 'var(--bg-primary)',
      }}>
        {/* AI Intensity */}
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            AI 强度
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            {AI_INTENSITY_CONFIG.map(cfg => {
              const isActive = intensity === cfg.key
              return (
                <button
                  key={cfg.key}
                  onClick={() => onIntensityChange(cfg.key)}
                  title={cfg.desc}
                  style={{
                    flex: 1,
                    padding: '5px 4px',
                    borderRadius: 6,
                    border: `1px solid ${isActive ? 'var(--accent-primary)' : 'var(--border-color)'}`,
                    background: isActive ? 'var(--accent-light)' : 'var(--bg-secondary)',
                    color: isActive ? 'var(--accent-primary)' : 'var(--text-secondary)',
                    fontSize: 11,
                    fontWeight: isActive ? 600 : 400,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 3,
                  }}
                >
                  <span style={{ fontSize: 12 }}>{cfg.icon}</span>
                  {cfg.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Collaboration Scope */}
        <div>
          <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            协作范围
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            {COLLABORATION_SCOPE_CONFIG.map(cfg => {
              const isActive = scope === cfg.key
              const isDisabled = cfg.key === 'selection' && !selectedText
              return (
                <button
                  key={cfg.key}
                  onClick={() => !isDisabled && onScopeChange(cfg.key)}
                  title={cfg.desc}
                  style={{
                    flex: 1,
                    padding: '5px 4px',
                    borderRadius: 6,
                    border: `1px solid ${isActive ? 'var(--accent-primary)' : 'var(--border-color)'}`,
                    background: isActive ? 'var(--accent-light)' : 'var(--bg-secondary)',
                    color: isDisabled ? 'var(--text-tertiary)' : isActive ? 'var(--accent-primary)' : 'var(--text-secondary)',
                    fontSize: 11,
                    fontWeight: isActive ? 600 : 400,
                    cursor: isDisabled ? 'not-allowed' : 'pointer',
                    transition: 'all 0.15s ease',
                    opacity: isDisabled ? 0.5 : 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 3,
                  }}
                >
                  <span style={{ fontSize: 12 }}>{cfg.icon}</span>
                  {cfg.label}
                </button>
              )
            })}
          </div>
          {selectedText && (
            <div style={{
              marginTop: 6,
              padding: '4px 8px',
              borderRadius: 4,
              background: 'var(--accent-light)',
              fontSize: 10,
              color: 'var(--accent-primary)',
              lineHeight: 1.4,
            }}>
              已选中: "{selectedText.slice(0, 30)}{selectedText.length > 30 ? '…' : ''}"
            </div>
          )}
        </div>
      </div>

      {/* Scrollable Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: '8px 0' }}>
        {/* Active segment info */}
        {activeSegment && (
          <div style={{
            margin: '4px 14px 10px',
            padding: '8px 10px',
            borderRadius: 8,
            background: 'var(--bg-primary)',
            border: '1px solid var(--border-color)',
          }}>
            <div style={{
              fontSize: 11,
              fontWeight: 600,
              color: 'var(--text-primary)',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}>
              <span>{SEGMENT_TYPE_CONFIG[activeSegment.type].icon}</span>
              正在写：{SEGMENT_TYPE_CONFIG[activeSegment.type].label}
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 3 }}>
              {activeSegment.content.length > 0
                ? `${activeSegment.content.length} 字 · 约 ${formatDuration(activeSegment.estimatedSeconds)}`
                : '还没有内容'
              }
            </div>
          </div>
        )}

        {/* Pending Suggestions */}
        {activeSuggestions.length > 0 && (
          <div style={{ padding: '0 14px', marginBottom: 10 }}>
            <div style={{
              fontSize: 10,
              fontWeight: 600,
              color: 'var(--text-tertiary)',
              marginBottom: 8,
              textTransform: 'uppercase',
              letterSpacing: 0.5,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}>
              待处理建议
              <span style={{
                background: 'var(--accent-primary)',
                color: '#fff',
                fontSize: 9,
                padding: '1px 6px',
                borderRadius: 10,
                fontWeight: 700,
              }}>
                {activeSuggestions.length}
              </span>
            </div>
            {activeSuggestions.map(s => (
              <SuggestionCard
                key={s.id}
                suggestion={s}
                onAccept={onAcceptSuggestion}
                onReject={onRejectSuggestion}
                onEditMore={onEditMoreSuggestion}
              />
            ))}
          </div>
        )}

        {/* Five Agent Roles — Collapsible */}
        <div style={{ padding: '0 10px' }}>
          <div style={{
            fontSize: 10,
            fontWeight: 600,
            color: 'var(--text-tertiary)',
            padding: '4px 4px 8px',
            textTransform: 'uppercase',
            letterSpacing: 0.5,
          }}>
            协作角色
          </div>
          {AI_AGENTS.map(agent => {
            const isExpanded = expandedAgents.has(agent.role)
            const agentSuggestionCount = activeSuggestions.filter(s => s.agentRole === agent.role).length
            const isRelevant = agent.role === 'hook_designer'
              ? (activeSegment?.type === 'opening' || activeSegment?.type === 'closing')
              : true

            return (
              <div
                key={agent.role}
                style={{
                  marginBottom: 4,
                  borderRadius: 8,
                  border: '1px solid var(--border-color)',
                  overflow: 'hidden',
                  transition: 'all 0.2s ease',
                  opacity: isRelevant ? 1 : 0.5,
                }}
              >
                {/* Agent Header */}
                <div
                  onClick={() => toggleAgent(agent.role)}
                  style={{
                    padding: '8px 10px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    cursor: 'pointer',
                    background: isExpanded ? `${agent.color}04` : 'transparent',
                    transition: 'background 0.15s ease',
                  }}
                  onMouseEnter={e => { if (!isExpanded) e.currentTarget.style.background = 'var(--bg-tertiary)' }}
                  onMouseLeave={e => { if (!isExpanded) e.currentTarget.style.background = 'transparent' }}
                >
                  <span style={{ fontSize: 15, flexShrink: 0 }}>{agent.icon}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
                      {agent.label}
                    </div>
                    {!isExpanded && (
                      <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {agent.description}
                      </div>
                    )}
                  </div>
                  {agentSuggestionCount > 0 && (
                    <span style={{
                      background: agent.color,
                      color: '#fff',
                      fontSize: 9,
                      padding: '1px 5px',
                      borderRadius: 8,
                      fontWeight: 700,
                      flexShrink: 0,
                    }}>
                      {agentSuggestionCount}
                    </span>
                  )}
                  <span style={{ color: 'var(--text-tertiary)', fontSize: 10, flexShrink: 0 }}>
                    {isExpanded ? <UpOutlined /> : <DownOutlined />}
                  </span>
                </div>

                {/* Agent Expanded Content */}
                {isExpanded && (
                  <div style={{
                    padding: '0 10px 10px',
                    borderTop: '1px solid var(--border-light)',
                    animation: 'writingExpand 0.2s ease-out',
                  }}>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.6, marginTop: 8, marginBottom: 10 }}>
                      {agent.description}
                    </div>

                    {/* Capabilities */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
                      {agent.capabilities.map(cap => (
                        <span
                          key={cap}
                          style={{
                            fontSize: 10,
                            padding: '2px 8px',
                            borderRadius: 4,
                            background: `${agent.color}08`,
                            color: agent.color,
                            fontWeight: 500,
                          }}
                        >
                          {cap}
                        </span>
                      ))}
                    </div>

                    {/* Boundaries */}
                    <div style={{ marginBottom: 10 }}>
                      {agent.boundaries.map(b => (
                        <div key={b} style={{ fontSize: 10, color: 'var(--text-tertiary)', lineHeight: 1.5, display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span style={{ color: '#ef4444', fontSize: 8 }}>●</span> {b}
                        </div>
                      ))}
                    </div>

                    {/* Invoke Button */}
                    <Button
                      block
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation()
                        onInvokeAgent(agent.role)
                      }}
                      disabled={!activeSegment || activeSegment.content.length < 5}
                      style={{
                        borderRadius: 6,
                        fontSize: 11,
                        height: 30,
                        fontWeight: 600,
                        color: agent.color,
                        borderColor: `${agent.color}40`,
                        background: `${agent.color}06`,
                      }}
                    >
                      {agent.icon} 调用{agent.label}
                    </Button>

                    {/* Contextual hint for hook_designer */}
                    {agent.role === 'hook_designer' && activeSegment && activeSegment.type !== 'opening' && activeSegment.type !== 'closing' && (
                      <div style={{
                        marginTop: 6,
                        fontSize: 10,
                        color: 'var(--warning-color)',
                        background: 'var(--warning-bg)',
                        padding: '4px 8px',
                        borderRadius: 4,
                      }}>
                        此角色主要针对开场和结尾段落
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Panel Footer — Boundary Reminder */}
      <div style={{
        padding: '8px 14px',
        borderTop: '1px solid var(--border-color)',
        background: 'var(--bg-primary)',
        fontSize: 10,
        color: 'var(--text-tertiary)',
        lineHeight: 1.5,
        textAlign: 'center',
      }}>
        AI 协作空间 · 所有建议需人工确认 · 表达权在你
      </div>
    </div>
  )
}
