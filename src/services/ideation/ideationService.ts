import type {
  IdeationContext,
  IdeationResult,
  IdeationServiceResponse,
  BlockGenerationResponse,
  StructureBlock,
  NewsItemPlan,
  EnhancedMaterial,
  IdeationConfig,
} from '../../types/ideation'
import type { ContentCreationType } from '../../types/workflow'
import { llmService } from '../llmService'
import { IDEATION_TIMEOUTS, IDEATION_TEMPERATURES, NEWS_PLANNING_RULES } from '../../constants/ideation'
import { ideationConfigManager, type LLMConfig } from './config'
import {
  SYSTEM_PROMPTS,
  buildTypeDetectionPrompt,
  buildNewsPlanningPrompt,
  buildStoryStructurePrompt,
  buildNewsStructurePrompt,
  buildBlockRegenerationPrompt,
  buildQualityAssessmentPrompt,
} from './prompts'
import { parseJSONFromLLM, validateIdeationResult } from './utils'

class IdeationService {
  async isLLMAvailable(): Promise<boolean> {
    return ideationConfigManager.isLLMAvailable()
  }

  async detectContentType(
    materials: EnhancedMaterial[]
  ): Promise<{ type: ContentCreationType; confidence: number; reason: string } | null> {
    const llmConfig = ideationConfigManager.getLLMConfig()
    if (!llmConfig) return null

    try {
      const prompt = buildTypeDetectionPrompt(materials)
      const response = await llmService.call({
        apiBase: llmConfig.apiBase,
        apiKey: llmConfig.apiKey,
        model: llmConfig.model,
        messages: [
          { role: 'system', content: '你是内容类型分析专家，返回严格的JSON格式。' },
          { role: 'user', content: prompt },
        ],
        temperature: IDEATION_TEMPERATURES.TYPE_DETECTION,
        timeout: IDEATION_TIMEOUTS.TYPE_DETECTION,
      })

      const content = response.choices[0]?.message?.content
      if (!content) throw new Error('Empty response')

      const result = parseJSONFromLLM(content)
      return {
        type: result.content_type,
        confidence: result.confidence,
        reason: result.reason,
      }
    } catch (error) {
      console.error('[IdeationService] Content type detection failed:', error)
      return null
    }
  }

  async planNewsItems(
    materials: EnhancedMaterial[],
    config: IdeationConfig
  ): Promise<NewsItemPlan | null> {
    if (!config.news_auto_count) {
      return {
        recommended_count: Math.min(materials.length, config.news_max_count),
        reason: '用户手动控制条目数',
        strategy: config.news_strategy,
        clustering_applied: false,
      }
    }

    const llmConfig = ideationConfigManager.getLLMConfig()
    if (!llmConfig) {
      return this.fallbackNewsPlanning(materials, config)
    }

    try {
      const prompt = buildNewsPlanningPrompt(
        materials,
        config.news_max_count,
        config.news_strategy
      )

      const response = await llmService.call({
        apiBase: llmConfig.apiBase,
        apiKey: llmConfig.apiKey,
        model: llmConfig.model,
        messages: [
          { role: 'system', content: '你是新闻编辑专家，返回严格的JSON格式。' },
          { role: 'user', content: prompt },
        ],
        temperature: IDEATION_TEMPERATURES.NEWS_PLANNING,
        timeout: IDEATION_TIMEOUTS.NEWS_PLANNING,
      })

      const content = response.choices[0]?.message?.content
      if (!content) throw new Error('Empty response')

      const result = parseJSONFromLLM(content)
      
      return {
        recommended_count: result.recommended_count,
        reason: result.reason,
        strategy: config.news_strategy,
        clustering_applied: result.clustering_applied || false,
        event_clusters: result.news_items?.map((item: any) => ({
          cluster_id: item.event_cluster_id || `cluster_${item.index}`,
          cluster_name: item.title,
          material_count: item.material_indices?.length || 1,
          recommended_as_single_item: true,
        })),
      }
    } catch (error) {
      console.error('[IdeationService] News planning failed:', error)
      return this.fallbackNewsPlanning(materials, config)
    }
  }

