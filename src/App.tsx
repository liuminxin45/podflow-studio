import { useState, useEffect } from 'react'
import { Layout, Button, Space, Typography, message, ConfigProvider, theme } from 'antd'
import { PlayCircleOutlined, SettingOutlined } from '@ant-design/icons'
import WorkflowCanvas, { STAGES } from './components/WorkflowCanvas'
import NodeDetailPanel from './components/NodeDetailPanel'
import LogPanel from './components/LogPanel'
import ApprovalModal from './components/ApprovalModal'
import CreationStudio from './components/CreationStudio'
import DiscoverPanel from './components/DiscoverPanel'
import OrganizePanel from './components/OrganizePanel'
import WritingLayer from './components/writing'
import SoundStudio from './components/SoundStudio'
import PublishLayer from './components/PublishLayer'
import SettingsPage from './components/SettingsPage'
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
  const [studioVisible, setStudioVisible] = useState(false)
  const [studioAutoOpened, setStudioAutoOpened] = useState(false)
  const [discoverVisible, setDiscoverVisible] = useState(false)
  const [organizeVisible, setOrganizeVisible] = useState(false)
  const [writingVisible, setWritingVisible] = useState(false)
  const [fetchSources, setFetchSources] = useState<Array<{ id: string; name: string; description: string }>>([])
  const [fetchConfig, setFetchConfig] = useState<Record<string, any>>({})
  const [soundStudioVisible, setSoundStudioVisible] = useState(false)
  const [publishVisible, setPublishVisible] = useState(false)
  const [settingsVisible, setSettingsVisible] = useState(false)

  // Close all full-screen panels (mutual exclusivity)
  const closeAllPanels = () => {
    setDiscoverVisible(false)
    setOrganizeVisible(false)
    setStudioVisible(false)
    setWritingVisible(false)
    setSoundStudioVisible(false)
    setPublishVisible(false)
    setSettingsVisible(false)
  }

  // Load fetch sources and config
  useEffect(() => {
    window.electronAPI.getFetchSources()
      .then(sources => setFetchSources(sources))
      .catch(e => console.error('Failed to load fetch sources:', e))
    window.electronAPI.loadNodeConfig('fetch')
      .then(config => { if (config) setFetchConfig(config) })
      .catch(e => console.error('Failed to load fetch config:', e))
  }, [])

  useEffect(() => {
    window.electronAPI.onWorkflowUpdate((data) => {
      setWorkflow(data)

      // Auto-open creation studio when organize completes and ideate begins
      if (!studioAutoOpened && data?.nodeExecutions) {
        const organizeStage = STAGES.find(s => s.id === 'organize')
        const ideateStage = STAGES.find(s => s.id === 'ideate')
        if (organizeStage && ideateStage) {
          const organizeComplete = organizeStage.subNodes.every(
            n => data.nodeExecutions?.[n]?.status === 'completed'
          )
          const ideateStarted = ideateStage.subNodes.some(
            n => data.nodeExecutions?.[n]?.status === 'running' ||
                 data.nodeExecutions?.[n]?.status === 'completed'
          )
          if (organizeComplete && ideateStarted) {
            setStudioVisible(true)
            setStudioAutoOpened(true)
          }
        }
      }
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

  const logPanelHeight = logPanelCollapsed ? '40px' : '200px'

  return (
    <ConfigProvider
      theme={{
        algorithm: theme.defaultAlgorithm,
        token: {
          colorPrimary: '#2563eb',
          colorBgBase: '#ffffff',
          colorBgContainer: '#ffffff',
          colorBgElevated: '#ffffff',
          colorBorder: '#e5e7eb',
          fontFamily: "'Inter', sans-serif",
          borderRadius: 6,
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
          padding: '0 20px',
          height: '52px',
          lineHeight: '52px',
          zIndex: 20
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '20px' }}>🎙️</span>
            <Title level={5} style={{ color: 'var(--text-primary)', margin: 0, fontWeight: 600 }}>
              Auto-Podcast Studio
            </Title>
          </div>
          <Space size="small">
            <Button 
              type="primary" 
              icon={<PlayCircleOutlined />}
              onClick={handleStart}
              style={{ 
                background: 'var(--accent-primary)',
                borderColor: 'var(--accent-primary)',
                boxShadow: 'var(--shadow-sm)',
                height: '32px',
                fontSize: '13px'
              }}
            >
              Create New Episode
            </Button>
            <Button 
              icon={<SettingOutlined />} 
              onClick={() => { closeAllPanels(); setSettingsVisible(true) }}
              style={{ 
                background: 'transparent', 
                borderColor: 'var(--border-color)',
                color: 'var(--text-secondary)',
                height: '32px'
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
            height: `calc(100vh - 52px - ${logPanelHeight})`,
            display: 'flex',
            flexDirection: 'row',
            transition: 'height 0.3s ease'
          }}>
            <div style={{ flex: 1, position: 'relative', height: '100%' }}>
              <WorkflowCanvas 
                workflow={workflow} 
                onNodeClick={setSelectedNode}
                onStageClick={(stageId) => {
                  closeAllPanels()
                  if (stageId === 'ideate') {
                    setStudioVisible(true)
                  } else if (stageId === 'discover') {
                    setDiscoverVisible(true)
                  } else if (stageId === 'organize') {
                    setOrganizeVisible(true)
                  } else if (stageId === 'write') {
                    setWritingVisible(true)
                  } else if (stageId === 'produce') {
                    setSoundStudioVisible(true)
                  } else if (stageId === 'publish') {
                    setPublishVisible(true)
                  }
                }}
              />
            </div>
            
            {selectedNode && (
              <div style={{ 
                width: '500px', 
                height: '100%', 
                borderLeft: '1px solid var(--border-color)',
                background: 'var(--bg-secondary)',
                boxShadow: 'var(--shadow-lg)',
                zIndex: 20,
                animation: 'slideInRight 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
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
            overflow: 'hidden',
            boxShadow: '0 -2px 10px rgba(0,0,0,0.02)'
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

        <DiscoverPanel
          visible={discoverVisible}
          onClose={() => setDiscoverVisible(false)}
          fetchContents={workflow?.state?.fetch_contents || []}
          manualContents={workflow?.state?.manual_contents || []}
          fetchSources={fetchSources}
          fetchConfig={fetchConfig}
          onFetchConfigSave={async (values) => {
            const result = await window.electronAPI.saveNodeConfig('fetch', values)
            if (result.success) {
              setFetchConfig(values)
            } else {
              throw new Error(result.error)
            }
          }}
        />

        <OrganizePanel
          visible={organizeVisible}
          onClose={() => setOrganizeVisible(false)}
          contents={workflow?.state?.raw_contents || workflow?.state?.fetch_contents || []}
          userTopic={(fetchConfig?.topic as string) || ''}
          onProceedToIdeate={(_candidates) => {
            closeAllPanels()
            setStudioVisible(true)
          }}
        />

        <CreationStudio
          visible={studioVisible}
          onClose={() => setStudioVisible(false)}
          rawContents={workflow?.state?.raw_contents || []}
          selectedTopic={workflow?.state?.selected_topic}
          onConfirm={(_structure) => {
            closeAllPanels()
            setWritingVisible(true)
          }}
        />

        <WritingLayer
          visible={writingVisible}
          onClose={() => setWritingVisible(false)}
          episodeTitle={workflow?.state?.selected_topic?.title || ''}
          episodeDesc={workflow?.state?.selected_topic?.description || ''}
          onProceedToProduction={() => {
            closeAllPanels()
            setSoundStudioVisible(true)
          }}
        />

        <SoundStudio
          visible={soundStudioVisible}
          onClose={() => setSoundStudioVisible(false)}
          episodeTitle={workflow?.state?.selected_topic?.title || ''}
          onProceedToPublish={() => {
            closeAllPanels()
            setPublishVisible(true)
          }}
        />
        <PublishLayer
          visible={publishVisible}
          onClose={() => setPublishVisible(false)}
          episodeTitle={workflow?.state?.selected_topic?.title || ''}
          episodeDesc={workflow?.state?.selected_topic?.description || ''}
        />

        <SettingsPage
          visible={settingsVisible}
          onClose={() => setSettingsVisible(false)}
        />
      </Layout>
    </ConfigProvider>
  )
}

export default App
