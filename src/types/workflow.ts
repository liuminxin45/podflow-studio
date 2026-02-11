export interface PodcastState {
  episode_id: string
  created_at: string
  runtime_config: Record<string, any>
  logs: string[]
  errors: ErrorInfo[]
  fetch_contents: ContentItem[]
  manual_contents: ContentItem[]
  raw_contents: ContentItem[]
  cleaned_contents: ContentItem[]
  researched_contents: ContentItem[]
  selected_topic: Topic
  selected_materials: ContentItem[]
  script: Script
  stages: Stage[]
  audio_segments: string[]
  final_audio_path: string
  audio_metadata: Record<string, any>
  cover_path: string
  intro_outro_paths: Record<string, string>
  review_summary: Record<string, any>
  storage_info: Record<string, any>
  rss_path: string
  publish_status: Record<string, any>
  subtitle_path: string
}

export interface ContentItem {
  title?: string
  content?: string
  url?: string
  published?: string
  source?: string
  type?: string
}

export interface Topic {
  title?: string
  description?: string
  keywords?: string[]
}

export interface Script {
  title?: string
  description?: string
  dialogue?: DialogueLine[]
}

export interface DialogueLine {
  speaker: string
  text: string
}

export interface Stage {
  order: number
  speaker: string
  text: string
  duration?: number
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
}

export interface Workflow {
  id: string
  state: PodcastState
  status: 'running' | 'completed' | 'failed' | 'waiting_approval'
  currentNode: string | null
  nodeExecutions: Record<string, NodeExecution>
  approvals?: Record<string, string>
}

export interface WorkflowCreateResult {
  workflowId: string
  episodeId: string
}
