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
  Position
} from 'reactflow'
import 'reactflow/dist/style.css'
import type { Workflow } from '../types/workflow'

const NODE_SEQUENCE = [
  'source_selector', 'fetch', 'manual', 'preprocess', 'research', 'topic_selection',
  'script', 'stages', 'tts', 'audio_postprocess',
  'assets', 'store', 'publish'
]

const NODE_LABELS: Record<string, string> = {
  source_selector: 'Source',
  fetch: 'Fetch',
  manual: 'Manual',
  preprocess: 'Preprocess',
  research: 'Research',
  topic_selection: 'Topic',
  script: 'Script',
  stages: 'Stages',
  tts: 'TTS',
  audio_postprocess: 'Audio',
  assets: 'Assets',
  store: 'Store',
  publish: 'Publish'
}

function getNodeStyle(status: string) {
  switch (status) {
    case 'completed':
      return { bg: 'var(--bg-elevated)', border: 'var(--success-color)', emoji: '✓', shadow: '0 0 10px rgba(82, 196, 26, 0.2)' }
    case 'running':
      return { bg: 'var(--bg-elevated)', border: 'var(--warning-color)', emoji: '⏳', shadow: '0 0 15px rgba(250, 173, 20, 0.4)' }
    case 'failed':
      return { bg: 'var(--bg-elevated)', border: 'var(--error-color)', emoji: '❌', shadow: '0 0 10px rgba(255, 77, 79, 0.2)' }
    case 'waiting_approval':
      return { bg: 'var(--bg-elevated)', border: 'var(--info-color)', emoji: '👤', shadow: '0 0 10px rgba(24, 144, 255, 0.2)' }
    default:
      return { bg: 'var(--bg-elevated)', border: 'var(--border-color)', emoji: '⏸', shadow: 'none' }
  }
}

function buildNodes(workflow: Workflow | null): Node[] {
  const nodes: Node[] = []
  let xPos = 50
  const yBase = 150
  const xSpacing = 200

  for (let i = 0; i < NODE_SEQUENCE.length; i++) {
    const name = NODE_SEQUENCE[i]
    const execution = workflow?.nodeExecutions?.[name]
    const status = execution?.status || 'pending'
    const { bg, border, emoji, shadow } = getNodeStyle(status)
    const durationText = execution?.duration
      ? `${execution.duration.toFixed(1)}s`
      : ''

    let yPos = yBase
    
    // fetch和manual并行显示
    if (name === 'fetch') {
      yPos = yBase - 80  // fetch在上方
    } else if (name === 'manual') {
      yPos = yBase + 80  // manual在下方
      xPos -= xSpacing  // manual与fetch同一个x坐标
    }

    nodes.push({
      id: name,
      type: 'default',
      data: {
        label: (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{ fontSize: '14px', fontWeight: 500 }}>{emoji} {NODE_LABELS[name]}</div>
            {durationText && <div style={{ fontSize: '10px', opacity: 0.7 }}>{durationText}</div>}
          </div>
        )
      },
      position: { x: xPos, y: yPos },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      style: {
        background: bg,
        border: `1px solid ${border}`,
        borderRadius: '8px',
        padding: '12px',
        width: 140,
        color: 'var(--text-primary)',
        boxShadow: shadow,
        transition: 'all 0.3s ease',
      }
    })

    xPos += xSpacing
  }

  return nodes
}

function buildEdges(workflow: Workflow | null): Edge[] {
  const edges: Edge[] = []
  
  const commonEdgeStyle = { stroke: 'var(--border-light)', strokeWidth: 2 }
  const activeEdgeStyle = { stroke: 'var(--accent-primary)', strokeWidth: 2 }

  // source_selector 分支到 fetch 和 manual
  edges.push({
    id: 'source_selector-fetch',
    source: 'source_selector',
    target: 'fetch',
    animated: workflow?.currentNode === 'source_selector',
    style: workflow?.currentNode === 'source_selector' ? activeEdgeStyle : commonEdgeStyle
  })
  
  edges.push({
    id: 'source_selector-manual',
    source: 'source_selector',
    target: 'manual',
    animated: workflow?.currentNode === 'source_selector',
    style: workflow?.currentNode === 'source_selector' ? activeEdgeStyle : commonEdgeStyle
  })
  
  // fetch 和 manual 都连接到 preprocess
  edges.push({
    id: 'fetch-preprocess',
    source: 'fetch',
    target: 'preprocess',
    animated: workflow?.currentNode === 'fetch',
    style: workflow?.currentNode === 'fetch' ? activeEdgeStyle : commonEdgeStyle
  })
  
  edges.push({
    id: 'manual-preprocess',
    source: 'manual',
    target: 'preprocess',
    animated: workflow?.currentNode === 'manual',
    style: workflow?.currentNode === 'manual' ? activeEdgeStyle : commonEdgeStyle
  })
  
  // preprocess 之后的节点顺序连接
  const remainingNodes = NODE_SEQUENCE.slice(3)  // 从 preprocess 开始
  for (let i = 0; i < remainingNodes.length - 1; i++) {
    const source = remainingNodes[i]
    const target = remainingNodes[i + 1]
    const isActive = workflow?.currentNode === source
    
    edges.push({
      id: `${source}-${target}`,
      source: source,
      target: target,
      animated: isActive,
      style: isActive ? activeEdgeStyle : commonEdgeStyle
    })
  }
  
  return edges
}

const initialNodes = buildNodes(null)
const initialEdges = buildEdges(null)

interface Props {
  workflow: Workflow | null
  onNodeClick: (nodeName: string) => void
}

export default function WorkflowCanvas({ workflow, onNodeClick }: Props) {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)

  useEffect(() => {
    setNodes(buildNodes(workflow))
    setEdges(buildEdges(workflow))
  }, [workflow, setNodes, setEdges])

  const onInit = useCallback((instance: ReactFlowInstance) => {
    setTimeout(() => instance.fitView({ padding: 0.2 }), 100)
  }, [])

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={(_, node) => onNodeClick(node.id)}
        onInit={onInit}
        minZoom={0.1}
        maxZoom={2}
        nodesDraggable={false}
        nodesConnectable={false}
      >
        <Background />
        <Controls />
        <MiniMap />
      </ReactFlow>
    </div>
  )
}
