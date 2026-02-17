import { useState, useEffect } from 'react'
import { Layout, Button, Space, Typography, ConfigProvider, theme, Modal, Tooltip } from 'antd'
import { AudioOutlined, CloseOutlined, FolderOpenOutlined, SaveOutlined, SettingOutlined } from './icons/antdCompat'
import ApprovalModal from './components/ApprovalModal'
import CreationStudio from './components/CreationStudio'
import DiscoverPanel from './components/DiscoverPanel'
import OrganizePanel from './components/OrganizePanel'
import WritingLayer from './components/writing'
import SoundStudio from './components/SoundStudio'
import PublishLayer from './components/PublishLayer'
import SettingsPage from './components/SettingsPage'
import WorkflowSidebar from './components/WorkflowSidebar'
import EpisodeManager from './components/EpisodeManager'
import { STAGES } from './components/workflowStages'
import type { Workflow, WorkflowCreateResult, WorkflowSummary, ContentItem } from './types/workflow'
import type {
  TrendRadarConfigView,
  TrendRadarItem,
  TrendRadarMeta,
  TrendRadarRunResult,
  TrendRadarSource,
  TrendRadarStatus,
  TrendRadarUpdateStatus,
} from './types/trendradar'

const { Header, Content } = Layout
const { Title } = Typography
const APP_SNAPSHOT_KEY = 'app.workflow.snapshot.v1'

type AppSnapshot = {
  workflow: Workflow | null
  selectedNode: string | null
  studioVisible: boolean
  discoverVisible: boolean
  organizeVisible: boolean
  writingVisible: boolean
  soundStudioVisible: boolean
  publishVisible: boolean
  discoverCandidates: ContentItem[]
  organizeCandidates: ContentItem[]
  writingSeed: {
    title?: string
    description?: string
    initialScript?: { title?: string; dialogue?: Array<{ speaker: string; text: string }> }
  } | null
  productionSeed: {
    title: string
    description: string
    globalTone: string
    segments: Array<{ id: string; type: string; label: string; content: string; estimatedSeconds: number }>
  } | null
}

