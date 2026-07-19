export interface CategoryRule {
  id: string
  label: string
  color: string
  bg: string
  keywords: string[]
}

/**
 * Comprehensive predefined news categories.
 * LLM classification is CONSTRAINED to only pick from these IDs.
 * The last entry 'other' is the fallback for anything that doesn't fit.
 */
export const CATEGORY_RULES: CategoryRule[] = [
  {
    id: 'regulation',
    label: '监管政策',
    color: '#ea580c',
    bg: '#fff7ed',
    keywords: ['监管', '政策', '法规', '合规', '审查', '禁令', '立法', 'regulation', 'policy', 'compliance', 'ban', 'restrict', 'law'],
  },
  {
    id: 'breakthrough',
    label: '技术突破',
    color: '#2563eb',
    bg: '#eff6ff',
    keywords: ['突破', '开源', '新模型', '算法', '架构', 'release', 'launch', 'breakthrough', 'open source', 'GPT', 'model', 'LLM'],
  },
  {
    id: 'product',
    label: '产品发布',
    color: '#8b5cf6',
    bg: '#faf5ff',
    keywords: ['产品', '发布', '更新', '版本', '功能', '上线', '体验', 'product', 'update', 'feature', 'version', 'app', 'release'],
  },
  {
    id: 'market',
    label: '市场动向',
    color: '#16a34a',
    bg: '#f0fdf4',
    keywords: ['融资', '估值', '收购', '上市', 'IPO', '营收', '投资', '市值', 'funding', 'valuation', 'acquisition', 'revenue', 'market'],
  },
  {
    id: 'people',
    label: '人物动态',
    color: '#7c3aed',
    bg: '#f5f3ff',
    keywords: ['CEO', 'CTO', '创始人', '离职', '加入', '任命', '专访', 'founder', 'hire', 'resign', 'join', 'interview'],
  },
  {
    id: 'science',
    label: '科学研究',
    color: '#0d9488',
    bg: '#f0fdfa',
    keywords: ['论文', '研究', '实验', '学术', '发现', '基准', 'paper', 'research', 'study', 'experiment', 'arxiv', 'benchmark'],
  },
  {
    id: 'trend',
    label: '行业趋势',
    color: '#0891b2',
    bg: '#ecfeff',
    keywords: ['趋势', '增长', '变化', '转型', '预测', '展望', 'trend', 'growth', 'shift', 'transform', 'forecast'],
  },
  {
    id: 'security',
    label: '安全隐私',
    color: '#dc2626',
    bg: '#fef2f2',
    keywords: ['安全', '隐私', '漏洞', '攻击', '数据泄露', '风险', 'security', 'privacy', 'vulnerability', 'attack', 'breach', 'risk'],
  },
  {
    id: 'funding',
    label: '融资并购',
    color: '#059669',
    bg: '#ecfdf5',
    keywords: ['融资', '并购', '收购', '合并', 'A轮', 'B轮', 'C轮', '种子轮', 'Series', 'merger', 'acquire', 'deal'],
  },
  {
    id: 'application',
    label: '行业应用',
    color: '#0284c7',
    bg: '#f0f9ff',
    keywords: ['应用', '落地', '场景', '案例', '方案', '部署', 'application', 'use case', 'deploy', 'solution', 'enterprise'],
  },
  {
    id: 'society',
    label: '社会影响',
    color: '#64748b',
    bg: '#f8fafc',
    keywords: ['就业', '伦理', '社会', '影响', '争议', '偏见', 'ethics', 'impact', 'employment', 'society', 'bias', 'controversy'],
  },
  {
    id: 'education',
    label: '教育培训',
    color: '#ca8a04',
    bg: '#fefce8',
    keywords: ['教程', '课程', '学习', '培训', '教学', '认证', 'tutorial', 'course', 'learning', 'training', 'guide', 'certification'],
  },
  {
    id: 'developer',
    label: '开发者工具',
    color: '#475569',
    bg: '#f1f5f9',
    keywords: ['开发者', 'API', 'SDK', '框架', '工具链', '开源', 'developer', 'framework', 'tool', 'library', 'github', 'open source'],
  },
  {
    id: 'hardware',
    label: '硬件算力',
    color: '#b45309',
    bg: '#fffbeb',
    keywords: ['芯片', 'GPU', '算力', '硬件', '服务器', '数据中心', 'chip', 'hardware', 'compute', 'NVIDIA', 'datacenter', 'TPU'],
  },
  {
    id: 'data',
    label: '数据与基础设施',
    color: '#7c3aed',
    bg: '#faf5ff',
    keywords: ['数据', '数据集', '标注', '基础设施', '云服务', 'dataset', 'data', 'annotation', 'infrastructure', 'cloud'],
  },
  {
    id: 'competition',
    label: '行业竞争',
    color: '#e11d48',
    bg: '#fff1f2',
    keywords: ['竞争', '对手', '对比', '评测', '排名', '份额', 'competition', 'rival', 'compare', 'ranking', 'share'],
  },
  {
    id: 'opinion',
    label: '观点评论',
    color: '#6366f1',
    bg: '#eef2ff',
    keywords: ['观点', '评论', '分析', '预测', '看法', '解读', 'opinion', 'analysis', 'comment', 'perspective', 'editorial'],
  },
  {
    id: 'partnership',
    label: '合作生态',
    color: '#0d9488',
    bg: '#f0fdfa',
    keywords: ['合作', '战略', '联盟', '生态', '伙伴', '集成', 'partnership', 'alliance', 'ecosystem', 'integration', 'collaborate'],
  },
  {
    id: 'other',
    label: '其他',
    color: '#9ca3af',
    bg: '#f9fafb',
    keywords: [],
  },
]

/**
 * Get the full category list for LLM prompt — maps id → label
 */
export function getCategoryListForPrompt(): Array<{ id: string; label: string }> {
  return CATEGORY_RULES.map(r => ({ id: r.id, label: r.label }))
}

/**
 * Get display info by category ID (returns 'other' if not found)
 */
export function getCategoryById(id: string): CategoryRule {
  return CATEGORY_RULES.find(r => r.id === id) || CATEGORY_RULES[CATEGORY_RULES.length - 1]
}

/** All valid category IDs (for LLM validation) */
export const VALID_CATEGORY_IDS = new Set(CATEGORY_RULES.map(r => r.id))
