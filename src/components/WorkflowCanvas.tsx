import { useEffect, useCallback } from 'react'
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type ReactFlowInstance,
  Position,
  MarkerType
} from 'reactflow'
import 'reactflow/dist/style.css'
import type { Workflow } from '../types/workflow'

// ============================================================
// Stage definitions — creator-first workflow
// ============================================================

export interface StageDefinition {
  id: string
  label: string
  subtitle: string
  icon: string
  subNodes: string[]
  color: string
}

export const STAGES: StageDefinition[] = [
  { id: 'discover', label: '发现', subtitle: '世界在发生什么', icon: '🔭', subNodes: ['fetch', 'manual', 'merge'], color: '#3b82f6' },
  { id: 'organize', label: '整理', subtitle: '去噪、筛选、归类', icon: '�', subNodes: ['preprocess'], color: '#06b6d4' },
  { id: 'ideate',   label: '构思', subtitle: '决定讲什么、怎么讲', icon: '💡', subNodes: ['research', 'topic_selection'], color: '#8b5cf6' },
  { id: 'write',    label: '写作', subtitle: '把想法变成对话', icon: '✍️', subNodes: ['script'], color: '#f59e0b' },
  { id: 'produce',  label: '制作', subtitle: '让文字变成声音', icon: '🎧', subNodes: ['tts', 'audio_postprocess', 'assets'], color: '#10b981' },
  { id: 'publish',  label: '发布', subtitle: '检查并发给世界', icon: '🚀', subNodes: ['review', 'publish'], color: '#ef4444' },
]

// ============================================================
// Stage status computation
// ============================================================

function getStageStatus(stage: StageDefinition, workflow: Workflow | null): string {
  if (!workflow) return 'pending'
  const statuses = stage.subNodes.map(n => workflow.nodeExecutions?.[n]?.status || 'pending')
  if (statuses.some(s => s === 'failed')) return 'failed'
  if (statuses.some(s => s === 'waiting_approval')) return 'waiting_approval'
  if (statuses.some(s => s === 'running')) return 'running'
  if (statuses.every(s => s === 'completed')) return 'completed'
  if (statuses.some(s => s === 'completed')) return 'running' // partially done
  return 'pending'
}

function getStageDuration(stage: StageDefinition, workflow: Workflow | null): number {
  if (!workflow) return 0
  return stage.subNodes.reduce((sum, n) => {
    return sum + (workflow.nodeExecutions?.[n]?.duration || 0)
  }, 0)
}

// ============================================================
// Visual style
// ============================================================

function getStageStyle(status: string, stageColor: string) {
  const baseStyle = {
    background: 'var(--bg-secondary)',
    borderRadius: '14px',
    padding: '14px 18px',
    width: 180,
    color: 'var(--text-primary)',
    fontSize: '13px',
    fontWeight: 500 as const,
    boxShadow: 'var(--shadow-md)',
    transition: 'all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)',
    textAlign: 'left' as const,
  }

  switch (status) {
    case 'completed':
      return { ...baseStyle, border: `1.5px solid var(--success-color)`, boxShadow: '0 4px 12px rgba(16, 185, 129, 0.15)' }
    case 'running':
      return { ...baseStyle, border: `1.5px solid ${stageColor}`, boxShadow: `0 4px 16px ${stageColor}30` }
    case 'failed':
      return { ...baseStyle, border: '1.5px solid var(--error-color)', boxShadow: '0 4px 12px rgba(239, 68, 68, 0.15)' }
    case 'waiting_approval':
      return { ...baseStyle, border: '1.5px solid var(--warning-color)', boxShadow: '0 4px 12px rgba(245, 158, 11, 0.15)' }
    default:
      return { ...baseStyle, border: '1.5px solid var(--border-color)' }
  }
}

function getStatusIcon(status: string): string {
  switch (status) {
    case 'completed': return '✓'
    case 'running': return '⚡'
    case 'failed': return '✕'
    case 'waiting_approval': return '⏸'
    default: return '○'
  }
}

function getStatusColor(status: string, stageColor: string): string {
  switch (status) {
    case 'completed': return 'var(--success-color)'
    case 'running': return stageColor
    case 'failed': return 'var(--error-color)'
    case 'waiting_approval': return 'var(--warning-color)'
    default: return 'var(--text-tertiary)'
  }
}

// ============================================================
// Build nodes and edges
// ============================================================

