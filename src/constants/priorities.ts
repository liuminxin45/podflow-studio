export type Priority = 'primary' | 'important' | 'backup'

export interface PriorityConfig {
  label: string
  barColor: string
  bgColor: string
  tagBg: string
  tagColor: string
}

export const PRIORITY_CONFIG: Record<Priority, PriorityConfig> = {
  primary: { 
    label: '主线候选', 
    barColor: '#4f5156',
    bgColor: '#f4f4f5',
    tagBg: '#f4f4f5',
    tagColor: '#4f5156'
  },
  important: { 
    label: '重要', 
    barColor: '#4f5156',
    bgColor: '#ffffff', 
    tagBg: '#f4f4f5',
    tagColor: '#4f5156'
  },
  backup: { 
    label: '备用', 
    barColor: '#92949a',
    bgColor: '#ffffff', 
    tagBg: '#f4f4f5',
    tagColor: '#92949a'
  },
}

export function prioritySortKey(p: Priority): number {
  if (p === 'primary') return 0
  if (p === 'important') return 1
  return 2
}
