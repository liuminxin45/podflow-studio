import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Button, Input, Progress, Select, Slider, Switch, Tag, message } from 'antd'
import {
  AudioOutlined,
  CheckCircleOutlined,
  CloseOutlined,
  FileImageOutlined,
  FileTextOutlined,
  FolderOpenOutlined,
  LoadingOutlined,
  PlayCircleOutlined,
  ReloadOutlined,
  SoundOutlined,
  StopOutlined,
  WarningOutlined,
} from '../../icons/antdCompat'
import type { VoiceSegment, Workflow } from '../../types/workflow'
import StageHeader from '../StageHeader'
import {
  AUDIO_PROVIDERS,
  OUTPUT_FORMATS,
  PRODUCE_NODE_LABELS,
  RATE_OPTIONS,
  SEGMENT_COLORS,
  VOICE_PRESETS,
} from './constants'
import type {
  AudioProvider,
  OutputFormat,
  PostprocessSettings,
  ProductionRunState,
  ScriptSegment,
  StudioMode,
  StudioRecording,
} from './types'
import './productionStudio.css'

interface Props {
  visible: boolean
  onClose: () => void
  onBackToWriting?: () => void
  workflow?: Workflow | null
  episodeTitle?: string
  onSaveRecording?: (payload: {
    episodeId: string
    segmentId: string
    mimeType: string
    durationSeconds: number
    data: ArrayBuffer
  }) => Promise<{ success: boolean; path: string; size: number; mimeType: string; durationSeconds: number }>
  onUpdateWorkflow?: (patch: Record<string, any>) => Promise<void> | void
  onRunNodes?: (nodes: string[]) => Promise<void> | void
  onOpenPath?: (targetPath: string) => Promise<{ success: boolean; error?: string }>
  onShowItemInFolder?: (targetPath: string) => Promise<{ success: boolean; error?: string }>
  onProceedToPublish?: () => void
}

const DEFAULT_POSTPROCESS: PostprocessSettings = {
  outputFormat: 'mp3',
  segmentPauseMs: 600,
  normalizeLoudness: true,
  trimSilence: false,
  addBgm: false,
  bgmPath: '',
  bgmVolume: 0.15,
}

const IDLE_RUN: ProductionRunState = { status: 'idle', message: '', error: '' }
const PRODUCE_NODES = new Set(['tts', 'audio_postprocess', 'assets'])

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function formatTime(seconds: number): string {
  const safe = Math.max(0, Math.round(Number(seconds) || 0))
  const mins = Math.floor(safe / 60)
  const secs = safe % 60
  return `${mins}:${String(secs).padStart(2, '0')}`
}

function formatBytes(value: unknown): string {
  const bytes = Number(value) || 0
  if (bytes <= 0) return '-'
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function fileName(targetPath: string): string {
  const parts = targetPath.split(/[\\/]/).filter(Boolean)
  return parts[parts.length - 1] || targetPath
}

type ArtifactKind = 'audio' | 'image' | 'report'

const ARTIFACT_EXTENSIONS: Record<ArtifactKind, Set<string>> = {
  audio: new Set(['.aac', '.flac', '.m4a', '.mp3', '.oga', '.ogg', '.opus', '.wav', '.webm']),
  image: new Set(['.jpeg', '.jpg', '.png', '.webp']),
  report: new Set(['.json']),
}

function artifactExtension(targetPath: string): string {
  const leaf = fileName(text(targetPath)).toLowerCase()
  const dot = leaf.lastIndexOf('.')
  return dot > 0 ? leaf.slice(dot) : ''
}

function isAllowedArtifactPath(targetPath: string, kind: ArtifactKind): boolean {
  return Boolean(text(targetPath)) && ARTIFACT_EXTENSIONS[kind].has(artifactExtension(targetPath))
}

function finiteNumber(value: unknown, fallback: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function providerFromEngine(engine: string): AudioProvider | null {
  if (engine === 'edge-tts') return 'edge-tts'
  if (engine === 'openai-compatible') return 'openai-compatible'
  if (engine === 'doubao_tts') return 'doubao_tts'
  if (engine === 'voice_clone') return 'voice_clone'
  return null
}

function configuredVoice(provider: AudioProvider, config: Record<string, any>): string {
  const configuredProvider = providerFromEngine(text(config.engine).toLowerCase())
  if (configuredProvider && configuredProvider !== provider) return ''
  if (provider === 'doubao_tts' || provider === 'voice_clone') {
    return text(config.doubao_voice_type || config.default_voice)
  }
  return text(config.default_voice)
}

function isAudioProviderConfigured(provider: AudioProvider, config: Record<string, any>): boolean {
  if (provider === 'edge-tts') return true
  if (provider === 'openai-compatible') {
    return Boolean(text(config.api_key) && text(config.api_base) && text(config.model || config.api_model))
  }
  return Boolean(
    text(config.doubao_app_id)
    && text(config.doubao_access_token)
    && text(config.doubao_cluster)
    && text(config.doubao_voice_type || config.default_voice)
    && text(config.doubao_endpoint)
    && text(config.doubao_resource_id),
  )
}

function scriptSegments(state: Workflow['state'] | undefined): {
  source: 'edited_script'
  segments: ScriptSegment[]
} {
  const editedSegments = state?.edited_script?.segments

  return {
    source: 'edited_script',
    segments: (editedSegments || []).map((segment, index) => {
      const content = text(segment.text)
      return {
        id: text(segment.id) || `seg_${index + 1}`,
        label: text(segment.title) || `第 ${index + 1} 段`,
        color: SEGMENT_COLORS[index % SEGMENT_COLORS.length],
        content,
        speaker: text(segment.speaker) || 'Host A',
        estimatedSeconds: finiteNumber(
          segment.estimated_seconds,
          Math.max(5, Math.round(content.length / 4)),
        ),
      }
    }),
  }
}

function verifiedFinalAudioPath(state: Workflow['state'] | undefined): string {
  const outputs = state?.audio_outputs || {}
  const statePath = text(outputs.final_audio_path)
  if (!isAllowedArtifactPath(statePath, 'audio') || text(outputs.status) !== 'ok') return ''
  const outputFormat = text(outputs.format).toLowerCase().replace(/^\./, '')
  if (!outputFormat || artifactExtension(statePath) !== `.${outputFormat}`) return ''
  if (finiteNumber(outputs.file_size, 0) <= 0) return ''
  if (finiteNumber(outputs.duration_seconds, 0) <= 0) return ''
  if (finiteNumber(outputs.segments_count, 0) <= 0) return ''
  return statePath
}

function savedRecordings(items: VoiceSegment[] | undefined): Record<string, StudioRecording> {
  const next: Record<string, StudioRecording> = {}
  for (const item of items || []) {
    if (item.engine !== 'recording') continue
    const segmentId = text(item.segment_id)
    if (!segmentId || !isAllowedArtifactPath(item.path, 'audio')) continue
    next[segmentId] = {
      segmentId,
      status: 'recorded',
      durationSeconds: Number(item.duration_seconds) || 0,
      path: item.path,
      mimeType: item.mime_type || '',
      size: item.size,
    }
  }
  return next
}

function toPersistedRecordings(
  recordings: Record<string, StudioRecording>,
  segments: ScriptSegment[],
): VoiceSegment[] {
  return segments.flatMap(segment => {
    const recording = recordings[segment.id]
    if (!recording?.path || recording.status !== 'recorded' || !isAllowedArtifactPath(recording.path, 'audio')) return []
    return [{
      segment_id: segment.id,
      path: recording.path,
      text: segment.content,
      speaker: segment.speaker,
      engine: 'recording',
      voice: 'recording',
      mime_type: recording.mimeType || 'audio/webm',
      duration_seconds: recording.durationSeconds,
      size: recording.size || 0,
    }]
  })
}

function preferredRecordingMimeType(): string {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus']
  return candidates.find(candidate => MediaRecorder.isTypeSupported(candidate)) || ''
}

async function blobArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === 'function') return blob.arrayBuffer()
  return new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error || new Error('无法读取录音数据'))
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) resolve(reader.result)
      else reject(new Error('录音数据格式无效'))
    }
    reader.readAsArrayBuffer(blob)
  })
}

