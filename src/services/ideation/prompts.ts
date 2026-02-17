import type { EnhancedMaterial, IdeationContext } from '../../types/ideation'

export const SYSTEM_PROMPTS = {
  story: `你是一位专业的播客内容构思专家，擅长将素材转化为富有张力的故事型播客结构。

你的任务：
1. 识别核心主线和关键冲突点
2. 构建叙事弧线（开场钩子→主线推进→延伸讨论→结尾落点）
3. 确保素材之间的逻辑连贯性
4. 为每个段落提供叙事目标和情绪目标

【重要】输出格式要求：
- 必须返回纯JSON对象，不要包含任何Markdown标记
- 禁止使用 \`\`\`json 代码块包裹
- 直接输出 { ... } 格式的JSON
- 每个段落包含narrative_goal、emotion_target、key_points
- 标注引用来源的可信度
- 识别需要核验的内容`,

  news_brief: `你是一位专业的新闻播客编辑，擅长从多条素材中提炼新闻早报结构。

你的任务：
1. 对素材进行事件聚类（同事件不同来源应合并）
2. 根据时效性、重要性、完整性筛选新闻条目
3. 构建新闻播报结构（导语→N条新闻→总结）
4. 确保事实准确性，区分事实与观点

【重要】输出格式要求：
- 必须返回纯JSON对象，不要包含任何Markdown标记
- 禁止使用 \`\`\`json 代码块包裹
- 直接输出 { ... } 格式的JSON
- 每条新闻包含核心事实、多方来源、置信度评估
- 标注需要人工核验的低置信内容
- 说明聚类和筛选逻辑`,
} as const

export function buildTypeDetectionPrompt(materials: EnhancedMaterial[]): string {
  const materialsSummary = materials.slice(0, 20).map((m, i) => 
    `${i + 1}. ${m.title || '无标题'}\n   来源: ${m.source || '未知'}\n   时间: ${m.published || '未知'}`
  ).join('\n\n')

  return `分析以下素材，判断更适合制作「故事型播客」还是「新闻型播客」。

素材列表（共${materials.length}条，展示前20条）：
${materialsSummary}

判断标准：
- 新闻型：素材时效性强、事件密集、来源多样、适合快报
- 故事型：素材围绕核心主题、有叙事深度、适合深度展开

【重要】输出格式要求：
- 必须返回纯JSON对象，不要使用Markdown代码块包裹
- 禁止输出 \`\`\`json 或 \`\`\` 标记
- 直接输出符合以下schema的JSON：

{
  "content_type": "story",
  "confidence": 85,
  "reason": "判断理由",
  "material_characteristics": {
    "timeliness": "high",
    "event_density": "medium",
    "narrative_depth": "high"
  }
}
`
}

export function buildNewsPlanningPrompt(
  materials: EnhancedMaterial[],
  maxCount: number,
  strategy: 'coverage' | 'depth'
): string {
  const materialsSummary = materials.map((m, i) => ({
    index: i,
    title: m.title || '无标题',
    source: m.source || '未知',
    published: m.published || '未知',
    cluster_id: m._event_cluster_id,
    cluster_name: m._event_cluster_name,
  }))

  return `根据以下${materials.length}条素材，规划新闻条目数量和结构。

素材信息：
${JSON.stringify(materialsSummary, null, 2)}

规划约束：
- 最多${maxCount}条新闻
- 策略：${strategy === 'coverage' ? '覆盖优先（更多事件）' : '深度优先（少而精）'}

【重要】输出格式要求：
- 必须返回纯JSON对象，不要使用Markdown代码块包裹
- 禁止输出 \`\`\`json 或 \`\`\` 标记
- 直接输出符合以下schema的JSON：

{
  "recommended_count": 5,
  "reason": "规划理由",
  "news_items": [
    {
      "index": 0,
      "title": "新闻标题",
      "material_indices": [0, 1, 2],
      "event_cluster_id": "cluster_1",
      "priority": "high",
      "estimated_duration_seconds": 60
    }
  ],
  "clustering_applied": true,
  "warnings": []
}
`
}

