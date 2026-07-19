import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button, Input, Modal, message } from 'antd'
import type {
  ContentCreationType,
  ContentItem,
  FactCard,
  SelectedNewsTopic,
  Workflow,
} from '../types/workflow'
import { FileTextOutlined, WarningOutlined } from '../icons/antdCompat'
import { settingsRepository } from '../services/settings/repository'
import { persistCurrentWritingNodeConfigs } from '../services/settings/writingNodeConfig'
import { readyCandidatesForDraft } from '../utils/workflowDraftGuards'
import { resolveMorningNewsProfile } from '../services/writing/morningNewsProfile'
import WritingLayer from './writing'

type MaterialItem = ContentItem & { _source_channel?: 'auto'; _isDeepDive?: boolean }
const EMPTY_MATERIALS: MaterialItem[] = []
const EMPTY_FACTS: FactCard[] = []
const EMPTY_SELECTED_TOPICS: SelectedNewsTopic[] = []
const DRAFT_GENERATION_PHASES = [
  { id: 'preparing', label: '准备素材', detail: '同步创作偏好与本期资料' },
  { id: 'facts', label: '提炼事实', detail: '生成可追溯的事实卡片' },
  { id: 'script', label: '撰写初稿', detail: '按节目结构生成口播稿' },
  { id: 'validation', label: '校验成稿', detail: '检查稿件结构与生成结果' },
] as const
type DraftGenerationPhase = typeof DRAFT_GENERATION_PHASES[number]['id']

type MorningNewsStructure = {
  contentType?: ContentCreationType
  topic: { title?: string; description?: string }
  materials: MaterialItem[]
  facts: FactCard[]
  selected_topics: SelectedNewsTopic[]
  blocks: Array<{ id: string; type: string; title: string; materials: MaterialItem[]; notes: string }>
}

interface Props {
  visible: boolean
  onClose: () => void
  onBackToOrganize?: () => void
  rawContents: MaterialItem[]
  selectedTopic?: { title?: string; description?: string }
  selectedMaterials?: MaterialItem[]
  initialFacts?: FactCard[]
  initialSelectedTopics?: SelectedNewsTopic[]
  workflow?: Workflow | null
  onRunNodes?: (nodes: string[]) => Promise<Workflow | void> | Workflow | void
  onStateChange?: (structure: MorningNewsStructure) => Promise<void> | void
  onPrepareGeneration?: (mode: 'initial' | 'regenerate', draftPatch?: Record<string, any>) => Promise<void> | void
  onDraftPatchChange?: (patch: Record<string, any>) => void
  onProceedToProduction?: (patch: Record<string, any>) => Promise<void> | void
}

function slotTypeForIndex(index: number, quickNewsCount: number): 'quick_news' | 'deep_dive' {
  return index < quickNewsCount ? 'quick_news' : 'deep_dive'
}

