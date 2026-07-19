export type StudioMode = 'ai' | 'recording'

export type AudioProvider = 'edge-tts' | 'openai-compatible' | 'doubao_tts' | 'voice_clone'

export type OutputFormat = 'mp3' | 'wav' | 'opus'

export type ProductionStatus =
  | 'idle'
  | 'saving'
  | 'running'
  | 'awaiting-result'
  | 'succeeded'
  | 'failed'

export interface ScriptSegment {
  id: string
  label: string
  color: string
  content: string
  speaker: string
  estimatedSeconds: number
}

export interface StudioRecording {
  segmentId: string
  status: 'empty' | 'recording' | 'saving' | 'recorded'
  durationSeconds: number
  path?: string
  mimeType?: string
  size?: number
  error?: string
}

export interface PostprocessSettings {
  outputFormat: OutputFormat
  segmentPauseMs: number
  normalizeLoudness: boolean
  trimSilence: boolean
  addBgm: boolean
  bgmPath: string
  bgmVolume: number
}

export interface ProductionRunState {
  status: ProductionStatus
  message: string
  error: string
}
