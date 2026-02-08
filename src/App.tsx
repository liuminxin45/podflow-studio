import { useState, useEffect } from 'react'
import { Layout, Button, Space, Typography, message } from 'antd'
import { PlayCircleOutlined, SettingOutlined } from '@ant-design/icons'
import WorkflowCanvas from './components/WorkflowCanvas'
import NodeDetailPanel from './components/NodeDetailPanel'
import LogPanel from './components/LogPanel'
import type { Workflow, WorkflowCreateResult } from './types/workflow'

const { Header, Content, Footer } = Layout
const { Title } = Typography

declare global {
  interface Window {
    electronAPI: {
      createWorkflow: (config: Record<string, any>) => Promise<WorkflowCreateResult>
      getWorkflow: (id: string) => Promise<Workflow | null>
      approveNode: (id: string, node: string, approved: boolean, output?: any) => Promise<{ status: string }>
      onWorkflowUpdate: (callback: (data: Workflow) => void) => void
      getNodeSchema: (nodeName: string) => Promise<any>
      getAllNodeSchemas: () => Promise<Record<string, any>>
    }
  }
}

function App() {
  const [workflow, setWorkflow] = useState<Workflow | null>(null)
  const [selectedNode, setSelectedNode] = useState<string | null>(null)

  useEffect(() => {
    window.electronAPI.onWorkflowUpdate((data) => {
      setWorkflow(data)
    })
  }, [])

  const handleStart = async () => {
    try {
      const result = await window.electronAPI.createWorkflow({})
      message.success(`Started: ${result.episodeId}`)
    } catch (e: any) {
      message.error(`Failed: ${e.message}`)
    }
  }

  return (
    <Layout style={{ height: '100vh' }}>
      <Header style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between',
        background: '#001529',
        padding: '0 24px'
      }}>
        <Title level={3} style={{ color: 'white', margin: 0 }}>
          🎙️ Auto-Podcast Studio
        </Title>
        <Space>
          <Button 
            type="primary" 
            icon={<PlayCircleOutlined />}
            onClick={handleStart}
            size="large"
          >
            新建项目
          </Button>
          <Button icon={<SettingOutlined />}>设置</Button>
        </Space>
      </Header>

      <Layout>
        <Content style={{ position: 'relative', overflow: 'hidden' }}>
          <WorkflowCanvas workflow={workflow} onNodeClick={setSelectedNode} />
          {selectedNode && (
            <NodeDetailPanel 
              nodeName={selectedNode} 
              workflow={workflow}
              onClose={() => setSelectedNode(null)}
            />
          )}
        </Content>

        <Footer style={{ height: '200px', padding: 0, borderTop: '1px solid #f0f0f0' }}>
          <LogPanel workflow={workflow} />
        </Footer>
      </Layout>
    </Layout>
  )
}

export default App