function buildNodes(workflow: Workflow | null): Node[] {
  const nodes: Node[] = []
  const xSpacing = 230
  const yBase = 180

  for (let i = 0; i < STAGES.length; i++) {
    const stage = STAGES[i]
    const status = getStageStatus(stage, workflow)
    const duration = getStageDuration(stage, workflow)
    const statusColor = getStatusColor(status, stage.color)
    const statusIcon = getStatusIcon(status)
    const durationText = duration > 0 ? `${duration.toFixed(1)}s` : ''
    const style = getStageStyle(status, stage.color)

    nodes.push({
      id: stage.id,
      type: 'default',
      data: {
        label: (
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ 
              width: '36px', 
              height: '36px', 
              borderRadius: '10px', 
              background: `${stage.color}12`,
              color: statusColor,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '18px',
              flexShrink: 0,
              position: 'relative' as const,
            }}>
              {status === 'completed' ? statusIcon : stage.icon}
              {status === 'running' && (
                <div style={{
                  position: 'absolute',
                  inset: -2,
                  borderRadius: '12px',
                  border: `2px solid ${stage.color}`,
                  borderTopColor: 'transparent',
                  animation: 'spin 1s linear infinite',
                }} />
              )}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ 
                fontWeight: 600, 
                fontSize: '13px',
                textOverflow: 'ellipsis', 
                overflow: 'hidden', 
                whiteSpace: 'nowrap',
                color: status === 'running' ? stage.color : 'var(--text-primary)',
              }}>
                {stage.label}
              </div>
              <div style={{
                fontSize: '10px',
                color: 'var(--text-tertiary)',
                marginTop: '1px',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}>
                {stage.subtitle}
              </div>
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '6px', 
                marginTop: '3px' 
              }}>
                {/* Sub-node progress dots */}
                {stage.subNodes.length > 1 && (
                  <div style={{ display: 'flex', gap: '3px' }}>
                    {stage.subNodes.map(n => {
                      const ns = workflow?.nodeExecutions?.[n]?.status || 'pending'
                      const dotColor = ns === 'completed' ? 'var(--success-color)' 
                        : ns === 'running' ? stage.color 
                        : ns === 'failed' ? 'var(--error-color)' 
                        : 'var(--border-color)'
                      return (
                        <div key={n} style={{
                          width: 6, height: 6, borderRadius: '50%',
                          background: dotColor,
                          transition: 'background 0.3s ease',
                        }} />
                      )
                    })}
                  </div>
                )}
                {durationText && (
                  <span style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>
                    {durationText}
                  </span>
                )}
              </div>
            </div>
          </div>
        )
      },
      position: { x: 60 + i * xSpacing, y: yBase },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      style: style,
    })
  }

  return nodes
}

function buildEdges(workflow: Workflow | null): Edge[] {
  const edges: Edge[] = []
  
  const commonEdgeStyle = { stroke: 'var(--border-color)', strokeWidth: 1.5 }
  const activeEdgeStyle = { stroke: 'var(--accent-primary)', strokeWidth: 2 }
  
  const markerEnd = {
    type: MarkerType.ArrowClosed,
    width: 18,
    height: 18,
    color: 'var(--border-color)',
  }
  
  const activeMarkerEnd = { ...markerEnd, color: 'var(--accent-primary)' }

  for (let i = 0; i < STAGES.length - 1; i++) {
    const source = STAGES[i]
    const target = STAGES[i + 1]
    const sourceStatus = getStageStatus(source, workflow)
    const targetStatus = getStageStatus(target, workflow)
    const isActive = sourceStatus === 'completed' && (targetStatus === 'running' || targetStatus === 'completed')
      || sourceStatus === 'running'
    
    edges.push({
      id: `${source.id}-${target.id}`,
      source: source.id,
      target: target.id,
      animated: sourceStatus === 'running' || (sourceStatus === 'completed' && targetStatus === 'running'),
      style: isActive ? activeEdgeStyle : commonEdgeStyle,
      type: 'smoothstep',
      markerEnd: isActive ? activeMarkerEnd : markerEnd,
    })
  }
  
  return edges
}

const initialNodes = buildNodes(null)
const initialEdges = buildEdges(null)

interface Props {
  workflow: Workflow | null
  onNodeClick: (nodeName: string) => void
  onStageClick?: (stageId: string) => void
}

export default function WorkflowCanvas({ workflow, onNodeClick, onStageClick }: Props) {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)

  useEffect(() => {
    setNodes(buildNodes(workflow))
    setEdges(buildEdges(workflow))
  }, [workflow, setNodes, setEdges])

  const onInit = useCallback((instance: ReactFlowInstance) => {
    setTimeout(() => instance.fitView({ padding: 0.3, duration: 800 }), 100)
  }, [])

  // Map stage click: discover/ideate open dedicated panels, others open detail panel
  const handleNodeClick = useCallback((_: any, node: Node) => {
    const stage = STAGES.find(s => s.id === node.id)
    if (stage) {
      if ((stage.id === 'ideate' || stage.id === 'discover' || stage.id === 'organize' || stage.id === 'write' || stage.id === 'produce' || stage.id === 'publish') && onStageClick) {
        onStageClick(stage.id)
      } else {
        onNodeClick(stage.subNodes[0])
      }
    } else {
      onNodeClick(node.id)
    }
  }, [onNodeClick, onStageClick])

  return (
    <div style={{ position: 'absolute', inset: 0, background: 'var(--bg-primary)' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        onInit={onInit}
        minZoom={0.1}
        maxZoom={2}
        nodesDraggable={false}
        nodesConnectable={false}
        defaultEdgeOptions={{ type: 'smoothstep' }}
        fitView
      >
        <Background color="var(--border-color)" gap={20} size={1} />
        <Controls 
          style={{ 
            background: 'var(--bg-secondary)', 
            border: '1px solid var(--border-color)',
            boxShadow: 'var(--shadow-md)',
            borderRadius: '8px',
            padding: '4px'
          }} 
          showInteractive={false}
        />
        <MiniMap 
          style={{ 
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-color)',
            borderRadius: '8px',
            boxShadow: 'var(--shadow-md)'
          }}
          maskColor="var(--bg-primary)"
          nodeColor={() => 'var(--border-color)'}
        />
      </ReactFlow>
    </div>
  )
}
