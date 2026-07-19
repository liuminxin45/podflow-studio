import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LLMError } from '../../types/llm'
import type { ContentItem } from '../../types/workflow'
import { llmService } from '../llmService'
import { postProcessDiscoverItems, type DiscoverPostProcessProgress } from '../discoverPostProcess'

vi.mock('../llmService', () => ({
  llmService: {
    call: vi.fn(),
  },
}))

describe('discoverPostProcess', () => {
  const now = Date.now()
  const items: ContentItem[] = [
    {
      title: 'Fresh AI launch',
      content: 'AI product update',
      source: 'source-a',
      published: new Date(now - 2 * 3600000).toISOString(),
    },
    {
      title: 'Fresh chip news',
      content: 'Semiconductor update',
      source: 'source-b',
      published: new Date(now - 4 * 3600000).toISOString(),
    },
    {
      title: 'Old AI post',
      content: 'Old AI article',
      source: 'source-a',
      published: new Date(now - 72 * 3600000).toISOString(),
    },
  ]

  const llmConfig = {
    apiBase: 'local-agent://codex',
    apiKey: 'local-agent',
    model: 'codex',
    providerKind: 'local_agent',
    localAgentId: 'codex',
    localAgentCommand: 'codex',
    aiTarget: 'agent:codex',
    timeout: 180000,
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('applies script recency and per-source result limit without LLM when topic is empty', async () => {
    const result = await postProcessDiscoverItems(items, {
      coreTopic: '',
      recencyHours: 24,
      resultLimit: 1,
    }, null)

    expect(result.rawCount).toBe(3)
    expect(result.recencyCount).toBe(2)
    expect(result.items).toHaveLength(2)
    expect(result.items.map(item => item.title)).toEqual(['Fresh AI launch', 'Fresh chip news'])
    expect(result.audit.rawItems).toHaveLength(3)
    expect(result.audit.stages.find(stage => stage.id === 'recency')?.failedCount).toBe(1)
    expect(result.audit.stages.find(stage => stage.id === 'limit')?.failedCount).toBe(0)
    expect(llmService.call).not.toHaveBeenCalled()
  })

  it('limits results independently for each source', async () => {
    const result = await postProcessDiscoverItems([
      ...items,
      {
        title: 'Second source A item',
        content: 'Another AI article',
        source: 'source-a',
        published: new Date(now - 3 * 3600000).toISOString(),
      },
    ], {
      coreTopic: '',
      recencyHours: 24,
      resultLimit: 1,
    }, null)

    expect(result.items.map(item => item.source)).toEqual(['source-a', 'source-b'])
    expect(result.items.filter(item => item.source === 'source-a')).toHaveLength(1)
    expect(result.audit.stages.find(stage => stage.id === 'limit')?.label).toBe('每源条数')
    expect(result.audit.stages.find(stage => stage.id === 'limit')?.failedCount).toBe(1)
  })

  it('uses LLM to apply the configured core topic', async () => {
    vi.mocked(llmService.call).mockResolvedValue({
      id: 'topic-filter',
      object: 'chat.completion',
      created: Date.now(),
      model: 'codex',
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: JSON.stringify([
              { index: 1, score: 92, decision: 'keep', reason: 'AI related', angle: 'launch' },
              { index: 2, score: 25, decision: 'drop', reason: 'not AI', angle: '' },
            ]),
          },
          finish_reason: 'stop',
        },
      ],
    })

    const result = await postProcessDiscoverItems(items, {
      coreTopic: 'AI 产品发布',
      recencyHours: 24,
      resultLimit: 10,
    }, llmConfig)

    expect(result.items).toHaveLength(1)
    expect(result.items[0]._topic_score).toBe(92)
    expect(result.topicMatchedCount).toBe(1)
    expect(result.topicRejectedCount).toBe(1)
    expect(result.audit.rejectedItems.some(entry => entry.stageId === 'topic' && entry.reason === 'not AI')).toBe(true)
    expect(result.audit.passedItems[0].item.title).toBe('Fresh AI launch')
    expect(llmService.call).toHaveBeenCalledTimes(1)
  })

  it('uses a local display summary without calling LLM when topic is empty', async () => {
    const result = await postProcessDiscoverItems([
      {
        title: '阿里推出 Qoder 企业版',
        content: '阿里云推出 Qoder 企业版，为企业提供个人云端知识库 QMind，并支持 Credits 资源池化分配。',
        source: 'aihot',
        published: new Date(now - 2 * 3600000).toISOString(),
      },
    ], {
      coreTopic: '',
      recencyHours: 24,
      resultLimit: 10,
    }, llmConfig)

    expect(result.items).toHaveLength(1)
    expect(result.items[0].summary).toContain('阿里云推出 Qoder 企业版')
    expect(llmService.call).not.toHaveBeenCalled()
  })

  it('keeps retained items visible after recency and source limit processing', async () => {
    const result = await postProcessDiscoverItems([
      {
        title: '官方通报城市更新进展',
        content: '相关部门称项目处置已经完成。',
        source: 'police',
        published: new Date(now - 2 * 3600000).toISOString(),
      },
      {
        title: 'Company files official earnings update',
        content: 'The filing may affect market expectations and investor guidance.',
        source: 'SEC',
        url: 'https://www.sec.gov/example',
        published: new Date(now - 2 * 3600000).toISOString(),
        _event_sources: ['SEC', 'Reuters', 'Bloomberg'],
      } as ContentItem,
    ], {
      coreTopic: '',
      recencyHours: 24,
      resultLimit: 10,
    }, null)

    expect(result.items).toHaveLength(2)
    expect(result.items.map(item => item.title)).toEqual([
      '官方通报城市更新进展',
      'Company files official earnings update',
    ])
  })

  it('emits source post-processing progress events before returning retained results', async () => {
    const events: DiscoverPostProcessProgress[] = []

    const result = await postProcessDiscoverItems(items, {
      coreTopic: '',
      recencyHours: 24,
      resultLimit: 1,
    }, null, event => events.push(event))

    expect(result.items).toHaveLength(2)
    expect(events.map(event => event.type)).toEqual([
      'postprocess_started',
      'recency_done',
      'topic_skipped',
      'limit_done',
    ])
    expect(events.find(event => event.type === 'recency_done')?.recencyCount).toBe(2)
    expect(events.find(event => event.type === 'limit_done')?.finalCount).toBe(2)
  })

  it('fails explicitly when core topic requires AI but no target is configured', async () => {
    await expect(postProcessDiscoverItems(items, {
      coreTopic: 'AI',
      recencyHours: 24,
      resultLimit: 10,
    }, null)).rejects.toBeInstanceOf(LLMError)
  })
})
