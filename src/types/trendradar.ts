import type { ContentItem } from './workflow'

export type TrendRadarSourceKind = 'platform' | 'rss'
export type TrendRadarFilterMethod = 'keyword' | 'ai'
export type TrendRadarAIProviderSource = 'app' | 'trendradar' | 'env' | 'none'
export type TrendRadarReportMode = 'daily' | 'current' | 'incremental'
export type TrendRadarReportDisplayMode = 'keyword' | 'platform'

export interface TrendRadarSource {
  id: string
  name: string
  kind: TrendRadarSourceKind
  enabled: boolean
  url?: string
  description?: string
}

export interface TrendRadarConfigView {
  timezone?: string
  show_version_update?: boolean
  platforms_enabled: boolean
  rss_enabled: boolean
  enabled_platforms: string[]
  enabled_rss_feeds: string[]
  max_items_per_source: number
  freshness_days: number
  rss_freshness_enabled?: boolean
  rss_request_interval?: number
  rss_timeout?: number
  rss_proxy_enabled?: boolean
  rss_proxy_url?: string
  crawler_request_interval?: number
  filter_method: TrendRadarFilterMethod
  filter_priority_sort_enabled?: boolean
  ai_available: boolean
  ai_api_key_set?: boolean
  ai_provider_source?: TrendRadarAIProviderSource
  ai_model?: string
  ai_api_base?: string
  ai_timeout?: number
  ai_temperature?: number
  ai_max_tokens?: number
  ai_num_retries?: number
  ai_fallback_models?: string[]
  ai_filter_batch_size?: number
  ai_filter_batch_interval?: number
  ai_filter_min_score?: number
  ai_filter_reclassify_threshold?: number
  ai_interests_file?: string
  ai_filter_prompt_file?: string
  ai_filter_extract_prompt_file?: string
  ai_filter_update_tags_prompt_file?: string
  api_url?: string
  proxy_enabled: boolean
  proxy_url?: string
  schedule_preset?: string
  report_mode?: TrendRadarReportMode
  report_display_mode?: TrendRadarReportDisplayMode
  sort_by_position_first?: boolean
  rank_threshold?: number
  max_news_per_keyword?: number
  display_standalone_enabled?: boolean
  standalone_platforms?: string[]
  standalone_rss_feeds?: string[]
  standalone_max_items?: number
  debug?: boolean
  raw?: Record<string, any>
}

export interface TrendRadarItem extends ContentItem {
  trendradar_id: string
  source_kind: TrendRadarSourceKind
  source_id: string
  source_name: string
  rank?: number
  rank_highlight?: boolean
  score?: number
  first_seen?: string
  last_seen?: string
  report_path?: string
  matched_reason?: string
  ai_filter_tag?: string
  ai_filter_score?: number
  keyword_tag?: string
  standalone?: boolean
}

export interface TrendRadarMeta {
  generated_at?: string
  report_path?: string
  failed_sources?: string[]
  platform_count?: number
  rss_count?: number
  item_count?: number
  topics?: Array<{ name: string; count: number }>
  ai_filter?: {
    enabled?: boolean
    total_processed?: number
    total_matched?: number
    total_returned?: number
    report_limited?: number
    failed_batches?: number
    model?: string
    interests_file?: string
    tags?: Array<{ tag: string; count: number }>
    error?: string
  }
  standalone?: {
    enabled?: boolean
    added?: number
    platforms?: string[]
    rss_feeds?: string[]
    max_items?: number
  }
  config?: Partial<TrendRadarConfigView>
}

export interface TrendRadarStatus {
  available: boolean
  adapterAvailable?: boolean
  fullRuntimeAvailable?: boolean
  runtimeBlocked?: boolean
  runtimeBlocker?: string
  processRunning: boolean
  pid?: number | null
  status: string
  localVersion?: string
  lockedVersion?: string
  lockedCommit?: string
  pythonRequirement?: string
  pythonCompatible?: boolean
  missingDependencies?: string[]
  pythonVersion?: string
  pythonExecutable?: string
  userDataDir?: string
  latestRunAt?: string | null
  latestItemCount?: number
  lastError?: string | null
}

export interface TrendRadarRunResult {
  success: boolean
  running?: boolean
  items: TrendRadarItem[]
  fetch_contents: TrendRadarItem[]
  meta: TrendRadarMeta
  error?: string
}

export interface TrendRadarUpdateStatus {
  success: boolean
  localVersion?: string
  remoteVersion?: string
  lockedVersion?: string
  localCommit?: string
  lockedCommit?: string
  remoteConfigVersions?: Record<string, string>
  pythonVersion?: string
  pythonRequirement?: string
  pythonCompatible?: boolean
  missingDependencies?: string[]
  fullRuntimeAvailable?: boolean
  remotePythonRequirement?: string
  updateAvailable: boolean
  blocked?: boolean
  blocker?: string
  error?: string
}
