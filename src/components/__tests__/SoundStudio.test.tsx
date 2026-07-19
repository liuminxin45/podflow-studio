import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { message } from 'antd'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import SoundStudio from '../SoundStudio'
import type { Workflow } from '../../types/workflow'

function workflow(overrides: Partial<Workflow> = {}, stateOverrides: Record<string, any> = {}): Workflow {
  return {
    id: 'workflow-produce-test',
    status: 'draft',
    currentNode: null,
    nodeExecutions: {},
    state: {
      episode_id: 'episode-produce-test',
      edited_script: { segments: [
        { id: 'seg_1', type: 'opening', speaker: 'Host A', title: '开场', text: '欢迎收听本期节目。', source_fact_ids: [], estimated_seconds: 8 },
        { id: 'seg_2', type: 'quick_news', speaker: 'Host A', title: '正文', text: '这是经过事实核验的节目正文。', source_fact_ids: [], estimated_seconds: 12 },
      ] },
      voice_segments: [],
      audio_outputs: {},
      cover_path: '',
      errors: [],
      ...stateOverrides,
    },
    ...overrides,
  } as Workflow
}

describe('SoundStudio production workflow', () => {
  const originalElectronAPI = window.electronAPI
  const loadNodeConfig = vi.fn(async (nodeName: string): Promise<Record<string, any>> => {
    if (nodeName === 'tts') {
      return {
        engine: 'edge-tts',
        default_voice: 'zh-CN-XiaoxiaoNeural',
        rate: '+0%',
        output_dir: 'out/voice_segments',
      }
    }
    if (nodeName === 'audio_postprocess') {
      return {
        output_dir: 'out/episodes',
        output_format: 'mp3',
        segment_pause_ms: 600,
        normalize_loudness: true,
      }
    }
    return { output_dir: 'out/assets', generate_cover: true }
  })
  const saveNodeConfig = vi.fn(async () => ({ success: true }))

  beforeEach(() => {
    loadNodeConfig.mockClear()
    saveNodeConfig.mockClear()
    ;(window as any).electronAPI = {
      ...(originalElectronAPI || {}),
      loadNodeConfig,
      saveNodeConfig,
    }
  })

  afterEach(() => {
    ;(window as any).electronAPI = originalElectronAPI
  })

  it('renders only production-backed controls and the real script', async () => {
    render(<SoundStudio visible onClose={vi.fn()} workflow={workflow()} />)

    await waitFor(() => expect(loadNodeConfig).toHaveBeenCalledTimes(3))
    fireEvent.click(screen.getByText('正文'))
    expect(screen.getByText('声音制作')).toBeTruthy()
    expect(screen.getByText('这是经过事实核验的节目正文。')).toBeTruthy()
    expect(screen.getByText('Edge TTS')).toBeTruthy()
    expect(screen.getByText(/段间停顿/)).toBeTruthy()
    expect(screen.queryByText('删除选中')).toBeNull()
    expect(screen.queryByText('片头片尾模板')).toBeNull()
    expect(screen.queryByText('段落过渡')).toBeNull()
  }, 60_000)

  it('uses the same edited-script priority as TTS and preserves a zero segment pause', async () => {
    loadNodeConfig
      .mockResolvedValueOnce({
        engine: 'edge-tts',
        default_voice: 'zh-CN-XiaoxiaoNeural',
        rate: '+0%',
      })
      .mockResolvedValueOnce({
        output_format: 'mp3',
        segment_pause_ms: 0,
        normalize_loudness: true,
      })
      .mockResolvedValueOnce({ generate_cover: true })
    const onRunNodes = vi.fn(async () => undefined)
    render(
      <SoundStudio
        visible
        onClose={vi.fn()}
        workflow={workflow({}, {
          edited_script: {
            segments: [{
              id: 'edited_1',
              title: '最终开场',
              text: '这是人工编辑后的最终口播稿。',
              speaker: 'Host A',
              estimated_seconds: 9,
            }],
          },
          script: {
            segments: [{ id: 'generated_1', title: '旧生成稿', text: '这段生成稿不应被制作。' }],
          },
        })}
        onUpdateWorkflow={vi.fn(async () => undefined)}
        onRunNodes={onRunNodes}
      />,
    )

    expect(await screen.findByText('这是人工编辑后的最终口播稿。')).toBeTruthy()
    expect(screen.getByText('人工编辑稿')).toBeTruthy()
    expect(screen.queryByText('这段生成稿不应被制作。')).toBeNull()
    expect(screen.queryByText('欢迎收听本期节目。')).toBeNull()
    expect(screen.getByText(/段间停顿/).textContent).toContain('0 ms')

    const generateButton = screen.getByRole('button', { name: /制作成品/ })
    expect(generateButton.className).toContain('ant-btn-primary')
    expect(generateButton.querySelector('.ant-btn-icon')).toBeTruthy()
    fireEvent.click(generateButton)
    await waitFor(() => expect(onRunNodes).toHaveBeenCalled())
    expect(saveNodeConfig).toHaveBeenCalledWith('audio_postprocess', expect.objectContaining({
      segment_pause_ms: 0,
    }))
  }, 60_000)

  it('blocks production when configs fail to load and supports a safe retry', async () => {
    loadNodeConfig.mockRejectedValueOnce(new Error('配置文件暂时不可读'))
    const onUpdateWorkflow = vi.fn(async () => undefined)
    const onRunNodes = vi.fn(async () => undefined)
    render(
      <SoundStudio
        visible
        onClose={vi.fn()}
        workflow={workflow()}
        onUpdateWorkflow={onUpdateWorkflow}
        onRunNodes={onRunNodes}
      />,
    )

    expect(await screen.findByText('配置读取失败')).toBeTruthy()
    const generate = screen.getByRole('button', { name: /制作成品/ }) as HTMLButtonElement
    expect(generate.disabled).toBe(true)
    fireEvent.click(generate)
    expect(saveNodeConfig).not.toHaveBeenCalled()
    expect(onRunNodes).not.toHaveBeenCalled()

    const retryButtons = screen.getAllByRole('button', { name: '重新读取' })
    fireEvent.click(retryButtons[0])
    await waitFor(() => expect((screen.getByRole('button', { name: /制作成品/ }) as HTMLButtonElement).disabled).toBe(false))
  }, 60_000)

  it('loads a saved Doubao TTS provider without replacing its engine or voice', async () => {
    loadNodeConfig
      .mockResolvedValueOnce({
        engine: 'doubao_tts',
        default_voice: 'zh_female_shuangkuaisisi_moon_bigtts',
        doubao_app_id: 'doubao-app',
        doubao_access_token: 'doubao-token',
        doubao_cluster: 'volcano_tts',
        doubao_voice_type: 'zh_female_shuangkuaisisi_moon_bigtts',
        doubao_endpoint: 'https://openspeech.bytedance.com/api/v1/tts',
        doubao_resource_id: 'volc.service_type.10029',
      })
      .mockResolvedValueOnce({ output_format: 'mp3', segment_pause_ms: 600 })
      .mockResolvedValueOnce({ generate_cover: true })
    const onRunNodes = vi.fn(async () => undefined)
    render(
      <SoundStudio
        visible
        onClose={vi.fn()}
        workflow={workflow()}
        onUpdateWorkflow={vi.fn(async () => undefined)}
        onRunNodes={onRunNodes}
      />,
    )

    expect(await screen.findByText('豆包语音生成')).toBeTruthy()
    expect(screen.queryByText(/不受制作页支持/)).toBeNull()
    await waitFor(() => expect((screen.getByRole('button', { name: /制作成品/ }) as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(screen.getByRole('button', { name: /制作成品/ }))
    await waitFor(() => expect(onRunNodes).toHaveBeenCalled())
    expect(saveNodeConfig).toHaveBeenCalledWith('tts', expect.objectContaining({
      engine: 'doubao_tts',
      doubao_voice_type: 'zh_female_shuangkuaisisi_moon_bigtts',
      doubao_resource_id: 'volc.service_type.10029',
    }))
  }, 60_000)

  it('does not carry a saved Doubao voice into Edge TTS when switching providers', async () => {
    loadNodeConfig
      .mockResolvedValueOnce({
        engine: 'doubao_tts',
        default_voice: 'zh_female_shuangkuaisisi_moon_bigtts',
        doubao_voice_type: 'zh_female_shuangkuaisisi_moon_bigtts',
        doubao_app_id: 'doubao-app',
        doubao_access_token: 'doubao-token',
        doubao_cluster: 'volcano_tts',
        doubao_endpoint: 'https://openspeech.bytedance.com/api/v1/tts',
        doubao_resource_id: 'volc.service_type.10029',
      })
      .mockResolvedValueOnce({ output_format: 'mp3', segment_pause_ms: 600 })
      .mockResolvedValueOnce({ generate_cover: true })

    render(<SoundStudio visible onClose={vi.fn()} workflow={workflow()} />)

    const providerSelect = await screen.findByRole('combobox', { name: '语音服务' })
    fireEvent.mouseDown(providerSelect)
    fireEvent.click(await screen.findByText('Edge TTS', { selector: '.ant-select-item-option-content' }))

    await waitFor(() => expect(screen.getByRole('button', { name: /晓晓/ }).getAttribute('aria-pressed')).toBe('true'))
    expect(screen.queryByText('已配置音色')).toBeNull()
    expect(screen.queryByText('zh_female_shuangkuaisisi_moon_bigtts')).toBeNull()
  }, 60_000)

  it('persists node configs, runs only Produce nodes, and waits for a verified artifact', async () => {
    const onUpdateWorkflow = vi.fn(async () => undefined)
    const onRunNodes = vi.fn(async () => undefined)
    const onOpenPath = vi.fn(async () => ({ success: true }))
    const props = {
      visible: true,
      onClose: vi.fn(),
      workflow: workflow(),
      onUpdateWorkflow,
      onRunNodes,
      onOpenPath,
    }
    const { rerender } = render(<SoundStudio {...props} />)

    await waitFor(() => expect((screen.getByRole('button', { name: /制作成品/ }) as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(screen.getByRole('switch', { name: '叠加背景音乐' }))
    fireEvent.change(screen.getByRole('textbox', { name: '背景音乐文件路径' }), {
      target: { value: 'D:\\Music\\podcast-bed.wav' },
    })
    fireEvent.click(screen.getByRole('button', { name: /制作成品/ }))

    await waitFor(() => expect(onRunNodes).toHaveBeenCalledWith(['tts', 'audio_postprocess', 'assets']))
    expect(onRunNodes).not.toHaveBeenCalledWith(expect.arrayContaining(['review']))
    expect(saveNodeConfig).toHaveBeenCalledWith('tts', expect.objectContaining({
      engine: 'edge-tts',
      default_voice: 'zh-CN-XiaoxiaoNeural',
    }))
    expect(saveNodeConfig).toHaveBeenCalledWith('audio_postprocess', expect.objectContaining({
      output_format: 'mp3',
      segment_pause_ms: 600,
      normalize_loudness: true,
      add_bgm: true,
      bgm_path: 'D:\\Music\\podcast-bed.wav',
    }))
    expect(onUpdateWorkflow).toHaveBeenCalledWith(expect.objectContaining({
      voice_segments: [],
      audio_outputs: {},
    }))
    expect(screen.queryByText('final.wav')).toBeNull()

    const unverifiable = workflow(
      { status: 'completed' },
      {
        cover_path: 'out/episodes/episode-produce-test/cover.url',
        voice_segments: [{
          segment_id: 'seg_1',
          path: 'out/episodes/episode-produce-test/voice.cmd',
          voice: 'unsafe',
        }],
        audio_outputs: {
          status: 'ok',
          final_audio_path: 'out/episodes/episode-produce-test/payload.exe',
          audio_report_path: 'out/episodes/episode-produce-test/report.cmd',
          duration_seconds: 20,
          segments_count: 2,
          format: 'exe',
          file_size: 32000,
        },
      },
    )
    rerender(<SoundStudio {...props} workflow={unverifiable} />)
    expect(await screen.findByText('已有成品记录无法验证')).toBeTruthy()
    expect(screen.queryByText('payload.exe')).toBeNull()
    expect(screen.queryByRole('button', { name: '制作报告' })).toBeNull()
    expect(screen.queryByRole('button', { name: '查看封面' })).toBeNull()
    expect(screen.queryByRole('button', { name: '试听真实文件' })).toBeNull()
    expect((screen.getByRole('button', { name: '进入发布' }) as HTMLButtonElement).disabled).toBe(true)

    const completed = workflow(
      { status: 'completed' },
      {
        audio_outputs: {
          status: 'ok',
          final_audio_path: 'out/episodes/episode-produce-test/final.wav',
          duration_seconds: 20,
          segments_count: 2,
          format: 'wav',
          file_size: 32000,
          audio_report_path: 'out/episodes/episode-produce-test/audio_report.json',
        },
      },
    )
    rerender(<SoundStudio {...props} workflow={completed} />)

    expect(await screen.findByText('final.wav')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '用系统播放器试听' }))
    await waitFor(() => expect(onOpenPath).toHaveBeenCalledWith('out/episodes/episode-produce-test/final.wav'))
  }, 60_000)

  it('restores the last valid artifact references when a rebuild fails', async () => {
    const previous = {
      voice_segments: [{ segment_id: 'seg_1', path: 'out/old/seg_1.mp3', voice: 'old' }],
      audio_outputs: {
        status: 'ok',
        final_audio_path: 'out/old/final.mp3',
        duration_seconds: 20,
        segments_count: 1,
        format: 'mp3',
        file_size: 32000,
        audio_report_path: 'out/old/audio_report.json',
      },
      cover_path: 'out/old/cover.png',
    }
    const onUpdateWorkflow = vi.fn(async () => undefined)
    const onRunNodes = vi.fn(async () => { throw new Error('TTS service unavailable') })
    render(
      <SoundStudio
        visible
        onClose={vi.fn()}
        workflow={workflow({}, previous)}
        onUpdateWorkflow={onUpdateWorkflow}
        onRunNodes={onRunNodes}
      />,
    )

    await waitFor(() => expect((screen.getByRole('button', { name: /重新制作/ }) as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(screen.getByRole('button', { name: /重新制作/ }))

    await waitFor(() => expect(onRunNodes).toHaveBeenCalled())
    await waitFor(() => expect(onUpdateWorkflow).toHaveBeenLastCalledWith(previous))
    expect((await screen.findAllByText(/TTS service unavailable/)).length).toBeGreaterThan(0)
  }, 60_000)

  it('refuses to assemble an incomplete set of human recordings', async () => {
    const onUpdateWorkflow = vi.fn(async () => undefined)
    const onRunNodes = vi.fn(async () => undefined)
    render(
      <SoundStudio
        visible
        onClose={vi.fn()}
        workflow={workflow({}, {
          voice_segments: [{
            segment_id: 'seg_1',
            path: 'out/recordings/episode-produce-test/seg_1.webm',
            text: '欢迎收听本期节目。',
            speaker: 'Host A',
            engine: 'recording',
            voice: 'recording',
            mime_type: 'audio/webm',
            duration_seconds: 8,
            size: 1024,
          }],
        })}
        onUpdateWorkflow={onUpdateWorkflow}
        onRunNodes={onRunNodes}
      />,
    )

    await waitFor(() => expect((screen.getByRole('button', { name: '真人录音' }) as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(screen.getByRole('button', { name: '真人录音' }))
    expect(screen.getByText('1/2')).toBeTruthy()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /制作成品/ }))
      await Promise.resolve()
    })

    expect(await screen.findByText(/还需录制 1 个段落/)).toBeTruthy()
    expect(onRunNodes).not.toHaveBeenCalled()
    expect(onUpdateWorkflow).not.toHaveBeenCalled()
    await act(async () => {
      message.destroy()
      await Promise.resolve()
    })
  }, 60_000)

  it('cancels a pending microphone request when hidden and prevents duplicate requests', async () => {
    const stopTrack = vi.fn()
    const stream = { getTracks: () => [{ stop: stopTrack }] } as unknown as MediaStream
    let resolveStream: ((value: MediaStream) => void) | undefined
    const getUserMedia = vi.fn(() => new Promise<MediaStream>(resolve => {
      resolveStream = resolve
    }))
    let recorderConstructions = 0
    class MockMediaRecorder {
      static isTypeSupported = vi.fn(() => true)
      state: RecordingState = 'inactive'
      mimeType = 'audio/webm'
      ondataavailable: ((event: BlobEvent) => void) | null = null
      onstop: (() => void) | null = null
      onerror: ((event: Event) => void) | null = null

      constructor(_stream: MediaStream) {
        recorderConstructions += 1
      }
      start() { this.state = 'recording' }
      stop() { this.state = 'inactive'; this.onstop?.() }
    }
    const originalMediaRecorder = globalThis.MediaRecorder
    const originalMediaDevices = navigator.mediaDevices
    Object.defineProperty(globalThis, 'MediaRecorder', { configurable: true, value: MockMediaRecorder })
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } })
    const onSaveRecording = vi.fn()

    try {
      const props = {
        onClose: vi.fn(),
        workflow: workflow(),
        onSaveRecording,
        onUpdateWorkflow: vi.fn(async () => undefined),
      }
      const { rerender } = render(<SoundStudio {...props} visible />)
      await waitFor(() => expect((screen.getByRole('button', { name: '真人录音' }) as HTMLButtonElement).disabled).toBe(false))
      fireEvent.click(screen.getByRole('button', { name: '真人录音' }))
      const startButton = screen.getByRole('button', { name: '开始录制' })
      fireEvent.click(startButton)
      fireEvent.click(startButton)

      await waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(1))
      expect(await screen.findByText('正在连接麦克风')).toBeTruthy()
      expect((screen.getByRole('button', { name: '关闭制作页' }) as HTMLButtonElement).disabled).toBe(true)
      expect((screen.getByRole('button', { name: /正文.*待录/ }) as HTMLButtonElement).disabled).toBe(true)

      rerender(<SoundStudio {...props} visible={false} />)
      await act(async () => {
        resolveStream?.(stream)
        await Promise.resolve()
      })

      await waitFor(() => expect(stopTrack).toHaveBeenCalledTimes(1))
      expect(recorderConstructions).toBe(0)
      expect(onSaveRecording).not.toHaveBeenCalled()
    } finally {
      Object.defineProperty(globalThis, 'MediaRecorder', { configurable: true, value: originalMediaRecorder })
      Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: originalMediaDevices })
    }
  }, 60_000)

  it('never saves recorder error output even if data and stop events follow', async () => {
    const stream = { getTracks: () => [{ stop: vi.fn() }] } as unknown as MediaStream
    let recorderInstance: MockMediaRecorder | null = null
    class MockMediaRecorder {
      static isTypeSupported = vi.fn(() => true)
      state: RecordingState = 'inactive'
      mimeType = 'audio/webm'
      ondataavailable: ((event: BlobEvent) => void) | null = null
      onstop: (() => void) | null = null
      onerror: ((event: Event) => void) | null = null

      constructor(_stream: MediaStream) {
        recorderInstance = this
      }
      start() { this.state = 'recording' }
      stop() { this.state = 'inactive'; this.onstop?.() }
    }
    const originalMediaRecorder = globalThis.MediaRecorder
    const originalMediaDevices = navigator.mediaDevices
    Object.defineProperty(globalThis, 'MediaRecorder', { configurable: true, value: MockMediaRecorder })
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn(async () => stream) },
    })
    const onSaveRecording = vi.fn()

    try {
      render(
        <SoundStudio
          visible
          onClose={vi.fn()}
          workflow={workflow()}
          onSaveRecording={onSaveRecording}
          onUpdateWorkflow={vi.fn(async () => undefined)}
        />,
      )
      await waitFor(() => expect((screen.getByRole('button', { name: '真人录音' }) as HTMLButtonElement).disabled).toBe(false))
      fireEvent.click(screen.getByRole('button', { name: '真人录音' }))
      fireEvent.click(screen.getByRole('button', { name: '开始录制' }))
      await screen.findByRole('button', { name: '结束录制' })

      await act(async () => {
        recorderInstance?.onerror?.(new Event('error'))
        recorderInstance?.ondataavailable?.({ data: new Blob(['partial-audio']) } as BlobEvent)
        recorderInstance?.onstop?.()
        await Promise.resolve()
      })

      expect(onSaveRecording).not.toHaveBeenCalled()
      expect(screen.getByText('录音设备发生错误。')).toBeTruthy()
      expect(screen.getByText('0/2')).toBeTruthy()
    } finally {
      Object.defineProperty(globalThis, 'MediaRecorder', { configurable: true, value: originalMediaRecorder })
      Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: originalMediaDevices })
    }
  }, 60_000)

  it('records every segment, persists real files, and assembles the recording paths', async () => {
    const stoppedTracks: string[] = []
    const stream = {
      getTracks: () => [{ stop: () => stoppedTracks.push('stopped') }],
    } as unknown as MediaStream
    class MockMediaRecorder {
      static isTypeSupported = vi.fn(() => true)
      state: RecordingState = 'inactive'
      mimeType = 'audio/webm;codecs=opus'
      ondataavailable: ((event: BlobEvent) => void) | null = null
      onstop: (() => void) | null = null
      onerror: ((event: Event) => void) | null = null

      constructor(_stream: MediaStream, options?: MediaRecorderOptions) {
        if (options?.mimeType) this.mimeType = options.mimeType
      }

      start() {
        this.state = 'recording'
      }

      stop() {
        this.state = 'inactive'
        this.ondataavailable?.({ data: new Blob(['recorded-audio'], { type: this.mimeType }) } as BlobEvent)
        this.onstop?.()
      }
    }

    const originalMediaRecorder = globalThis.MediaRecorder
    const originalMediaDevices = navigator.mediaDevices
    Object.defineProperty(globalThis, 'MediaRecorder', { configurable: true, value: MockMediaRecorder })
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn(async () => stream) },
    })

    const onSaveRecording = vi.fn(async (payload: { segmentId: string; mimeType: string; durationSeconds: number }) => ({
      success: true,
      path: `out/recordings/episode-produce-test/${payload.segmentId}.webm`,
      size: 14,
      mimeType: payload.mimeType,
      durationSeconds: payload.durationSeconds,
    }))
    const onUpdateWorkflow = vi.fn(async () => undefined)
    const onRunNodes = vi.fn(async () => undefined)

    try {
      render(
        <SoundStudio
          visible
          onClose={vi.fn()}
          workflow={workflow()}
          onSaveRecording={onSaveRecording}
          onUpdateWorkflow={onUpdateWorkflow}
          onRunNodes={onRunNodes}
        />,
      )

      await waitFor(() => expect((screen.getByRole('button', { name: '真人录音' }) as HTMLButtonElement).disabled).toBe(false))
      fireEvent.click(screen.getByRole('button', { name: '真人录音' }))
      fireEvent.click(screen.getByRole('button', { name: '开始录制' }))
      fireEvent.click(await screen.findByRole('button', { name: '结束录制' }))
      await waitFor(() => expect(onSaveRecording).toHaveBeenCalledWith(expect.objectContaining({ segmentId: 'seg_1' })))

      fireEvent.click(screen.getByText('正文'))
      fireEvent.click(screen.getByRole('button', { name: '开始录制' }))
      fireEvent.click(await screen.findByRole('button', { name: '结束录制' }))
      await waitFor(() => expect(onSaveRecording).toHaveBeenCalledWith(expect.objectContaining({ segmentId: 'seg_2' })))
      await waitFor(() => expect(screen.getByText('2/2')).toBeTruthy())

      fireEvent.click(screen.getByRole('button', { name: /制作成品/ }))
      await waitFor(() => expect(onRunNodes).toHaveBeenCalledWith(['audio_postprocess', 'assets']))
      expect(onUpdateWorkflow).toHaveBeenLastCalledWith(expect.objectContaining({
        voice_segments: [
          expect.objectContaining({ segment_id: 'seg_1', engine: 'recording' }),
          expect.objectContaining({ segment_id: 'seg_2', engine: 'recording' }),
        ],
        audio_outputs: {},
      }))
      expect(stoppedTracks.length).toBe(2)
    } finally {
      Object.defineProperty(globalThis, 'MediaRecorder', { configurable: true, value: originalMediaRecorder })
      Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: originalMediaDevices })
    }
  }, 60_000)

  it('stops the microphone when the page is hidden', async () => {
    const stopTrack = vi.fn()
    const stream = { getTracks: () => [{ stop: stopTrack }] } as unknown as MediaStream
    class MockMediaRecorder {
      static isTypeSupported = vi.fn(() => true)
      state: RecordingState = 'inactive'
      mimeType = 'audio/webm'
      ondataavailable: ((event: BlobEvent) => void) | null = null
      onstop: (() => void) | null = null

      constructor(_stream: MediaStream) {}
      start() { this.state = 'recording' }
      stop() {
        this.state = 'inactive'
        this.ondataavailable?.({ data: new Blob(['audio']) } as BlobEvent)
        this.onstop?.()
      }
    }
    const originalMediaRecorder = globalThis.MediaRecorder
    const originalMediaDevices = navigator.mediaDevices
    Object.defineProperty(globalThis, 'MediaRecorder', { configurable: true, value: MockMediaRecorder })
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn(async () => stream) },
    })
    const onSaveRecording = vi.fn(async () => ({
      success: true,
      path: 'out/recordings/hidden.webm',
      size: 5,
      mimeType: 'audio/webm',
      durationSeconds: 1,
    }))

    try {
      const props = {
        onClose: vi.fn(),
        workflow: workflow(),
        onSaveRecording,
        onUpdateWorkflow: vi.fn(async () => undefined),
      }
      const { rerender } = render(<SoundStudio {...props} visible />)
      await waitFor(() => expect((screen.getByRole('button', { name: '真人录音' }) as HTMLButtonElement).disabled).toBe(false))
      fireEvent.click(screen.getByRole('button', { name: '真人录音' }))
      fireEvent.click(screen.getByRole('button', { name: '开始录制' }))
      await screen.findByRole('button', { name: '结束录制' })

      rerender(<SoundStudio {...props} visible={false} />)

      await waitFor(() => expect(stopTrack).toHaveBeenCalled())
      await waitFor(() => expect(onSaveRecording).toHaveBeenCalled())
    } finally {
      Object.defineProperty(globalThis, 'MediaRecorder', { configurable: true, value: originalMediaRecorder })
      Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: originalMediaDevices })
    }
  }, 60_000)
})
