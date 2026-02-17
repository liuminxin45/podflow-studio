/**
 * Ideation Constants
 * 构思层常量配置
 */

export const IDEATION_TIMEOUTS = {
  TYPE_DETECTION: 30000,
  NEWS_PLANNING: 45000,
  STRUCTURE_GENERATION: 60000,
  BLOCK_REGENERATION: 30000,
  QUALITY_ASSESSMENT: 20000,
} as const

export const IDEATION_TEMPERATURES = {
  TYPE_DETECTION: 0.3,
  NEWS_PLANNING: 0.3,
  STORY_GENERATION: 0.7,
  NEWS_GENERATION: 0.3,
  BLOCK_REGENERATION: 0.5,
  QUALITY_ASSESSMENT: 0.3,
} as const

export const NEWS_PLANNING_RULES = {
  SMALL_BATCH: { maxItems: 4, recommended: 3 },
  MEDIUM_BATCH: { maxItems: 12, recommended: 5 },
  LARGE_BATCH: { maxItems: 25, recommended: 8 },
  XLARGE_BATCH: { maxItems: Infinity, recommended: 12 },
} as const

export const QUALITY_THRESHOLDS = {
  MIN_OVERALL_SCORE: 60,
  GOOD_SCORE: 70,
  EXCELLENT_SCORE: 85,
} as const

export const UI_DIMENSIONS = {
  MATERIAL_POOL_WIDTH: 320,
  INSIGHT_PANEL_WIDTH: 280,
  HEADER_HEIGHT: 52,
  MODAL_MAX_WIDTH: 1200,
  MODAL_MAX_HEIGHT_PERCENT: 90,
} as const

export const ANIMATION_DURATIONS = {
  FADE_IN: 200,
  SLIDE_IN: 300,
  HOVER_TRANSITION: 200,
} as const
