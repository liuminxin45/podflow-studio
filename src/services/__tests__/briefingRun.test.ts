import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Workflow } from '../../types/workflow'
import {
  BRIEFING_PHASES,
  buildBriefingFetchConfig,
  inspectBriefingReadiness,
  latestBriefingFailure,
  parseBriefingMaterials,
  phaseStatus,
} from '../briefingRun'

describe('briefing run helpers', () => {
  const originalElectronAPI = window.electronAPI

  afterEach(() => {
    ;(window as any).electronAPI = originalElectronAPI
  })

  it('parses URLs and paragraph text into current source_inputs', () => {
    const items = parseBriefingMaterials([
      'https://example.com/news',
      '',
      '人工材料标题',
      '第二行正文',
    ].join('\n'))

    expect(items).toEqual([
      expect.objectContaining({ url: 'https://example.com/news', type: 'manual_url', content: '' }),
      expect.objectContaining({ title: '人工材料标题', content: '人工材料标题\n第二行正文', type: 'manual_note' }),
    ])
  })

  it('keeps saved source selection while applying the requested topic', () => {
    expect(buildBriefingFetchConfig({
      enabled_sources: ['newsnow'],
      newsnow_source_ids: ['ithome'],
      result_limit: 6,
    }, 'AI 编程')).toEqual(expect.objectContaining({
      topic: 'AI 编程',
      enabled_sources: ['newsnow'],
      newsnow_source_ids: ['ithome'],
      result_limit: 6,
    }))
  })

  it('derives honest progress and failure from node executions', () => {
    const workflow = {
      status: 'failed',
      currentNode: null,
      nodeExecutions: {
        fetch: { status: 'completed' },
        preprocess: { status: 'failed' },
      },
      state: {
        errors: [{ node: 'preprocess', message: '没有可用正文' }],
      },
    } as unknown as Workflow

    expect(phaseStatus(workflow, BRIEFING_PHASES[0])).toBe('failed')
    expect(latestBriefingFailure(workflow)).toEqual({ node: 'preprocess', message: '没有可用正文' })
  })

  it('explains when defaults exist but runtime AI and voice configs were never saved', async () => {
    ;(window as any).electronAPI = {
      loadNodeConfig: vi.fn(async (node: string) => {
        if (node === 'app_settings') {
          return {
            apiConfig: {
              global: {
                defaultAITarget: '',
                audioProvider: 'edge-tts',
              },
            },
          }
        }
        return null
      }),
    }

    await expect(inspectBriefingReadiness()).resolves.toMatchObject({
      ready: false,
      issues: [
        '尚未选择默认 AI 目标',
      ],
      llmLabel: '未选择',
      voiceLabel: '待保存',
    })
  })

  it('treats a paused script as normal but reports missing attempted audio', () => {
    const workflow = { status: 'completed', nodeExecutions: { script: { status: 'completed' } }, state: {
      runtime_config: { quick_brief: { requested_at: 'now' } }, script: { segments: [{ text: '稿件' }] },
    } } as unknown as Workflow
    expect(latestBriefingFailure(workflow)).toBeNull()
    workflow.nodeExecutions.tts = { status: 'completed' }
    expect(latestBriefingFailure(workflow)).toBeNull()
    workflow.state.production_plan = { clips: [{ id: 'clip' }] } as any
    expect(latestBriefingFailure(workflow)?.message).toContain('没有生成可播放音频')
  })

  it('accepts the saved local-agent and Edge TTS runtime configs', async () => {
    ;(window as any).electronAPI = {
      loadNodeConfig: vi.fn(async (node: string) => {
        if (node === 'app_settings') {
          return { apiConfig: { global: { defaultAITarget: 'agent:codex', audioProvider: 'edge-tts' } } }
        }
        if (node === 'script') {
          return {
            provider_kind: 'local_agent',
            llm_model: 'codex',
            local_agent_id: 'codex',
            local_agent_command: 'codex',
          }
        }
        if (node === 'tts') return { engine: 'edge-tts' }
        return null
      }),
    }

    await expect(inspectBriefingReadiness()).resolves.toMatchObject({
      ready: true,
      issues: [],
      llmLabel: 'codex',
      voiceLabel: 'edge-tts',
    })
  })
})
