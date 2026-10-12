import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import type { Workflow } from '../types/workflow'

vi.mock('../components/ApprovalModal', () => ({ default: () => null }))
vi.mock('../components/EpisodeDraftStudio', () => ({ default: () => null }))
vi.mock('../components/briefing/ContentWorkbench', () => ({ default: ({ visible }: { visible: boolean }) => visible ? <h1>打磨内容</h1> : null }))
vi.mock('../components/DiscoverPanel', () => ({ default: () => null }))
vi.mock('../components/OrganizePanel', async () => {
  const { forwardRef } = await import('react')
  return { default: forwardRef(() => null) }
})
vi.mock('../components/SoundStudio', () => ({ default: () => null }))
vi.mock('../components/PublishLayer', () => ({ default: () => null }))
vi.mock('../components/SettingsPage', () => ({
  default: ({ visible, initialSection }: { visible: boolean; initialSection?: string }) => (
    visible ? <div>设置定位：{initialSection}</div> : null
  ),
}))
vi.mock('../components/EpisodeManager', () => ({ default: () => null }))
vi.mock('../components/WorkflowSidebar', () => ({ default: () => null }))
vi.mock('../components/GlobalPlayer', () => ({ default: () => null }))

function initialWorkflow(): Workflow {
  return {
    id: 'quick-workflow',
    status: 'draft',
    currentNode: null,
    nodeExecutions: {},
    state: {
      episode_id: 'ep-quick',
      created_at: '2026-09-02T00:00:00Z',
      schema_version: 3,
      preset: { id: 'morning_news_brief' },
      source_inputs: [],
      runtime_config: { quick_brief: { requested_at: '2026-09-02T00:00:00Z' } },
      logs: [],
      errors: [],
      fetch_contents: [],
      cleaned_contents: [],
      researched_contents: [],
      facts: [],
      selected_topic: {},
      selected_topics: [],
      selected_materials: [],
      script: {},
      edited_script: {},
      voice_segments: [],
      audio_outputs: {},
      intro_outro_paths: {},
      review_summary: {},
      publish_outputs: {},
      subtitle_path: '',
      run_report: {},
    },
  }
}

describe('App quick briefing orchestration', () => {
  const originalElectronAPI = window.electronAPI
  let workflow: Workflow
  const runWorkflowNodes = vi.fn()

  beforeEach(() => {
    workflow = initialWorkflow()
    runWorkflowNodes.mockReset()
    runWorkflowNodes.mockImplementation(async (_id: string, nodes: string[]) => {
      workflow = {
        ...workflow,
        status: 'completed',
        currentNode: null,
        nodeExecutions: Object.fromEntries(nodes.map(node => [node, { status: 'completed' }])),
        state: {
          ...workflow.state,
          selected_topic: { title: 'AI 编程日报' },
          script: { title: 'AI 编程日报', segments: [{ id: 'seg-1', title: '主题', text: '真实稿件', type: 'quick_news', source_fact_ids: [], source_claim_ids: [], estimated_seconds: 10 }] },
          audio_outputs: {},
          release_readiness: { status: 'blocked' },
        },
      }
      return workflow
    })
    ;(window as any).electronAPI = {
      appLog: vi.fn(async () => ({ success: true })),
      listWorkflows: vi.fn(async () => []),
      listSeries: vi.fn(async () => []),
      loadNodeConfig: vi.fn(async (node: string) => {
        if (node === 'script') return { provider_kind: 'openai', api_base: 'https://api.openai.com/v1', api_key: 'test', llm_model: 'gpt-test' }
        if (node === 'tts') return { engine: 'edge-tts' }
        if (node === 'fetch') return { enabled_sources: ['newsnow'], newsnow_source_ids: ['ithome'] }
        return {}
      }),
      createWorkflow: vi.fn(async () => ({ workflowId: workflow.id, episodeId: workflow.state.episode_id })),
      getWorkflow: vi.fn(async () => workflow),
      updateWorkflowState: vi.fn(async (_id: string, patch: Record<string, unknown>) => {
        workflow = { ...workflow, state: { ...workflow.state, ...patch } }
        return workflow
      }),
      discoverRun: vi.fn(async () => {
        workflow = {
          ...workflow,
          nodeExecutions: { fetch: { status: 'completed' } },
          state: { ...workflow.state, fetch_contents: [{ title: '新闻', content: '新闻正文', source: 'newsnow' }] },
        }
        return workflow
      }),
      runWorkflowNodes,
      saveWorkflow: vi.fn(async () => workflow),
      onWorkflowUpdate: vi.fn(() => vi.fn()),
      onNeedApproval: vi.fn(() => vi.fn()),
      setAppDirtyState: vi.fn(async () => ({ success: true })),
      detectLocalAgents: vi.fn(async () => []),
      saveNodeConfig: vi.fn(async () => ({ success: true })),
    }
  })

  afterEach(() => {
    ;(window as any).electronAPI = originalElectronAPI
  })

  it('stops at a saved draft without voice configuration or automatic production', async () => {
    const load = window.electronAPI.loadNodeConfig
    vi.mocked(window.electronAPI.loadNodeConfig).mockImplementation(async node => node === 'tts' ? null : node === 'script' ? { provider_kind: 'ollama', api_base: 'http://localhost:11434', llm_model: 'test' } : {})
    render(<App />)
    const generate = await screen.findByRole('button', { name: '研究并生成稿件' })
    fireEvent.change(screen.getByRole('textbox', { name: '关注主题' }), { target: { value: 'AI 编程' } })
    await waitFor(() => expect((generate as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(generate)

    expect(await screen.findByRole('heading', { name: '打磨内容' })).toBeTruthy()
    expect(runWorkflowNodes).toHaveBeenCalledTimes(1)
    const nodes = runWorkflowNodes.mock.calls[0][1] as string[]
    expect(nodes).toEqual(['preprocess', 'research', 'topic_selection', 'facts', 'script'])
    expect(nodes).not.toContain('tts')
    expect(nodes).not.toContain('publish')
    expect(window.electronAPI.saveWorkflow).toHaveBeenCalledWith(workflow.id)
    expect(load).toHaveBeenCalled()
  })

  it('opens the intelligent capability settings from a missing-target warning', async () => {
    vi.mocked(window.electronAPI.loadNodeConfig).mockImplementation(async (node: string) => {
      if (node === 'app_settings') {
        return { apiConfig: { global: { defaultAITarget: '', audioProvider: 'edge-tts' } } }
      }
      return null
    })

    render(<App />)

    expect(await screen.findByText('尚未选择默认 AI 目标')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '打开设置' }))
    expect(await screen.findByText('设置定位：api-config')).toBeTruthy()
  })
})