function loadAppSnapshot(): Partial<AppSnapshot> {
  try {
    if (typeof window === 'undefined') return {}
    const raw = window.localStorage.getItem(APP_SNAPSHOT_KEY)
    if (!raw) return {}
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

function saveAppSnapshot(snapshot: AppSnapshot) {
  try {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(APP_SNAPSHOT_KEY, JSON.stringify(snapshot))
  } catch {
    // ignore localStorage errors
  }
}

type UiNotice = {
  type: 'success' | 'warning' | 'error' | 'info'
  text: string
}

declare global {
  interface Window {
    electronAPI: {
      createWorkflow: (config: Record<string, any>) => Promise<WorkflowCreateResult>
      getWorkflow: (id: string) => Promise<Workflow | null>
      listWorkflows: () => Promise<WorkflowSummary[]>
      openWorkflow: (id: string) => Promise<Workflow>
      saveWorkflow: (id: string) => Promise<Workflow>
      closeWorkflow: (id: string) => Promise<{ success: boolean }>
      updateWorkflowMeta: (
        id: string,
        meta: { title: string; description: string; previewPath: string }
      ) => Promise<Workflow>
      duplicateWorkflow: (id: string) => Promise<Workflow>
      deleteWorkflow: (id: string) => Promise<{ success: boolean }>
      exportWorkflow: (id: string) => Promise<{ success: boolean; canceled?: boolean; path?: string }>
      importWorkflow: () => Promise<{ success: boolean; canceled?: boolean; workflow?: Workflow; summary?: WorkflowSummary }>
      approveNode: (id: string, node: string, approved: boolean, output?: any) => Promise<{ status: string }>
      updateWorkflowState: (id: string, patch: Record<string, any>) => Promise<Workflow>
      runWorkflowNodes: (id: string, nodeNames: string[]) => Promise<Workflow>
      saveRecording: (payload: {
        episodeId: string
        segmentId: string
        mimeType: string
        durationSeconds: number
        data: ArrayBuffer
      }) => Promise<{ success: boolean; path: string; size: number; mimeType: string; durationSeconds: number }>
      openPath: (targetPath: string) => Promise<{ success: boolean; error?: string }>
      showItemInFolder: (targetPath: string) => Promise<{ success: boolean; error?: string }>
      readImageAsDataUrl: (targetPath: string) => Promise<{
        success: boolean
        error?: string
        path?: string
        size?: number
        mimeType?: string
        dataUrl?: string
      }>
      onWorkflowUpdate: (callback: (data: Workflow | null) => void) => void
      onNeedApproval: (callback: (data: any) => void) => void
      getNodeSchema: (nodeName: string) => Promise<any>
      getAllNodeSchemas: () => Promise<Record<string, any>>
      saveNodeConfig: (nodeName: string, config: Record<string, any>) => Promise<{ success: boolean; error?: string }>
      loadNodeConfig: (nodeName: string) => Promise<Record<string, any> | null>
      loadAllConfigs: () => Promise<Record<string, Record<string, any>>>
      deleteNodeConfig: (nodeName: string) => Promise<{ success: boolean; error?: string }>
      resetAllConfigs: () => Promise<{ success: boolean; error?: string }>
      getFetchSources: () => Promise<Array<{ id: string; name: string; description: string }>>
      radarGetState: () => Promise<{
        enabled: boolean
        intervalMin: number
        keepLast: number
        lastRunAt: string | null
        lastError: string | null
        running: boolean
        lastRunContents?: ContentItem[]
        contents: ContentItem[]
      }>
      radarStart: (config?: Record<string, any>) => Promise<any>
      radarStop: () => Promise<any>
      radarRunOnce: (config?: Record<string, any>) => Promise<any>
      radarClearContents: () => Promise<any>
      radarUpdateContents: (contents: ContentItem[]) => Promise<any>
      onRadarUpdate: (callback: (data: {
        enabled: boolean
        intervalMin: number
        keepLast: number
        lastRunAt: string | null
        lastError: string | null
        running: boolean
        lastRunContents?: ContentItem[]
        contents: ContentItem[]
      }) => void) => void
      trendradarStart: (intervalMin?: number) => Promise<any>
      trendradarStop: () => Promise<any>
      trendradarStatus: () => Promise<any>
      trendradarGetStatus: () => Promise<TrendRadarStatus>
      trendradarGetConfig: () => Promise<{ success: boolean; config: TrendRadarConfigView; error?: string }>
      trendradarSaveConfig: (config: Partial<TrendRadarConfigView>) => Promise<{ success: boolean; config: TrendRadarConfigView; error?: string }>
      trendradarListSources: () => Promise<{ success: boolean; sources: TrendRadarSource[]; error?: string }>
      trendradarRunOnce: (config?: Partial<TrendRadarConfigView>) => Promise<TrendRadarRunResult>
      trendradarGetLatest: () => Promise<{ success: boolean; items: TrendRadarItem[]; fetch_contents: TrendRadarItem[]; meta: TrendRadarMeta; error?: string }>
      trendradarGetTopics: () => Promise<{ success: boolean; topics: Array<{ name: string; count: number }>; error?: string }>
      trendradarCheckUpdate: () => Promise<TrendRadarUpdateStatus>
      trendradarUpdateDependency: (payload?: Record<string, any>) => Promise<Record<string, any>>
      trendradarOpenReport: (reportPath: string) => Promise<{ success: boolean; error?: string }>
      onTrendradarLog: (callback: (data: string) => void) => void
      onTrendradarStatus: (callback: (data: any) => void) => void
    }
  }
}

function App() {
  const [workflow, setWorkflow] = useState<Workflow | null>(null)
  const [workflowSummaries, setWorkflowSummaries] = useState<WorkflowSummary[]>([])
  const [homePage, setHomePage] = useState<'blank' | 'episodes'>('episodes')
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [approvalVisible, setApprovalVisible] = useState(false)
  const [approvalData, setApprovalData] = useState<any>(null)
  const [studioVisible, setStudioVisible] = useState(false)
  const [studioAutoOpened, setStudioAutoOpened] = useState(false)
  const [discoverVisible, setDiscoverVisible] = useState(false)
  const [organizeVisible, setOrganizeVisible] = useState(false)
  const [discoverCandidates, setDiscoverCandidates] = useState<ContentItem[]>([])
  const [organizeCandidates, setOrganizeCandidates] = useState<ContentItem[]>([])
  const [writingVisible, setWritingVisible] = useState(false)
  const [soundStudioVisible, setSoundStudioVisible] = useState(false)
  const [publishVisible, setPublishVisible] = useState(false)
  const [settingsVisible, setSettingsVisible] = useState(false)
  const [settingsReturnTarget, setSettingsReturnTarget] = useState<{
    homePage: 'blank' | 'episodes'
    stageId: string | null
  } | null>(null)
  const hasElectronBackend = Boolean(window.electronAPI?.listWorkflows)

  const showNotice = (type: UiNotice['type'], text: string) => {
    const prefix = type === 'error' ? '错误' : type === 'warning' ? '警告' : '提示'
    console[type === 'error' ? 'error' : type === 'warning' ? 'warn' : 'log'](`[${prefix}] ${text}`)
  }

  const saveActiveWorkflow = async () => {
    if (!workflow) return null
    if (!window.electronAPI?.saveWorkflow) {
      showNotice('warning', '当前浏览器预览没有 Electron 后端，无法保存节目')
      return null
    }
    const saved = await window.electronAPI.saveWorkflow(workflow.id)
    setWorkflow(saved)
    setHasUnsavedChanges(false)
    await loadWorkflowSummaries()
    showNotice('success', '节目已保存')
    return saved
  }

  const confirmSaveBeforeReplace = async () => {
    if (!workflow || !hasUnsavedChanges) return true
    return new Promise<boolean>((resolve) => {
      Modal.confirm({
        title: '保存当前节目？',
        content: '当前节目有未保存更改。保存后再继续，或选择不保存并丢弃这些更改。',
        okText: '保存',
        cancelText: '不保存',
        centered: true,
        async onOk() {
          try {
            await saveActiveWorkflow()
            resolve(true)
          } catch (error: any) {
            showNotice('error', `保存失败：${error.message}`)
            resolve(false)
          }
        },
        onCancel() {
          resolve(true)
        },
      })
    })
  }

  const loadWorkflowSummaries = async () => {
    if (!window.electronAPI?.listWorkflows) return
    try {
      const summaries = await window.electronAPI.listWorkflows()
      setWorkflowSummaries(summaries)
    } catch (error) {
      console.error('Failed to load workflows:', error)
    }
  }

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

  const openStage = (stageId: string) => {
    closeAllPanels()
    setHomePage('blank')
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
  }

  const getCurrentStageId = () => {
    if (discoverVisible) return 'discover'
    if (organizeVisible) return 'organize'
    if (studioVisible) return 'ideate'
    if (writingVisible) return 'write'
    if (soundStudioVisible) return 'produce'
    if (publishVisible) return 'publish'
    return null
  }

  const openSettings = () => {
    setSettingsReturnTarget({
      homePage,
      stageId: getCurrentStageId(),
    })
    closeAllPanels()
    setHomePage('blank')
    setSettingsVisible(true)
  }

  const closeSettings = () => {
    const target = settingsReturnTarget
    setSettingsVisible(false)
    setSettingsReturnTarget(null)

    if (target?.stageId && workflow) {
      openStage(target.stageId)
      return
    }

    if (target?.homePage === 'episodes') {
      setHomePage('episodes')
      void loadWorkflowSummaries()
      return
    }

    setHomePage(workflow ? 'blank' : 'episodes')
  }

  const openEpisodeManager = () => {
    closeAllPanels()
    setHomePage('episodes')
    void loadWorkflowSummaries()
  }

  const returnToEpisodeManager = () => {
    closeAllPanels()
    setHomePage('episodes')
    void loadWorkflowSummaries()
  }

  useEffect(() => {
    void loadWorkflowSummaries()
  }, [])

  useEffect(() => {
    if (!window.electronAPI?.onWorkflowUpdate) return
    window.electronAPI.onWorkflowUpdate((data) => {
      setWorkflow(data)
      void loadWorkflowSummaries()

      if (!data) return

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
            openStage('ideate')
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

  useEffect(() => {
    setStudioAutoOpened(false)
    setDiscoverCandidates(workflow?.state?.selected_materials || workflow?.state?.raw_contents || [])
    setOrganizeCandidates(workflow?.state?.organize_ui?.candidates || workflow?.state?.cleaned_contents || [])
  }, [workflow?.id])

  const handleStart = async () => {
    try {
      if (!window.electronAPI?.createWorkflow) {
        showNotice('warning', '当前浏览器预览没有 Electron 后端，无法创建节目')
        return
      }
      const canContinue = await confirmSaveBeforeReplace()
      if (!canContinue) return
      const result = await window.electronAPI.createWorkflow({ autoRun: false })
      const created = await window.electronAPI.getWorkflow(result.workflowId)
      if (created) setWorkflow(created)
      setHasUnsavedChanges(true)
      await loadWorkflowSummaries()
      showNotice('success', `已创建节目：${result.episodeId}`)
      openStage('discover')
    } catch (e: any) {
      showNotice('error', `创建失败：${e.message}`)
    }
  }

  const ensureWorkflow = async () => {
    if (workflow) return workflow
    if (!window.electronAPI?.createWorkflow) {
      showNotice('warning', '当前浏览器预览没有 Electron 后端，部分执行能力不可用')
      return null
    }
    const result = await window.electronAPI.createWorkflow({ autoRun: false })
    const created = await window.electronAPI.getWorkflow(result.workflowId)
    if (created) {
      setWorkflow(created)
      setHasUnsavedChanges(true)
      await loadWorkflowSummaries()
      return created
    }
    return null
  }

  const updateWorkflowPatch = async (patch: Record<string, any>) => {
    const active = await ensureWorkflow()
    if (!active) return null
    const updated = await window.electronAPI.updateWorkflowState(active.id, patch)
    setWorkflow(updated)
    setHasUnsavedChanges(true)
    void loadWorkflowSummaries()
    return updated
  }

  const runWorkflowNodes = async (nodeNames: string[]) => {
    const active = await ensureWorkflow()
    if (!active) return null
    const updated = await window.electronAPI.runWorkflowNodes(active.id, nodeNames)
    setWorkflow(updated)
    setHasUnsavedChanges(true)
    void loadWorkflowSummaries()
    return updated
  }

  const handleOpenWorkflow = async (workflowId: string) => {
    if (!window.electronAPI?.openWorkflow) {
      showNotice('warning', '当前浏览器预览没有 Electron 后端，无法打开节目')
      return
    }
    try {
      if (workflow?.id === workflowId) {
        openStage('discover')
        return
      }
      if (workflow?.id !== workflowId) {
        const canContinue = await confirmSaveBeforeReplace()
        if (!canContinue) return
      }
      const opened = await window.electronAPI.openWorkflow(workflowId)
      setWorkflow(opened)
      setHasUnsavedChanges(false)
      closeAllPanels()
      await loadWorkflowSummaries()
      showNotice('success', '已打开节目')
      openStage('discover')
    } catch (e: any) {
      showNotice('error', `打开失败：${e.message}`)
    }
  }

  const handleCloseWorkflow = async () => {
    if (!workflow) return
    const canContinue = await confirmSaveBeforeReplace()
    if (!canContinue) return
    if (window.electronAPI?.closeWorkflow) {
      await window.electronAPI.closeWorkflow(workflow.id)
    }
    setWorkflow(null)
    setHasUnsavedChanges(false)
    closeAllPanels()
    setHomePage('episodes')
    await loadWorkflowSummaries()
  }

  const handleDeleteWorkflow = async (workflowId: string) => {
    if (!window.electronAPI?.deleteWorkflow) {
      showNotice('warning', '当前浏览器预览没有 Electron 后端，无法删除节目')
      return
    }
    try {
      if (workflow?.id === workflowId) {
        const canContinue = await confirmSaveBeforeReplace()
        if (!canContinue) return
      }
      await window.electronAPI.deleteWorkflow(workflowId)
      if (workflow?.id === workflowId) {
        setWorkflow(null)
        setHasUnsavedChanges(false)
        closeAllPanels()
        setHomePage('episodes')
      }
      await loadWorkflowSummaries()
      showNotice('success', '节目已删除')
    } catch (e: any) {
      showNotice('error', `删除失败：${e.message}`)
    }
  }

  const handleImportWorkflow = async () => {
    if (!window.electronAPI?.importWorkflow) {
      showNotice('warning', '当前浏览器预览没有 Electron 后端，无法导入节目')
      return
    }
    try {
      const canContinue = await confirmSaveBeforeReplace()
      if (!canContinue) return
      const result = await window.electronAPI.importWorkflow()
      if (result.canceled) return
      if (result.workflow) {
        setWorkflow(result.workflow)
        setHasUnsavedChanges(true)
      }
      closeAllPanels()
      await loadWorkflowSummaries()
      showNotice('success', '节目已导入')
      openStage('discover')
    } catch (e: any) {
      showNotice('error', `导入失败：${e.message}`)
    }
  }

  const handleExportWorkflow = async (workflowId: string) => {
    if (!window.electronAPI?.exportWorkflow) {
      showNotice('warning', '当前浏览器预览没有 Electron 后端，无法导出节目')
      return
    }
    try {
      const result = await window.electronAPI.exportWorkflow(workflowId)
      if (result.canceled) return
      showNotice('success', `节目已导出：${result.path}`)
    } catch (e: any) {
      showNotice('error', `导出失败：${e.message}`)
    }
  }

  const handleEditWorkflow = async (
    workflowId: string,
    patch: { title: string; description: string; previewPath: string }
  ) => {
    if (!window.electronAPI?.updateWorkflowMeta) {
      showNotice('warning', '当前浏览器预览没有 Electron 后端，无法编辑节目')
      return
    }
    try {
      const updated = await window.electronAPI.updateWorkflowMeta(workflowId, patch)
      if (workflow?.id === workflowId) {
        setWorkflow(updated)
        setHasUnsavedChanges(true)
      }
      await loadWorkflowSummaries()
      showNotice('success', workflow?.id === workflowId ? '节目信息已更新，记得保存节目' : '节目信息已保存')
    } catch (e: any) {
      showNotice('error', `保存失败：${e.message}`)
    }
  }

  const handleDuplicateWorkflow = async (workflowId: string) => {
    if (!window.electronAPI?.duplicateWorkflow) {
      showNotice('warning', '当前浏览器预览没有 Electron 后端，无法复制节目')
      return
    }
    try {
      const canContinue = await confirmSaveBeforeReplace()
      if (!canContinue) return
      const copied = await window.electronAPI.duplicateWorkflow(workflowId)
      setWorkflow(copied)
      setHasUnsavedChanges(true)
      await loadWorkflowSummaries()
      showNotice('success', '节目已复制，当前副本尚未保存')
      openStage('discover')
    } catch (e: any) {
      showNotice('error', `复制失败：${e.message}`)
    }
  }

  const handleApprove = async () => {
    if (!approvalData) return
    try {
      await window.electronAPI.approveNode(approvalData.workflowId, approvalData.nodeName, true)
      setApprovalVisible(false)
      setApprovalData(null)
      setHasUnsavedChanges(true)
      showNotice('success', '已批准，工作流继续执行')
    } catch (e: any) {
      showNotice('error', `批准失败：${e.message}`)
    }
  }

  const handleReject = async () => {
    if (!approvalData) return
    try {
      await window.electronAPI.approveNode(approvalData.workflowId, approvalData.nodeName, false)
      setApprovalVisible(false)
      setApprovalData(null)
      setHasUnsavedChanges(true)
      showNotice('warning', '已拒绝，工作流已停止')
    } catch (e: any) {
      showNotice('error', `拒绝失败：${e.message}`)
    }
  }

  const activeStageId =
    settingsVisible ? null : getCurrentStageId()
  const showWorkflowSidebar = Boolean(workflow && activeStageId)

  return (
    <ConfigProvider
      theme={{
        algorithm: theme.defaultAlgorithm,
        token: {
          colorPrimary: '#2f3437',
          colorBgBase: '#ffffff',
          colorBgContainer: '#ffffff',
          colorBgElevated: '#ffffff',
          colorBorder: '#e7e3da',
          fontFamily: "var(--font-ui)",
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
            <span style={{
              width: 24,
              height: 24,
              border: '1px solid var(--border-color)',
              borderRadius: 6,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-primary)',
              background: 'var(--bg-tertiary)',
            }}>
              <AudioOutlined />
            </span>
            <Title level={5} style={{ color: 'var(--text-primary)', margin: 0, fontWeight: 600 }}>
              Auto-Podcast Studio
            </Title>
          </div>
          <Space size="small">
            {workflow && (
              <>
                <Tooltip title={hasUnsavedChanges ? '保存节目' : '节目已保存'}>
                  <Button
                    icon={<SaveOutlined />}
                    onClick={saveActiveWorkflow}
                    disabled={!hasUnsavedChanges}
                    aria-label="保存节目"
                    style={{
                      background: hasUnsavedChanges ? 'var(--bg-muted)' : 'transparent',
                      borderColor: hasUnsavedChanges ? 'var(--accent-primary)' : 'var(--border-color)',
                      color: hasUnsavedChanges ? 'var(--text-primary)' : 'var(--text-secondary)',
                      height: '32px',
                      width: '32px',
                      padding: 0,
                    }}
                  />
                </Tooltip>
                <Tooltip title="关闭节目">
                  <Button
                    icon={<CloseOutlined />}
                    onClick={handleCloseWorkflow}
                    aria-label="关闭节目"
                    style={{
                      background: 'transparent',
                      borderColor: 'var(--border-color)',
                      color: 'var(--text-secondary)',
                      height: '32px',
                      width: '32px',
                      padding: 0,
                    }}
                  />
                </Tooltip>
              </>
            )}
            <Tooltip title="节目管理">
              <Button
                icon={<FolderOpenOutlined />}
                onClick={openEpisodeManager}
                aria-label="节目管理"
                style={{
                  background: homePage === 'episodes' ? 'var(--bg-muted)' : 'transparent',
                  borderColor: homePage === 'episodes' ? 'var(--accent-primary)' : 'var(--border-color)',
                  color: homePage === 'episodes' ? 'var(--text-primary)' : 'var(--text-secondary)',
                  height: '32px',
                  width: '32px',
                  padding: 0,
                }}
              />
            </Tooltip>
            <Tooltip title="设置">
              <Button
                icon={<SettingOutlined />}
                onClick={openSettings}
                aria-label="设置"
                style={{
                  background: 'transparent',
                  borderColor: 'var(--border-color)',
                  color: 'var(--text-secondary)',
                  height: '32px',
                  width: '32px',
                  padding: 0,
                }}
              />
            </Tooltip>
          </Space>
        </Header>

        <Layout style={{ background: 'transparent' }}>
          <Content style={{ 
            position: 'relative', 
            overflow: 'hidden', 
            height: 'calc(100vh - 52px)',
            display: 'flex',
            flexDirection: 'row',
            transition: 'height 0.3s ease'
          }}>
            {showWorkflowSidebar && (
              <WorkflowSidebar
                workflow={workflow}
                activeStageId={activeStageId}
                onStageClick={openStage}
              />
            )}
            <main style={{
              flex: 1,
              minWidth: 0,
              height: '100%',
              overflow: 'auto',
              background: 'var(--bg-primary)',
              padding: homePage === 'episodes' ? '28px 32px' : 0,
            }}>
              {homePage === 'episodes' && (
                <EpisodeManager
                  episodes={workflowSummaries}
                  activeWorkflowId={workflow?.id}
                  activeWorkflowDirty={hasUnsavedChanges}
                  hasElectronBackend={hasElectronBackend}
                  onCreate={handleStart}
                  onOpen={handleOpenWorkflow}
                  onDelete={handleDeleteWorkflow}
                  onDuplicate={handleDuplicateWorkflow}
                  onImport={handleImportWorkflow}
                  onExport={handleExportWorkflow}
                  onEdit={handleEditWorkflow}
                />
              )}
            </main>
          </Content>
        </Layout>

        <ApprovalModal
          visible={approvalVisible}
          approvalData={approvalData}
          onApprove={handleApprove}
          onReject={handleReject}
        />

        <DiscoverPanel
          key={`discover-${workflow?.id || 'none'}`}
          visible={discoverVisible}
          onClose={returnToEpisodeManager}
          items={(workflow?.state?.fetch_contents || []) as TrendRadarItem[]}
          selectedItems={(workflow?.state?.selected_materials || []) as TrendRadarItem[]}
          meta={(workflow?.state?.trendradar_meta || {}) as TrendRadarMeta}
          onLoadConfig={async () => {
            const result = await window.electronAPI.trendradarGetConfig()
            if (!result.success) throw new Error(result.error || '读取 TrendRadar 配置失败')
            return result.config
          }}
          onSaveConfig={async (config) => {
            const result = await window.electronAPI.trendradarSaveConfig(config)
            if (!result.success) throw new Error(result.error || '保存 TrendRadar 配置失败')
            return result.config
          }}
          onListSources={async () => {
            const result = await window.electronAPI.trendradarListSources()
            if (!result.success) throw new Error(result.error || '读取 TrendRadar 数据源失败')
            return result.sources || []
          }}
          onGetStatus={() => window.electronAPI.trendradarGetStatus()}
          onCheckUpdate={() => window.electronAPI.trendradarCheckUpdate()}
          onUpdateDependency={() => window.electronAPI.trendradarUpdateDependency({ ref: 'latest', installDeps: true })}
          onOpenReport={async (reportPath) => {
            const result = await window.electronAPI.trendradarOpenReport(reportPath)
            if (!result.success) throw new Error(result.error || '打开 TrendRadar 报告失败')
          }}
          onRunOnce={async (config) => {
            const result = await window.electronAPI.trendradarRunOnce(config)
            const contents = (result.fetch_contents || result.items || []) as TrendRadarItem[]
            const meta = result.meta || {}
            await updateWorkflowPatch({
              fetch_contents: contents,
              raw_contents: [],
              selected_materials: [],
              trendradar_meta: meta,
              discover_ui: {
                selectedCount: 0,
                lastRunAt: meta.generated_at || new Date().toISOString(),
              },
              organize_ui: {
                candidates: [],
                ignoredIds: [],
                mode: workflow?.state?.organize_ui?.mode || 'quick',
              },
              cleaned_contents: [],
            })
            setDiscoverCandidates([])
            setOrganizeCandidates([])
            return { ...result, items: contents, fetch_contents: contents, meta }
          }}
          onProceedToOrganize={(candidates, meta) => {
            setDiscoverCandidates(candidates)
            void updateWorkflowPatch({
              selected_materials: candidates,
              raw_contents: candidates,
              trendradar_meta: {
                ...(workflow?.state?.trendradar_meta || {}),
                ...meta,
                selected_count: candidates.length,
              },
              discover_ui: {
                selectedCount: candidates.length,
                proceededAt: new Date().toISOString(),
              },
            })
            closeAllPanels()
            setOrganizeVisible(true)
          }}
        />

        <OrganizePanel
          key={`organize-${workflow?.id || 'none'}`}
          visible={organizeVisible}
          onClose={returnToEpisodeManager}
          contents={discoverCandidates.length > 0
            ? discoverCandidates
            : (workflow?.state?.raw_contents || workflow?.state?.fetch_contents || [])}
          userTopic={(workflow?.state?.selected_topic?.title as string) || ''}
          initialCandidates={(workflow?.state?.organize_ui?.candidates || workflow?.state?.cleaned_contents || []) as any}
          initialIgnoredIds={(workflow?.state?.organize_ui?.ignoredIds || []) as any}
          initialMode={(workflow?.state?.organize_ui?.mode || 'quick') as any}
          onStateChange={(state) => {
            void updateWorkflowPatch({
              organize_ui: state,
              cleaned_contents: state.candidates,
            })
          }}
          onProceedToIdeate={(candidates) => {
            setOrganizeCandidates(candidates)
            void updateWorkflowPatch({
              selected_materials: candidates,
              cleaned_contents: candidates,
            })
            closeAllPanels()
            setStudioVisible(true)
          }}
        />

        <CreationStudio
          key={`creation-${workflow?.id || 'none'}`}
          visible={studioVisible}
          onClose={returnToEpisodeManager}
          rawContents={organizeCandidates.length > 0
            ? organizeCandidates
            : (workflow?.state?.raw_contents || [])}
          selectedTopic={workflow?.state?.selected_topic}
          initialBlocks={(workflow?.state?.episode_brief?.blocks || []) as any}
          onStateChange={(structure) => {
            void updateWorkflowPatch({
              selected_topic: {
                title: structure?.topic?.title || workflow?.state?.selected_topic?.title || '',
                description: structure?.topic?.description || workflow?.state?.selected_topic?.description || '',
              },
              selected_materials: structure?.materials || workflow?.state?.selected_materials || [],
              episode_brief: structure,
            })
          }}
          onConfirm={(structure) => {
            void updateWorkflowPatch({
              selected_topic: {
                title: structure?.topic?.title || workflow?.state?.selected_topic?.title || '',
                description: structure?.topic?.description || workflow?.state?.selected_topic?.description || '',
              },
              selected_materials: organizeCandidates.length > 0 ? organizeCandidates : workflow?.state?.selected_materials || [],
              episode_brief: structure,
            })
            closeAllPanels()
            setWritingVisible(true)
          }}
        />

        <WritingLayer
          key={`writing-${workflow?.id || 'none'}`}
          visible={writingVisible}
          onClose={returnToEpisodeManager}
          workflow={workflow}
          episodeTitle={workflow?.state?.selected_topic?.title || ''}
          episodeDesc={workflow?.state?.selected_topic?.description || ''}
          onSaveDraft={async (patch) => {
            await updateWorkflowPatch(patch)
          }}
          onProceedToProduction={async (patch) => {
            await updateWorkflowPatch(patch)
            closeAllPanels()
            setSoundStudioVisible(true)
          }}
        />

        <SoundStudio
          key={`sound-${workflow?.id || 'none'}`}
          visible={soundStudioVisible}
          onClose={returnToEpisodeManager}
          workflow={workflow}
          episodeTitle={workflow?.state?.selected_topic?.title || ''}
          onSaveRecording={async (payload) => {
            if (!workflow) {
              const active = await ensureWorkflow()
              if (!active) throw new Error('无法创建 workflow')
              return window.electronAPI.saveRecording({ ...payload, episodeId: active.state.episode_id })
            }
            return window.electronAPI.saveRecording({ ...payload, episodeId: workflow.state.episode_id })
          }}
          onUpdateWorkflow={async (patch) => {
            await updateWorkflowPatch(patch)
          }}
          onRunNodes={async (nodes) => {
            await runWorkflowNodes(nodes)
          }}
          onOpenPath={async (targetPath) => {
            return window.electronAPI.openPath(targetPath)
          }}
          onShowItemInFolder={async (targetPath) => {
            return window.electronAPI.showItemInFolder(targetPath)
          }}
          onProceedToPublish={async () => {
            closeAllPanels()
            setPublishVisible(true)
          }}
        />
        <PublishLayer
          key={`publish-${workflow?.id || 'none'}`}
          visible={publishVisible}
          onClose={returnToEpisodeManager}
          workflow={workflow}
          episodeTitle={workflow?.state?.selected_topic?.title || ''}
          episodeDesc={workflow?.state?.selected_topic?.description || ''}
          onRunNodes={async (nodes) => {
            await runWorkflowNodes(nodes)
          }}
          onOpenPath={async (targetPath) => {
            return window.electronAPI.openPath(targetPath)
          }}
          onShowItemInFolder={async (targetPath) => {
            return window.electronAPI.showItemInFolder(targetPath)
          }}
        />

        <SettingsPage
          visible={settingsVisible}
          workflow={workflow}
          onClose={closeSettings}
        />
      </Layout>
    </ConfigProvider>
  )
}

export default App
