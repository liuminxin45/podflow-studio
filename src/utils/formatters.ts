export function formatTimeAgo(published?: string): string {
  if (!published) return ''
  try {
    const d = new Date(published)
    const now = new Date()
    const h = Math.floor((now.getTime() - d.getTime()) / 3600000)
    if (h < 1) return '刚刚'
    if (h < 24) return `${h}小时前`
    const days = Math.floor(h / 24)
    if (days < 7) return `${days}天前`
    return published
  } catch {
    return published
  }
}

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}
