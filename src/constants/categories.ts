export interface CategoryRule {
  id: string
  label: string
  color: string
  bg: string
  keywords: string[]
}

export const CATEGORY_RULES: CategoryRule[] = [
  { 
    id: 'regulation', 
    label: '监管政策', 
    color: '#ea580c', 
    bg: '#fff7ed', 
    keywords: ['监管', '政策', '法规', '合规', '审查', 'regulation', 'policy', 'compliance', 'ban', 'restrict'] 
  },
  { 
    id: 'breakthrough', 
    label: '技术突破', 
    color: '#2563eb', 
    bg: '#eff6ff', 
    keywords: ['突破', '发布', '开源', '新模型', 'release', 'launch', 'breakthrough', 'open source', 'GPT', 'model'] 
  },
  { 
    id: 'market', 
    label: '市场动向', 
    color: '#16a34a', 
    bg: '#f0fdf4', 
    keywords: ['融资', '估值', '收购', '上市', 'IPO', '营收', 'funding', 'valuation', 'acquisition', 'revenue', 'market'] 
  },
  { 
    id: 'people', 
    label: '人物动态', 
    color: '#7c3aed', 
    bg: '#f5f3ff', 
    keywords: ['CEO', 'CTO', '创始人', '离职', '加入', 'founder', 'hire', 'resign', 'join'] 
  },
  { 
    id: 'trend', 
    label: '行业趋势', 
    color: '#0891b2', 
    bg: '#ecfeff', 
    keywords: ['趋势', '增长', '变化', '转型', 'trend', 'growth', 'shift', 'transform'] 
  },
]
