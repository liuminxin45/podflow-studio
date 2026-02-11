import type { ContentItem } from '../types/workflow'

// ============================================================
// Types
// ============================================================

export interface TopicCluster {
  id: string
  name: string
  color: string
  bg: string
  itemIds: number[]
}

export type PriorityHint = 'mainline' | 'expandable' | 'background'

export interface ItemAIHints {
  priorityHint?: PriorityHint
  priorityReason?: string
  duplicateOf?: number
  duplicateScore?: number
  isLowDensity?: boolean
  noiseReason?: string
}

export interface AIAnalysisResult {
  clusters: TopicCluster[]
  hints: Map<number, ItemAIHints>
}

// ============================================================
// Constants
// ============================================================

const CLUSTER_COLORS = [
  { color: '#2563eb', bg: '#eff6ff' },
  { color: '#7c3aed', bg: '#f5f3ff' },
  { color: '#059669', bg: '#ecfdf5' },
  { color: '#d97706', bg: '#fffbeb' },
  { color: '#dc2626', bg: '#fef2f2' },
  { color: '#0891b2', bg: '#ecfeff' },
  { color: '#c026d3', bg: '#fdf4ff' },
  { color: '#4f46e5', bg: '#eef2ff' },
]

export const PRIORITY_HINT_CONFIG: Record<PriorityHint, { label: string; color: string; bg: string; icon: string }> = {
  mainline:   { label: '可能主线', color: '#1d4ed8', bg: '#dbeafe', icon: '◆' },
  expandable: { label: '可延展',   color: '#7c3aed', bg: '#ede9fe', icon: '◇' },
  background: { label: '背景信息', color: '#6b7280', bg: '#f3f4f6', icon: '○' },
}

// ============================================================
// Stop words (Chinese + English common words)
// ============================================================

const STOP_WORDS = new Set([
  '的', '了', '是', '在', '和', '与', '或', '有', '不', '这', '那', '也', '都',
  '就', '会', '可以', '对', '为', '将', '从', '到', '被', '让', '把', '已',
  '其', '它', '他', '她', '们', '个', '等', '中', '上', '下', '之', '而', '但',
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'shall',
  'should', 'may', 'might', 'must', 'can', 'could', 'to', 'of', 'in',
  'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through',
  'during', 'before', 'after', 'above', 'below', 'between', 'out',
  'off', 'over', 'under', 'again', 'further', 'then', 'once', 'here',
  'there', 'when', 'where', 'why', 'how', 'all', 'each', 'every',
  'both', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor',
  'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 'just',
  'and', 'but', 'or', 'if', 'this', 'that', 'it', 'its', 'new',
])

// ============================================================
// Text Processing Helpers
// ============================================================

