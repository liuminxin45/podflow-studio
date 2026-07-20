export interface DiscoverUiState {
  selectedCount?: number
  selectedItems?: ContentItem[]
  lastRunAt?: string
  proceededAt?: string
  configUpdatedAt?: string
  fetch_config?: Record<string, any>
}

interface ActiveGenerationRequest {
  mode: 'initial' | 'regenerate'
  require_llm?: boolean
  requested_at?: string
  status?: 'failed' | null
  failed_at?: string
  draft_snapshot?: Script | null
}

interface EmptyGenerationRequest {
  mode?: never
  require_llm?: never
  requested_at?: never
  status?: never
  failed_at?: never
  draft_snapshot?: never
}

export type GenerationRequest = ActiveGenerationRequest | EmptyGenerationRequest

export interface SelectedNewsTopic {
  id?: string
  title?: string
  fact_id?: string
  is_deep_dive?: boolean
}

export interface GenerationMeta {
  generated_at?: string
  preset_id?: string
  source_fact_count?: number
  used_fact_ids?: string[]
  actual_news_item_count?: number
  structure?: Record<string, any>
  settings?: Record<string, any>
}

export interface ScriptSnapshot {
  id?: string
  reason?: string
  created_at?: string
  edited_script?: Script
  generation_meta?: GenerationMeta
}

export interface DownstreamStale {
  is_stale?: boolean
  reason?: string
  invalidated_at?: string
  artifacts?: Record<string, any>
}

export interface PodcastState {
  episode_id: string
  created_at: string
  schema_version: number
  preset: Record<string, any>
  source_inputs: ContentItem[]
  runtime_config: Record<string, any>
  logs: string[]
  errors: ErrorInfo[]
  fetch_contents: ContentItem[]
  cleaned_contents: ContentItem[]
  researched_contents: ContentItem[]
  facts: FactCard[]
  selected_topic: Topic
  selected_topics: SelectedNewsTopic[]
  selected_materials: ContentItem[]
  auto_selected_items?: ContentItem[]
  auto_rejected_items?: ContentItem[]
  script: Script
  edited_script: Script
  generation_request?: GenerationRequest
  generation_meta?: GenerationMeta
  script_snapshots?: ScriptSnapshot[]
  downstream_stale?: DownstreamStale
  voice_segments: VoiceSegment[]
  production_plan?: ProductionPlan
  audio_outputs: Record<string, any>
  cover_path: string
  intro_outro_paths: Record<string, string>
  review_summary: Record<string, any>
  publish_outputs: Record<string, any>
  subtitle_path: string
  run_report: Record<string, any>
  discover_meta?: Record<string, any>
  discover_ui?: DiscoverUiState
  organize_ui?: Record<string, any>
  episode_brief?: Record<string, any>
  writing_meta?: Record<string, any>
  series?: SeriesSnapshot
  playback?: PlaybackState
  _manifest?: Record<string, any>
}

export interface SeriesDefaults {
  language: string
  targetDurationMinutes: number
  author: string
  hostName: string
  defaultVoice: string
  enabledPlatforms: string[]
  templateVariant: 'quick_9_plus_deep_1'
}

export interface SeriesSnapshot {
  id: string
  title: string
  description: string
  coverPath: string
  cadence: 'daily' | 'weekly'
  defaults: SeriesDefaults
}

export interface Series extends SeriesSnapshot {
  episodeIds: string[]
  createdAt: string
  updatedAt: string
}

export interface PlaybackState {
  positionSeconds: number
  durationSeconds: number
  completed: boolean
  speed: number
  playCount: number
  updatedAt: string
}

export interface ContentItem {
  title?: string
  content?: string
  summary?: string
  url?: string
  published?: string
  source?: string
  type?: string
  source_kind?: 'platform' | 'rss'
  source_id?: string
  source_name?: string
  rank?: number
  score?: number
  first_seen?: string
  last_seen?: string
  report_path?: string
  /** Whether this item has been classified/tagged by LLM or keyword */
  _tagged?: boolean
  /** Classification result stored directly on the item */
  _classification?: {
    categoryId: string
    categoryLabel: string
    priority: 'high' | 'normal' | 'low'
    reason: string
    fromLLM: boolean
  }
  _ai_organize?: {
    status?: 'selected' | 'rejected' | 'noise' | 'duplicate'
    reason?: string
    confidence?: number
    duplicate_of?: number | string
    cluster_id?: string
    cluster_name?: string
    tags?: string[]
    score?: number
    priority?: 'high' | 'medium' | 'low'
  }
}

