export interface Agent {
  key: 'content' | 'distribution' | 'risk'
  name: string
  role: string
  color: string
  lightBg: string
}

export const AGENTS: Agent[] = [
  {
    key: 'content',
    name: '内容编辑',
    role: '帮你打磨标题和描述，让节目更有吸引力',
    color: '#4f5156',
    lightBg: '#f4f4f5',
  },
  {
    key: 'distribution',
    name: '传播顾问',
    role: '优化发布策略，帮节目触达更多听众',
    color: '#4f5156',
    lightBg: '#edf3ec',
  },
  {
    key: 'risk',
    name: '风险审查员',
    role: '检查潜在风险，确保发布安全无忧',
    color: '#4f5156',
    lightBg: '#f4f4f5',
  },
]
