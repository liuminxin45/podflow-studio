import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Layout, Button, Space, ConfigProvider, theme, Modal, message } from 'antd'
import ApprovalModal from './components/ApprovalModal'
import EpisodeDraftStudio from './components/EpisodeDraftStudio'
import DiscoverPanel, { type DiscoverConfig, type DiscoverMeta } from './components/DiscoverPanel'
import OrganizePanel, { type OrganizePanelHandle } from './components/OrganizePanel'
import SoundStudio from './components/SoundStudio'
import PublishLayer from './components/PublishLayer'
import SettingsPage from './components/SettingsPage'
import WorkflowSidebar from './components/WorkflowSidebar'
import EpisodeManager from './components/EpisodeManager'
import GlobalSettingsButton from './components/GlobalSettingsButton'
import { STAGES } from './components/workflowStages'
import { detectAndPersistLocalAgentsOnStartup } from './services/settings/localAgentDetection'
import { llmConfigResolver } from './services/settings/llmConfigResolver'
import { postProcessDiscoverItems, type DiscoverPostProcessProgressHandler } from './services/discoverPostProcess'
import { canEnterStage } from './services/workflowStageStatus'
import type { Workflow, WorkflowSummary, ContentItem, PodcastState } from './types/workflow'
import {
  buildOrganizeUiPatch,
  contentOriginKeys,
  getErrorMessage,
  organizeWorkspaceMatchesSelection,
  readyCandidatesForDraft,
  toCandidateItems,
} from './utils'
import { contentIdentity } from './utils/contentIdentity'
import { isCurrentResearchSession } from './services/organizeEvidence'

const { Content } = Layout
const EMPTY_FACTS: PodcastState['facts'] = []
const EMPTY_SELECTED_TOPICS: PodcastState['selected_topics'] = []
const EMPTY_MATERIALS: ContentItem[] = []

type UiNotice = {
  type: 'success' | 'warning' | 'error' | 'info'
  text: string
}

function canUseAsMaterial(item: ContentItem): boolean {
  return Boolean(item)
}

function hasMeaningfulStateValue(value: any): boolean {
  if (Array.isArray(value)) return value.length > 0
  if (value && typeof value === 'object') return Object.values(value).some(hasMeaningfulStateValue)
  if (typeof value === 'string') return value.trim().length > 0
  if (typeof value === 'boolean') return value
  return typeof value === 'number' && Number.isFinite(value) && value !== 0
}

function hasDiscoveryDependentContent(state?: Workflow['state'] | null): boolean {
  if (!state) return false
  return [
    state.selected_materials,
    state.cleaned_contents,
    state.researched_contents,
    state.organize_ui?.candidates,
    state.facts,
    state.selected_topic,
    state.selected_topics,
    state.episode_brief,
    state.script,
    state.edited_script,
    state.writing_meta,
    state.voice_segments,
    state.production_plan,
    state.audio_outputs,
    state.cover_path,
    state.intro_outro_paths,
    state.review_summary,
    state.publish_outputs,
    state.subtitle_path,
    state.run_report,
  ].some(hasMeaningfulStateValue)
}

function buildDiscoveryRerunResetPatch(): Record<string, any> {
  return {
    selected_materials: [],
    cleaned_contents: [],
    researched_contents: [],
    selected_topic: {},
    selected_topics: [],
    facts: [],
    episode_brief: {},
    script: {},
    edited_script: {},
    writing_meta: {},
    voice_segments: [],
    production_plan: {},
    audio_outputs: {},
    cover_path: '',
    intro_outro_paths: {},
    review_summary: {},
    publish_outputs: {},
    subtitle_path: '',
    run_report: {},
    organize_ui: buildOrganizeUiPatch([]),
  }
}

function buildOrganizeSelectionChangeResetPatch(): Record<string, any> {
  return {
    cleaned_contents: [],
    researched_contents: [],
    auto_selected_items: [],
    auto_rejected_items: [],
    selected_topic: {},
    selected_topics: [],
    facts: [],
    episode_brief: {},
    script: {},
    edited_script: {},
    generation_request: {},
    generation_meta: {},
    script_snapshots: [],
    downstream_stale: {},
    writing_meta: {},
    voice_segments: [],
    production_plan: {},
    audio_outputs: {},
    cover_path: '',
    intro_outro_paths: {},
    review_summary: {},
    publish_outputs: {},
    subtitle_path: '',
    run_report: {},
  }
}

