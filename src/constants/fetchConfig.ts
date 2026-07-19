export const FETCH_NEUTRAL_CONFIG = {
  topic: '',
  breadth: 5,
  quality: 1,
  freshness: 1,
  min_relevance: 1,
  allow_duplicates: false,
  prefer_original: true,
  language_mix: 'mixed',
  keywords: [],
  exclude_keywords: [],
  event_detection: true,
  trending_boost: false,
  max_articles: 500,
  group_by_topic: true,
  include_summary: true,
} as const

export const DEFAULT_DISCOVER_FILTER_CONFIG = {
  topic: '',
  recency_hours: 24,
  result_limit: 10,
} as const
