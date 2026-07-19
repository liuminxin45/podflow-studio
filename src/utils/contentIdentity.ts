import type { ContentItem } from '../types/workflow'

export function contentIdentity(item: ContentItem): string {
  const stableUrl = String(item.url || '').trim()
  if (stableUrl) return `url:${stableUrl}`
  return `source-title:${item.source_id || item.source || ''}|${item.title || ''}`
}
