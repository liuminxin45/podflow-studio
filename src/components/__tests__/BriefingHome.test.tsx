import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Workflow } from '../../types/workflow'
import BriefingHome from '../briefing/BriefingHome'

const ready = {
  loading: false,
  ready: true,
  issues: [],
  llmLabel: 'gpt-test',
  voiceLabel: 'edge-tts',
}

function props() {
  return {
    workflow: null,
    episodes: [],
    libraryLoading: false,
    busy: false,
    hasElectronBackend: true,
    readiness: ready,
    onStart: vi.fn(),
    onOpenSettings: vi.fn(),
    onOpenSample: vi.fn(),
    onOpenLibrary: vi.fn(),
    onPlay: vi.fn(),
    onOpenStudio: vi.fn(),
  }
}

describe('BriefingHome', () => {
  it('starts from one result-oriented action with optional topic and materials', () => {
    const value = props()
    render(<BriefingHome {...value} />)

    fireEvent.change(screen.getByRole('textbox', { name: '关注主题' }), { target: { value: 'AI 编程' } })
    fireEvent.change(screen.getByRole('textbox', { name: '指定素材' }), { target: { value: 'https://example.com/news' } })
    fireEvent.click(screen.getByRole('button', { name: '生成今日节目' }))

    expect(value.onStart).toHaveBeenCalledWith({ topic: 'AI 编程', materialText: 'https://example.com/news' })
  })

  it('shows the playable result before studio controls', () => {
    const value = props()
    const workflow = {
      id: 'quick-1',
      status: 'completed',
      currentNode: null,
      nodeExecutions: {},
      state: {
        runtime_config: { quick_brief: { requested_at: '2026-09-02T00:00:00Z' } },
        script: { title: '今天的 AI 简报', segments: [] },
        audio_outputs: { final_audio_path: 'final.mp3', duration_seconds: 620 },
        release_readiness: { status: 'blocked', gates: {} },
        facts: [],
        selected_materials: [{ title: '素材' }],
      },
    } as unknown as Workflow

    render(<BriefingHome {...value} workflow={workflow} />)

    expect(screen.getByRole('heading', { name: '今天的 AI 简报' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '播放节目' }))
    expect(value.onPlay).toHaveBeenCalledWith('quick-1')
    expect(screen.getByRole('button', { name: '打开制作工作台' })).toBeTruthy()
  })
})