export interface Topic {
  title?: string
  description?: string
  keywords?: string[]
}

export interface FactCard {
  id: string
  title: string
  summary: string
  source_title: string
  source_url: string
  source_titles?: string[]
  source_urls?: string[]
  published_at: string
  claim: string
  confidence: 'high' | 'medium' | 'low'
  is_deep_dive?: boolean
  used_in_segments?: string[]
}

export type ContentCreationType = 'news_brief'
export type SupportedContentCreationType = 'news_brief'

export function isContentCreationType(value: unknown): value is ContentCreationType {
  return value === 'news_brief'
}

export function resolveSupportedContentCreationType(value: ContentCreationType): SupportedContentCreationType {
  return value
}

export interface Script {
  id?: string
  title?: string
  description?: string
  content_type?: ContentCreationType
  preset_id?: string
  num_hosts?: number
  language?: string
  segments?: ScriptSegment[]
  generated_by?: string
  edited_from?: string
  edit_mode?: string
}

export interface ScriptSegment {
  id: string
  type: 'opening' | 'quick_news' | 'deep_dive' | 'closing' | 'custom'
  title: string
  text: string
  source_fact_ids: string[]
  estimated_seconds: number
  speaker?: string
}

export interface VoiceSegment {
  segment_id: string
  path: string
  text: string
  speaker: string
  source_fact_ids?: string[]
  engine: string
  voice: string
  mime_type?: string
  duration_seconds?: number
  size?: number
  updated_at?: string
  parent_segment_id?: string
  generation_key?: string
}

export type ProductionClipSource = 'tts' | 'recording' | 'local'

export interface ProductionClip {
  id: string
  parent_segment_id: string
  segment_type: ScriptSegment['type']
  segment_title: string
  text: string
  speaker: string
  source_fact_ids: string[]
  source: ProductionClipSource
  path: string
  duration_seconds: number
  trim_start_ms: number
  trim_end_ms: number
  generation_key: string
}

export interface ProductionJoin {
  after_clip_id: string
  type: 'pause' | 'transition'
  duration_ms: number
}

export interface ProductionMusicSlot {
  enabled: boolean
  path: string
  volume: number
  duration_ms: number
  fade_in_ms: number
  fade_out_ms: number
}

export interface ProductionPlan {
  version: 1
  script_hash: string
  clips: ProductionClip[]
  joins: ProductionJoin[]
  music: {
    intro: ProductionMusicSlot
    transition: ProductionMusicSlot
    bed: ProductionMusicSlot
    outro: ProductionMusicSlot
  }
  render: {
    output_format: 'mp3' | 'wav' | 'opus'
    normalize_loudness: boolean
    target_lufs: number
    true_peak_db: number
  }
  updated_at: string
}

export interface RssValidation {
  ok: boolean
  errors: string[]
  warnings: string[]
  enclosure_url: string
  local_preview_only: boolean
}

export interface ErrorInfo {
  node: string
  message: string
  detail?: string
  timestamp?: string
}

export interface NodeExecution {
  status: 'pending' | 'running' | 'completed' | 'failed' | 'waiting_approval'
  startedAt?: string
  completedAt?: string
  duration?: number
  error?: string
  errorStack?: string
  attempts?: number
  history?: NodeAttempt[]
}

export interface NodeAttempt {
  attempt: number
  startedAt: string
  completedAt?: string
  duration?: number
  status: 'running' | 'completed' | 'failed'
  error?: string
}

export interface Workflow {
  id: string
  state: PodcastState
  status: 'draft' | 'running' | 'completed' | 'failed' | 'waiting_approval'
  currentNode: string | null
  nodeExecutions: Record<string, NodeExecution>
  approvals?: Record<string, string>
}

export interface WorkflowCreateResult {
  workflowId: string
  episodeId: string
}

export interface WorkflowSummary {
  id: string
  episodeId: string
  title: string
  description?: string
  status: Workflow['status']
  createdAt: string
  updatedAt?: string
  previewPath?: string
  isCurrent?: boolean
  isSaved?: boolean
  audioPath?: string
  durationSeconds?: number
  playback?: PlaybackState
  series?: SeriesSnapshot
  failedNode?: string
  topicKeys?: string[]
  sourceDomains?: string[]
}

export interface RecoveryPlan {
  nodeName: string
  recommendedNode: string
  rerunNodes: string[]
  clearFields: string[]
  clearLabels: string[]
  populatedFields: string[]
  populatedLabels: string[]
  preserveFields: string[]
}
