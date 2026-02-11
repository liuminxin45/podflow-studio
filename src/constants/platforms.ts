export interface PlatformOption {
  id: string
  name: string
  icon: string
  desc: string
  label?: string
}

export const PLATFORM_OPTIONS: PlatformOption[] = [
  { id: 'xiaoyuzhou', name: '小宇宙', label: '小宇宙', icon: '🎧', desc: '中文播客首选平台' },
  { id: 'apple', name: 'Apple Podcasts', label: 'Apple Podcasts', icon: '🍎', desc: '全球最大播客平台' },
  { id: 'spotify', name: 'Spotify', label: 'Spotify', icon: '🎵', desc: '音乐与播客一体' },
  { id: 'ximalaya', name: '喜马拉雅', label: '喜马拉雅', icon: '🏔️', desc: '国内音频内容平台' },
  { id: 'wechat', name: '微信听书', label: '微信听书', icon: '💬', desc: '微信生态内容分发' },
]
