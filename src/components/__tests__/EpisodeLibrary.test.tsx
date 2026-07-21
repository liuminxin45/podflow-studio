import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import EpisodeManager from '../EpisodeManager'
import GlobalPlayer from '../GlobalPlayer'
import type { Series, Workflow, WorkflowSummary } from '../../types/workflow'

const series: Series = {
  id: 'daily',
  title: '每日科技',
  description: '科技新闻',
  coverPath: '',
  cadence: 'daily',
  defaults: {
    language: 'zh-CN',
    targetDurationMinutes: 18,
    author: '编辑部',
    hostName: '小流',
    defaultVoice: 'voice-a',
    enabledPlatforms: ['local', 'rss'],
    templateVariant: 'quick_9_plus_deep_1',
  },
  episodeIds: ['ep-1'],
  createdAt: '2026-07-20T00:00:00Z',
  updatedAt: '2026-07-20T00:00:00Z',
}

const episode: WorkflowSummary = {
  id: 'ep-1',
  episodeId: 'episode-1',
  title: '芯片新闻',
  status: 'completed',
  createdAt: '2026-07-20T00:00:00Z',
  updatedAt: '2026-07-20T01:00:00Z',
  audioPath: 'final.mp3',
  durationSeconds: 100,
  playback: { positionSeconds: 30, durationSeconds: 100, completed: false, speed: 1.25, playCount: 1, updatedAt: '' },
  series,
  topicKeys: ['芯片'],
  sourceDomains: ['example.com'],
}

describe('节目库与播放器', () => {
  const originalElectronAPI = window.electronAPI

  beforeEach(() => {
    ;(window as any).electronAPI = {
      readImageAsDataUrl: vi.fn(async () => ({ success: false })),
      getMediaUrl: vi.fn(async () => ({ url: 'podflow-media://audio/token' })),
      updatePlayback: vi.fn(async () => episode.playback),
      openExternal: vi.fn(async () => ({ success: true })),
    }
  })

  afterEach(() => {
    vi.restoreAllMocks()
    ;(window as any).electronAPI = originalElectronAPI
  })

  it('filters continue-listening episodes and exposes play and recovery actions', async () => {
    const onPlay = vi.fn()
    const onRerun = vi.fn()
    render(<EpisodeManager
      episodes={[episode]}
      loading={false}
      series={[series]}
      hasElectronBackend
      onCreate={vi.fn()}
      onOpen={vi.fn()}
      onPlay={onPlay}
      onRerun={onRerun}
      onDelete={vi.fn()}
      onImport={vi.fn()}
      onExport={vi.fn()}
      onEdit={vi.fn()}
      onUpsertSeries={vi.fn(async () => series)}
      onAssignSeries={vi.fn()}
      onReorderSeries={vi.fn()}
      onGenerateSeriesFeed={vi.fn()}
    />)

    await waitFor(() => expect(screen.getByText('芯片新闻')).toBeTruthy())
    fireEvent.click(screen.getByText('继续收听'))
    expect(screen.getByText('芯片新闻')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '继续' }))
    fireEvent.click(screen.getByRole('button', { name: '重跑' }))
    expect(onPlay).toHaveBeenCalledWith('ep-1')
    expect(onRerun).toHaveBeenCalledWith('ep-1')
  })

  it('links the current script segment to its fact source', async () => {
    const workflow = {
      id: 'ep-1',
      state: {
        edited_script: { segments: [{ id: 's1', type: 'quick_news', title: '芯片', text: '这是有来源的稿件。', source_fact_ids: ['f1'], estimated_seconds: 20 }] },
        facts: [{ id: 'f1', title: '官方发布', summary: '', source_title: 'Example', source_url: 'https://example.com/source', published_at: '', claim: '', confidence: 'high' }],
      },
    } as unknown as Workflow
    render(<GlobalPlayer episode={episode} workflow={workflow} onClose={vi.fn()} onPlaybackPersisted={vi.fn()} onEnded={vi.fn()} />)

    await waitFor(() => expect(window.electronAPI.getMediaUrl).toHaveBeenCalledWith('ep-1'))
    fireEvent.click(screen.getByRole('button', { name: '展开稿件与来源' }))
    expect(screen.getByText('这是有来源的稿件。')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /官方发布/ }))
    expect(window.electronAPI.openExternal).toHaveBeenCalledWith('https://example.com/source')
  })

  it('persists the previous episode identity before switching media', async () => {
    const secondEpisode = { ...episode, id: 'ep-2', episodeId: 'episode-2', title: '第二期' }
    const { container, rerender } = render(
      <GlobalPlayer episode={episode} workflow={null} onClose={vi.fn()} onPlaybackPersisted={vi.fn()} onEnded={vi.fn()} />,
    )
    await waitFor(() => expect(container.querySelector('audio')).toBeTruthy())
    const audio = container.querySelector('audio') as HTMLAudioElement
    audio.currentTime = 42
    Object.defineProperty(audio, 'duration', { configurable: true, value: 100 })
    fireEvent.timeUpdate(audio)

    rerender(<GlobalPlayer episode={secondEpisode} workflow={null} onClose={vi.fn()} onPlaybackPersisted={vi.fn()} onEnded={vi.fn()} />)

    await waitFor(() => expect(window.electronAPI.updatePlayback).toHaveBeenCalledWith(
      'ep-1',
      expect.objectContaining({ positionSeconds: 42, durationSeconds: 100 }),
    ))
    expect(window.electronAPI.updatePlayback).not.toHaveBeenCalledWith('ep-2', expect.anything())
  })

  it('allows retrying a rejected media play and counts only the successful attempt', async () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play')
      .mockRejectedValueOnce(new DOMException('The element has no supported sources.', 'NotSupportedError'))
      .mockResolvedValueOnce(undefined)
    const { container, unmount } = render(
      <GlobalPlayer episode={episode} workflow={null} onClose={vi.fn()} onPlaybackPersisted={vi.fn()} onEnded={vi.fn()} />,
    )

    await waitFor(() => expect(container.querySelector('audio')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: '播放' }))

    expect(await screen.findByText(/音频播放失败：.*The element has no supported sources\./)).toBeTruthy()
    expect(screen.getByRole('button', { name: '播放' }).hasAttribute('disabled')).toBe(false)

    fireEvent.click(screen.getByRole('button', { name: '播放' }))
    await waitFor(() => expect(play).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.queryByText(/音频播放失败：/)).toBeNull())

    unmount()
    await waitFor(() => expect(window.electronAPI.updatePlayback).toHaveBeenCalledWith(
      'ep-1',
      expect.objectContaining({ playCount: 2 }),
    ))
  })

  it('does not count a rejected media play', async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockRejectedValueOnce(
      new DOMException('The element has no supported sources.', 'NotSupportedError'),
    )
    const { container, unmount } = render(
      <GlobalPlayer episode={episode} workflow={null} onClose={vi.fn()} onPlaybackPersisted={vi.fn()} onEnded={vi.fn()} />,
    )

    await waitFor(() => expect(container.querySelector('audio')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: '播放' }))
    await screen.findByText(/音频播放失败：.*The element has no supported sources\./)

    unmount()
    await waitFor(() => expect(window.electronAPI.updatePlayback).toHaveBeenCalledWith(
      'ep-1',
      expect.objectContaining({ playCount: 1 }),
    ))
  })
})