  async generateIdeation(
    context: IdeationContext,
    config: IdeationConfig
  ): Promise<IdeationServiceResponse> {
    const llmConfig = ideationConfigManager.getLLMConfig()
    
    if (!llmConfig) {
      return {
        success: false,
        error: {
          code: 'LLM_ERROR',
          message: 'LLM配置不可用，请在Settings中配置',
          recoverable: true,
          fallback_available: true,
        },
      }
    }

    // 检测内容类型
    let contentType = config.content_type
    let detectionReason: string | undefined
    
    if (config.auto_detect_type && !contentType) {
      const detection = await this.detectContentType(context.materials)
      if (detection) {
        contentType = detection.type
        detectionReason = detection.reason
      } else {
        contentType = 'story' // 默认
      }
    }

    if (!contentType) contentType = 'story'

    const startTime = Date.now()

    try {
      let result: IdeationResult

      if (contentType === 'news_brief') {
        result = await this.generateNewsStructure(context, config, llmConfig, detectionReason)
      } else {
        result = await this.generateStoryStructure(context, config, llmConfig, detectionReason)
      }

      // 质量评估
      const qualityScore = await this.assessQuality(result, llmConfig)
      result.quality_score = qualityScore

      const duration = Date.now() - startTime

      if (qualityScore && qualityScore.overall < config.min_quality_score) {
        return {
          success: false,
          result,
          error: {
            code: 'VALIDATION_ERROR',
            message: `构思质量未达标准（${qualityScore.overall}/${config.min_quality_score}），建议重新生成或手动调整`,
            recoverable: true,
            fallback_available: true,
          },
          warnings: [`质量分数: ${qualityScore.overall}/100`],
        }
      }

      return {
        success: true,
        result,
        warnings: duration > 60000 ? ['生成耗时较长，建议检查网络或更换模型'] : undefined,
      }
    } catch (error: any) {
      console.error('[IdeationService] Generation failed:', error)
      
      return {
        success: false,
        error: {
          code: 'LLM_ERROR',
          message: error.message || '生成失败',
          recoverable: true,
          fallback_available: true,
        },
      }
    }
  }

  async regenerateBlock(
    block: StructureBlock,
    materials: EnhancedMaterial[],
    userFeedback?: string
  ): Promise<BlockGenerationResponse> {
    const llmConfig = ideationConfigManager.getLLMConfig()
    if (!llmConfig) {
      return {
        success: false,
        error: 'LLM不可用',
      }
    }

    try {
      const prompt = buildBlockRegenerationPrompt(
        block.type,
        materials,
        JSON.stringify(block),
        userFeedback
      )

      const response = await llmService.call({
        apiBase: llmConfig.apiBase,
        apiKey: llmConfig.apiKey,
        model: llmConfig.model,
        messages: [
          { role: 'system', content: '你是播客内容构思专家，返回严格的JSON格式。' },
          { role: 'user', content: prompt },
        ],
        temperature: IDEATION_TEMPERATURES.BLOCK_REGENERATION,
        timeout: IDEATION_TIMEOUTS.BLOCK_REGENERATION,
      })

      const content = response.choices[0]?.message?.content
      if (!content) throw new Error('Empty response')

      const result = parseJSONFromLLM(content)
      
      return {
        success: true,
        block: {
          ...block,
          ...result,
          llm_generated: true,
          generation_status: 'success',
        },
      }
    } catch (error: any) {
      console.error('[IdeationService] Block regeneration failed:', error)
      return {
        success: false,
        error: error.message,
        partial_data: block,
      }
    }
  }

