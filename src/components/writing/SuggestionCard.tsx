import { useState } from 'react'
import { Button, Input } from 'antd'
import { CheckOutlined, CloseOutlined, EditOutlined } from '@ant-design/icons'
import type { AISuggestion, AgentConfig } from './types'
import { AI_AGENTS } from './types'

const { TextArea } = Input

interface SuggestionCardProps {
  suggestion: AISuggestion
  onAccept: (suggestion: AISuggestion, finalText?: string) => void
  onReject: (suggestion: AISuggestion) => void
  onEditMore: (suggestion: AISuggestion) => void
}

export default function SuggestionCard({ suggestion, onAccept, onReject, onEditMore }: SuggestionCardProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editedText, setEditedText] = useState(suggestion.suggestedText)
  const agent = AI_AGENTS.find(a => a.role === suggestion.agentRole) as AgentConfig

  if (suggestion.status !== 'pending' && suggestion.status !== 'editing') {
    return null
  }

  return (
    <div
      className="writing-suggestion-card"
      style={{
        borderRadius: 10,
        border: `1px solid ${agent.color}20`,
        background: 'var(--bg-secondary)',
        overflow: 'hidden',
        marginBottom: 10,
        animation: 'writingSuggestionIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      {/* Header */}
      <div style={{
        padding: '8px 12px',
        background: `${agent.color}06`,
        borderBottom: `1px solid ${agent.color}12`,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
      }}>
        <span style={{ fontSize: 13 }}>{agent.icon}</span>
        <span style={{ fontSize: 11, fontWeight: 600, color: agent.color }}>{agent.label}</span>
        <span style={{
          fontSize: 9,
          padding: '1px 6px',
          borderRadius: 4,
          background: `${agent.color}10`,
          color: agent.color,
          fontWeight: 500,
          marginLeft: 'auto',
        }}>
          {suggestion.intensity === 'light' ? '轻润色' : suggestion.intensity === 'standard' ? '标准' : '深度'}
        </span>
      </div>

      {/* Reason */}
      <div style={{
        padding: '8px 12px 4px',
        fontSize: 11,
        color: 'var(--text-secondary)',
        lineHeight: 1.5,
      }}>
        {suggestion.reason}
      </div>

      {/* Diff comparison */}
      <div style={{ padding: '6px 12px' }}>
        {/* Original */}
        <div style={{
          padding: '6px 10px',
          borderRadius: 6,
          background: '#fef2f2',
          border: '1px solid #fecaca',
          fontSize: 12,
          lineHeight: 1.7,
          color: '#991b1b',
          marginBottom: 6,
          maxHeight: 80,
          overflow: 'auto',
          textDecoration: 'line-through',
          opacity: 0.7,
        }}>
          {suggestion.originalText.slice(0, 200)}
          {suggestion.originalText.length > 200 && '…'}
        </div>

        {/* Suggested / Editing */}
        {isEditing ? (
          <TextArea
            value={editedText}
            onChange={e => setEditedText(e.target.value)}
            autoSize={{ minRows: 2, maxRows: 8 }}
            style={{
              fontSize: 12,
              lineHeight: 1.7,
              borderRadius: 6,
              border: `1px solid ${agent.color}40`,
              background: `${agent.color}04`,
            }}
          />
        ) : (
          <div style={{
            padding: '6px 10px',
            borderRadius: 6,
            background: '#ecfdf5',
            border: '1px solid #a7f3d0',
            fontSize: 12,
            lineHeight: 1.7,
            color: '#065f46',
            maxHeight: 100,
            overflow: 'auto',
          }}>
            {suggestion.suggestedText.slice(0, 300)}
            {suggestion.suggestedText.length > 300 && '…'}
          </div>
        )}
      </div>

      {/* Actions */}
      <div style={{
        padding: '6px 12px 10px',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
      }}>
        <Button
          size="small"
          type="primary"
          icon={<CheckOutlined />}
          onClick={() => onAccept(suggestion, isEditing ? editedText : undefined)}
          style={{
            borderRadius: 6,
            fontSize: 11,
            height: 26,
            background: '#10b981',
            borderColor: '#10b981',
          }}
        >
          采纳
        </Button>
        <Button
          size="small"
          icon={<CloseOutlined />}
          onClick={() => onReject(suggestion)}
          style={{
            borderRadius: 6,
            fontSize: 11,
            height: 26,
            color: 'var(--text-tertiary)',
            borderColor: 'var(--border-color)',
          }}
        >
          忽略
        </Button>
        <Button
          size="small"
          icon={<EditOutlined />}
          onClick={() => {
            if (isEditing) {
              onEditMore(suggestion)
            } else {
              setIsEditing(true)
              setEditedText(suggestion.suggestedText)
            }
          }}
          style={{
            borderRadius: 6,
            fontSize: 11,
            height: 26,
            color: agent.color,
            borderColor: `${agent.color}40`,
          }}
        >
          {isEditing ? '保留并继续' : '编辑后采纳'}
        </Button>
      </div>
    </div>
  )
}
