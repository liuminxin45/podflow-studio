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
import {
  STAGES,
  getStageDuration,
  getStageStatus,
  getStatusColor,
  getStatusIcon,
} from './workflowStages'

export { STAGES }

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