  private async generateStoryStructure(
    context: IdeationContext,
    config: IdeationConfig,
    llmConfig: LLMConfig,
    detectionReason?: string
  ): Promise<IdeationResult> {
    const prompt = buildStoryStructurePrompt(context, context.target_topic)
    
    const response = await llmService.call({
      apiBase: llmConfig.apiBase,
      apiKey: llmConfig.apiKey,
      model: llmConfig.model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPTS.story },
        { role: 'user', content: prompt },
      ],
      temperature: config.llm_temperature || IDEATION_TEMPERATURES.STORY_GENERATION,
      timeout: config.llm_timeout || IDEATION_TIMEOUTS.STRUCTURE_GENERATION,
    })

    const content = response.choices[0]?.message?.content
    if (!content) throw new Error('Empty response')

    const parsed = parseJSONFromLLM(content)
    
    const validation = validateIdeationResult(parsed)
    if (!validation.valid) {
      throw new Error(`构思结果格式不正确: ${validation.errors.join(', ')}`)
    }
    
    return {
      id: `ideation_${Date.now()}`,
      timestamp: new Date().toISOString(),
      mode: 'llm',
      content_type: 'story',
      topic: {
        ...parsed.topic,
        auto_detected: !!detectionReason,
        detection_reason: detectionReason,
      },
      blocks: this.parseBlocks(parsed.blocks, context.materials),
      llm_metadata: {
        model: llmConfig.model,
        temperature: config.llm_temperature || IDEATION_TEMPERATURES.STORY_GENERATION,
        total_tokens: response.usage?.total_tokens,
        duration_ms: 0,
      },
    }
  }

  private async generateNewsStructure(
    context: IdeationContext,
    config: IdeationConfig,
    llmConfig: LLMConfig,
    detectionReason?: string
  ): Promise<IdeationResult> {
    const newsItemPlan = await this.planNewsItems(context.materials, config)
    if (!newsItemPlan) throw new Error('News planning failed')

    const prompt = buildNewsStructurePrompt(context, newsItemPlan as any)
    
    const response = await llmService.call({
      apiBase: llmConfig.apiBase,
      apiKey: llmConfig.apiKey,
      model: llmConfig.model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPTS.news_brief },
        { role: 'user', content: prompt },
      ],
      temperature: config.llm_temperature || IDEATION_TEMPERATURES.NEWS_GENERATION,
      timeout: config.llm_timeout || IDEATION_TIMEOUTS.STRUCTURE_GENERATION,
    })

    const content = response.choices[0]?.message?.content
    if (!content) throw new Error('Empty response')

    const parsed = parseJSONFromLLM(content)
    
    const validation = validateIdeationResult(parsed)
    if (!validation.valid) {
      throw new Error(`构思结果格式不正确: ${validation.errors.join(', ')}`)
    }
    
    return {
      id: `ideation_${Date.now()}`,
      timestamp: new Date().toISOString(),
      mode: 'llm',
      content_type: 'news_brief',
      topic: {
        ...parsed.topic,
        auto_detected: !!detectionReason,
        detection_reason: detectionReason,
      },
      blocks: this.parseBlocks(parsed.blocks, context.materials),
      news_item_plan: newsItemPlan,
      llm_metadata: {
        model: llmConfig.model,
        temperature: config.llm_temperature || IDEATION_TEMPERATURES.NEWS_GENERATION,
        total_tokens: response.usage?.total_tokens,
        duration_ms: 0,
      },
    }
  }

  private parseBlocks(rawBlocks: any[], materials: EnhancedMaterial[]): StructureBlock[] {
    return rawBlocks.map((b, idx) => ({
      id: `block_${Date.now()}_${idx}`,
      type: b.type || 'custom',
      title: b.title || '未命名段落',
      materials: (b.material_indices || [])
        .map((i: number) => materials[i])
        .filter(Boolean),
      notes: b.notes || '',
      llm_generated: true,
      llm_suggestions: {
        narrative_goal: b.narrative_goal,
        emotion_target: b.emotion_target,
        duration_estimate: b.duration_estimate || 60,
        key_points: b.key_points || [],
        sources: b.sources || [],
      },
      generation_status: 'success',
    }))
  }

  private async assessQuality(
    result: IdeationResult,
    llmConfig: LLMConfig
  ): Promise<typeof result.quality_score> {
    try {
      const prompt = buildQualityAssessmentPrompt(result)
      
      const response = await llmService.call({
        apiBase: llmConfig.apiBase,
        apiKey: llmConfig.apiKey,
        model: llmConfig.model,
        messages: [
          { role: 'system', content: '你是播客质量评估专家。' },
          { role: 'user', content: prompt },
        ],
        temperature: IDEATION_TEMPERATURES.QUALITY_ASSESSMENT,
        timeout: IDEATION_TIMEOUTS.QUALITY_ASSESSMENT,
      })

      const content = response.choices[0]?.message?.content
      if (!content) return undefined

      const assessment = parseJSONFromLLM(content)
      return {
        structure_completeness: assessment.structure_completeness,
        source_reliability: assessment.source_reliability,
        redundancy_level: assessment.redundancy_level,
        speakability: assessment.speakability,
        overall: assessment.overall,
      }
    } catch (error) {
      console.error('[IdeationService] Quality assessment failed:', error)
      return undefined
    }
  }

  private fallbackNewsPlanning(
    materials: EnhancedMaterial[],
    config: IdeationConfig
  ): NewsItemPlan {
    const count = materials.length
    let recommendedCount: number

    if (count <= NEWS_PLANNING_RULES.SMALL_BATCH.maxItems) {
      recommendedCount = Math.min(NEWS_PLANNING_RULES.SMALL_BATCH.recommended, count)
    } else if (count <= NEWS_PLANNING_RULES.MEDIUM_BATCH.maxItems) {
      recommendedCount = Math.min(NEWS_PLANNING_RULES.MEDIUM_BATCH.recommended, count)
    } else if (count <= NEWS_PLANNING_RULES.LARGE_BATCH.maxItems) {
      recommendedCount = Math.min(NEWS_PLANNING_RULES.LARGE_BATCH.recommended, count)
    } else {
      recommendedCount = Math.min(NEWS_PLANNING_RULES.XLARGE_BATCH.recommended, count)
    }

    recommendedCount = Math.min(recommendedCount, config.news_max_count)

    return {
      recommended_count: recommendedCount,
      reason: '基于素材数量的规则推荐',
      strategy: config.news_strategy,
      clustering_applied: false,
    }
  }
}

export const ideationService = new IdeationService()
