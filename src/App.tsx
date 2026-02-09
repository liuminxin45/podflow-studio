import { useState, useEffect } from 'react'
import { Layout, Button, Space, Typography, message, ConfigProvider, theme } from 'antd'
import { PlayCircleOutlined, SettingOutlined } from '@ant-design/icons'
import WorkflowCanvas from './components/WorkflowCanvas'
import NodeDetailPanel from './components/NodeDetailPanel'
import LogPanel from './components/LogPanel'
import ApprovalModal from './components/ApprovalModal'
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
      onNeedApproval: (callback: (data: any) => void) => void
      getNodeSchema: (nodeName: string) => Promise<any>
      getAllNodeSchemas: () => Promise<Record<string, any>>
      saveNodeConfig: (nodeName: string, config: Record<string, any>) => Promise<{ success: boolean; error?: string }>
      loadNodeConfig: (nodeName: string) => Promise<Record<string, any> | null>
      loadAllConfigs: () => Promise<Record<string, Record<string, any>>>
      deleteNodeConfig: (nodeName: string) => Promise<{ success: boolean; error?: string }>
      resetAllConfigs: () => Promise<{ success: boolean; error?: string }>
      getFetchSources: () => Promise<Array<{ id: string; name: string; description: string }>>
    }
  }
}

function App() {
  const [workflow, setWorkflow] = useState<Workflow | null>(null)
  const [selectedNode, setSelectedNode] = useState<string | null>(null)
  const [approvalVisible, setApprovalVisible] = useState(false)
  const [approvalData, setApprovalData] = useState<any>(null)
  const [logPanelCollapsed, setLogPanelCollapsed] = useState(false)

  useEffect(() => {
    window.electronAPI.onWorkflowUpdate((data) => {
      setWorkflow(data)
    })

    window.electronAPI.onNeedApproval((data) => {
      console.log('[Frontend] Received needApproval event:', data)
      setApprovalData(data)
      setApprovalVisible(true)
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

  const handleApprove = async () => {
    if (!approvalData) return
    try {
      await window.electronAPI.approveNode(approvalData.workflowId, approvalData.nodeName, true)
      setApprovalVisible(false)
      setApprovalData(null)
      message.success('已批准，工作流继续执行')
    } catch (e: any) {
      message.error(`批准失败: ${e.message}`)
    }
  }

  const handleReject = async () => {
    if (!approvalData) return
    try {
      await window.electronAPI.approveNode(approvalData.workflowId, approvalData.nodeName, false)
      setApprovalVisible(false)
      setApprovalData(null)
      message.warning('已拒绝，工作流已停止')
    } catch (e: any) {
      message.error(`拒绝失败: ${e.message}`)
    }
  }

  const logPanelHeight = logPanelCollapsed ? '46px' : '240px'

  return (
    <ConfigProvider
      theme={{
        algorithm: theme.darkAlgorithm,
        token: {
          colorPrimary: '#1890ff',
          colorBgBase: '#121212',
          colorBgContainer: '#1e1e1e',
          colorBgElevated: '#2d2d2d',
          colorBorder: '#333333',
        },
      }}
    >
      <Layout style={{ height: '100vh', background: 'var(--bg-primary)' }}>
        <Header style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between',
          background: 'var(--bg-secondary)',
          borderBottom: '1px solid var(--border-color)',
          padding: '0 24px',
          height: '64px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '24px' }}>🎙️</span>
            <Title level={4} style={{ color: 'var(--text-primary)', margin: 0, fontWeight: 600 }}>
              Auto-Podcast Studio
            </Title>
          </div>
          <Space size="middle">
            <Button 
              type="primary" 
              icon={<PlayCircleOutlined />}
              onClick={handleStart}
              size="large"
              style={{ 
                background: 'var(--accent-primary)',
                borderColor: 'var(--accent-primary)',
                boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
              }}
            >
              Create New Episode
            </Button>
            <Button 
              icon={<SettingOutlined />} 
              style={{ 
                background: 'transparent', 
                borderColor: 'var(--border-light)',
                color: 'var(--text-primary)'
              }}
            >
              Settings
            </Button>
          </Space>
        </Header>

        <Layout style={{ background: 'transparent' }}>
          <Content style={{ 
            position: 'relative', 
            overflow: 'hidden', 
            height: `calc(100vh - 64px - ${logPanelHeight})`,
            display: 'flex',
            flexDirection: 'row',
            transition: 'height 0.3s ease'
          }}>
            <div style={{ flex: 1, position: 'relative', height: '100%' }}>
              <WorkflowCanvas workflow={workflow} onNodeClick={setSelectedNode} />
            </div>
            
            {selectedNode && (
              <div style={{ 
                width: '600px', 
                height: '100%', 
                borderLeft: '1px solid var(--border-color)',
                background: 'var(--bg-secondary)',
                boxShadow: '-4px 0 16px rgba(0, 0, 0, 0.2)',
                zIndex: 20,
                animation: 'slideIn 0.3s ease-out'
              }}>
                <NodeDetailPanel 
                  nodeName={selectedNode} 
                  workflow={workflow}
                  onClose={() => setSelectedNode(null)}
                />
              </div>
            )}
          </Content>

          <Footer style={{ 
            height: logPanelHeight, 
            padding: 0, 
            background: 'var(--bg-secondary)',
            borderTop: '1px solid var(--border-color)',
            zIndex: 10,
            transition: 'height 0.3s ease',
            overflow: 'hidden'
          }}>
            <LogPanel 
              workflow={workflow} 
              collapsed={logPanelCollapsed}
              onToggle={() => setLogPanelCollapsed(!logPanelCollapsed)}
            />
          </Footer>
        </Layout>

        <ApprovalModal
          visible={approvalVisible}
          approvalData={approvalData}
          onApprove={handleApprove}
          onReject={handleReject}
        />
      </Layout>
      <style>{`
        @keyframes slideIn {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </ConfigProvider>
  )
}

export default App
