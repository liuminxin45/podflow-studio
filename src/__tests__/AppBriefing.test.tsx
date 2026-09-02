import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import type { Workflow } from '../types/workflow'

vi.mock('../components/ApprovalModal', () => ({ default: () => null }))
vi.mock('../components/EpisodeDraftStudio', () => ({ default: () => null }))
vi.mock('../components/DiscoverPanel', () => ({ default: () => null }))
vi.mock('../components/OrganizePanel', async () => {
  const { forwardRef } = await import('react')
  return { default: forwardRef(() => null) }
})
vi.mock('../components/SoundStudio', () => ({ default: () => null }))
vi.mock('../components/PublishLayer', () => ({ default: () => null }))
vi.mock('../components/SettingsPage', () => ({ default: () => null }))
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
          script: { title: 'AI 编程日报', segments: [] },
          audio_outputs: { final_audio_path: 'final.mp3', duration_seconds: 600 },
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

  it('creates one workflow, runs through review, and never calls publish', async () => {
    render(<App />)
    const generate = await screen.findByRole('button', { name: '生成今日节目' })
    await waitFor(() => expect((generate as HTMLButtonElement).disabled).toBe(false))
    fireEvent.change(screen.getByRole('textbox', { name: '关注主题' }), { target: { value: 'AI 编程' } })
    fireEvent.click(generate)

    expect(await screen.findByRole('heading', { name: 'AI 编程日报' })).toBeTruthy()
    expect(runWorkflowNodes).toHaveBeenCalledTimes(1)
    const nodes = runWorkflowNodes.mock.calls[0][1] as string[]
    expect(nodes).toContain('review')
    expect(nodes).not.toContain('publish')
  })
})