export function buildStoryStructurePrompt(
  context: IdeationContext,
  targetTopic?: string
): string {
  const materialsInfo = context.materials.map((m, i) => ({
    index: i,
    title: m.title || '无标题',
    content_preview: (m.content || '').slice(0, 200),
    source: m.source,
    credibility: m._credibility_score,
  }))

  const userPrefs = context.user_preferences
  const challenge = context.ideation_challenge || 'normal'

  return `基于以下素材，生成故事型播客结构。

${targetTopic ? `目标主题：${targetTopic}\n` : ''}
素材信息（共${context.materials.length}条）：
${JSON.stringify(materialsInfo, null, 2)}

用户偏好：
- 语气风格：${userPrefs?.tone_style || 'balanced'}
- 时长偏好：${userPrefs?.duration_preference || 'medium'}
- 构思挑战模式：${challenge}

【重要】输出格式要求：
- 必须返回纯JSON对象，不要使用Markdown代码块包裹
- 禁止输出 \`\`\`json 或 \`\`\` 标记
- 直接输出符合以下schema的JSON：

{
  "topic": {
    "title": "AI时代的伦理困境",
    "description": "探讨人工智能发展中的道德边界"
  },
  "blocks": [
    {
      "type": "opening",
      "title": "开场引入",
      "material_indices": [0, 1],
      "narrative_goal": "引发听众对AI伦理的思考",
      "emotion_target": "好奇与警觉",
      "key_points": ["AI发展现状", "引出核心问题"],
      "duration_estimate": 90,
      "sources": [
        {
          "material_index": 0,
          "confidence": "high",
          "fact_or_opinion": "fact"
        }
      ]
    }
  ],
  "quality_notes": "结构完整，素材引用准确"
}
`
}

export function buildNewsStructurePrompt(
  context: IdeationContext,
  newsItemPlan: { recommended_count: number; news_items: any[] }
): string {
  const materialsInfo = context.materials.map((m, i) => ({
    index: i,
    title: m.title || '无标题',
    content_preview: (m.content || '').slice(0, 200),
    source: m.source,
    published: m.published,
    credibility: m._credibility_score,
    fact_checked: m._fact_checked,
  }))

  return `基于以下素材和规划，生成新闻早报播客结构。

素材信息：
${JSON.stringify(materialsInfo, null, 2)}

新闻条目规划：
${JSON.stringify(newsItemPlan, null, 2)}

【重要】输出格式要求：
- 必须返回纯JSON对象，不要使用Markdown代码块包裹
- 禁止输出 \`\`\`json 或 \`\`\` 标记
- 直接输出符合以下schema的JSON：

{
  "topic": {
    "title": "今日科技要闻",
    "description": "聚焦AI、新能源与政策动态"
  },
  "blocks": [
    {
      "type": "opening",
      "title": "开场",
      "key_points": ["欢迎收听", "今日要点概述"],
      "duration_estimate": 30
    },
    {
      "type": "news_item",
      "title": "OpenAI发布新模型",
      "material_indices": [0, 1, 3],
      "narrative_goal": "传递核心事实",
      "key_points": ["模型能力提升", "发布时间", "市场影响"],
      "duration_estimate": 60,
      "sources": [
        {
          "material_index": 0,
          "confidence": "high",
          "fact_or_opinion": "fact",
          "needs_verification": false
        }
      ]
    },
    {
      "type": "closing",
      "title": "结尾",
      "key_points": ["今日要点总结", "明日预告"],
      "duration_estimate": 30
    }
  ],
  "fact_check_warnings": [],
  "quality_score": {
    "source_reliability": 85,
    "fact_coverage": 90
  }
}
`
}

export function buildBlockRegenerationPrompt(
  blockType: string,
  materials: EnhancedMaterial[],
  previousContent?: string,
  userFeedback?: string
): string {
  return `重新生成${blockType}段落内容。

可用素材：
${JSON.stringify(materials.map((m, i) => ({
  index: i,
  title: m.title,
  content_preview: (m.content || '').slice(0, 150),
})), null, 2)}

${previousContent ? `之前版本：\n${previousContent}\n` : ''}
${userFeedback ? `用户反馈：\n${userFeedback}\n` : ''}

【重要】输出格式要求：
- 必须返回纯JSON对象，不要使用Markdown代码块包裹
- 禁止输出 \`\`\`json 或 \`\`\` 标记
- 直接输出改进后的段落JSON结构`
}

export function buildQualityAssessmentPrompt(result: any): string {
  return `评估以下播客构思的质量：

${JSON.stringify(result, null, 2)}

【重要】输出格式要求：
- 必须返回纯JSON对象，不要使用Markdown代码块包裹
- 禁止输出 \`\`\`json 或 \`\`\` 标记
- 直接输出符合以下schema的JSON：

{
  "structure_completeness": 85,
  "source_reliability": 78,
  "redundancy_level": 20,
  "speakability": 90,
  "overall": 82,
  "improvement_suggestions": ["建议增加背景说明", "部分引用需要核实"],
  "critical_issues": []
}
`
}