function App() {
  const [modal, modalContextHolder] = Modal.useModal()
  const [messageApi, messageContextHolder] = message.useMessage()
  const [workflow, setWorkflow] = useState<Workflow | null>(null)
  const [workflowSummaries, setWorkflowSummaries] = useState<WorkflowSummary[]>([])
  const [homePage, setHomePage] = useState<'blank' | 'episodes'>('episodes')
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [approvalVisible, setApprovalVisible] = useState(false)
  const [approvalData, setApprovalData] = useState<any>(null)
  const [draftVisible, setDraftVisible] = useState(false)
  const draftAutoOpened = useRef(false)
  const [discoverVisible, setDiscoverVisible] = useState(false)
  const [discoverRunning, setDiscoverRunning] = useState(false)
  const [organizeVisible, setOrganizeVisible] = useState(false)
  const [discoverCandidates, setDiscoverCandidates] = useState<ContentItem[]>([])
  const [organizeCandidates, setOrganizeCandidates] = useState<ContentItem[]>([])
  const organizeSaveQueueRef = useRef<Promise<void>>(Promise.resolve())
  const organizePanelRef = useRef<OrganizePanelHandle>(null)
  const pendingDraftPatchRef = useRef<{
    workflowId: string
    patch: Record<string, any>
    signature: string
  } | null>(null)
  const draftPatchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const draftPatchSaveQueueRef = useRef<Promise<void>>(Promise.resolve())
  const [soundStudioVisible, setSoundStudioVisible] = useState(false)
  const [publishVisible, setPublishVisible] = useState(false)
  const [settingsVisible, setSettingsVisible] = useState(false)
  const [settingsReturnTarget, setSettingsReturnTarget] = useState<{
    homePage: 'blank' | 'episodes'
    stageId: string | null
  } | null>(null)
  const hasElectronBackend = Boolean(window.electronAPI?.listWorkflows)

  const navigationWorkflow = useMemo<Workflow | null>(() => {
    if (!workflow || !discoverRunning) return workflow
    return {
      ...workflow,
      status: 'running',
      currentNode: 'fetch',
      nodeExecutions: {
        ...workflow.nodeExecutions,
        fetch: {
          ...(workflow.nodeExecutions.fetch || {}),
          status: 'running',
        },
      },
    }
  }, [discoverRunning, workflow])

  const showNotice = useCallback((type: UiNotice['type'], text: string) => {
    const logMessage = `[AppNotice] type=${type}`
    const logLevel = type === 'error' ? 'error' : type === 'warning' ? 'warning' : 'log'
    messageApi[type]({
      content: text,
      duration: type === 'error' ? 3 : 2,
      style: { marginTop: 60 },
    })
    if (window.electronAPI?.appLog) {
      void window.electronAPI.appLog(logLevel, logMessage).catch(() => {
        console[type === 'error' ? 'error' : type === 'warning' ? 'warn' : 'log'](logMessage)
      })
      return
    }
    console[type === 'error' ? 'error' : type === 'warning' ? 'warn' : 'log'](logMessage)
  }, [messageApi])

  const loadWorkflowSummaries = useCallback(async () => {
    if (!window.electronAPI?.listWorkflows) return
    try {
      const summaries = await window.electronAPI.listWorkflows()
      setWorkflowSummaries(summaries)
      const currentSummary = summaries.find(item => item.isCurrent)
      if (currentSummary && window.electronAPI.getWorkflow) {
        const current = await window.electronAPI.getWorkflow(currentSummary.id)
        if (current) {
          setWorkflow(existing => existing?.id === current.id ? existing : current)
        }
      }
    } catch (error) {
      console.error('Failed to load workflows:', error)
    }
  }, [])

  const flushPendingDraftPatch = useCallback(async () => {
    const pending = pendingDraftPatchRef.current
    if (!pending) return null
    if (draftPatchTimerRef.current) {
      clearTimeout(draftPatchTimerRef.current)
      draftPatchTimerRef.current = null
    }
    if (!window.electronAPI?.updateWorkflowState) {
      throw new Error('当前运行环境未连接 Electron 后端，无法保存编辑稿')
    }

    let updated: Workflow | null = null
    draftPatchSaveQueueRef.current = draftPatchSaveQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        updated = await window.electronAPI.updateWorkflowState(pending.workflowId, pending.patch)
        if (pendingDraftPatchRef.current?.signature === pending.signature) {
          pendingDraftPatchRef.current = null
        }
        setWorkflow(current => current?.id === pending.workflowId ? updated : current)
      })
    await draftPatchSaveQueueRef.current
    return updated
  }, [])

  const queueDraftPatch = useCallback((patch: Record<string, any>) => {
    if (!workflow) return
    const signature = JSON.stringify({
      edited_script: patch.edited_script || {},
    })
    const persistedSignature = JSON.stringify({
      edited_script: workflow.state?.edited_script || {},
    })
    if (signature === persistedSignature || signature === pendingDraftPatchRef.current?.signature) return

    pendingDraftPatchRef.current = { workflowId: workflow.id, patch, signature }
    setHasUnsavedChanges(true)
    if (draftPatchTimerRef.current) clearTimeout(draftPatchTimerRef.current)
    draftPatchTimerRef.current = setTimeout(() => {
      void flushPendingDraftPatch().catch(error => {
        showNotice('error', `编辑稿自动保存失败：${getErrorMessage(error)}`)
      })
    }, 400)
  }, [flushPendingDraftPatch, showNotice, workflow])

  const discardPendingDraftPatch = useCallback(() => {
    pendingDraftPatchRef.current = null
    if (draftPatchTimerRef.current) {
      clearTimeout(draftPatchTimerRef.current)
      draftPatchTimerRef.current = null
    }
  }, [])

  useEffect(() => () => {
    if (draftPatchTimerRef.current) clearTimeout(draftPatchTimerRef.current)
  }, [])

  const saveActiveWorkflow = useCallback(async (options: { notify?: boolean } = {}) => {
    if (!workflow) return null
    if (!window.electronAPI?.saveWorkflow) {
      showNotice('warning', '当前浏览器预览没有 Electron 后端，无法保存节目')
      return null
    }
    if (organizeVisible) await organizePanelRef.current?.flushState()
    await organizeSaveQueueRef.current
    await flushPendingDraftPatch()
    const saved = await window.electronAPI.saveWorkflow(workflow.id)
    setWorkflow(saved)
    setHasUnsavedChanges(false)
    await loadWorkflowSummaries()
    if (options.notify !== false) showNotice('success', '节目已保存')
    return saved
  }, [flushPendingDraftPatch, loadWorkflowSummaries, organizeVisible, showNotice, workflow])

  const confirmSaveBeforeReplace = useCallback(async () => {
    if (!workflow || !hasUnsavedChanges) return true
    return new Promise<boolean>((resolve) => {
      let settled = false
      let modalHandle: { destroy: () => void } | null = null
      const finish = (canContinue: boolean) => {
        if (settled) return
        settled = true
        modalHandle?.destroy()
        resolve(canContinue)
      }

      modalHandle = modal.confirm({
        title: '保存当前节目？',
        content: (
          <div>
            <p>当前节目有未保存更改。保存后再继续，或选择不保存并丢弃这些更改。</p>
            <Space style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
              <Button onClick={() => finish(false)}>
                取消
              </Button>
              <Button onClick={() => {
                discardPendingDraftPatch()
                finish(true)
              }}>
                不保存
              </Button>
              <Button
                type="primary"
                onClick={async () => {
                  try {
                    await saveActiveWorkflow()
                    finish(true)
                  } catch (error) {
                    showNotice('error', `保存失败：${getErrorMessage(error)}`)
                  }
                }}
              >
                保存
              </Button>
            </Space>
          </div>
        ),
        footer: null,
        closable: true,
        maskClosable: false,
        centered: true,
        onCancel() {
          finish(false)
        },
      })
    })
  }, [discardPendingDraftPatch, hasUnsavedChanges, modal, saveActiveWorkflow, showNotice, workflow])

  // Close all full-screen panels (mutual exclusivity)
  const closeAllPanels = useCallback(() => {
    setDiscoverVisible(false)
    setOrganizeVisible(false)
    setDraftVisible(false)
    setSoundStudioVisible(false)
    setPublishVisible(false)
    setSettingsVisible(false)
  }, [])

  const openStage = useCallback((stageId: string) => {
    if (navigationWorkflow && !canEnterStage(navigationWorkflow, stageId)) {
      const stage = STAGES.find(item => item.id === stageId)
      showNotice('warning', `请先完成前序流程，暂不能进入${stage?.label || '该'}层`)
      return
    }
    closeAllPanels()
    setHomePage('blank')
    if (stageId === 'draft') {
      setDraftVisible(true)
    } else if (stageId === 'discover') {
      setDiscoverVisible(true)
    } else if (stageId === 'organize') {
      setOrganizeVisible(true)
    } else if (stageId === 'produce') {
      setSoundStudioVisible(true)
    } else if (stageId === 'publish') {
      setPublishVisible(true)
    }
  }, [closeAllPanels, navigationWorkflow, showNotice])

  const getCurrentStageId = useCallback(() => {
    if (discoverVisible) return 'discover'
    if (organizeVisible) return 'organize'
    if (draftVisible) return 'draft'
    if (soundStudioVisible) return 'produce'
    if (publishVisible) return 'publish'
    return null
  }, [discoverVisible, draftVisible, organizeVisible, publishVisible, soundStudioVisible])

  useEffect(() => {
    const currentStageId = getCurrentStageId()
    if (!navigationWorkflow || !currentStageId || canEnterStage(navigationWorkflow, currentStageId)) return
    closeAllPanels()
    setHomePage('blank')
    setDiscoverVisible(true)
    showNotice('warning', '上游数据已失效，已返回发现层重新确认数据流')
  }, [closeAllPanels, getCurrentStageId, navigationWorkflow, showNotice])

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

  const returnToEpisodeManager = () => {
    closeAllPanels()
    setHomePage('episodes')
    void loadWorkflowSummaries()
  }

  useEffect(() => {
    void loadWorkflowSummaries()
  }, [loadWorkflowSummaries])

  useEffect(() => {
    if (!hasElectronBackend) return
    void detectAndPersistLocalAgentsOnStartup().catch(error => {
      console.warn('[App] Local agent startup detection failed:', error)
    })
  }, [hasElectronBackend])

  useEffect(() => {
    if (!window.electronAPI?.onWorkflowUpdate) return
    const unsubscribeWorkflow = window.electronAPI.onWorkflowUpdate((data) => {
      setWorkflow(data)
      void loadWorkflowSummaries()

      if (!data) return

      const isAuto = Boolean(data?.state?.runtime_config?.auto_execute)

      // Manual mode only: open EpisodeDraftStudio when organize completes and draft nodes begin
      if (!isAuto && !draftAutoOpened.current && data?.nodeExecutions) {
        const organizeStage = STAGES.find(s => s.id === 'organize')
        const draftStage = STAGES.find(s => s.id === 'draft')
        if (organizeStage && draftStage) {
          const organizeComplete = organizeStage.subNodes.every(
            n => data.nodeExecutions?.[n]?.status === 'completed'
          )
          const draftStarted = draftStage.subNodes.some(
            n => data.nodeExecutions?.[n]?.status === 'running' ||
                 data.nodeExecutions?.[n]?.status === 'completed'
          )
          if (organizeComplete && draftStarted) {
            openStage('draft')
            draftAutoOpened.current = true
          }
        }
      }
    })

    const unsubscribeApproval = window.electronAPI.onNeedApproval((data) => {
      console.log('[Frontend] Received needApproval event:', data)
      setApprovalData(data)
      setApprovalVisible(true)
    })

    return () => {
      if (typeof unsubscribeWorkflow === 'function') unsubscribeWorkflow()
      if (typeof unsubscribeApproval === 'function') unsubscribeApproval()
    }
  }, [loadWorkflowSummaries, openStage])

  useEffect(() => {
    void window.electronAPI?.setAppDirtyState?.(Boolean(workflow && hasUnsavedChanges))
  }, [hasUnsavedChanges, workflow])

  useEffect(() => {
    draftAutoOpened.current = false
  }, [workflow?.id])

  useEffect(() => {
    const savedWorkspace = toCandidateItems(workflow?.state?.organize_ui?.candidates)
    setDiscoverCandidates((workflow?.state?.discover_ui?.selectedItems || []).filter(canUseAsMaterial))
    setOrganizeCandidates(readyCandidatesForDraft(savedWorkspace))
  }, [
    workflow?.state?.discover_ui?.selectedItems,
    workflow?.state?.organize_ui?.candidates,
  ])

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
    } catch (error) {
      showNotice('error', `创建失败：${getErrorMessage(error)}`)
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
    if (updated.status === 'failed') {
      const detail = [...(updated.state?.errors || [])].reverse().find(error => (
        !error.node || nodeNames.includes(error.node)
      ))?.message
      throw new Error(detail || `${nodeNames.join('、')} 执行失败`)
    }
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
    } catch (error) {
      showNotice('error', `打开失败：${getErrorMessage(error)}`)
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
    } catch (error) {
      showNotice('error', `删除失败：${getErrorMessage(error)}`)
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
    } catch (error) {
      showNotice('error', `导入失败：${getErrorMessage(error)}`)
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
    } catch (error) {
      showNotice('error', `导出失败：${getErrorMessage(error)}`)
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
    } catch (error) {
      showNotice('error', `保存失败：${getErrorMessage(error)}`)
    }
  }

  const handleDuplicateWorkflow = async (workflowId: string) => {
    if (!window.electronAPI?.duplicateWorkflow) {
      showNotice('warning', '当前浏览器预览没有 Electron 后端，无法复制节目')
      return
    }
    try {
      await window.electronAPI.duplicateWorkflow(workflowId)
      await loadWorkflowSummaries()
      showNotice('success', '节目已复制')
    } catch (error) {
      showNotice('error', `复制失败：${getErrorMessage(error)}`)
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
    } catch (error) {
      showNotice('error', `批准失败：${getErrorMessage(error)}`)
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
    } catch (error) {
      showNotice('error', `拒绝失败：${getErrorMessage(error)}`)
    }
  }

  const activeStageId =
    settingsVisible ? null : getCurrentStageId()
  const showWorkflowSidebar = Boolean(navigationWorkflow && activeStageId)
  const savedOrganizeCandidates = useMemo(
    () => toCandidateItems(workflow?.state?.organize_ui?.candidates),
    [workflow?.state?.organize_ui?.candidates],
  )
  const initialOrganizeCandidates = savedOrganizeCandidates
  const persistedDiscoverSelection = workflow?.state?.discover_ui?.selectedItems || EMPTY_MATERIALS
  const draftRawContents = useMemo(() => {
    if (organizeCandidates.length > 0) return organizeCandidates
    return readyCandidatesForDraft(workflow?.state?.selected_materials)
  }, [
    organizeCandidates,
    workflow?.state?.selected_materials,
  ])

  return (
    <ConfigProvider
      theme={{
        algorithm: theme.defaultAlgorithm,
        token: {
          colorPrimary: '#303438',
          colorPrimaryHover: '#202326',
          colorPrimaryActive: '#17191b',
          colorText: '#242629',
          colorTextSecondary: '#686a6d',
          colorBgBase: '#ffffff',
          colorBgContainer: '#ffffff',
          colorBgElevated: '#ffffff',
          colorBgLayout: '#ffffff',
          colorBgTextHover: '#f0f1f1',
          colorFillAlter: '#f6f6f5',
          colorBorder: '#e6e7e7',
          colorBorderSecondary: '#f0f1f1',
          fontFamily: "var(--font-ui)",
          fontSize: 13,
          fontSizeSM: 12,
          fontWeightStrong: 600,
          controlHeight: 32,
          controlHeightSM: 28,
          borderRadius: 6,
          borderRadiusSM: 5,
          borderRadiusLG: 10,
          boxShadow: '0 1px 2px rgba(20, 23, 25, 0.025)',
          boxShadowSecondary: '0 1px 2px rgba(20, 23, 25, 0.025)',
        },
      }}
    >
      {messageContextHolder}
      {modalContextHolder}
      <Layout style={{ height: '100vh', background: 'var(--bg-primary)' }}>
        <Layout style={{ background: 'transparent' }}>
          <Content style={{ 
            position: 'relative', 
            overflow: 'hidden', 
            height: '100vh',
            display: 'flex',
            flexDirection: 'row',
            transition: 'height 0.3s ease'
          }}>
            {showWorkflowSidebar && (
              <WorkflowSidebar
                workflow={navigationWorkflow}
                activeStageId={activeStageId}
                onStageClick={openStage}
                onOpenSettings={openSettings}
                hasUnsavedChanges={hasUnsavedChanges}
                onSave={saveActiveWorkflow}
                onClose={handleCloseWorkflow}
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
        {!showWorkflowSidebar && !settingsVisible && (
          <GlobalSettingsButton onOpen={openSettings} floating />
        )}

        <ApprovalModal
          visible={approvalVisible}
          approvalData={approvalData}
          onApprove={handleApprove}
          onReject={handleReject}
        />

        <DiscoverPanel
          key={`discover-${workflow?.id || 'none'}`}
          visible={discoverVisible}
          items={workflow?.state?.fetch_contents || []}
          selectedItems={persistedDiscoverSelection}
          meta={(workflow?.state?.discover_meta || {}) as DiscoverMeta}
          initialConfig={workflow?.state?.discover_ui?.fetch_config as Partial<DiscoverConfig> | undefined}
          hasDownstreamContent={hasDiscoveryDependentContent(workflow?.state)}
          onConfigChange={(config) => {
            void updateWorkflowPatch({
              discover_ui: {
                ...(workflow?.state?.discover_ui || {}),
                fetch_config: config,
                configUpdatedAt: new Date().toISOString(),
              },
            })
          }}
          onLoadConfig={async () => {
            if (!window.electronAPI?.loadNodeConfig) {
              throw new Error('当前页面没有 Electron 后端，无法读取采集配置。请从 Electron 桌面应用打开。')
            }
            return await window.electronAPI.loadNodeConfig('fetch') || {}
          }}
          onListSources={async () => {
            console.log('[Discover] getFetchSources start ' + JSON.stringify({
              hasElectronAPI: Boolean(window.electronAPI),
              hasGetFetchSources: Boolean(window.electronAPI?.getFetchSources),
            }))
            if (!window.electronAPI?.getFetchSources) {
              throw new Error('当前页面没有 Electron 后端，无法读取内置数据源。请从 Electron 桌面应用打开。')
            }
            const sources = await window.electronAPI.getFetchSources()
            console.log('[Discover] getFetchSources result ' + JSON.stringify({
              isArray: Array.isArray(sources),
              count: Array.isArray(sources) ? sources.length : null,
              ids: Array.isArray(sources) ? sources.map(source => source?.id).filter(Boolean) : [],
            }))
            return sources
          }}
          onClearCollection={async () => {
            setDiscoverCandidates([])
            setOrganizeCandidates([])
            await updateWorkflowPatch({
              fetch_contents: [],
              selected_materials: [],
              discover_meta: {
                generated_at: new Date().toISOString(),
                item_count: 0,
                raw_item_count: 0,
                selected_count: 0,
                source_counts: {},
                errors: [],
              },
              discover_ui: {
                ...(workflow?.state?.discover_ui || {}),
                selectedCount: 0,
                selectedItems: [],
                clearedAt: new Date().toISOString(),
              },
            })
          }}
          onRunOnce={async (config, onPostProcessProgress?: DiscoverPostProcessProgressHandler) => {
            setDiscoverRunning(true)
            try {
              const saveResult = await window.electronAPI.saveNodeConfig('fetch', config)
              if (!saveResult.success) throw new Error(saveResult.error || '保存采集配置失败')
              const active = await ensureWorkflow()
              if (!active) throw new Error('无法创建 workflow')
              const startedAt = new Date().toISOString()
              const clearedWorkflow = await window.electronAPI.updateWorkflowState(active.id, {
                fetch_contents: [],
                ...buildDiscoveryRerunResetPatch(),
                discover_meta: {
                  generated_at: startedAt,
                  item_count: 0,
                  raw_item_count: 0,
                  recency_count: 0,
                  topic_matched_count: 0,
                  topic_rejected_count: 0,
                  selected_count: 0,
                  source_counts: {},
                  errors: [],
                  audit: undefined,
                },
                discover_ui: {
                  ...(active.state?.discover_ui || {}),
                  selectedCount: 0,
                  selectedItems: [],
                  lastRunStartedAt: startedAt,
                  fetch_config: config,
                },
              })
              setWorkflow(clearedWorkflow)
              setHasUnsavedChanges(true)
              setDiscoverCandidates([])
              setOrganizeCandidates([])
              void loadWorkflowSummaries()
              let updatedWorkflow: Workflow | null = null
              if (window.electronAPI?.discoverRun) {
                updatedWorkflow = await window.electronAPI.discoverRun(active.id, config)
                setWorkflow(updatedWorkflow)
                setHasUnsavedChanges(true)
                void loadWorkflowSummaries()
              } else {
                updatedWorkflow = await window.electronAPI.runWorkflowNodes(active.id, ['fetch'])
                setWorkflow(updatedWorkflow)
                setHasUnsavedChanges(true)
                void loadWorkflowSummaries()
              }
              const rawContents = updatedWorkflow?.state?.fetch_contents || []
              const processed = await postProcessDiscoverItems(rawContents, {
                coreTopic: String(config.topic || ''),
                recencyHours: Number(config.recency_hours || 0),
                resultLimit: Number(config.result_limit || 10),
              }, llmConfigResolver.getLLMConfig('discover'), onPostProcessProgress)
              const contents = processed.items
              const sourceCounts = contents.reduce<Record<string, number>>((acc, item) => {
                const source = item.source || 'unknown'
                acc[source] = (acc[source] || 0) + 1
                return acc
              }, {})
              const meta: DiscoverMeta = {
                generated_at: new Date().toISOString(),
                item_count: contents.length,
                raw_item_count: processed.rawCount,
                recency_count: processed.recencyCount,
                topic_matched_count: processed.topicMatchedCount,
                topic_rejected_count: processed.topicRejectedCount,
                source_counts: sourceCounts,
                errors: updatedWorkflow?.state?.errors || [],
                audit: processed.audit,
              }
              await updateWorkflowPatch({
                fetch_contents: contents,
                ...buildDiscoveryRerunResetPatch(),
                discover_meta: meta,
                discover_ui: {
                  ...(updatedWorkflow?.state?.discover_ui || {}),
                  selectedCount: 0,
                  selectedItems: [],
                  lastRunAt: meta.generated_at || new Date().toISOString(),
                  fetch_config: config,
                },
              })
              return { items: contents, meta }
            } finally {
              setDiscoverRunning(false)
            }
          }}
          onProceedToOrganize={(candidates, meta, config) => {
            const safeCandidates = candidates.filter(canUseAsMaterial)
            if (safeCandidates.length === 0) {
              showNotice('warning', '没有可进入整理的素材。')
              return
            }
            const savedWorkspace = toCandidateItems(workflow?.state?.organize_ui?.candidates)
            const reusingWorkspace = organizeWorkspaceMatchesSelection(savedWorkspace, safeCandidates)
            const readyMaterials = reusingWorkspace
              ? readyCandidatesForDraft(savedWorkspace)
              : []
            setDiscoverCandidates(safeCandidates)
            void updateWorkflowPatch({
              // This field is the ready-only writing handoff. Re-entering
              // organize must not replace enriched rows with raw discovery data.
              selected_materials: readyMaterials,
              discover_meta: {
                ...(workflow?.state?.discover_meta || {}),
                ...meta,
                selected_count: safeCandidates.length,
              },
              discover_ui: {
                ...(workflow?.state?.discover_ui || {}),
                selectedCount: safeCandidates.length,
                selectedItems: safeCandidates,
                proceededAt: new Date().toISOString(),
                fetch_config: config,
              },
              ...(!reusingWorkspace ? buildOrganizeSelectionChangeResetPatch() : {}),
            })
            closeAllPanels()
            setOrganizeVisible(true)
          }}
        />

        <OrganizePanel
          ref={organizePanelRef}
          key={`organize-${workflow?.id || 'none'}`}
          visible={organizeVisible}
          onClose={returnToEpisodeManager}
          onBackToDiscover={() => {
            closeAllPanels()
            setDiscoverVisible(true)
          }}
          contents={discoverCandidates}
          userTopic={(workflow?.state?.selected_topic?.title as string) || ''}
          initialCandidates={initialOrganizeCandidates}
          initialResearchSessions={Array.isArray(workflow?.state?.organize_ui?.researchSessions)
            ? workflow.state.organize_ui.researchSessions.filter(isCurrentResearchSession)
            : []}
          onProcessLog={(entry) => {
            const workflowId = workflow?.id
            if (!workflowId || !window.electronAPI?.appendWorkflowLogs) return
            void window.electronAPI.appendWorkflowLogs(workflowId, [entry]).catch(error => {
              console.error('[OrganizeResearch] Failed to append workflow log:', error)
            })
          }}
          onRemoveFromMaterialPool={(originKeys) => {
            const removed = new Set(originKeys)
            organizeSaveQueueRef.current = organizeSaveQueueRef.current
              .catch(() => undefined)
              .then(async () => {
                const active = await ensureWorkflow()
                if (!active || !window.electronAPI?.getWorkflow) return
                const current = await window.electronAPI.getWorkflow(active.id) || active
                const selectedItems = (current.state.discover_ui?.selectedItems || [])
                  .filter(item => !removed.has(contentIdentity(item)))
                await updateWorkflowPatch({
                  ...buildOrganizeSelectionChangeResetPatch(),
                  discover_ui: {
                    ...(current.state.discover_ui || {}),
                    selectedCount: selectedItems.length,
                    selectedItems,
                  },
                  discover_meta: {
                    ...(current.state.discover_meta || {}),
                    selected_count: selectedItems.length,
                  },
                  selected_materials: (current.state.selected_materials || [])
                    .filter(item => !contentOriginKeys(item).some(key => removed.has(key))),
                })
              })
            void organizeSaveQueueRef.current.catch(error => {
              showNotice('error', `同步发现页选择失败：${getErrorMessage(error)}`)
            })
          }}
          onStateChange={(state) => {
            const patch = {
              organize_ui: buildOrganizeUiPatch(state.candidates, state.researchSessions),
              selected_materials: readyCandidatesForDraft(state.candidates),
            }
            organizeSaveQueueRef.current = organizeSaveQueueRef.current
              .catch(() => undefined)
              .then(async () => { await updateWorkflowPatch(patch) })
            return organizeSaveQueueRef.current
          }}
          onProceedToIdeate={(candidates, researchSessions, allCandidates) => {
            if (candidates.length === 0) {
              showNotice('warning', '请至少将一条新闻标记为整理完成后再进入成稿')
              return
            }
            setOrganizeCandidates(candidates)
            organizeSaveQueueRef.current = organizeSaveQueueRef.current
              .catch(() => undefined)
              .then(async () => {
                await updateWorkflowPatch({
                  organize_ui: buildOrganizeUiPatch(allCandidates, researchSessions),
                  selected_materials: candidates,
                  // Facts and topics belong to the prior organized selection.
                  // Rebuild them from this ready-only handoff in the draft flow.
                  facts: [],
                  selected_topics: [],
                })
              })
            void organizeSaveQueueRef.current.then(() => {
              closeAllPanels()
              setDraftVisible(true)
            }).catch(error => {
              showNotice('error', `整理结果保存失败：${getErrorMessage(error)}`)
            })
          }}
        />

        <EpisodeDraftStudio
          key={`draft-${workflow?.id || 'none'}`}
          visible={draftVisible}
          onClose={returnToEpisodeManager}
          onBackToOrganize={() => {
            closeAllPanels()
            setOrganizeVisible(true)
          }}
          rawContents={draftRawContents}
          selectedTopic={workflow?.state?.selected_topic}
          initialFacts={workflow?.state?.facts ?? EMPTY_FACTS}
          initialSelectedTopics={workflow?.state?.selected_topics ?? EMPTY_SELECTED_TOPICS}
          selectedMaterials={workflow?.state?.selected_materials ?? EMPTY_MATERIALS}
          onRunNodes={async (nodes) => {
            return (await runWorkflowNodes(nodes)) || undefined
          }}
          onPrepareGeneration={async (mode, draftPatch) => {
            await flushPendingDraftPatch()
            await updateWorkflowPatch({
              generation_request: {
                mode,
                require_llm: true,
                requested_at: new Date().toISOString(),
                draft_snapshot: draftPatch?.edited_script || {},
              },
            })
          }}
          onDraftPatchChange={queueDraftPatch}
          onStateChange={async (structure) => {
            await updateWorkflowPatch({
              selected_topic: {
                title: structure?.topic?.title || workflow?.state?.selected_topic?.title || '',
                description: structure?.topic?.description || workflow?.state?.selected_topic?.description || '',
              },
              selected_materials: structure?.materials || workflow?.state?.selected_materials || [],
              facts: structure?.facts || workflow?.state?.facts || [],
              selected_topics: structure?.selected_topics || workflow?.state?.selected_topics || [],
              episode_brief: structure,
            })
          }}
          workflow={workflow}
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
          onBackToWriting={() => {
            closeAllPanels()
            setDraftVisible(true)
          }}
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
          onBackToProduce={() => {
            closeAllPanels()
            setSoundStudioVisible(true)
          }}
          workflow={workflow}
          episodeTitle={workflow?.state?.selected_topic?.title || ''}
          episodeDesc={workflow?.state?.selected_topic?.description || ''}
          onRunNodes={async (nodes) => {
            await runWorkflowNodes(nodes)
          }}
          onSaveWorkflow={async () => {
            const saved = await saveActiveWorkflow({ notify: false })
            if (!saved) throw new Error('发布文件已生成，但节目无法自动保存')
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
