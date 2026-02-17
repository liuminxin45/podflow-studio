import { useState, useCallback, useEffect } from 'react'
import type {
  IdeationContext,
  IdeationResult,
  IdeationConfig,
  IdeationStatus,
  DualTrackState,
  EnhancedMaterial,
  StructureBlock,
} from '../types/ideation'
import { ideationService } from '../services/ideation/ideationService'
import { ideationConfigManager } from '../services/ideation/config'

interface UseIdeationOptions {
  materials: EnhancedMaterial[]
  onComplete?: (result: IdeationResult) => void
}

interface UseIdeationReturn {
  // 状态
  status: IdeationStatus
  dualTrack: DualTrackState
  config: IdeationConfig
  llmAvailable: boolean
  
  // 当前工作版本
  workingDraft: IdeationResult | null
  
  // 操作
  generateLLMVersion: () => Promise<void>
  regenerateBlock: (blockId: string, userFeedback?: string) => Promise<void>
  adoptLLMVersion: () => void
  adoptManualVersion: () => void
  adoptBlock: (blockId: string, source: 'manual' | 'llm') => void
  mergeVersions: (blockSelections: Record<string, 'manual' | 'llm'>) => void
  updateConfig: (updates: Partial<IdeationConfig>) => void
  resetToManual: () => void
  
  // 错误
  error: string | null
  warnings: string[]
}

const DEFAULT_CONFIG: IdeationConfig = {
  mode: 'hybrid',
  prefer_llm: false,
  auto_detect_type: true,
  news_auto_count: true,
  news_max_count: 8,
  news_strategy: 'coverage',
  min_quality_score: 60,
  enable_fact_check: true,
}

