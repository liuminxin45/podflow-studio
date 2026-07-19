export interface VoiceOption {
  id: string
  label: string
  desc: string
  icon: string
}

export const VOICE_OPTIONS: VoiceOption[] = [
  { id: 'warm-male', label: '温暖男声', desc: '适合背景解读与专题播报', icon: 'WM' },
  { id: 'steady-male', label: '沉稳男声', desc: '适合新闻解读与评论', icon: 'SM' },
  { id: 'gentle-female', label: '柔和女声', desc: '适合深夜电台与情感', icon: 'GF' },
  { id: 'energetic-female', label: '活力女声', desc: '适合热门话题与讨论', icon: 'EF' },
  { id: 'professional', label: '专业播报', desc: '适合正式新闻播报', icon: 'PB' },
  { id: 'storyteller', label: '讲述者', desc: '适合平实讲述与人物引语', icon: 'ST' },
]
