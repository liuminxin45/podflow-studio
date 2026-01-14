export interface StageInfo {
  id: string;
  name: string;
  description: string;
  icon: string;
  order: number;
}

export interface StageResult {
  status: 'success' | 'partial' | 'skipped' | 'failed' | 'pending';
  output: Record<string, unknown> | null;
  error: string | null;
  metadata: {
    stage_name: string;
    stage_version: string;
    started_at: string | null;
    completed_at: string | null;
    duration_seconds: number | null;
  };
}

export interface StageData {
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  result: StageResult | null;
}

export const STAGES: StageInfo[] = [
  { id: 'fetch', name: 'Fetch', description: '数据获取', icon: 'Download', order: 1 },
  { id: 'cluster', name: 'Cluster', description: '聚类分组', icon: 'Layers', order: 2 },
  { id: 'selection', name: 'Selection', description: '选题筛选', icon: 'Filter', order: 3 },
  { id: 'research', name: 'Research', description: '深度研究', icon: 'Search', order: 4 },
  { id: 'script', name: 'Script', description: '脚本生成', icon: 'FileText', order: 5 },
  { id: 'audio', name: 'Audio', description: '音频合成', icon: 'Volume2', order: 6 },
  { id: 'publish', name: 'Publish', description: '发布上线', icon: 'Upload', order: 7 },
];