export default function EpisodeDraftStudio({
  visible,
  onBackToOrganize,
  rawContents = EMPTY_MATERIALS,
  selectedTopic,
  selectedMaterials = EMPTY_MATERIALS,
  initialFacts = EMPTY_FACTS,
  initialSelectedTopics = EMPTY_SELECTED_TOPICS,
  workflow,
  onRunNodes,
  onStateChange,
  onPrepareGeneration,
  onDraftPatchChange,
  onProceedToProduction,
}: Props) {
  const [facts, setFacts] = useState<FactCard[]>([])
  const [topicTitle, setTopicTitle] = useState(selectedTopic?.title || '通勤早咖啡：今日新闻简报')
  const [topicDesc, setTopicDesc] = useState(selectedTopic?.description || '面向通勤场景的单人新闻早报')
  const [draftHasContent, setDraftHasContent] = useState(false)
  const [generationRunning, setGenerationRunning] = useState(false)
  const [generationPhase, setGenerationPhase] = useState<DraftGenerationPhase>('preparing')
  const [generationElapsedSeconds, setGenerationElapsedSeconds] = useState(0)
  const [savedSettings, setSavedSettings] = useState(() => settingsRepository.load())
  const [modalApi, modalContextHolder] = Modal.useModal()
  const [messageApi, messageContextHolder] = message.useMessage()
  const lastSyncedStateRef = useRef('')
  const draftPatchRef = useRef<Record<string, any> | undefined>()
  const morningNewsProfile = useMemo(() => resolveMorningNewsProfile(savedSettings), [savedSettings])
  const generationPhaseIndex = DRAFT_GENERATION_PHASES.findIndex(phase => phase.id === generationPhase)

  useEffect(() => {
    if (!generationRunning) return
    const startedAt = Date.now()
    setGenerationElapsedSeconds(0)
    const timer = window.setInterval(() => {
      setGenerationElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [generationRunning])

  // `rawContents` is the explicit handoff from the current organize session.
  // Persisted material is accepted only when it carries the same ready marker;
  // discovery selections must never leak into the draft as a fallback.
  const materials = useMemo(() => (
    rawContents.length > 0 ? rawContents : readyCandidatesForDraft(selectedMaterials)
  ), [rawContents, selectedMaterials])

  useEffect(() => {
    if (!visible) return
    setSavedSettings(settingsRepository.load())
    const nextFacts = factsForCurrentMaterials(initialFacts, materials)
    setFacts(nextFacts)
    setTopicTitle(selectedTopic?.title || '通勤早咖啡：今日新闻简报')
    setTopicDesc(selectedTopic?.description || '面向通勤场景的单人新闻早报')
  }, [initialFacts, materials, selectedTopic?.description, selectedTopic?.title, visible])

  // 时长偏好决定推荐密度；整理页已确认的新闻优先，实际可用事实是硬上限。
  const curatedFacts = useMemo(() => {
    if (initialSelectedTopics.length === 0) return facts
    const byId = new Map(facts.map(fact => [fact.id, fact]))
    const ordered = initialSelectedTopics
      .map(topic => byId.get(String(topic.fact_id || topic.id || '')))
      .filter((fact): fact is FactCard => Boolean(fact))
    return ordered.length > 0 ? ordered : facts
  }, [facts, initialSelectedTopics])
  const deepDiveFactId = useMemo(() => {
    const persisted = initialSelectedTopics.find(topic => topic.is_deep_dive)
    const persistedId = String(persisted?.fact_id || persisted?.id || '')
    if (persistedId && facts.some(fact => fact.id === persistedId)) return persistedId

    const deepMaterial = materials.find(material => material._isDeepDive)
    if (!deepMaterial) return ''
    const deepMaterialUrl = deepMaterial.url || ''
    return facts.find(fact => (
      deepMaterialUrl
        ? Boolean(fact.source_url && deepMaterialUrl === fact.source_url)
        : Boolean(deepMaterial.title && fact.title && deepMaterial.title === fact.title)
    ))?.id || ''
  }, [facts, initialSelectedTopics, materials])
  const resolvedNewsCount = Math.min(curatedFacts.length, morningNewsProfile.recommendedNewsItemCount)
  const resolvedDeepDiveCount = deepDiveFactId && resolvedNewsCount > 0
    ? 1
    : resolvedNewsCount >= 3
      ? Math.min(morningNewsProfile.deepDiveRecommendedCount, 1)
      : 0
  const resolvedQuickNewsCount = Math.max(0, resolvedNewsCount - resolvedDeepDiveCount)
  const selectedFacts = useMemo(() => {
    if (!deepDiveFactId || resolvedDeepDiveCount === 0) return curatedFacts.slice(0, resolvedNewsCount)
    const deepFact = curatedFacts.find(fact => fact.id === deepDiveFactId)
    if (!deepFact) return curatedFacts.slice(0, resolvedNewsCount)
    const quickFacts = curatedFacts.filter(fact => fact.id !== deepDiveFactId).slice(0, Math.max(0, resolvedNewsCount - 1))
    return [...quickFacts, deepFact]
  }, [curatedFacts, deepDiveFactId, resolvedDeepDiveCount, resolvedNewsCount])

  const selectedTopics = useMemo(() => (
    selectedFacts.map((fact, index) => ({
      id: `topic_${index + 1}`,
      title: fact.title,
      fact_id: fact.id,
      ...(resolvedDeepDiveCount > 0 && fact.id === deepDiveFactId ? { is_deep_dive: true } : {}),
    }))
  ), [deepDiveFactId, resolvedDeepDiveCount, selectedFacts])

  const sourceIssues = useMemo(() => selectedFacts.filter(fact => !fact.source_url).length, [selectedFacts])

  const structure = useMemo<MorningNewsStructure>(() => ({
    contentType: 'news_brief',
    topic: { title: topicTitle, description: topicDesc },
    materials,
    facts: selectedFacts,
    selected_topics: selectedTopics,
    blocks: [
      { id: 'opening', type: 'opening', title: '开场导语', materials: [], notes: '' },
      ...selectedFacts.map((fact, index) => ({
        id: `news_${index + 1}`,
        type: slotTypeForIndex(index, resolvedQuickNewsCount),
        title: fact.title,
        materials: materials.filter(item => item.title === fact.source_title || item.url === fact.source_url),
        notes: fact.claim,
      })),
      { id: 'closing', type: 'closing', title: '结尾总结', materials: [], notes: '' },
    ],
  }), [materials, resolvedQuickNewsCount, selectedFacts, selectedTopics, topicDesc, topicTitle])

  const draftWorkflow = useMemo<Workflow | null>(() => {
    if (!workflow) return null
    return {
      ...workflow,
      state: {
        ...workflow.state,
        selected_topic: {
          ...(workflow.state.selected_topic || {}),
          title: topicTitle,
          description: topicDesc,
        },
        selected_materials: materials,
        facts: selectedFacts,
        selected_topics: selectedTopics,
        episode_brief: structure,
      },
    }
  }, [materials, selectedFacts, selectedTopics, structure, topicDesc, topicTitle, workflow])

  useEffect(() => {
    if (!visible || (materials.length > 0 && selectedFacts.length === 0)) return
    const serialized = JSON.stringify({
      topic: structure.topic,
      facts: structure.facts,
      selected_topics: structure.selected_topics,
      block_count: structure.blocks.length,
    })
    if (serialized === lastSyncedStateRef.current) return
    lastSyncedStateRef.current = serialized
    void onStateChange?.(structure)
  }, [materials.length, onStateChange, selectedFacts.length, structure, visible])

  const hasStoredDraftContent = useMemo(() => (
    [workflow?.state?.edited_script, workflow?.state?.script].some(script => (
      (Array.isArray(script?.segments) && script.segments.some(segment => String(segment?.text || '').trim().length > 0))
    ))
  ), [workflow?.state?.edited_script, workflow?.state?.script])

  const generateScript = useCallback(async () => {
    if (selectedFacts.length === 0) {
      messageApi.warning('请先在整理页确认至少一条可用新闻，再生成初稿。')
      return
    }
    const isRegeneration = draftHasContent || hasStoredDraftContent
    if (isRegeneration) {
      const staleArtifactCount = Object.keys(workflow?.state?.downstream_stale?.artifacts || {}).length
      const shouldReplace = await new Promise<boolean>((resolve) => {
        modalApi.confirm({
          title: '重新生成初稿？',
          content: (
            <div>
              <p>将按当前已保存的创作偏好重新组织稿件，并替换当前可编辑稿。</p>
              <p>现有稿件会自动保留为一个版本快照；新稿成功前，当前稿不会被清空。</p>
              {staleArtifactCount > 0 && <p>已生成的音频、审核和发布结果会标记为需要重新制作。</p>}
            </div>
          ),
          okText: '继续生成',
          cancelText: '取消',
          okButtonProps: { danger: true },
          onOk: () => resolve(true),
          onCancel: () => resolve(false),
        })
      })
      if (!shouldReplace) return
    }

    try {
      setGenerationRunning(true)
      setGenerationPhase('preparing')
      await persistCurrentWritingNodeConfigs()
      // Persist the ready-only material package immediately before the node
      // run. This prevents an asynchronous screen transition from letting a
      // stale, broader `selected_materials` list reach FactsNode.
      await onStateChange?.(structure)
      await onPrepareGeneration?.(isRegeneration ? 'regenerate' : 'initial', draftPatchRef.current)
      setGenerationPhase('facts')
      const factsWorkflow = await onRunNodes?.(['facts'])
      const factsError = [...(factsWorkflow?.state?.errors || [])]
        .reverse()
        .find(error => error.node === 'facts')
      if (factsWorkflow?.status === 'failed') {
        throw new Error(factsError?.message || '事实卡片生成未完成')
      }

      setGenerationPhase('script')
      const generatedWorkflow = await onRunNodes?.(['script'])
      setGenerationPhase('validation')
      const scriptError = [...(generatedWorkflow?.state?.errors || [])]
        .reverse()
        .find(error => error.node === 'script')
      if (
        !generatedWorkflow
        || generatedWorkflow.status === 'failed'
        || generatedWorkflow.state?.generation_request?.status === 'failed'
      ) {
        throw new Error(scriptError?.message || '脚本生成未完成')
      }
      if (generatedWorkflow.state?.script?.generated_by === 'deterministic_mock') {
        throw new Error('成稿 AI 未实际运行，本次本地模板结果未写入初稿')
      }
      const actualCount = generatedWorkflow?.state?.generation_meta?.actual_news_item_count ?? selectedFacts.length
      messageApi.success(`初稿已生成：按实际素材编排 ${actualCount} 条新闻`)
    } catch (error: any) {
      messageApi.error(`生成初稿失败：${error?.message || String(error)}`)
    } finally {
      setGenerationRunning(false)
    }
  }, [draftHasContent, hasStoredDraftContent, messageApi, modalApi, onPrepareGeneration, onRunNodes, onStateChange, selectedFacts.length, structure, workflow?.state?.downstream_stale?.artifacts])

  if (!visible) return null

  return (
    <div className="stage-workbench creation-page">
      {modalContextHolder}
      {messageContextHolder}
      <WritingLayer
        visible
        embedded
        headerTitle="成稿"
        leadingPanel={(
          <aside className="creation-brief-pane" aria-label="本期概要">
            <section className="creation-brief-section creation-episode-fields">
              <div className="creation-brief-heading">本期节目</div>
              <label>
                <span>本期标题</span>
                <Input value={topicTitle} onChange={e => setTopicTitle(e.target.value)} />
              </label>
              <label>
                <span>一句话概括</span>
                <Input.TextArea value={topicDesc} onChange={e => setTopicDesc(e.target.value)} autoSize={{ minRows: 2, maxRows: 4 }} />
              </label>
            </section>

            {onRunNodes && (
              <section className="creation-brief-section creation-generate-section">
                <Button type="primary" icon={<FileTextOutlined />} block onClick={generateScript} loading={generationRunning} disabled={selectedFacts.length === 0}>
                  {generationRunning ? '正在生成初稿…' : '生成初稿'}
                </Button>
                {generationRunning && (
                  <div className="creation-generation-progress" role="status" aria-live="polite">
                    <div className="creation-generation-progress-head">
                      <strong>当前阶段：{DRAFT_GENERATION_PHASES[generationPhaseIndex].label}</strong>
                      <small>已等待 {generationElapsedSeconds} 秒</small>
                    </div>
                    <div className="creation-generation-activity" aria-hidden="true"><i /></div>
                    <p>{DRAFT_GENERATION_PHASES[generationPhaseIndex].detail}</p>
                    <div className="creation-generation-steps" aria-label="初稿生成阶段">
                      {DRAFT_GENERATION_PHASES.map((phase, index) => (
                        <span
                          className={index < generationPhaseIndex ? 'is-success' : index === generationPhaseIndex ? 'is-running' : 'is-pending'}
                          key={phase.id}
                        >
                          <i />{phase.label}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                <div className="creation-generation-profile" role="status">
                  <strong>按已保存偏好生成</strong>
                  <span>
                    本期按 {selectedFacts.length} 条素材生成：{resolvedQuickNewsCount} 条快讯
                    {resolvedDeepDiveCount > 0 ? ` + ${resolvedDeepDiveCount} 条深度稿` : ''}
                    {' · '}{morningNewsProfile.editorialVoiceLabel}
                    {' · '}{savedSettings.creatorPreferences.contentTendency === 'analysis' ? '深度分析' : '新闻解读'}
                  </span>
                  {selectedFacts.length < morningNewsProfile.recommendedNewsItemCount && (
                    <span>素材少于{savedSettings.creatorPreferences.durationPreference === 'short' ? '短早报' : '标准早报'}建议的 {morningNewsProfile.recommendedNewsItemCount} 条，时长和总字数将相应缩短。</span>
                  )}
                </div>
              </section>
            )}

            <section className="creation-brief-section creation-news-section">
              <div className="creation-brief-heading-row">
                <div>
                  <div className="creation-brief-heading">本期新闻</div>
                </div>
              </div>
              <div className="creation-news-list" role="list">
                {selectedFacts.map((fact, index) => (
                  <div className="creation-news-item" key={fact.id} role="listitem">
                    <span className="creation-news-order">{String(index + 1).padStart(2, '0')}</span>
                    <span className="creation-news-copy">
                      <strong>{fact.title || '无标题新闻'}</strong>
                      {index >= resolvedQuickNewsCount && resolvedDeepDiveCount > 0 && <small>深度稿</small>}
                    </span>
                  </div>
                ))}
              </div>
            </section>

            {sourceIssues > 0 && (
              <section className="creation-source-check" role="status">
                <WarningOutlined />
                <div>
                  <strong>{sourceIssues} 条新闻缺少原文链接</strong>
                  <span>请返回整理页补充依据后再发布。</span>
                  {onBackToOrganize && <Button type="link" size="small" onClick={onBackToOrganize}>返回整理页核对</Button>}
                </div>
              </section>
            )}
          </aside>
        )}
        onClose={() => undefined}
        onBackToDraft={onBackToOrganize}
        workflow={draftWorkflow}
        episodeTitle={topicTitle}
        episodeDesc={topicDesc}
        characterTargets={{
          opening: morningNewsProfile.openingChars,
          quick_news: morningNewsProfile.quickNewsChars,
          deep_dive: morningNewsProfile.deepDiveChars,
          closing: morningNewsProfile.closingChars,
          episode: morningNewsProfile.episodeChars,
        }}
        onDraftContentChange={setDraftHasContent}
        onDraftPatchChange={(patch) => {
          draftPatchRef.current = patch
          onDraftPatchChange?.(patch)
        }}
        onProceedToProduction={onProceedToProduction}
      />
    </div>
  )
}

function deriveFacts(materials: MaterialItem[]): FactCard[] {
  const seen = new Set<string>()
  return materials
    .filter(item => {
      const key = item.url || item.title || ''
      if (!key || seen.has(key)) return false
      seen.add(key)
      return Boolean(item.title && (item.summary || item.content))
    })
    .slice(0, 20)
    .map((item, index) => {
      const content = String(item.summary || item.content || '').replace(/\s+/g, ' ').trim()
      return {
        id: `fact_${String(index + 1).padStart(3, '0')}`,
        title: item.title || `事实 ${index + 1}`,
        summary: content.slice(0, 260),
        source_title: item.source_name || item.source || item.title || '',
        source_url: item.url || '',
        published_at: item.published || '',
        claim: firstSentence(content),
        confidence: (item.url && item.published ? 'high' : item.url ? 'medium' : 'low') as FactCard['confidence'],
        used_in_segments: [],
      }
    })
}

function factsForCurrentMaterials(initialFacts: FactCard[], materials: MaterialItem[]): FactCard[] {
  if (materials.length === 0) return []
  if (initialFacts.length === 0) return deriveFacts(materials)

  const matchedFacts = materials.map(material => initialFacts.find(fact => (
    Boolean(material.url && fact.source_url && material.url === fact.source_url)
    || Boolean(material.title && fact.title && material.title === fact.title)
  )))
  // Reuse persisted cards only when every current material has one. A partial
  // match indicates state from an earlier organize batch and must not leak in.
  return matchedFacts.every((fact): fact is FactCard => Boolean(fact))
    ? matchedFacts
    : deriveFacts(materials)
}

function firstSentence(text: string): string {
  const match = text.match(/(.+?[。！？.!?])/)
  return (match?.[1] || text).slice(0, 180)
}
