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
    barColor: '#2563eb', 
    bgColor: '#eff6ff', 
    tagBg: '#dbeafe', 
    tagColor: '#1d4ed8' 
  },
  important: { 
    label: '重要', 
    barColor: '#06b6d4', 
    bgColor: '#ffffff', 
    tagBg: '#cffafe', 
    tagColor: '#0891b2' 
  },
  backup: { 
    label: '备用', 
    barColor: '#e5e7eb', 
    bgColor: '#ffffff', 
    tagBg: '#f3f4f6', 
    tagColor: '#6b7280' 
  },
}

export function prioritySortKey(p: Priority): number {
  if (p === 'primary') return 0
  if (p === 'important') return 1
  return 2
}
