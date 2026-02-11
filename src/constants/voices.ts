export interface VoiceOption {
  id: string
  label: string
  desc: string
  emoji: string
}

export const VOICE_OPTIONS: VoiceOption[] = [
  { id: 'warm-male', label: '温暖男声', desc: '适合深度访谈与叙事', emoji: '🎙️' },
  { id: 'steady-male', label: '沉稳男声', desc: '适合新闻解读与评论', emoji: '📻' },
  { id: 'gentle-female', label: '柔和女声', desc: '适合深夜电台与情感', emoji: '🌙' },
  { id: 'energetic-female', label: '活力女声', desc: '适合热门话题与讨论', emoji: '✨' },
  { id: 'professional', label: '专业播报', desc: '适合正式新闻播报', emoji: '📰' },
  { id: 'storyteller', label: '讲述者', desc: '适合故事型内容', emoji: '📖' },
]
