import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import type { Workflow } from '../types/workflow'

vi.mock('../components/ApprovalModal', () => ({ default: () => null }))
vi.mock('../components/SoundStudio', () => ({ default: () => null }))
vi.mock('../components/PublishLayer', () => ({ default: () => null }))
vi.mock('../components/SettingsPage', () => ({ default: () => null }))
vi.mock('../components/GlobalSettingsButton', () => ({ default: () => null }))
vi.mock('../components/WorkflowSidebar', () => ({
  default: ({ onSave }: { onSave: () => Promise<unknown> | unknown }) => (
    <button type="button" onClick={() => void onSave()}>保存节目</button>
  ),
}))
vi.mock('../components/EpisodeManager', () => ({
  default: ({ onOpen }: { onOpen: (id: string) => void }) => (
    <button type="button" onClick={() => onOpen('workflow-123123')}>打开 123123</button>
  ),
}))
vi.mock('../components/DiscoverPanel', () => ({
  default: (props: any) => props.visible ? (
    <div>
      <span>发现已选 {props.selectedItems.length} 条</span>
      <button type="button" onClick={() => props.onProceedToOrganize(props.selectedItems, {}, {})}>进入整理</button>
    </div>
  ) : null,
}))
vi.mock('../components/OrganizePanel', async () => {
  const { forwardRef, useImperativeHandle } = await import('react')
  return { default: forwardRef((props: any, ref) => {
    useImperativeHandle(ref, () => ({
      flushState: async () => {
        await props.onStateChange({
          candidates: [{
            ...props.initialCandidates[0],
            title: '补全并整理后的新闻',
            _references: [{
              _referenceId: 'official-source',
              _referenceKind: 'report',
              title: '官方补充资料',
              content: '官方核验内容',
            }],
            _editorial: {
              lead: '整理后的导语',
              coreFacts: '整理后的核心事实',
              background: '',
              impact: '',
              perspectives: '',
              listenerQuestions: '',
              explanatoryAngles: '',
              practicalValue: '',
            },
          }],
          researchSessions: [{
            unitId: 0,
            provider: 'tavily',
            queries: ['官方资料', '新闻背景'],
            results: [],
            status: 'completed',
            reportType: 'event',
            coreSubject: '补全并整理后的新闻',
            tasks: [
              { id: 'task_1', question: '官方资料是什么', purpose: '核验官方资料', role: 'direct_fact', freshness: 'year', queries: ['官方资料'] },
              { id: 'task_2', question: '新闻背景是什么', purpose: '补充背景', role: 'historical_context', freshness: 'any', queries: ['新闻背景'] },
            ],
            metrics: { retrieved: 0, accepted: 0, rejected: 0, uniqueDomains: 0, coveredTasks: 0, totalTasks: 2 },
            updatedAt: '2026-07-16T00:00:00.000Z',
          }],
        })
      },
    }), [props])
    return props.visible ? (
      <div>
        <button
          type="button"
          onClick={() => props.onProceedToIdeate(
            props.initialCandidates.filter((item: any) => item._status === 'ready'),
            [],
            props.initialCandidates,
          )}
        >
          使用 ready 新闻成稿
        </button>
        <button type="button" onClick={() => props.onRemoveFromMaterialPool(['url:https://example.com/intern'])}>
          删除单一来源
        </button>
        <button type="button" onClick={() => props.onRemoveFromMaterialPool([
          'url:https://example.com/intern',
          'url:https://example.com/market',
        ])}>
          删除合并来源
        </button>
      </div>
    ) : null
  }) }
})
vi.mock('../components/EpisodeDraftStudio', () => ({
  default: (props: any) => props.visible ? (
    <div>成稿收到：{props.rawContents.map((item: any) => item.title).join('、')}</div>
  ) : null,
}))

const allCandidates = [
  { title: '实习新闻', url: 'https://example.com/intern', _status: 'ready', _isDeepDive: true, _id: 0, _order: 0, _priority: 'important' },
  { title: '股市新闻', url: 'https://example.com/market', _status: 'ready', _id: 1, _order: 1, _priority: 'important' },
  { title: '痴迷', url: 'https://example.com/movie', _status: 'needs_context', _id: 2, _order: 2, _priority: 'backup' },
]

