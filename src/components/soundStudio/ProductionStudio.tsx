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
import type {
  ProductionClip,
  ProductionMusicSlot,
  ProductionPlan,
  VoiceSegment,
  Workflow,
} from '../../types/workflow'
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
import { planContentSignature, reconcileProductionPlan } from './productionPlan'
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
  units: Array<{ id: string; text?: string; content?: string; speaker: string; parent_segment_id?: string }>,
): VoiceSegment[] {
  return units.flatMap(unit => {
    const recording = recordings[unit.id]
    if (!recording?.path || recording.status !== 'recorded' || !isAllowedArtifactPath(recording.path, 'audio')) return []
    return [{
      segment_id: unit.id,
      parent_segment_id: unit.parent_segment_id || unit.id,
      path: recording.path,
      text: unit.text || unit.content || '',
      speaker: unit.speaker,
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
  const workflowScriptSegments = useMemo(
    () => workflow?.state?.edited_script?.segments || [],
    [workflow?.state?.edited_script?.segments],
  )
  const voiceSegments = useMemo(
    () => workflow?.state?.voice_segments || [],
    [workflow?.state?.voice_segments],
  )
  const savedProductionPlan = workflow?.state?.production_plan
  const legacyIntroPath = workflow?.state?.intro_outro_paths?.intro
  const legacyOutroPath = workflow?.state?.intro_outro_paths?.outro
  const recordingSignature = JSON.stringify(voiceSegments)
  const restoredRecordings = useMemo(
    () => savedRecordings(JSON.parse(recordingSignature) as VoiceSegment[]),
    [recordingSignature],
  )
  const [mode, setMode] = useState<StudioMode>('ai')
  const [activeSegmentId, setActiveSegmentId] = useState('')
  const [activeClipId, setActiveClipId] = useState('')
  const [clipGeneratingId, setClipGeneratingId] = useState('')
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
  const reconciledPlan = useMemo(
    () => reconcileProductionPlan(
      workflowScriptSegments,
      savedProductionPlan,
      voiceSegments,
    ),
    [savedProductionPlan, voiceSegments, workflowScriptSegments],
  )
  const reconciledPlanSignature = planContentSignature(reconciledPlan)
  const [productionPlan, setProductionPlan] = useState<ProductionPlan>(reconciledPlan)
  const productionPlanRef = useRef(productionPlan)
  const voiceSegmentsRef = useRef(voiceSegments)
  const recordedSegments = toPersistedRecordings(recordings, productionPlan.clips)
  const isBusy = ['saving', 'running', 'awaiting-result'].includes(runState.status)
  const recordingLocked = recordingPending || Boolean(recordingSegmentRef.current)
  const activeSegment = segments.find(segment => segment.id === activeSegmentId) || segments[0]
  const activeClips = productionPlan.clips.filter(clip => clip.parent_segment_id === activeSegment?.id)
  const activeClip = activeClips.find(clip => clip.id === activeClipId) || activeClips[0]
  const activeRecording = activeClip ? recordings[activeClip.id] : undefined
  const scriptReady = segments.length > 0 && segments.every(segment => Boolean(segment.content))
  const ttsClipCount = productionPlan.clips.filter(clip => clip.source === 'tts').length
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
    productionPlanRef.current = productionPlan
  }, [productionPlan])

  useEffect(() => {
    voiceSegmentsRef.current = voiceSegments
  }, [voiceSegments])

  useEffect(() => {
    setProductionPlan(current => (
      planContentSignature(current) === reconciledPlanSignature ? current : reconciledPlan
    ))
  }, [reconciledPlan, reconciledPlanSignature])

  useEffect(() => {
    if (!activeSegmentId || !segments.some(segment => segment.id === activeSegmentId)) {
      setActiveSegmentId(segments[0]?.id || '')
    }
  }, [activeSegmentId, segments])

  useEffect(() => {
    if (!activeClipId || !activeClips.some(clip => clip.id === activeClipId)) {
      setActiveClipId(activeClips[0]?.id || '')
    }
  }, [activeClipId, activeClips])

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
        if (!savedProductionPlan?.version) {
          const legacyIntro = text(legacyIntroPath)
          const legacyOutro = text(legacyOutroPath)
          setProductionPlan(current => {
            const migrated: ProductionPlan = {
              ...current,
              joins: current.joins.map(join => ({
                ...join,
                duration_ms: clamp(
                  finiteNumber(nextPostprocess.segment_pause_ms, join.duration_ms),
                  0,
                  5000,
                ),
              })),
              render: {
                ...current.render,
                output_format: OUTPUT_FORMATS.some(item => item.value === nextPostprocess.output_format)
                  ? nextPostprocess.output_format as OutputFormat
                  : current.render.output_format,
                normalize_loudness: nextPostprocess.normalize_loudness !== false,
              },
              music: {
                ...current.music,
                intro: legacyIntro ? { ...current.music.intro, enabled: true, path: legacyIntro } : current.music.intro,
                outro: legacyOutro ? { ...current.music.outro, enabled: true, path: legacyOutro } : current.music.outro,
                bed: {
                  ...current.music.bed,
                  enabled: Boolean(nextPostprocess.add_bgm),
                  path: text(nextPostprocess.bgm_path),
                  volume: clamp(finiteNumber(nextPostprocess.bgm_volume, DEFAULT_POSTPROCESS.bgmVolume), 0.01, 1),
                },
              },
            }
            productionPlanRef.current = migrated
            return migrated
          })
        }
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
  }, [
    configLoadAttempt,
    legacyIntroPath,
    legacyOutroPath,
    savedProductionPlan?.version,
    visible,
    workflow?.state?.episode_id,
  ])

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

  const persistProductionPlan = useCallback(async (
    next: ProductionPlan,
    voicePatch?: VoiceSegment[],
  ) => {
    const timestamped = { ...next, updated_at: new Date().toISOString() }
    productionPlanRef.current = timestamped
    setProductionPlan(timestamped)
    await onUpdateWorkflow?.({
      production_plan: timestamped,
      audio_outputs: {},
      ...(voicePatch ? { voice_segments: voicePatch } : {}),
    })
  }, [onUpdateWorkflow])

  const persistRecordings = useCallback(async (next: Record<string, StudioRecording>) => {
    recordingsRef.current = next
    setRecordings(next)
    const recordingItems = toPersistedRecordings(next, productionPlanRef.current.clips)
    const recordingIds = new Set(recordingItems.map(item => item.segment_id))
    const mergedVoiceSegments = [
      ...voiceSegmentsRef.current.filter(item => item.engine !== 'recording' && !recordingIds.has(item.segment_id)),
      ...recordingItems,
    ]
    const nextPlan: ProductionPlan = {
      ...productionPlanRef.current,
      clips: productionPlanRef.current.clips.map(clip => {
        const recording = next[clip.id]
        if (recording?.status === 'recorded' && recording.path) {
          return {
            ...clip,
            source: 'recording',
            path: recording.path,
            duration_seconds: recording.durationSeconds,
            trim_start_ms: 0,
            trim_end_ms: 0,
            generation_key: '',
          }
        }
        if (clip.source === 'recording') {
          return { ...clip, source: 'tts', path: '', duration_seconds: 0, generation_key: '' }
        }
        return clip
      }),
    }
    await persistProductionPlan(nextPlan, mergedVoiceSegments)
  }, [persistProductionPlan])

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

  const buildTtsConfig = useCallback(() => ({
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
  }), [audioProvider, rate, ttsConfig, voice])

  const updateClip = useCallback(async (clipId: string, patch: Partial<ProductionClip>) => {
    const next: ProductionPlan = {
      ...productionPlanRef.current,
      clips: productionPlanRef.current.clips.map(clip => clip.id === clipId ? { ...clip, ...patch } : clip),
    }
    await persistProductionPlan(next)
  }, [persistProductionPlan])

  const previewClip = useCallback((clipId: string, patch: Partial<ProductionClip>) => {
    const next: ProductionPlan = {
      ...productionPlanRef.current,
      clips: productionPlanRef.current.clips.map(clip => clip.id === clipId ? { ...clip, ...patch } : clip),
    }
    productionPlanRef.current = next
    setProductionPlan(next)
  }, [])

  const chooseClipFile = useCallback(async (clip: ProductionClip) => {
    const result = await window.electronAPI?.selectAudioFile?.()
    if (!result?.success || !result.path) return
    await updateClip(clip.id, {
      source: 'local',
      path: result.path,
      duration_seconds: 0,
      trim_start_ms: 0,
      trim_end_ms: 0,
      generation_key: '',
    })
  }, [updateClip])

  const updateJoin = useCallback(async (
    clipId: string,
    patch: Partial<ProductionPlan['joins'][number]>,
  ) => {
    const next: ProductionPlan = {
      ...productionPlanRef.current,
      joins: productionPlanRef.current.joins.map(join => (
        join.after_clip_id === clipId ? { ...join, ...patch } : join
      )),
      music: patch.type === 'transition'
        ? {
            ...productionPlanRef.current.music,
            transition: { ...productionPlanRef.current.music.transition, enabled: true },
          }
        : productionPlanRef.current.music,
    }
    await persistProductionPlan(next)
  }, [persistProductionPlan])

  const updateMusic = useCallback(async (
    name: keyof ProductionPlan['music'],
    patch: Partial<ProductionMusicSlot>,
  ) => {
    const next: ProductionPlan = {
      ...productionPlanRef.current,
      music: {
        ...productionPlanRef.current.music,
        [name]: { ...productionPlanRef.current.music[name], ...patch },
      },
    }
    await persistProductionPlan(next)
  }, [persistProductionPlan])

  const chooseMusicFile = useCallback(async (name: keyof ProductionPlan['music']) => {
    if (!window.electronAPI?.selectAudioFile) {
      message.warning({ content: '当前环境没有音频文件选择接口。', duration: 2, style: { marginTop: 60 } })
      return
    }
    const result = await window.electronAPI.selectAudioFile()
    if (!result.success || !result.path) return
    await updateMusic(name, { path: result.path, enabled: true })
  }, [updateMusic])

  const regenerateClip = useCallback(async (clip: ProductionClip) => {
    if (!onRunNodes || !onUpdateWorkflow || clipGeneratingId) return
    if (!providerConfigured) {
      message.warning({ content: '请先配置可用的语音服务。', duration: 2, style: { marginTop: 60 } })
      return
    }
    setClipGeneratingId(clip.id)
    try {
      const nextTtsConfig = buildTtsConfig()
      await saveNodeConfig('tts', nextTtsConfig)
      setTtsConfig(nextTtsConfig)
      const nextPlan: ProductionPlan = {
        ...productionPlanRef.current,
        clips: productionPlanRef.current.clips.map(item => item.id === clip.id
          ? { ...item, source: 'tts', path: '', duration_seconds: 0, generation_key: '' }
          : item),
        updated_at: new Date().toISOString(),
      }
      const nextVoices = voiceSegmentsRef.current.filter(item => item.segment_id !== clip.id)
      await onUpdateWorkflow({ production_plan: nextPlan, voice_segments: nextVoices, audio_outputs: {} })
      productionPlanRef.current = nextPlan
      setProductionPlan(nextPlan)
      await onRunNodes(['tts'])
      message.success({ content: '这一语音块已重新生成，其他片段保持不变。', duration: 2, style: { marginTop: 60 } })
    } catch (error: any) {
      message.error({ content: `语音块生成失败：${error?.message || String(error)}`, duration: 3, style: { marginTop: 60 } })
    } finally {
      setClipGeneratingId('')
    }
  }, [buildTtsConfig, clipGeneratingId, onRunNodes, onUpdateWorkflow, providerConfigured, saveNodeConfig])

  const handleGenerate = useCallback(async () => {
    const currentPlan = productionPlanRef.current
    const currentTtsClipCount = currentPlan.clips.filter(clip => clip.source === 'tts').length
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
    if (currentTtsClipCount > 0 && !providerConfigured) {
      const detail = unsupportedEngine
        ? `当前配置使用不受支持的语音引擎“${unsupportedEngine}”，请重新选择语音服务。`
        : '当前语音服务配置不完整，请先在设置页补齐必填字段。'
      message.warning({ content: detail, duration: 3, style: { marginTop: 60 } })
      return
    }
    const missingMusic = Object.entries(currentPlan.music)
      .find(([, slot]) => slot.enabled && !text(slot.path))
    if (missingMusic) {
      message.warning({ content: '已启用节目音乐，请先选择可读取的音频文件。', duration: 3, style: { marginTop: 60 } })
      return
    }

    setRunState({ status: 'saving', message: '保存制作配置', error: '' })
    const previousArtifacts = {
      voice_segments: structuredClone(workflow?.state?.voice_segments || []),
      production_plan: structuredClone(savedProductionPlan || {}),
      audio_outputs: structuredClone(workflow?.state?.audio_outputs || {}),
      cover_path: workflow?.state?.cover_path || '',
    }
    let artifactsCleared = false
    try {
      const nextTtsConfig = buildTtsConfig()
      const nextPostprocessConfig = {
        ...postprocessConfig,
        output_format: currentPlan.render.output_format,
        segment_pause_ms: postprocess.segmentPauseMs,
        normalize_loudness: currentPlan.render.normalize_loudness,
        trim_silence: postprocess.trimSilence,
        add_bgm: false,
        bgm_path: '',
      }
      const nextAssetsConfig = { ...assetsConfig, generate_cover: generateCover }

      await saveConfigBatch([
        ...(currentTtsClipCount > 0 ? [{ nodeName: 'tts', next: nextTtsConfig, previous: ttsConfig }] : []),
        { nodeName: 'audio_postprocess', next: nextPostprocessConfig, previous: postprocessConfig },
        { nodeName: 'assets', next: nextAssetsConfig, previous: assetsConfig },
      ])
      setTtsConfig(nextTtsConfig)
      setPostprocessConfig(nextPostprocessConfig)
      setAssetsConfig(nextAssetsConfig)

      const recordingItems = toPersistedRecordings(recordingsRef.current, currentPlan.clips)
      const recordingIds = new Set(recordingItems.map(item => item.segment_id))
      const nextVoiceSegments = [
        ...voiceSegmentsRef.current.filter(item => item.engine !== 'recording' && !recordingIds.has(item.segment_id)),
        ...recordingItems,
      ]
      await onUpdateWorkflow({
        production_plan: { ...currentPlan, updated_at: new Date().toISOString() },
        voice_segments: nextVoiceSegments,
        audio_outputs: {},
        ...(generateCover ? {} : { cover_path: '' }),
      })
      artifactsCleared = true

      awaitedRunRef.current = {
        errorCount: workflow?.state?.errors?.length || 0,
        executionComplete: false,
      }
      setRunState({ status: 'running', message: currentTtsClipCount > 0 ? '生成或复用语音块' : '合成真人录音', error: '' })
      const nodes = currentTtsClipCount > 0 ? ['tts', 'audio_postprocess'] : ['audio_postprocess']
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
    assetsConfig,
    buildTtsConfig,
    configError,
    configLoading,
    configReady,
    generateCover,
    onRunNodes,
    onUpdateWorkflow,
    postprocess,
    postprocessConfig,
    providerConfigured,
    saveConfigBatch,
    savedProductionPlan,
    scriptReady,
    ttsConfig,
    unsupportedEngine,
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
                || (ttsClipCount > 0 && Boolean(unsupportedEngine))
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
              const segmentClips = productionPlan.clips.filter(clip => clip.parent_segment_id === segment.id)
              const readyCount = segmentClips.filter(clip => {
                const generated = voiceSegments.find(item => item.segment_id === clip.id)
                return isAllowedArtifactPath(clip.path || generated?.path || '', 'audio')
              }).length
              const ready = segmentClips.length > 0 && readyCount === segmentClips.length
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
                    {ready ? <CheckCircleOutlined /> : `${readyCount}/${segmentClips.length}`}
                  </span>
                </button>
              )
            })}
            {segments.length === 0 && <div className="produce-empty-list">没有可制作的稿件分段。</div>}
          </div>

          {mode === 'recording' && productionPlan.clips.length > 0 && (
            <div className="produce-recording-total">
              <span>真人替换</span>
              <strong>{recordedSegments.length}/{productionPlan.clips.length}</strong>
              <Progress percent={Math.round((recordedSegments.length / productionPlan.clips.length) * 100)} showInfo={false} size="small" />
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
            <section className="produce-assembly-card">
              <div className="produce-assembly-heading">
                <span className="produce-segment-index large" style={{ borderColor: activeSegment.color, color: activeSegment.color }}>
                  {segments.findIndex(item => item.id === activeSegment.id) + 1}
                </span>
                <div>
                  <span className="produce-eyebrow">节目装配单 · {activeSegment.speaker}</span>
                  <h2>{activeSegment.label}</h2>
                  <p>{activeClips.length} 个可独立生成、替换和裁剪的语音块</p>
                </div>
                <Tag>{formatTime(activeSegment.estimatedSeconds)}</Tag>
              </div>

              <div className="produce-clip-stack">
                {activeClips.map((clip, clipIndex) => {
                  const voiceSegment = voiceSegments.find(item => item.segment_id === clip.id)
                  const clipPath = isAllowedArtifactPath(clip.path || voiceSegment?.path || '', 'audio')
                    ? clip.path || voiceSegment?.path || ''
                    : ''
                  const recording = recordings[clip.id]
                  const durationMs = Math.max(100, Math.round(Number(clip.duration_seconds || voiceSegment?.duration_seconds || 0) * 1000))
                  const rangeEnd = Math.max(clip.trim_start_ms + 50, durationMs - clip.trim_end_ms)
                  const join = productionPlan.joins.find(item => item.after_clip_id === clip.id)
                  const isSelected = activeClip?.id === clip.id
                  const sourceLabel = clip.source === 'recording' ? '真人录音' : clip.source === 'local' ? '本地替换' : 'AI 语音'
                  return (
                    <div key={clip.id} className={`produce-clip-wrap ${isSelected ? 'is-active' : ''}`}>
                      <article
                        className="produce-clip-card"
                        onClick={() => setActiveClipId(clip.id)}
                      >
                        <div className="produce-clip-index">{clipIndex + 1}</div>
                        <div className="produce-clip-body">
                          <div className="produce-clip-meta">
                            <span>{sourceLabel}</span>
                            <span>{clipPath ? formatTime(Number(clip.duration_seconds || voiceSegment?.duration_seconds)) : '待生成'}</span>
                            {clip.trim_start_ms + clip.trim_end_ms > 0 && <span>已裁剪 {(clip.trim_start_ms + clip.trim_end_ms) / 1000}s</span>}
                          </div>
                          <p>{clip.text}</p>
                          <div className="produce-waveform" aria-hidden="true">
                            {Array.from({ length: 32 }, (_, bar) => (
                              <i key={bar} style={{ height: `${24 + ((bar * 17 + clipIndex * 13) % 58)}%` }} />
                            ))}
                          </div>
                          {clipPath && durationMs > 100 && (
                            <div className="produce-trim-row">
                              <span>首尾裁剪</span>
                              <Slider
                                range
                                min={0}
                                max={durationMs}
                                step={50}
                                value={[clip.trim_start_ms, rangeEnd]}
                                disabled={isBusy || recordingLocked}
                                onChange={value => previewClip(clip.id, {
                                  trim_start_ms: value[0],
                                  trim_end_ms: Math.max(0, durationMs - value[1]),
                                })}
                                onChangeComplete={value => void updateClip(clip.id, {
                                  trim_start_ms: value[0],
                                  trim_end_ms: Math.max(0, durationMs - value[1]),
                                })}
                              />
                              <strong>{(clip.trim_start_ms / 1000).toFixed(1)}s — {(rangeEnd / 1000).toFixed(1)}s</strong>
                            </div>
                          )}
                        </div>
                        <div className="produce-clip-actions">
                          {clipPath && (
                            <Button size="small" icon={<PlayCircleOutlined />} onClick={event => {
                              event.stopPropagation()
                              void openArtifact(clipPath)
                            }}>试听</Button>
                          )}
                          <Button size="small" onClick={event => {
                            event.stopPropagation()
                            void chooseClipFile(clip)
                          }}>替换文件</Button>
                          {mode === 'ai' ? (
                            <Button
                              size="small"
                              icon={<ReloadOutlined />}
                              loading={clipGeneratingId === clip.id}
                              disabled={Boolean(clipGeneratingId) || recordingLocked}
                              onClick={event => {
                                event.stopPropagation()
                                void regenerateClip(clip)
                              }}
                            >重新生成</Button>
                          ) : recordingPending && isSelected ? (
                            <Button size="small" danger loading disabled>连接麦克风</Button>
                          ) : recording?.status === 'recording' && isSelected ? (
                            <Button size="small" danger type="primary" icon={<StopOutlined />} onClick={event => {
                              event.stopPropagation()
                              stopRecording()
                            }}>结束录制</Button>
                          ) : recording?.status === 'saving' && isSelected ? (
                            <Button size="small" loading disabled>保存中</Button>
                          ) : recording?.status === 'recorded' ? (
                            <Button size="small" icon={<ReloadOutlined />} onClick={async event => {
                              event.stopPropagation()
                              await removeRecording(clip.id)
                              await startRecording(clip.id)
                            }}>重录</Button>
                          ) : (
                            <Button size="small" danger icon={<AudioOutlined />} disabled={recordingLocked} onClick={event => {
                              event.stopPropagation()
                              setActiveClipId(clip.id)
                              void startRecording(clip.id)
                            }}>开始录制</Button>
                          )}
                        </div>
                      </article>

                      {join && (
                        <div className="produce-join-row">
                          <span className="produce-join-line" />
                          <Select
                            aria-label={`语音块 ${clipIndex + 1} 后的衔接`}
                            size="small"
                            value={join.type === 'transition' ? 'transition' : String(join.duration_ms)}
                            disabled={isBusy || recordingLocked}
                            options={[
                              { value: '0', label: '无停顿' },
                              { value: '300', label: '短停顿 · 0.3s' },
                              { value: '600', label: '标准停顿 · 0.6s' },
                              { value: '1200', label: '长停顿 · 1.2s' },
                              { value: 'transition', label: '转场音乐' },
                            ]}
                            onChange={value => void updateJoin(clip.id, value === 'transition'
                              ? { type: 'transition', duration_ms: productionPlan.music.transition.duration_ms }
                              : { type: 'pause', duration_ms: Number(value) })}
                          />
                          <span className="produce-join-line" />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {mode === 'recording' && activeClip && (
                <div className="produce-recording-dock">
                  <div>
                    <strong>{recordingPending
                      ? '正在连接麦克风'
                      : activeRecording?.status === 'recording'
                        ? `正在录制语音块 ${activeClips.findIndex(item => item.id === activeClip.id) + 1} · ${formatTime(activeRecordingDuration)}`
                        : '真人录音只替换当前语音块'}</strong>
                    <small>未录制的部分继续使用 AI 语音，不再要求整期二选一。</small>
                    {activeRecording?.error && <small className="produce-recording-error">{activeRecording.error}</small>}
                  </div>
                  {activeRecording?.status === 'recorded' && (
                    <Button size="small" onClick={() => void removeRecording(activeClip.id)}>恢复 AI 语音</Button>
                  )}
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
                <li className={(ttsClipCount === 0 || providerConfigured) ? 'is-complete' : ''}>
                  <SoundOutlined />
                  <span>
                    <strong>混合语音来源</strong>
                    <small>{recordedSegments.length} 段真人录音 · {ttsClipCount} 段 AI 语音</small>
                  </span>
                </li>
                <li><ReloadOutlined /><span><strong>音频合成</strong><small>按装配单中的裁剪、停顿和音乐渲染</small></span></li>
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
                    value={productionPlan.render.output_format}
                    disabled={isBusy}
                    options={OUTPUT_FORMATS}
                    onChange={(value: OutputFormat) => void persistProductionPlan({
                      ...productionPlanRef.current,
                      render: { ...productionPlanRef.current.render, output_format: value },
                    })}
                  />
                </label>
                <p className="produce-field-help">段间停顿已移到节目装配单，可为每个衔接单独设置。</p>
                <div className="produce-switch-row">
                  <span><strong>响度标准化</strong><small>统一各段音量</small></span>
                  <Switch
                    aria-label="响度标准化"
                    checked={productionPlan.render.normalize_loudness}
                    disabled={isBusy}
                    onChange={value => void persistProductionPlan({
                      ...productionPlanRef.current,
                      render: { ...productionPlanRef.current.render, normalize_loudness: value },
                    })}
                  />
                </div>
                <div className="produce-switch-row">
                  <span><strong>裁剪静音</strong><small>移除每段过长的无声区</small></span>
                  <Switch aria-label="裁剪静音" checked={postprocess.trimSilence} disabled={isBusy} onChange={value => setPostprocess(current => ({ ...current, trimSilence: value }))} />
                </div>
              </section>

              <section className="produce-settings-section">
                <div className="produce-settings-title"><div><span className="produce-eyebrow">节目音乐</span><h3>片头与转场</h3></div></div>
                {(['intro', 'transition', 'outro'] as const).map(name => {
                  const slot = productionPlan.music[name]
                  const label = name === 'intro' ? '片头音乐' : name === 'transition' ? '转场音乐' : '片尾音乐'
                  return (
                    <div className="produce-music-slot" key={name}>
                      <div className="produce-switch-row">
                        <span><strong>{label}</strong><small>{slot.path ? fileName(slot.path) : '尚未选择文件'}</small></span>
                        <Switch
                          aria-label={label}
                          checked={slot.enabled}
                          disabled={isBusy}
                          onChange={value => void updateMusic(name, { enabled: value })}
                        />
                      </div>
                      {slot.enabled && (
                        <div className="produce-file-row">
                          <Input value={slot.path} readOnly placeholder="选择本地音频文件" />
                          <Button aria-label={`选择${label}`} onClick={() => void chooseMusicFile(name)}>选择</Button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </section>

              <section className="produce-settings-section">
                <div className="produce-settings-title"><div><span className="produce-eyebrow">混音</span><h3>背景铺底</h3></div></div>
                <div className="produce-switch-row">
                  <span><strong>叠加 BGM</strong><small>循环并铺满成品时长</small></span>
                  <Switch
                    aria-label="叠加背景音乐"
                    checked={productionPlan.music.bed.enabled}
                    disabled={isBusy}
                    onChange={value => void updateMusic('bed', { enabled: value })}
                  />
                </div>
                {productionPlan.music.bed.enabled && (
                  <>
                    <label>
                      <span>音频文件路径</span>
                      <div className="produce-file-row">
                        <Input
                          aria-label="背景音乐文件路径"
                          value={productionPlan.music.bed.path}
                          readOnly
                          placeholder="选择本地背景音乐"
                        />
                        <Button aria-label="选择背景音乐" disabled={isBusy} onClick={() => void chooseMusicFile('bed')}>选择</Button>
                      </div>
                    </label>
                    <p className="produce-field-help"><WarningOutlined /> 路径必须可被桌面应用读取；不存在时制作会明确失败。</p>
                    <label>
                      <span>背景音量 <strong>{Math.round(productionPlan.music.bed.volume * 100)}%</strong></span>
                      <Slider
                        min={0.01}
                        max={0.5}
                        step={0.01}
                        value={productionPlan.music.bed.volume}
                        disabled={isBusy}
                        onChange={value => {
                          const next = {
                            ...productionPlanRef.current,
                            music: {
                              ...productionPlanRef.current.music,
                              bed: { ...productionPlanRef.current.music.bed, volume: value },
                            },
                          }
                          productionPlanRef.current = next
                          setProductionPlan(next)
                        }}
                        onChangeComplete={value => void updateMusic('bed', { volume: value })}
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