function extractKeywords(text: string): string[] {
  const normalized = text.toLowerCase()
  // Split on whitespace, punctuation, CJK boundaries
  const tokens = normalized
    .replace(/[，。！？、；：""''（）【】《》\-—…·\n\r\t]/g, ' ')
    .replace(/[^\w\u4e00-\u9fff\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1)
    .filter(t => !STOP_WORDS.has(t))

  // For Chinese text, also extract 2-char bigrams
  const cjkBigrams: string[] = []
  const cjkOnly = normalized.replace(/[^\u4e00-\u9fff]/g, '')
  for (let i = 0; i < cjkOnly.length - 1; i++) {
    const bigram = cjkOnly.substring(i, i + 2)
    if (!STOP_WORDS.has(bigram[0]) && !STOP_WORDS.has(bigram[1])) {
      cjkBigrams.push(bigram)
    }
  }

  return [...new Set([...tokens, ...cjkBigrams])]
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0
  let intersection = 0
  for (const x of a) {
    if (b.has(x)) intersection++
  }
  const union = a.size + b.size - intersection
  return union === 0 ? 0 : intersection / union
}

function getItemText(item: ContentItem): string {
  return `${item.title || ''} ${item.content || ''}`
}

// ============================================================
// 1️⃣ Topic Clustering Assistant
// ============================================================

export function clusterByTopic(
  items: Array<ContentItem & { _id: number }>,
): TopicCluster[] {
  if (items.length === 0) return []

  // Extract keyword sets for each item
  const keywordSets: Map<number, Set<string>> = new Map()
  items.forEach(item => {
    keywordSets.set(item._id, new Set(extractKeywords(getItemText(item))))
  })

  // Simple agglomerative clustering by keyword overlap
  const SIMILARITY_THRESHOLD = 0.15
  const clusters: Array<{ ids: number[]; keywords: Map<string, number> }> = []

  for (const item of items) {
    const itemKw = keywordSets.get(item._id)!
    let bestCluster = -1
    let bestScore = 0

    for (let ci = 0; ci < clusters.length; ci++) {
      // Compare with cluster centroid keywords
      const clusterKw = new Set(
        [...clusters[ci].keywords.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 20)
          .map(([k]) => k)
      )
      const score = jaccardSimilarity(itemKw, clusterKw)
      if (score > bestScore && score >= SIMILARITY_THRESHOLD) {
        bestScore = score
        bestCluster = ci
      }
    }

    if (bestCluster >= 0) {
      clusters[bestCluster].ids.push(item._id)
      for (const kw of itemKw) {
        clusters[bestCluster].keywords.set(kw, (clusters[bestCluster].keywords.get(kw) || 0) + 1)
      }
    } else {
      const kwMap = new Map<string, number>()
      for (const kw of itemKw) {
        kwMap.set(kw, 1)
      }
      clusters.push({ ids: [item._id], keywords: kwMap })
    }
  }

  // Generate cluster names from top keywords
  // Merge very small clusters (1 item) into "其他" if there are too many
  const MIN_CLUSTER_SIZE = 1
  const mainClusters = clusters.filter(c => c.ids.length >= MIN_CLUSTER_SIZE)
  const orphans = clusters.filter(c => c.ids.length < MIN_CLUSTER_SIZE)

  if (orphans.length > 0 && mainClusters.length > 0) {
    // Group orphans together
    const orphanCluster = {
      ids: orphans.flatMap(c => c.ids),
      keywords: new Map<string, number>(),
    }
    orphans.forEach(c => {
      c.keywords.forEach((v, k) => {
        orphanCluster.keywords.set(k, (orphanCluster.keywords.get(k) || 0) + v)
      })
    })
    if (orphanCluster.ids.length > 0) {
      mainClusters.push(orphanCluster)
    }
  }

  // If only 1 cluster and many items, try splitting further
  // For now, keep simple

  return mainClusters.map((c, i) => {
    const topKw = [...c.keywords.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([k]) => k)

    const name = topKw.length > 0 ? topKw.join(' · ') : '其他'
    const colorIdx = i % CLUSTER_COLORS.length

    return {
      id: `cluster-${i}`,
      name,
      color: CLUSTER_COLORS[colorIdx].color,
      bg: CLUSTER_COLORS[colorIdx].bg,
      itemIds: c.ids,
    }
  })
}

// ============================================================
// 2️⃣ Priority Hint Assistant
// ============================================================

const RELIABLE_SOURCES = [
  'reuters', 'bloomberg', 'techcrunch', 'theverge', 'arxiv', 'nature',
  'nytimes', 'wsj', 'bbc', 'ap', 'guardian',
  '新华社', '人民日报', '财新', '第一财经', '界面', '36氪',
]

export function analyzePriorityHints(
  items: Array<ContentItem & { _id: number }>,
  userTopic?: string,
): Map<number, Pick<ItemAIHints, 'priorityHint' | 'priorityReason'>> {
  const result = new Map<number, Pick<ItemAIHints, 'priorityHint' | 'priorityReason'>>()

  if (items.length === 0) return result

  // Score each item
  const scores: Array<{ id: number; score: number; reasons: string[] }> = []

  const topicKeywords = userTopic
    ? userTopic.toLowerCase().split(/[,，、\s]+/).filter(Boolean)
    : []

  for (const item of items) {
    let score = 0
    const reasons: string[] = []
    const text = getItemText(item).toLowerCase()

    // Factor 1: Topic relevance (0-40 points)
    if (topicKeywords.length > 0) {
      const hits = topicKeywords.filter(w => text.includes(w)).length
      const ratio = hits / topicKeywords.length
      if (ratio > 0.5) {
        score += 40
        reasons.push('主题高度相关')
      } else if (ratio > 0.2) {
        score += 20
        reasons.push('主题相关')
      }
    }

    // Factor 2: Content richness (0-20 points)
    const contentLen = (item.content || '').length
    if (contentLen > 200) {
      score += 20
      reasons.push('内容丰富')
    } else if (contentLen > 80) {
      score += 10
    }

    // Factor 3: Source reliability (0-15 points)
    if (item.source && RELIABLE_SOURCES.some(s => (item.source || '').toLowerCase().includes(s))) {
      score += 15
      reasons.push('来源可靠')
    }

    // Factor 4: Multi-source confirmation (0-25 points)
    const titleWords = (item.title || '').toLowerCase().split(/\s+/).filter(w => w.length > 2)
    if (titleWords.length > 0) {
      const similarCount = items.filter(other => {
        if (other._id === item._id) return false
        const otherTitle = (other.title || '').toLowerCase()
        return titleWords.filter(w => otherTitle.includes(w)).length >= Math.ceil(titleWords.length * 0.4)
      }).length
      if (similarCount >= 2) {
        score += 25
        reasons.push('多源覆盖')
      } else if (similarCount >= 1) {
        score += 12
      }
    }

    scores.push({ id: item._id, score, reasons })
  }

  // Assign hints based on relative scoring
  const maxScore = Math.max(...scores.map(s => s.score), 1)

  for (const s of scores) {
    const ratio = s.score / maxScore

    if (ratio >= 0.7 && s.score >= 30) {
      result.set(s.id, {
        priorityHint: 'mainline',
        priorityReason: s.reasons[0] || '综合评分较高',
      })
    } else if (ratio >= 0.4 && s.score >= 15) {
      result.set(s.id, {
        priorityHint: 'expandable',
        priorityReason: s.reasons[0] || '有延展价值',
      })
    } else {
      result.set(s.id, {
        priorityHint: 'background',
        priorityReason: '背景补充',
      })
    }
  }

  return result
}

// ============================================================
// 3️⃣ Duplicate & Noise Detection Assistant
// ============================================================

export interface DuplicateFlag {
  duplicateOf: number
  similarity: number
}

export interface NoiseFlag {
  reason: string
}

export function detectDuplicatesAndNoise(
  items: Array<ContentItem & { _id: number }>,
): {
  duplicates: Map<number, DuplicateFlag>
  noise: Map<number, NoiseFlag>
} {
  const duplicates = new Map<number, DuplicateFlag>()
  const noise = new Map<number, NoiseFlag>()

  if (items.length === 0) return { duplicates, noise }

  // Build keyword sets for all items
  const kwSets: Map<number, Set<string>> = new Map()
  items.forEach(item => {
    kwSets.set(item._id, new Set(extractKeywords(getItemText(item))))
  })

  // Pairwise comparison for duplicates
  const DUP_THRESHOLD = 0.45
  const processed = new Set<number>()

  for (let i = 0; i < items.length; i++) {
    if (processed.has(items[i]._id)) continue

    for (let j = i + 1; j < items.length; j++) {
      if (processed.has(items[j]._id)) continue

      const sim = jaccardSimilarity(kwSets.get(items[i]._id)!, kwSets.get(items[j]._id)!)

      if (sim >= DUP_THRESHOLD) {
        // Mark the later one as duplicate of the earlier one
        duplicates.set(items[j]._id, {
          duplicateOf: items[i]._id,
          similarity: sim,
        })
        processed.add(items[j]._id)
      }
    }
  }

  // Noise detection: low information density
  for (const item of items) {
    if (duplicates.has(item._id)) continue // already flagged

    const title = item.title || ''
    const content = item.content || ''
    const totalLen = title.length + content.length

    // Very short content with no substance
    if (totalLen < 20) {
      noise.set(item._id, { reason: '信息密度较低' })
      continue
    }

    // Title-only items with very generic title
    if (!content && title.length < 30) {
      noise.set(item._id, { reason: '缺少正文内容' })
      continue
    }

    // Check for source overlap - same source URL
    if (item.url) {
      const sameUrlCount = items.filter(
        other => other._id !== item._id && other.url === item.url
      ).length
      if (sameUrlCount > 0 && !duplicates.has(item._id)) {
        noise.set(item._id, { reason: '来源重复' })
      }
    }
  }

  return { duplicates, noise }
}

// ============================================================
// Combined Analysis
// ============================================================

export function runFullAnalysis(
  items: Array<ContentItem & { _id: number }>,
  userTopic?: string,
): AIAnalysisResult {
  const clusters = clusterByTopic(items)
  const priorityHints = analyzePriorityHints(items, userTopic)
  const { duplicates, noise } = detectDuplicatesAndNoise(items)

  // Merge all hints into a single map
  const hints = new Map<number, ItemAIHints>()

  for (const item of items) {
    const hint: ItemAIHints = {}

    const ph = priorityHints.get(item._id)
    if (ph) {
      hint.priorityHint = ph.priorityHint
      hint.priorityReason = ph.priorityReason
    }

    const dup = duplicates.get(item._id)
    if (dup) {
      hint.duplicateOf = dup.duplicateOf
      hint.duplicateScore = dup.similarity
    }

    const n = noise.get(item._id)
    if (n) {
      hint.isLowDensity = true
      hint.noiseReason = n.reason
    }

    hints.set(item._id, hint)
  }

  return { clusters, hints }
}
