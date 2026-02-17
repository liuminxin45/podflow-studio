/**
 * Ideation Layer Types
 * 构思层核心类型定义 - 支持手动与LLM双轨并行
 */

import type { ContentCreationType, ContentItem } from './workflow'

// ============================================================
// Core Ideation Types
// ============================================================

export type IdeationMode = 'manual' | 'llm' | 'hybrid'
export type IdeationStatus = 'idle' | 'generating' | 'partial' | 'complete' | 'error'
export type BlockGenerationStatus = 'pending' | 'generating' | 'success' | 'error'

// ============================================================
// Enhanced Material with Upstream Metadata
// ============================================================

export interface EnhancedMaterial extends ContentItem {
  _source_channel?: 'auto' | 'manual'
  
  // 上游整理层传递的增强字段
  _dedupe_id?: string
  _event_cluster_id?: string
  _event_cluster_name?: string
  _credibility_score?: number  // 0-100
  _timeliness_score?: number   // 0-100
  _controversy_score?: number  // 0-100
  _fact_checked?: boolean
  
  // 构思层使用标记
  _assigned_to_block?: string
  _manual_priority?: number
}

// ============================================================
// Ideation Structure Block
// ============================================================

export type StructureBlockType = 
  | 'opening' 
  | 'mainline' 
  | 'discussion' 
  | 'background' 
  | 'news_item' 
  | 'closing' 
  | 'custom'

export interface StructureBlock {
  id: string
  type: StructureBlockType
  title: string
  materials: EnhancedMaterial[]
  notes: string
  
  // LLM生成增强字段
  llm_generated?: boolean
  llm_suggestions?: {
    narrative_goal?: string      // 叙事目标
    emotion_target?: string       // 情绪目标
    duration_estimate?: number    // 预估时长（秒）
    key_points?: string[]         // 要点列表
    sources?: MaterialReference[] // 引用来源
  }
  
  // 生成状态
  generation_status?: BlockGenerationStatus
  generation_error?: string
}

export interface MaterialReference {
  material_id: number | string
  url?: string
  title?: string
  confidence: 'high' | 'medium' | 'low'
  fact_or_opinion: 'fact' | 'opinion' | 'mixed'
  needs_verification?: boolean
}

// ============================================================
// News Item Planning
// ============================================================

export interface NewsItemPlan {
  recommended_count: number
  reason: string
  strategy: 'coverage' | 'depth'
  clustering_applied: boolean
  event_clusters?: Array<{
    cluster_id: string
    cluster_name: string
    material_count: number
    recommended_as_single_item: boolean
  }>
}

// ============================================================
// Ideation Result
// ============================================================

export interface IdeationResult {
  id: string
  timestamp: string
  mode: IdeationMode
  content_type: ContentCreationType
  
  // Topic
  topic: {
    title: string
    description: string
    auto_detected?: boolean
    detection_reason?: string
  }
  
  // Structure
  blocks: StructureBlock[]
  news_item_plan?: NewsItemPlan
  
  // Quality metrics
  quality_score?: {
    structure_completeness: number  // 0-100
    source_reliability: number      // 0-100
    redundancy_level: number        // 0-100 (lower is better)
    speakability: number            // 0-100
    overall: number
  }
  
  // Generation metadata
  llm_metadata?: {
    model: string
    temperature: number
    total_tokens?: number
    duration_ms: number
    partial_failure_blocks?: string[]
  }
}

// ============================================================
// Ideation Config
// ============================================================

export interface IdeationConfig {
  // Mode selection
  mode: IdeationMode
  prefer_llm: boolean
  
  // Content type
  content_type?: ContentCreationType
  auto_detect_type: boolean
  
  // News planning
  news_auto_count: boolean
  news_max_count: number
  news_strategy: 'coverage' | 'depth'
  
  // Quality gates
  min_quality_score: number
  enable_fact_check: boolean
  
  // LLM settings (from Settings page)
  llm_model?: string
  llm_temperature?: number
  llm_timeout?: number
}

// ============================================================
// Ideation Context (for LLM)
// ============================================================

export interface IdeationContext {
  materials: EnhancedMaterial[]
  user_preferences?: {
    tone_style?: 'rational' | 'emotional' | 'balanced'
    content_tendency?: 'news' | 'story' | 'mixed'
    duration_preference?: 'short' | 'medium' | 'long'
  }
  ideation_challenge?: 'normal' | 'critical' | 'reverse'
  target_topic?: string
}

// ============================================================
// Dual Track State
// ============================================================

export interface DualTrackState {
  manual_version: IdeationResult | null
  llm_version: IdeationResult | null
  working_draft: IdeationResult | null
  merge_history: Array<{
    timestamp: string
    source: 'manual' | 'llm' | 'hybrid'
    block_ids: string[]
  }>
}

// ============================================================
// Service Response Types
// ============================================================

export interface IdeationServiceResponse {
  success: boolean
  result?: IdeationResult
  error?: {
    code: 'LLM_ERROR' | 'VALIDATION_ERROR' | 'TIMEOUT' | 'INSUFFICIENT_DATA'
    message: string
    recoverable: boolean
    fallback_available: boolean
  }
  warnings?: string[]
}

export interface BlockGenerationResponse {
  success: boolean
  block?: StructureBlock
  error?: string
  partial_data?: Partial<StructureBlock>
}