describe('App discover-to-draft handoff', () => {
  const originalElectronAPI = window.electronAPI
  let currentWorkflow: Workflow
  let releaseOrganizeUpdate: (() => void) | null
  let organizeUpdateStarted: boolean
  const saveWorkflow = vi.fn(async () => currentWorkflow)

  beforeEach(() => {
    releaseOrganizeUpdate = null
    organizeUpdateStarted = false
    saveWorkflow.mockClear()
    currentWorkflow = {
      id: 'workflow-123123',
      status: 'draft',
      currentNode: null,
      nodeExecutions: {},
      state: {
        episode_id: 'episode-123123',
        selected_topic: { title: '123123' },
        fetch_contents: allCandidates,
        selected_materials: allCandidates,
        discover_ui: { selectedCount: 3, selectedItems: allCandidates },
        discover_meta: { selected_count: 3 },
        organize_ui: { candidates: allCandidates, researchSessions: [] },
        cleaned_contents: allCandidates,
      },
    } as unknown as Workflow
    ;(window as any).electronAPI = {
      appLog: vi.fn(async () => ({ success: true })),
      listWorkflows: vi.fn(async () => []),
      openWorkflow: vi.fn(async () => currentWorkflow),
      getWorkflow: vi.fn(async () => currentWorkflow),
      updateWorkflowState: vi.fn(async (_id: string, patch: Record<string, any>) => {
        if (patch.organize_ui?.candidates?.[0]?.title === '补全并整理后的新闻') {
          organizeUpdateStarted = true
          await new Promise<void>(resolve => { releaseOrganizeUpdate = resolve })
        }
        currentWorkflow = {
          ...currentWorkflow,
          state: { ...currentWorkflow.state, ...patch },
        }
        return currentWorkflow
      }),
      saveWorkflow,
      onWorkflowUpdate: vi.fn(() => vi.fn()),
      onNeedApproval: vi.fn(() => vi.fn()),
      setAppDirtyState: vi.fn(async () => undefined),
    }
  })

  afterEach(() => {
    ;(window as any).electronAPI = originalElectronAPI
  })

  it('keeps all discovery selections while sending only ready units to draft', async () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: '打开 123123' }))
    expect(await screen.findByText('发现已选 3 条')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '进入整理' }))
    fireEvent.click(await screen.findByRole('button', { name: '使用 ready 新闻成稿' }))

    expect(await screen.findByText('成稿收到：实习新闻、股市新闻')).toBeTruthy()
    await waitFor(() => {
      expect(currentWorkflow.state.selected_materials.map(item => item.title)).toEqual(['实习新闻', '股市新闻'])
      expect(currentWorkflow.state.discover_ui?.selectedItems?.map(item => item.title)).toEqual(['实习新闻', '股市新闻', '痴迷'])
    })
  })

  it('waits for the latest organize workspace before saving the workflow', async () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: '打开 123123' }))
    fireEvent.click(await screen.findByRole('button', { name: '进入整理' }))
    await screen.findByRole('button', { name: '使用 ready 新闻成稿' })

    fireEvent.click(screen.getByRole('button', { name: '保存节目' }))
    await waitFor(() => expect(organizeUpdateStarted).toBe(true))
    expect(saveWorkflow).not.toHaveBeenCalled()

    releaseOrganizeUpdate?.()
    await waitFor(() => expect(saveWorkflow).toHaveBeenCalledWith(currentWorkflow.id))
    expect(currentWorkflow.state.organize_ui).toEqual(expect.objectContaining({
      candidates: [expect.objectContaining({
        title: '补全并整理后的新闻',
        _references: [expect.objectContaining({ title: '官方补充资料' })],
        _editorial: expect.objectContaining({ coreFacts: '整理后的核心事实' }),
      })],
      researchSessions: [expect.objectContaining({ queries: ['官方资料', '新闻背景'] })],
    }))
  })

  it.each([
    { button: '删除单一来源', remaining: ['股市新闻', '痴迷'], count: 2 },
    { button: '删除合并来源', remaining: ['痴迷'], count: 1 },
  ])('synchronizes every discovery selection surface after $button', async ({ button, remaining, count }) => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: '打开 123123' }))
    fireEvent.click(await screen.findByRole('button', { name: '进入整理' }))
    fireEvent.click(await screen.findByRole('button', { name: button }))

    await waitFor(() => {
      expect(currentWorkflow.state.discover_ui?.selectedCount).toBe(count)
      expect(currentWorkflow.state.discover_ui?.selectedItems?.map(item => item.title)).toEqual(remaining)
      expect(currentWorkflow.state.discover_meta?.selected_count).toBe(count)
      expect(currentWorkflow.state.selected_materials.map(item => item.title)).toEqual(remaining)
    })
  })
})