export default function ProductionStudio({
  visible,
  onClose,
  onBackToWriting,
  workflow,
  episodeTitle = '',
  onSaveRecording,
  onUpdateWorkflow,
  onRunNodes,
  onOpenPath,
  onShowItemInFolder,
  onProceedToPublish,
}: Props) {
  const scriptSelection = useMemo(() => scriptSegments(workflow?.state), [workflow?.state])
  const segments = scriptSelection.segments
  const recordingSignature = JSON.stringify(workflow?.state?.voice_segments || [])
  const restoredRecordings = useMemo(
    () => savedRecordings(JSON.parse(recordingSignature) as VoiceSegment[]),
    [recordingSignature],
  )
  const [mode, setMode] = useState<StudioMode>('ai')
  const [activeSegmentId, setActiveSegmentId] = useState('')
  const [audioProvider, setAudioProvider] = useState<AudioProvider>('edge-tts')
  const [voice, setVoice] = useState(VOICE_PRESETS['edge-tts'][0].id)
  const [rate, setRate] = useState('+0%')
  const [ttsConfig, setTtsConfig] = useState<Record<string, any>>({})
  const [postprocessConfig, setPostprocessConfig] = useState<Record<string, any>>({})
  const [assetsConfig, setAssetsConfig] = useState<Record<string, any>>({})
  const [postprocess, setPostprocess] = useState<PostprocessSettings>(DEFAULT_POSTPROCESS)
  const [generateCover, setGenerateCover] = useState(true)
  const [configLoading, setConfigLoading] = useState(false)
  const [configReady, setConfigReady] = useState(false)
  const [configLoadAttempt, setConfigLoadAttempt] = useState(0)
  const [configError, setConfigError] = useState('')
  const [unsupportedEngine, setUnsupportedEngine] = useState('')
  const [recordings, setRecordings] = useState<Record<string, StudioRecording>>({})
  const recordingsRef = useRef(recordings)
  const [recordingPending, setRecordingPending] = useState(false)
  const [recordingTick, setRecordingTick] = useState(0)
  const [runState, setRunState] = useState<ProductionRunState>(IDLE_RUN)
  const awaitedRunRef = useRef<{ errorCount: number; executionComplete: boolean } | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const recordingStartedAtRef = useRef(0)
  const recordingSegmentRef = useRef('')
  const recordingTimerRef = useRef<number | null>(null)
  const recordingPendingRef = useRef(false)
  const recordingRequestRef = useRef(0)
  const componentAliveRef = useRef(true)
  const visibleRef = useRef(visible)

  visibleRef.current = visible
  const storedFinalAudioPath = text(workflow?.state?.audio_outputs?.final_audio_path)
  const finalAudioPath = verifiedFinalAudioPath(workflow?.state)
  const hasUnverifiedFinalAudio = Boolean(storedFinalAudioPath && !finalAudioPath)
  const audioOutputs = workflow?.state?.audio_outputs || {}
  const storedAudioReportPath = text(workflow?.state?.audio_outputs?.audio_report_path)
  const storedCoverPath = text(workflow?.state?.cover_path)
  const audioReportPath = isAllowedArtifactPath(storedAudioReportPath, 'report') ? storedAudioReportPath : ''
  const coverPath = isAllowedArtifactPath(storedCoverPath, 'image') ? storedCoverPath : ''
  const voiceSegments = workflow?.state?.voice_segments || []
  const recordedSegments = toPersistedRecordings(recordings, segments)
  const isBusy = ['saving', 'running', 'awaiting-result'].includes(runState.status)
  const recordingLocked = recordingPending || Boolean(recordingSegmentRef.current)
  const activeSegment = segments.find(segment => segment.id === activeSegmentId) || segments[0]
  const activeVoiceSegment = voiceSegments.find(item => item.segment_id === activeSegment?.id)
  const activeVoicePath = isAllowedArtifactPath(activeVoiceSegment?.path || '', 'audio')
    ? activeVoiceSegment?.path || ''
    : ''
  const activeRecording = activeSegment ? recordings[activeSegment.id] : undefined
  const scriptReady = segments.length > 0 && segments.every(segment => Boolean(segment.content))
  const allRecorded = segments.length > 0 && recordedSegments.length === segments.length
  const providerConfigured = !unsupportedEngine && isAudioProviderConfigured(audioProvider, ttsConfig)
  const visibleVoicePresets = useMemo(() => {
    const presets = VOICE_PRESETS[audioProvider]
    if (!voice || presets.some(item => item.id === voice)) return presets
    return [{
      id: voice,
      label: audioProvider === 'voice_clone' ? '复刻音色' : '已配置音色',
      description: voice,
    }, ...presets]
  }, [audioProvider, voice])

  useEffect(() => {
    recordingsRef.current = recordings
  }, [recordings])

  useEffect(() => {
    if (!activeSegmentId || !segments.some(segment => segment.id === activeSegmentId)) {
      setActiveSegmentId(segments[0]?.id || '')
    }
  }, [activeSegmentId, segments])

  useEffect(() => {
    setRecordings(restoredRecordings)
  }, [restoredRecordings, workflow?.state?.episode_id])

  useEffect(() => {
    if (!visible) return
    setConfigReady(false)
    if (!window.electronAPI?.loadNodeConfig) {
      setConfigLoading(false)
      setConfigError('当前环境没有节点配置读取接口。')
      return
    }

    let cancelled = false
    setConfigLoading(true)
    setConfigError('')
    Promise.all([
      window.electronAPI.loadNodeConfig('tts'),
      window.electronAPI.loadNodeConfig('audio_postprocess'),
      window.electronAPI.loadNodeConfig('assets'),
    ])
      .then(([savedTts, savedPostprocess, savedAssets]) => {
        if (cancelled) return
        const nextTts = savedTts || {}
        const nextPostprocess = savedPostprocess || {}
        const nextAssets = savedAssets || {}
        const savedEngine = text(nextTts.engine || 'edge-tts').toLowerCase()
        const detectedProvider = providerFromEngine(savedEngine)
        const nextProvider: AudioProvider = detectedProvider || 'edge-tts'
        const nextUnsupportedEngine = detectedProvider ? '' : savedEngine
        const availableVoices = VOICE_PRESETS[nextProvider]
        const savedVoice = configuredVoice(nextProvider, nextTts)

        setTtsConfig(nextTts)
        setPostprocessConfig(nextPostprocess)
        setAssetsConfig(nextAssets)
        setAudioProvider(nextProvider)
        setUnsupportedEngine(nextUnsupportedEngine)
        setVoice(savedVoice || availableVoices[0]?.id || '')
        setRate(RATE_OPTIONS.some(item => item.value === nextTts.rate) ? nextTts.rate : '+0%')
        setPostprocess({
          outputFormat: OUTPUT_FORMATS.some(item => item.value === nextPostprocess.output_format)
            ? nextPostprocess.output_format as OutputFormat
            : DEFAULT_POSTPROCESS.outputFormat,
          segmentPauseMs: clamp(
            finiteNumber(nextPostprocess.segment_pause_ms, DEFAULT_POSTPROCESS.segmentPauseMs),
            0,
            5000,
          ),
          normalizeLoudness: nextPostprocess.normalize_loudness !== false,
          trimSilence: Boolean(nextPostprocess.trim_silence),
          addBgm: Boolean(nextPostprocess.add_bgm),
          bgmPath: text(nextPostprocess.bgm_path),
          bgmVolume: clamp(finiteNumber(nextPostprocess.bgm_volume, DEFAULT_POSTPROCESS.bgmVolume), 0.01, 1),
        })
        setGenerateCover(nextAssets.generate_cover !== false)
        setConfigReady(true)
      })
      .catch(error => {
        if (!cancelled) {
          setConfigReady(false)
          setConfigError(error?.message || String(error))
        }
      })
      .finally(() => {
        if (!cancelled) setConfigLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [configLoadAttempt, visible, workflow?.state?.episode_id])

  useEffect(() => {
    if (!awaitedRunRef.current?.executionComplete || !workflow || workflow.status === 'running') return

    const newErrors = (workflow.state.errors || [])
      .slice(awaitedRunRef.current.errorCount)
      .filter(error => PRODUCE_NODES.has(error.node))
    const outputStatus = text(workflow.state.audio_outputs?.status)
    awaitedRunRef.current = null

    if (newErrors.length > 0) {
      const error = newErrors.map(item => `${item.node}: ${item.message}`).join('；')
      setRunState({ status: 'failed', message: '', error })
      message.error({ content: `制作失败：${error}`, duration: 3, style: { marginTop: 60 } })
      return
    }
    if (outputStatus === 'error' || outputStatus === 'skipped') {
      const error = text(workflow.state.audio_outputs?.message)
        || (outputStatus === 'skipped' ? '没有可合成的音频片段。' : '音频后处理失败。')
      setRunState({ status: 'failed', message: '', error })
      message.error({ content: `制作失败：${error}`, duration: 3, style: { marginTop: 60 } })
      return
    }
    if (verifiedFinalAudioPath(workflow.state)) {
      setRunState({ status: 'succeeded', message: '成品音频和制作报告已经写入本期节目。', error: '' })
      message.success({ content: '音频制作完成', duration: 2, style: { marginTop: 60 } })
      return
    }

    const error = '制作节点已经结束，但没有生成成品音频。请检查节点日志。'
    setRunState({ status: 'failed', message: '', error })
    message.error({ content: error, duration: 3, style: { marginTop: 60 } })
  }, [runState.status, workflow])

  useEffect(() => {
    if (!awaitedRunRef.current || workflow?.status !== 'running') return
    const nodeLabel = PRODUCE_NODE_LABELS[workflow.currentNode || '']
    if (nodeLabel) setRunState({ status: 'running', message: nodeLabel, error: '' })
  }, [workflow?.currentNode, workflow?.status])

  useEffect(() => {
    componentAliveRef.current = true
    return () => {
      componentAliveRef.current = false
      recordingRequestRef.current += 1
      recordingPendingRef.current = false
      if (recordingTimerRef.current) window.clearInterval(recordingTimerRef.current)
      const recorder = mediaRecorderRef.current
      if (recorder?.state === 'recording') recorder.stop()
      mediaStreamRef.current?.getTracks().forEach(track => track.stop())
    }
  }, [])

  const persistRecordings = useCallback(async (next: Record<string, StudioRecording>) => {
    recordingsRef.current = next
    setRecordings(next)
    await onUpdateWorkflow?.({ voice_segments: toPersistedRecordings(next, segments) })
  }, [onUpdateWorkflow, segments])

  const stopRecordingTimer = useCallback(() => {
    if (recordingTimerRef.current) window.clearInterval(recordingTimerRef.current)
    recordingTimerRef.current = null
  }, [])

  const startRecording = useCallback(async (segmentId: string) => {
    if (recordingPendingRef.current || mediaRecorderRef.current?.state === 'recording') {
      message.warning({ content: '请先结束当前录制。', duration: 2, style: { marginTop: 60 } })
      return
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      message.error({ content: '当前环境不支持麦克风录制。', duration: 2, style: { marginTop: 60 } })
      return
    }
    if (!onSaveRecording) {
      message.error({ content: '当前环境没有录音保存接口。', duration: 2, style: { marginTop: 60 } })
      return
    }

    const requestId = recordingRequestRef.current + 1
    recordingRequestRef.current = requestId
    recordingPendingRef.current = true
    setRecordingPending(true)
    let requestedStream: MediaStream | null = null
    let recorder: MediaRecorder | null = null

    try {
      requestedStream = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (
        requestId !== recordingRequestRef.current
        || !componentAliveRef.current
        || !visibleRef.current
      ) {
        requestedStream.getTracks().forEach(track => track.stop())
        return
      }

      const mimeType = preferredRecordingMimeType()
      recorder = mimeType
        ? new MediaRecorder(requestedStream, { mimeType })
        : new MediaRecorder(requestedStream)
      mediaRecorderRef.current = recorder
      mediaStreamRef.current = requestedStream
      const chunks: Blob[] = []
      const startedAt = Date.now()
      let recorderFailed = false
      recordingStartedAtRef.current = startedAt
      recordingSegmentRef.current = segmentId
      setRecordingTick(0)

      const recording: StudioRecording = {
        segmentId,
        status: 'recording',
        durationSeconds: 0,
      }
      const started = { ...recordingsRef.current, [segmentId]: recording }
      recordingsRef.current = started
      setRecordings(started)

      recorder.ondataavailable = event => {
        if (event.data?.size) chunks.push(event.data)
      }
      recorder.onerror = () => {
        recorderFailed = true
        stopRecordingTimer()
        requestedStream?.getTracks().forEach(track => track.stop())
        if (mediaRecorderRef.current === recorder) {
          mediaStreamRef.current = null
          mediaRecorderRef.current = null
          recordingSegmentRef.current = ''
        }
        if (!componentAliveRef.current) return
        const failed = {
          ...recordingsRef.current,
          [segmentId]: { segmentId, status: 'empty', durationSeconds: 0, error: '录音设备发生错误。' },
        } satisfies Record<string, StudioRecording>
        recordingsRef.current = failed
        setRecordings(failed)
        message.error({ content: '录音设备发生错误，本段不会保存或参与合成。', duration: 3, style: { marginTop: 60 } })
      }
      recorder.onstop = async () => {
        stopRecordingTimer()
        const durationSeconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000))
        const actualMimeType = recorder?.mimeType || mimeType || 'audio/webm'
        const blob = new Blob(chunks, { type: actualMimeType })
        requestedStream?.getTracks().forEach(track => track.stop())
        if (mediaRecorderRef.current === recorder) {
          mediaStreamRef.current = null
          mediaRecorderRef.current = null
          recordingSegmentRef.current = ''
        }

        if (!componentAliveRef.current || recorderFailed) return

        const saving = {
          ...recordingsRef.current,
          [segmentId]: { segmentId, status: 'saving' as const, durationSeconds },
        }
        recordingsRef.current = saving
        setRecordings(saving)

        try {
          if (blob.size === 0) throw new Error('录音数据为空')
          const saved = await onSaveRecording({
            episodeId: text(workflow?.state?.episode_id) || 'unknown',
            segmentId,
            mimeType: actualMimeType,
            durationSeconds,
            data: await blobArrayBuffer(blob),
          })
          if (!saved?.success || !saved.path) throw new Error('录音文件未能写入磁盘')
          if (!isAllowedArtifactPath(saved.path, 'audio')) throw new Error('录音保存接口返回了不受支持的文件类型')
          const next = {
            ...recordingsRef.current,
            [segmentId]: {
              segmentId,
              status: 'recorded' as const,
              durationSeconds: Number(saved.durationSeconds) || durationSeconds,
              path: saved.path,
              mimeType: saved.mimeType || actualMimeType,
              size: saved.size,
            },
          }
          await persistRecordings(next)
          message.success({ content: '录音已保存', duration: 1.5, style: { marginTop: 60 } })
        } catch (error: any) {
          const failed = {
            ...recordingsRef.current,
            [segmentId]: {
              segmentId,
              status: 'empty' as const,
              durationSeconds: 0,
              error: error?.message || String(error),
            },
          }
          recordingsRef.current = failed
          setRecordings(failed)
          message.error({ content: `录音保存失败：${error?.message || String(error)}`, duration: 3, style: { marginTop: 60 } })
        }
      }

      recorder.start(250)
      recordingTimerRef.current = window.setInterval(() => setRecordingTick(value => value + 1), 500)
    } catch (error: any) {
      stopRecordingTimer()
      requestedStream?.getTracks().forEach(track => track.stop())
      if (mediaRecorderRef.current === recorder || !recorder) {
        mediaStreamRef.current = null
        mediaRecorderRef.current = null
        recordingSegmentRef.current = ''
      }
      if (
        requestId !== recordingRequestRef.current
        || !componentAliveRef.current
        || !visibleRef.current
      ) return
      const failed = {
        ...recordingsRef.current,
        [segmentId]: {
          segmentId,
          status: 'empty' as const,
          durationSeconds: 0,
          error: error?.message || String(error),
        },
      }
      recordingsRef.current = failed
      setRecordings(failed)
      message.error({ content: `无法开始录音：${error?.message || String(error)}`, duration: 3, style: { marginTop: 60 } })
    } finally {
      if (requestId === recordingRequestRef.current) {
        recordingPendingRef.current = false
        if (componentAliveRef.current) setRecordingPending(false)
      }
    }
  }, [onSaveRecording, persistRecordings, stopRecordingTimer, workflow?.state?.episode_id])

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop()
  }, [])

  useEffect(() => {
    if (visible) return
    recordingRequestRef.current += 1
    recordingPendingRef.current = false
    setRecordingPending(false)
    stopRecordingTimer()
    if (mediaRecorderRef.current?.state === 'recording') {
      // Hiding the page must never leave the microphone running without controls.
      // Stopping here still lets the normal onstop path persist the captured audio.
      mediaRecorderRef.current.stop()
    }
    mediaStreamRef.current?.getTracks().forEach(track => track.stop())
  }, [stopRecordingTimer, visible])

  const removeRecording = useCallback(async (segmentId: string) => {
    if (recordingSegmentRef.current === segmentId) return
    const next = { ...recordingsRef.current }
    delete next[segmentId]
    await persistRecordings(next)
  }, [persistRecordings])

  const openArtifact = useCallback(async (
    targetPath: string,
    action: 'open' | 'reveal' = 'open',
    kind: ArtifactKind = 'audio',
  ) => {
    if (!targetPath) return
    if (!isAllowedArtifactPath(targetPath, kind)) {
      message.error({ content: '文件类型不受支持，已阻止交给系统打开。', duration: 3, style: { marginTop: 60 } })
      return
    }
    const result = action === 'reveal'
      ? await onShowItemInFolder?.(targetPath)
      : await onOpenPath?.(targetPath)
    if (!result?.success) {
      message.error({ content: result?.error || '无法打开文件，请确认文件仍然存在。', duration: 3, style: { marginTop: 60 } })
    }
  }, [onOpenPath, onShowItemInFolder])

  const handleProviderChange = useCallback((provider: AudioProvider) => {
    setUnsupportedEngine('')
    setAudioProvider(provider)
    const savedVoice = configuredVoice(provider, ttsConfig)
    setVoice(savedVoice || VOICE_PRESETS[provider][0]?.id || '')
  }, [ttsConfig])

  const saveNodeConfig = useCallback(async (nodeName: string, config: Record<string, any>) => {
    if (!window.electronAPI?.saveNodeConfig) throw new Error('当前环境没有节点配置保存接口。')
    const result = await window.electronAPI.saveNodeConfig(nodeName, config)
    if (!result?.success) throw new Error(result?.error || `${nodeName} 配置保存失败`)
  }, [])

  const saveConfigBatch = useCallback(async (changes: Array<{
    nodeName: string
    next: Record<string, any>
    previous: Record<string, any>
  }>) => {
    const applied: typeof changes = []
    try {
      for (const change of changes) {
        await saveNodeConfig(change.nodeName, change.next)
        applied.push(change)
      }
    } catch (error: any) {
      const rollback = await Promise.allSettled(
        applied.reverse().map(change => saveNodeConfig(change.nodeName, change.previous)),
      )
      const rollbackFailed = rollback.some(result => result.status === 'rejected')
      const detail = error?.message || String(error)
      throw new Error(rollbackFailed
        ? `${detail}；部分全局节点配置回滚失败，请在设置页核对。`
        : `${detail}；已回滚本次写入的全局节点配置。`)
    }
  }, [saveNodeConfig])

  const handleGenerate = useCallback(async () => {
    if (configLoading || !configReady || configError) {
      message.error({ content: '制作配置尚未成功读取，请重试后再制作。', duration: 3, style: { marginTop: 60 } })
      return
    }
    if (!scriptReady) {
      message.warning({ content: '请先回到写作页，保存完整的稿件分段。', duration: 3, style: { marginTop: 60 } })
      return
    }
    if (!onRunNodes || !onUpdateWorkflow) {
      message.error({ content: '当前环境没有制作节点执行接口。', duration: 3, style: { marginTop: 60 } })
      return
    }
    if (mode === 'recording' && !allRecorded) {
      message.warning({ content: `还需录制 ${segments.length - recordedSegments.length} 个段落。完整录制后才能合成。`, duration: 3, style: { marginTop: 60 } })
      return
    }
    if (mode === 'ai' && !providerConfigured) {
      const detail = unsupportedEngine
        ? `当前配置使用不受支持的语音引擎“${unsupportedEngine}”，请重新选择语音服务。`
        : '当前语音服务配置不完整，请先在设置页补齐必填字段。'
      message.warning({ content: detail, duration: 3, style: { marginTop: 60 } })
      return
    }
    if (postprocess.addBgm && !postprocess.bgmPath) {
      message.warning({ content: '已开启背景音乐，请填写可读取的音频文件路径。', duration: 3, style: { marginTop: 60 } })
      return
    }

    setRunState({ status: 'saving', message: '保存制作配置', error: '' })
    const previousArtifacts = {
      voice_segments: structuredClone(workflow?.state?.voice_segments || []),
      audio_outputs: structuredClone(workflow?.state?.audio_outputs || {}),
      cover_path: workflow?.state?.cover_path || '',
    }
    let artifactsCleared = false
    try {
      const nextTtsConfig = {
        ...ttsConfig,
        engine: audioProvider,
        default_voice: voice,
        voice_mapping: { ...(ttsConfig.voice_mapping || {}), 'Host A': voice },
        ...((audioProvider === 'doubao_tts' || audioProvider === 'voice_clone')
          ? { doubao_voice_type: voice }
          : {}),
        rate,
        volume: text(ttsConfig.volume) || '+0%',
        output_format: audioProvider === 'openai-compatible'
          ? (text(ttsConfig.output_format) || 'mp3')
          : 'mp3',
      }
      const nextPostprocessConfig = {
        ...postprocessConfig,
        output_format: postprocess.outputFormat,
        segment_pause_ms: postprocess.segmentPauseMs,
        normalize_loudness: postprocess.normalizeLoudness,
        trim_silence: postprocess.trimSilence,
        add_bgm: postprocess.addBgm,
        bgm_path: postprocess.addBgm ? postprocess.bgmPath : '',
        bgm_volume: postprocess.bgmVolume,
      }
      const nextAssetsConfig = { ...assetsConfig, generate_cover: generateCover }

      await saveConfigBatch([
        ...(mode === 'ai' ? [{ nodeName: 'tts', next: nextTtsConfig, previous: ttsConfig }] : []),
        { nodeName: 'audio_postprocess', next: nextPostprocessConfig, previous: postprocessConfig },
        { nodeName: 'assets', next: nextAssetsConfig, previous: assetsConfig },
      ])
      setTtsConfig(nextTtsConfig)
      setPostprocessConfig(nextPostprocessConfig)
      setAssetsConfig(nextAssetsConfig)

      const recordingItems = toPersistedRecordings(recordingsRef.current, segments)
      await onUpdateWorkflow({
        voice_segments: mode === 'recording' ? recordingItems : [],
        audio_outputs: {},
        ...(generateCover ? {} : { cover_path: '' }),
      })
      artifactsCleared = true

      awaitedRunRef.current = {
        errorCount: workflow?.state?.errors?.length || 0,
        executionComplete: false,
      }
      setRunState({ status: 'running', message: mode === 'ai' ? '生成分段语音' : '合成真人录音', error: '' })
      const nodes = mode === 'ai' ? ['tts', 'audio_postprocess'] : ['audio_postprocess']
      if (generateCover) nodes.push('assets')
      await onRunNodes(nodes)
      if (awaitedRunRef.current) awaitedRunRef.current.executionComplete = true
      setRunState(current => current.status === 'failed' || current.status === 'succeeded'
        ? current
        : { status: 'awaiting-result', message: '核对成品文件', error: '' })
    } catch (error: any) {
      awaitedRunRef.current = null
      let detail = error?.message || String(error)
      if (artifactsCleared) {
        try {
          await onUpdateWorkflow(previousArtifacts)
        } catch (restoreError: any) {
          detail += `；旧成品引用恢复失败：${restoreError?.message || String(restoreError)}`
        }
      }
      setRunState({ status: 'failed', message: '', error: detail })
      message.error({ content: `制作失败：${detail}`, duration: 3, style: { marginTop: 60 } })
    }
  }, [
    allRecorded,
    assetsConfig,
    audioProvider,
    configError,
    configLoading,
    configReady,
    generateCover,
    mode,
    onRunNodes,
    onUpdateWorkflow,
    postprocess,
    postprocessConfig,
    providerConfigured,
    rate,
    recordedSegments.length,
    saveConfigBatch,
    scriptReady,
    segments,
    ttsConfig,
    unsupportedEngine,
    voice,
    workflow?.state?.errors?.length,
    workflow?.state?.audio_outputs,
    workflow?.state?.cover_path,
    workflow?.state?.voice_segments,
  ])

  const progress = runState.status === 'saving'
    ? 10
    : runState.status === 'awaiting-result'
      ? 95
      : workflow?.currentNode === 'tts'
        ? 30
        : workflow?.currentNode === 'audio_postprocess'
          ? 65
          : workflow?.currentNode === 'assets'
            ? 88
            : runState.status === 'succeeded'
              ? 100
              : isBusy
                ? 18
                : 0

  const activeRecordingDuration = activeRecording?.status === 'recording'
    ? Math.max(0, Math.floor((Date.now() - recordingStartedAtRef.current) / 1000)) + recordingTick * 0
    : activeRecording?.durationSeconds || 0

  if (!visible) return null

  return (
    <div className="stage-workbench produce-workbench">
      <StageHeader
        title="声音制作"
        center={
          <div className="produce-mode-switch" role="group" aria-label="制作方式">
            <button
              type="button"
              className={mode === 'ai' ? 'is-active' : ''}
              aria-pressed={mode === 'ai'}
              disabled={isBusy || recordingLocked}
              onClick={() => setMode('ai')}
            >
              <SoundOutlined /> AI 语音
            </button>
            <button
              type="button"
              className={mode === 'recording' ? 'is-active' : ''}
              aria-pressed={mode === 'recording'}
              disabled={isBusy || recordingLocked}
              onClick={() => setMode('recording')}
            >
              <AudioOutlined /> 真人录音
            </button>
          </div>
        }
        actions={
          <>
            <Button
              type="primary"
              icon={isBusy ? <LoadingOutlined spin /> : <ReloadOutlined />}
              loading={isBusy}
              disabled={
                configLoading
                || !configReady
                || Boolean(configError)
                || !scriptReady
                || (mode === 'ai' && Boolean(unsupportedEngine))
              }
              onClick={handleGenerate}
            >
              {finalAudioPath ? '重新制作' : '制作成品'}
            </Button>
            <Button
              aria-label="关闭制作页"
              icon={<CloseOutlined />}
              disabled={isBusy || recordingLocked}
              title={isBusy ? '请等待当前制作完成' : recordingLocked ? '请等待麦克风就绪或先结束当前录制' : undefined}
              onClick={onClose}
            />
          </>
        }
        previous={onBackToWriting ? {
          label: '返回写作',
          disabled: isBusy || recordingLocked,
          tooltip: isBusy ? '请等待当前制作完成' : recordingLocked ? '请等待麦克风就绪或先结束当前录制' : undefined,
          onClick: onBackToWriting,
        } : undefined}
        next={{
          label: '进入发布',
          disabled: !finalAudioPath || isBusy,
          tooltip: finalAudioPath ? undefined : '先生成可用的成品音频',
          onClick: onProceedToPublish,
        }}
      />

      <div className="produce-layout">
        <aside className="produce-segments" aria-label="稿件分段">
          <div className="produce-episode-summary">
            <span className="produce-eyebrow">本期节目</span>
            <h2>{episodeTitle || '未命名节目'}</h2>
            <div className="produce-readiness">
              <span>{segments.length} 个段落</span>
              <span>约 {formatTime(segments.reduce((sum, segment) => sum + segment.estimatedSeconds, 0))}</span>
              <span>{scriptSelection.source === 'edited_script' ? '人工编辑稿' : scriptSelection.source === 'script' ? '生成稿' : '兼容分段'}</span>
            </div>
          </div>

          {!scriptReady && (
            <Alert
              type="warning"
              showIcon
              message="稿件尚未就绪"
              description="请回到写作页保存包含正文的分段稿件。"
            />
          )}

          <div className="produce-segment-list">
            {segments.map((segment, index) => {
              const recording = recordings[segment.id]
              const generated = voiceSegments.find(item => item.segment_id === segment.id)
              const ready = mode === 'recording'
                ? recording?.status === 'recorded' && isAllowedArtifactPath(recording.path || '', 'audio')
                : isAllowedArtifactPath(generated?.path || '', 'audio')
              return (
                <button
                  type="button"
                  key={segment.id}
                  className={`produce-segment-item ${activeSegment?.id === segment.id ? 'is-active' : ''}`}
                  onClick={() => setActiveSegmentId(segment.id)}
                  disabled={recordingLocked && activeSegment?.id !== segment.id}
                  title={recordingLocked && activeSegment?.id !== segment.id
                    ? '请先结束当前录制，再切换片段'
                    : undefined}
                >
                  <span className="produce-segment-index" style={{ borderColor: segment.color, color: segment.color }}>
                    {index + 1}
                  </span>
                  <span className="produce-segment-copy">
                    <strong>{segment.label}</strong>
                    <small>{segment.speaker} · {formatTime(segment.estimatedSeconds)}</small>
                  </span>
                  <span className={`produce-segment-state ${ready ? 'is-ready' : ''}`}>
                    {ready ? <CheckCircleOutlined /> : mode === 'recording' ? '待录' : '待生成'}
                  </span>
                </button>
              )
            })}
            {segments.length === 0 && <div className="produce-empty-list">没有可制作的稿件分段。</div>}
          </div>

          {mode === 'recording' && segments.length > 0 && (
            <div className="produce-recording-total">
              <span>录制进度</span>
              <strong>{recordedSegments.length}/{segments.length}</strong>
              <Progress percent={Math.round((recordedSegments.length / segments.length) * 100)} showInfo={false} size="small" />
            </div>
          )}
        </aside>

        <main className="produce-main">
          {configError && (
            <Alert
              className="produce-alert"
              type="error"
              showIcon
              message="配置读取失败"
              description={configError}
              action={<Button size="small" onClick={() => setConfigLoadAttempt(value => value + 1)}>重新读取</Button>}
            />
          )}
          {hasUnverifiedFinalAudio && (
            <Alert
              className="produce-alert"
              type="warning"
              showIcon
              message="已有成品记录无法验证"
              description="成品路径与制作报告元数据不完整或不一致。请重新制作，验证通过后才能进入发布。"
            />
          )}
          {runState.status === 'failed' && (
            <Alert className="produce-alert" type="error" showIcon message="本次制作未完成" description={runState.error} />
          )}
          {audioOutputs.degraded && finalAudioPath && (
            <Alert
              className="produce-alert"
              type="warning"
              showIcon
              message="已使用兼容模式输出"
              description="当前环境的 pydub/ffmpeg 处理不可用，成品已降级为基础 WAV 合成；制作报告记录了降级原因。"
            />
          )}

          {isBusy && (
            <section className="produce-run-card" aria-live="polite">
              <div className="produce-run-icon"><LoadingOutlined spin /></div>
              <div className="produce-run-copy">
                <span className="produce-eyebrow">正在执行真实制作节点</span>
                <h2>{runState.message || '正在制作'}</h2>
                <p>请保持应用运行。完成后会核对成品路径和节点错误，不会用模拟进度冒充成功。</p>
                <Progress percent={progress} status="active" showInfo={false} />
              </div>
            </section>
          )}

          {!isBusy && finalAudioPath && (
            <section className="produce-artifact-card">
              <div className="produce-artifact-heading">
                <div className="produce-artifact-icon"><SoundOutlined /></div>
                <div>
                  <span className="produce-eyebrow">可发布成品</span>
                  <h2>{fileName(finalAudioPath)}</h2>
                  <p>
                    {formatTime(Number(audioOutputs.duration_seconds))}
                    {' · '}{String(audioOutputs.format || '').toUpperCase() || '音频'}
                    {' · '}{formatBytes(audioOutputs.file_size)}
                  </p>
                </div>
                <Tag color={audioOutputs.degraded ? 'orange' : 'green'}>
                  {audioOutputs.degraded ? '降级输出' : '制作完成'}
                </Tag>
              </div>
              <div className="produce-artifact-actions">
                <Button type="primary" icon={<PlayCircleOutlined />} onClick={() => openArtifact(finalAudioPath)}>
                  用系统播放器试听
                </Button>
                <Button icon={<FolderOpenOutlined />} onClick={() => openArtifact(finalAudioPath, 'reveal')}>
                  在文件夹中显示
                </Button>
                {audioReportPath && (
                  <Button icon={<FileTextOutlined />} onClick={() => openArtifact(audioReportPath, 'open', 'report')}>
                    制作报告
                  </Button>
                )}
                {coverPath && (
                  <Button icon={<FileImageOutlined />} onClick={() => openArtifact(coverPath, 'open', 'image')}>
                    查看封面
                  </Button>
                )}
              </div>
              {Array.isArray(audioOutputs.missing_segments) && audioOutputs.missing_segments.length > 0 && (
                <Alert
                  type="warning"
                  showIcon
                  message={`有 ${audioOutputs.missing_segments.length} 个源文件缺失，成品只包含可读取片段。`}
                />
              )}
            </section>
          )}

          {!isBusy && activeSegment && (
            <section className="produce-script-card">
              <div className="produce-script-meta">
                <span className="produce-segment-index large" style={{ borderColor: activeSegment.color, color: activeSegment.color }}>
                  {segments.findIndex(item => item.id === activeSegment.id) + 1}
                </span>
                <div>
                  <span className="produce-eyebrow">{activeSegment.speaker}</span>
                  <h2>{activeSegment.label}</h2>
                </div>
                <Tag>{formatTime(activeSegment.estimatedSeconds)}</Tag>
              </div>
              <p className="produce-script-text">{activeSegment.content}</p>

              {mode === 'ai' ? (
                <div className="produce-segment-action">
                  {activeVoicePath ? (
                    <>
                      <div>
                        <strong>分段语音已生成</strong>
                        <small>{fileName(activeVoicePath)} · {activeVoiceSegment?.voice}</small>
                      </div>
                      <Button icon={<PlayCircleOutlined />} onClick={() => openArtifact(activeVoicePath)}>
                        试听真实文件
                      </Button>
                    </>
                  ) : (
                    <div>
                      <strong>尚未生成分段语音</strong>
                      <small>配置声音后点击“制作成品”，TTS 节点会生成可试听的实际文件。</small>
                    </div>
                  )}
                </div>
              ) : (
                <div className="produce-segment-action recording">
                  <div>
                    <strong>
                      {recordingPending
                        ? '正在请求麦克风权限'
                        : activeRecording?.status === 'recording'
                          ? `录制中 ${formatTime(activeRecordingDuration)}`
                          : activeRecording?.status === 'saving'
                            ? '正在保存录音'
                            : activeRecording?.status === 'recorded'
                              ? `录音已保存 · ${formatTime(activeRecording.durationSeconds)}`
                              : '等待录制'}
                    </strong>
                    <small>
                      {activeRecording?.path
                        ? `${fileName(activeRecording.path)} · ${formatBytes(activeRecording.size)}`
                        : activeRecording?.error || '录音会逐段写入本期节目目录，并在全部完成后合成为成品。'}
                    </small>
                  </div>
                  <div className="produce-inline-actions">
                    {recordingPending ? (
                      <Button danger type="primary" icon={<AudioOutlined />} loading disabled>正在连接麦克风</Button>
                    ) : activeRecording?.status === 'recording' ? (
                      <Button danger type="primary" icon={<StopOutlined />} onClick={stopRecording}>结束录制</Button>
                    ) : activeRecording?.status === 'saving' ? (
                      <Button loading disabled>保存中</Button>
                    ) : activeRecording?.status === 'recorded' ? (
                      <>
                        <Button icon={<PlayCircleOutlined />} onClick={() => openArtifact(activeRecording.path || '')}>试听</Button>
                        <Button onClick={() => removeRecording(activeSegment.id)}>移出合成</Button>
                        <Button icon={<ReloadOutlined />} onClick={async () => {
                          await removeRecording(activeSegment.id)
                          await startRecording(activeSegment.id)
                        }}>重录</Button>
                      </>
                    ) : (
                      <Button danger type="primary" icon={<AudioOutlined />} onClick={() => startRecording(activeSegment.id)}>
                        开始录制
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </section>
          )}

          {!isBusy && !finalAudioPath && (
            <section className="produce-checklist">
              <div>
                <span className="produce-eyebrow">成品检查</span>
                <h2>制作链路</h2>
              </div>
              <ol>
                <li className={scriptReady ? 'is-complete' : ''}>
                  <CheckCircleOutlined />
                  <span><strong>稿件分段</strong><small>{scriptReady ? '正文完整，可以制作' : '需要返回写作页补齐'}</small></span>
                </li>
                <li className={(mode === 'ai' ? providerConfigured : allRecorded) ? 'is-complete' : ''}>
                  {mode === 'ai' ? <SoundOutlined /> : <AudioOutlined />}
                  <span>
                    <strong>{mode === 'ai' ? '语音提供方' : '真人录音'}</strong>
                    <small>{mode === 'ai' ? (providerConfigured ? '配置可用' : '远程接口配置不完整') : `${recordedSegments.length}/${segments.length} 段已保存`}</small>
                  </span>
                </li>
                <li><ReloadOutlined /><span><strong>音频合成</strong><small>按当前停顿、响度、静音和 BGM 设置处理</small></span></li>
                <li><FileImageOutlined /><span><strong>节目资产</strong><small>{generateCover ? '同步生成封面' : '本次不生成封面'}</small></span></li>
              </ol>
            </section>
          )}
        </main>

        <aside className="produce-settings" aria-label="制作设置">
          {configLoading ? (
            <div className="produce-settings-loading"><LoadingOutlined spin /> 正在读取节点配置</div>
          ) : !configReady ? (
            <div className="produce-settings-loading">
              <WarningOutlined /> 配置不可用
              <Button size="small" onClick={() => setConfigLoadAttempt(value => value + 1)}>重新读取</Button>
            </div>
          ) : (
            <>
              {mode === 'ai' && (
                <section className="produce-settings-section">
                  <div className="produce-settings-title">
                    <div><span className="produce-eyebrow">语音生成</span><h3>声音</h3></div>
                    <Tag color={providerConfigured ? 'green' : 'orange'}>
                      {unsupportedEngine ? '引擎不受支持' : providerConfigured ? '配置可用' : '待配置'}
                    </Tag>
                  </div>
                  <label>
                    <span>服务</span>
                    <Select
                      aria-label="语音服务"
                      value={unsupportedEngine ? undefined : audioProvider}
                      placeholder={unsupportedEngine ? `不支持：${unsupportedEngine}` : undefined}
                      disabled={isBusy}
                      options={AUDIO_PROVIDERS.map(item => ({ value: item.id, label: item.label }))}
                      onChange={handleProviderChange}
                    />
                  </label>
                  <p className="produce-field-help">
                    {AUDIO_PROVIDERS.find(item => item.id === audioProvider)?.description}
                  </p>
                  {unsupportedEngine && (
                    <Alert
                      type="error"
                      showIcon
                      message={`当前节点引擎“${unsupportedEngine}”不受制作页支持`}
                      description="请选择受支持的服务后再制作；页面不会静默覆盖原配置。"
                    />
                  )}
                  {audioProvider !== 'edge-tts' && !providerConfigured && (
                    <Alert type="warning" showIcon message="请在设置页完善语音 API 配置" />
                  )}
                  {!unsupportedEngine && (
                    <div className="produce-voice-grid">
                      {visibleVoicePresets.map(item => (
                        <button
                          type="button"
                          key={item.id}
                          className={voice === item.id ? 'is-active' : ''}
                          aria-pressed={voice === item.id}
                          disabled={isBusy}
                          onClick={() => setVoice(item.id)}
                        >
                          <strong>{item.label}</strong>
                          <small>{item.description}</small>
                        </button>
                      ))}
                    </div>
                  )}
                  <label>
                    <span>语速</span>
                    <Select
                      value={rate}
                      disabled={isBusy}
                      options={RATE_OPTIONS.map(item => ({ value: item.value, label: item.label }))}
                      onChange={setRate}
                    />
                  </label>
                </section>
              )}

              <section className="produce-settings-section">
                <div className="produce-settings-title"><div><span className="produce-eyebrow">音频后处理</span><h3>成品规格</h3></div></div>
                <label>
                  <span>输出格式</span>
                  <Select
                    value={postprocess.outputFormat}
                    disabled={isBusy}
                    options={OUTPUT_FORMATS}
                    onChange={(value: OutputFormat) => setPostprocess(current => ({ ...current, outputFormat: value }))}
                  />
                </label>
                <label>
                  <span>段间停顿 <strong>{postprocess.segmentPauseMs} ms</strong></span>
                  <Slider
                    min={0}
                    max={2000}
                    step={100}
                    value={postprocess.segmentPauseMs}
                    disabled={isBusy}
                    onChange={value => setPostprocess(current => ({ ...current, segmentPauseMs: value }))}
                  />
                </label>
                <div className="produce-switch-row">
                  <span><strong>响度标准化</strong><small>统一各段音量</small></span>
                  <Switch aria-label="响度标准化" checked={postprocess.normalizeLoudness} disabled={isBusy} onChange={value => setPostprocess(current => ({ ...current, normalizeLoudness: value }))} />
                </div>
                <div className="produce-switch-row">
                  <span><strong>裁剪静音</strong><small>移除每段过长的无声区</small></span>
                  <Switch aria-label="裁剪静音" checked={postprocess.trimSilence} disabled={isBusy} onChange={value => setPostprocess(current => ({ ...current, trimSilence: value }))} />
                </div>
              </section>

              <section className="produce-settings-section">
                <div className="produce-settings-title"><div><span className="produce-eyebrow">混音</span><h3>背景音乐</h3></div></div>
                <div className="produce-switch-row">
                  <span><strong>叠加 BGM</strong><small>循环并铺满成品时长</small></span>
                  <Switch aria-label="叠加背景音乐" checked={postprocess.addBgm} disabled={isBusy} onChange={value => setPostprocess(current => ({ ...current, addBgm: value }))} />
                </div>
                {postprocess.addBgm && (
                  <>
                    <label>
                      <span>音频文件路径</span>
                      <Input
                        aria-label="背景音乐文件路径"
                        value={postprocess.bgmPath}
                        disabled={isBusy}
                        placeholder="例如 D:\\Music\\podcast-bed.mp3"
                        onChange={event => setPostprocess(current => ({ ...current, bgmPath: event.target.value }))}
                      />
                    </label>
                    <p className="produce-field-help"><WarningOutlined /> 路径必须可被桌面应用读取；不存在时制作会明确失败。</p>
                    <label>
                      <span>背景音量 <strong>{Math.round(postprocess.bgmVolume * 100)}%</strong></span>
                      <Slider
                        min={0.01}
                        max={0.5}
                        step={0.01}
                        value={postprocess.bgmVolume}
                        disabled={isBusy}
                        onChange={value => setPostprocess(current => ({ ...current, bgmVolume: value }))}
                      />
                    </label>
                  </>
                )}
              </section>

              <section className="produce-settings-section">
                <div className="produce-switch-row">
                  <span><strong>生成节目封面</strong><small>运行资产节点并写入 cover_path</small></span>
                  <Switch aria-label="生成节目封面" checked={generateCover} disabled={isBusy} onChange={setGenerateCover} />
                </div>
              </section>
            </>
          )}
        </aside>
      </div>
    </div>
  )
}
