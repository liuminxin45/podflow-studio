export interface PlatformStatus {
  id: string
  name: string
  icon: string
  status: 'success' | 'processing' | 'failed'
  url?: string
}

export interface PublishRecord {
  id: string
  title: string
  publishedAt: string
  method: 'smart' | 'quick'
  suggestionsAccepted: number
  suggestionsTotal: number
  platforms: PlatformStatus[]
}

export const MOCK_HISTORY: PublishRecord[] = [
  {
    id: 'pub_001',
    title: 'Web3 的未来在哪里？',
    publishedAt: '2025-02-10 10:30',
    method: 'smart',
    suggestionsAccepted: 3,
    suggestionsTotal: 4,
    platforms: [
      { id: 'apple', name: 'Apple Podcasts', icon: '🍎', status: 'success', url: '#' },
      { id: 'spotify', name: 'Spotify', icon: '💚', status: 'success', url: '#' },
      { id: 'xiaoyuzhou', name: '小宇宙', icon: '🪐', status: 'success', url: '#' },
      { id: 'ximalaya', name: '喜马拉雅', icon: '🏔️', status: 'processing' },
    ],
  },
  {
    id: 'pub_002',
    title: '远程工作两年后的真实感受',
    publishedAt: '2025-02-03 09:15',
    method: 'quick',
    suggestionsAccepted: 0,
    suggestionsTotal: 0,
    platforms: [
      { id: 'apple', name: 'Apple Podcasts', icon: '🍎', status: 'success', url: '#' },
      { id: 'spotify', name: 'Spotify', icon: '💚', status: 'success', url: '#' },
      { id: 'xiaoyuzhou', name: '小宇宙', icon: '🪐', status: 'failed' },
    ],
  },
  {
    id: 'pub_003',
    title: '为什么年轻人开始写信了',
    publishedAt: '2025-01-27 14:00',
    method: 'smart',
    suggestionsAccepted: 4,
    suggestionsTotal: 5,
    platforms: [
      { id: 'apple', name: 'Apple Podcasts', icon: '🍎', status: 'success', url: '#' },
      { id: 'spotify', name: 'Spotify', icon: '💚', status: 'success', url: '#' },
      { id: 'xiaoyuzhou', name: '小宇宙', icon: '🪐', status: 'success', url: '#' },
      { id: 'ximalaya', name: '喜马拉雅', icon: '🏔️', status: 'success', url: '#' },
    ],
  },
]

export const DEFAULT_PLATFORMS: PlatformStatus[] = [
  { id: 'apple', name: 'Apple Podcasts', icon: '🍎', status: 'processing' },
  { id: 'spotify', name: 'Spotify', icon: '💚', status: 'processing' },
  { id: 'xiaoyuzhou', name: '小宇宙', icon: '🪐', status: 'processing' },
  { id: 'ximalaya', name: '喜马拉雅', icon: '🏔️', status: 'processing' },
]
