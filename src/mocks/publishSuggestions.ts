export interface AgentSuggestion {
  id: string
  title: string
  description: string
  before?: string
  after?: string
}

export const CONTENT_SUGGESTIONS: AgentSuggestion[] = [
  {
    id: 'cs1',
    title: '标题可以更抓人',
    description: '当前标题偏描述性，调整后更能引发好奇心，提升点击率。',
    before: '聊聊 AI 如何改变创作流程',
    after: 'AI 来了，创作者该紧张还是兴奋？',
  },
  {
    id: 'cs2',
    title: '补充一句节目简介',
    description: '好的简介能让听众在 3 秒内决定是否收听。',
    before: '本期聊 AI 创作工具。',
    after: '从 ChatGPT 到 AI 播客，创作工具正在经历一场静悄悄的革命。我们和三位一线创作者聊了聊他们的真实感受。',
  },
]

export const DISTRIBUTION_SUGGESTIONS: AgentSuggestion[] = [
  {
    id: 'ds1',
    title: '发布时间建议',
    description: '根据你的听众活跃数据，周三上午 10:00 是最佳发布时间。目前设定为立即发布，建议调整。',
  },
  {
    id: 'ds2',
    title: '添加话题标签',
    description: '推荐标签：#AI创作 #科技趋势 #创作者经济 — 这些标签在近一周热度上升，有助于被更多人发现。',
  },
]

export const RISK_SUGGESTIONS: AgentSuggestion[] = [
  {
    id: 'rs1',
    title: '内容安全检查通过',
    description: '未发现敏感内容、争议性表述或潜在版权风险。可以放心发布。',
  },
  {
    id: 'rs2',
    title: '音频质量达标',
    description: '响度标准符合 Apple Podcasts 和 Spotify 的要求（-16 LUFS），各段落音量均匀，无明显底噪。',
  },
]
