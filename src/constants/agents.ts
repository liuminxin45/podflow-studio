export interface Agent {
  key: 'content' | 'distribution' | 'risk'
  name: string
  role: string
  icon: string
  gradient: string
  color: string
  lightBg: string
}

export const AGENTS: Agent[] = [
  {
    key: 'content',
    name: '内容编辑',
    role: '帮你打磨标题和描述，让节目更有吸引力',
    icon: '🎨',
    gradient: 'linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)',
    color: '#2563eb',
    lightBg: '#eff6ff',
  },
  {
    key: 'distribution',
    name: '传播顾问',
    role: '优化发布策略，帮节目触达更多听众',
    icon: '📣',
    gradient: 'linear-gradient(135deg, #7c3aed 0%, #8b5cf6 100%)',
    color: '#7c3aed',
    lightBg: '#f5f3ff',
  },
  {
    key: 'risk',
    name: '风险审查员',
    role: '检查潜在风险，确保发布安全无忧',
    icon: '🛡',
    gradient: 'linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%)',
    color: '#d97706',
    lightBg: '#fffbeb',
  },
]