export function useIdeation({ materials, onComplete }: UseIdeationOptions): UseIdeationReturn {
  const [status, setStatus] = useState<IdeationStatus>('idle')
  const [llmAvailable, setLlmAvailable] = useState(false)
  const [config, setConfig] = useState<IdeationConfig>(DEFAULT_CONFIG)
  const [dualTrack, setDualTrack] = useState<DualTrackState>({
    manual_version: null,
    llm_version: null,
    working_draft: null,
    merge_history: [],
  })
  const [error, setError] = useState<string | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])

  useEffect(() => {
    ideationService.isLLMAvailable().then(setLlmAvailable)
  }, [])

  const generateLLMVersion = useCallback(async () => {
    if (!llmAvailable) {
      setError('LLM不可用，请在Settings中配置')
      return
    }

    setStatus('generating')
    setError(null)
    setWarnings([])

    try {
      const context: IdeationContext = {
        materials,
        user_preferences: ideationConfigManager.getUserPreferences(),
        ideation_challenge: ideationConfigManager.getIdeationChallenge(),
      }

      const response = await ideationService.generateIdeation(context, config)

      if (!response.success) {
        setError(response.error?.message || '生成失败')
        setStatus('error')
        return
      }

      if (response.warnings) {
        setWarnings(response.warnings)
      }

      setDualTrack(prev => ({
        ...prev,
        llm_version: response.result || null,
        working_draft: prev.working_draft || response.result || null,
      }))

      setStatus('complete')
      
      if (response.result && onComplete) {
        onComplete(response.result)
      }
    } catch (err: any) {
      setError(err.message || '生成失败')
      setStatus('error')
    }
  }, [materials, config, llmAvailable, onComplete])

  const regenerateBlock = useCallback(async (blockId: string, userFeedback?: string) => {
    if (!dualTrack.llm_version) return

    const block = dualTrack.llm_version.blocks.find(b => b.id === blockId)
    if (!block) return

    setStatus('partial')

    try {
      const response = await ideationService.regenerateBlock(
        block,
        materials,
        userFeedback
      )

      if (response.success && response.block) {
        setDualTrack(prev => {
          const updatedLLM = { ...prev.llm_version! }
          updatedLLM.blocks = updatedLLM.blocks.map(b =>
            b.id === blockId ? response.block! : b
          )

          const updatedWorking = prev.working_draft?.id === prev.llm_version?.id
            ? updatedLLM
            : prev.working_draft

          return {
            ...prev,
            llm_version: updatedLLM,
            working_draft: updatedWorking,
          }
        })
        setStatus('complete')
      } else {
        setError(response.error || '重新生成失败')
        setStatus('error')
      }
    } catch (err: any) {
      setError(err.message)
      setStatus('error')
    }
  }, [dualTrack.llm_version, materials])

  const adoptLLMVersion = useCallback(() => {
    if (!dualTrack.llm_version) return

    setDualTrack(prev => ({
      ...prev,
      working_draft: prev.llm_version,
      merge_history: [
        ...prev.merge_history,
        {
          timestamp: new Date().toISOString(),
          source: 'llm',
          block_ids: prev.llm_version?.blocks.map(b => b.id) || [],
        },
      ],
    }))
  }, [dualTrack.llm_version])

  const adoptManualVersion = useCallback(() => {
    if (!dualTrack.manual_version) return

    setDualTrack(prev => ({
      ...prev,
      working_draft: prev.manual_version,
      merge_history: [
        ...prev.merge_history,
        {
          timestamp: new Date().toISOString(),
          source: 'manual',
          block_ids: prev.manual_version?.blocks.map(b => b.id) || [],
        },
      ],
    }))
  }, [dualTrack.manual_version])

  const adoptBlock = useCallback((blockId: string, source: 'manual' | 'llm') => {
    const sourceVersion = source === 'manual' ? dualTrack.manual_version : dualTrack.llm_version
    if (!sourceVersion || !dualTrack.working_draft) return

    const sourceBlock = sourceVersion.blocks.find(b => b.id === blockId)
    if (!sourceBlock) return

    setDualTrack(prev => {
      const updated = { ...prev.working_draft! }
      updated.blocks = updated.blocks.map(b =>
        b.id === blockId ? sourceBlock : b
      )

      return {
        ...prev,
        working_draft: updated,
        merge_history: [
          ...prev.merge_history,
          {
            timestamp: new Date().toISOString(),
            source,
            block_ids: [blockId],
          },
        ],
      }
    })
  }, [dualTrack])

  const mergeVersions = useCallback((blockSelections: Record<string, 'manual' | 'llm'>) => {
    if (!dualTrack.manual_version || !dualTrack.llm_version) return

    const mergedBlocks: StructureBlock[] = []

    Object.entries(blockSelections).forEach(([blockId, source]) => {
      const sourceVersion = source === 'manual' ? dualTrack.manual_version : dualTrack.llm_version
      const block = sourceVersion?.blocks.find(b => b.id === blockId)
      if (block) {
        mergedBlocks.push(block)
      }
    })

    const mergedResult: IdeationResult = {
      id: `ideation_merged_${Date.now()}`,
      timestamp: new Date().toISOString(),
      mode: 'hybrid',
      content_type: dualTrack.llm_version.content_type,
      topic: dualTrack.llm_version.topic,
      blocks: mergedBlocks,
    }

    setDualTrack(prev => ({
      ...prev,
      working_draft: mergedResult,
      merge_history: [
        ...prev.merge_history,
        {
          timestamp: new Date().toISOString(),
          source: 'hybrid',
          block_ids: mergedBlocks.map(b => b.id),
        },
      ],
    }))
  }, [dualTrack])

  const updateConfig = useCallback((updates: Partial<IdeationConfig>) => {
    setConfig(prev => ({ ...prev, ...updates }))
  }, [])

  const resetToManual = useCallback(() => {
    setDualTrack({
      manual_version: null,
      llm_version: null,
      working_draft: null,
      merge_history: [],
    })
    setStatus('idle')
    setError(null)
    setWarnings([])
  }, [])

  return {
    status,
    dualTrack,
    config,
    llmAvailable,
    workingDraft: dualTrack.working_draft,
    generateLLMVersion,
    regenerateBlock,
    adoptLLMVersion,
    adoptManualVersion,
    adoptBlock,
    mergeVersions,
    updateConfig,
    resetToManual,
    error,
    warnings,
  }
}
