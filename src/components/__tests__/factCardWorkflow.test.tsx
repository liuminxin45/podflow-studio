import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import EpisodeDraftStudio from '../EpisodeDraftStudio'
import PublishLayer from '../PublishLayer'
import type { FactCard, PodcastState, Workflow } from '../../types/workflow'

vi.mock('antd', async (importOriginal) => {
  const actual = await importOriginal<typeof import('antd')>()
  const React = await import('react')
  return {
    ...actual,
    Popconfirm: ({
      children,
      title,
      description,
      okText = 'OK',
      cancelText = 'Cancel',
      onConfirm,
    }: any) => {
      const [open, setOpen] = React.useState(false)
      const child = React.Children.only(children) as any
      const trigger = React.cloneElement(child, {
        onClick: (event: unknown) => {
          child.props.onClick?.(event)
          setOpen(true)
        },
      })
      const confirmation = open
        ? React.createElement(
            'div',
            { role: 'dialog' },
            React.createElement('div', null, title),
            description ? React.createElement('div', null, description) : null,
            React.createElement(
              'button',
              { type: 'button', onClick: () => setOpen(false) },
              cancelText,
            ),
            React.createElement(
              'button',
              {
                type: 'button',
                onClick: () => {
                  setOpen(false)
                  onConfirm?.()
                },
              },
              okText,
            ),
          )
        : null
      return React.createElement(React.Fragment, null, trigger, confirmation)
    },
  }
})

function createWorkflow(state: Partial<PodcastState>): Workflow {
  return {
    id: 'workflow_test',
    status: 'draft',
    currentNode: null,
    nodeExecutions: {},
    state: {
      episode_id: 'episode_test',
      created_at: '2026-07-01T00:00:00.000Z',
      schema_version: 1,
      preset: {},
      source_inputs: [],
      runtime_config: {},
      logs: [],
      errors: [],
      fetch_contents: [],
      cleaned_contents: [],
      researched_contents: [],
      facts: [],
      selected_topic: {},
      selected_topics: [],
      selected_materials: [],
      script: {},
      edited_script: {},
      voice_segments: [],
      audio_outputs: {},
      cover_path: '',
      intro_outro_paths: {},
      review_summary: {},
      publish_outputs: {},
      subtitle_path: '',
      run_report: {},
      ...state,
    },
  }
}

const facts: FactCard[] = [
  {
    id: 'fact_001',
    title: '央行发布流动性操作',
    summary: '央行公告公开市场操作，维持市场流动性合理充裕。',
    source_title: '财经日报',
    source_url: 'https://example.com/a',
    published_at: '2026-07-01T07:00:00.000Z',
    claim: '央行公告公开市场操作。',
    confidence: 'high',
  },
  {
    id: 'fact_002',
    title: '科技公司更新模型能力',
    summary: '一家科技公司发布新模型能力更新。',
    source_title: '科技日报',
    source_url: 'https://example.com/b',
    published_at: '2026-07-01T07:05:00.000Z',
    claim: '科技公司发布新模型能力。',
    confidence: 'medium',
  },
  {
    id: 'fact_003',
    title: '能源价格小幅波动',
    summary: '能源价格在亚洲早盘小幅波动。',
    source_title: '市场快讯',
    source_url: 'https://example.com/c',
    published_at: '2026-07-01T07:10:00.000Z',
    claim: '能源价格小幅波动。',
    confidence: 'high',
  },
]

describe('morning-news writing surfaces', () => {
  it('does not fall back to unfinished organize materials or their stale facts', () => {
    render(
      <EpisodeDraftStudio
        visible
        onClose={vi.fn()}
        rawContents={[]}
        selectedMaterials={[{
          title: facts[0].title,
          url: facts[0].source_url,
          _status: 'needs_context',
        } as any]}
        initialFacts={facts}
        onRunNodes={vi.fn()}
      />,
    )

    expect(document.querySelectorAll('.creation-news-item')).toHaveLength(0)
    expect(screen.queryByText('央行发布流动性操作')).toBeNull()
    expect(screen.getByRole('button', { name: '生成初稿' }).hasAttribute('disabled')).toBe(true)
  })

  it('shows the organised news package and generates the initial script with internal facts', async () => {
    const onRunNodes = vi.fn().mockResolvedValue(undefined)

    render(
      <EpisodeDraftStudio
        visible
        onClose={vi.fn()}
        rawContents={[
          { title: '央行发布流动性操作', summary: '央行公告公开市场操作。', url: 'https://example.com/a', source: '财经日报' },
          { title: '科技公司更新模型能力', summary: '科技公司发布新模型能力。', url: 'https://example.com/b', source: '科技日报' },
        ]}
        initialFacts={facts}
        initialSelectedTopics={facts.map((fact, index) => ({ id: `topic_${index + 1}`, title: fact.title, fact_id: fact.id }))}
        onRunNodes={onRunNodes}
      />,
    )

    expect(screen.getByText('成稿')).toBeTruthy()
    expect(screen.getByText('本期新闻')).toBeTruthy()
    expect(screen.queryByText(/^2 条$/)).toBeNull()
    expect(screen.queryByText('事实卡片')).toBeNull()
    expect(screen.queryByText('结构确认')).toBeNull()
    expect(screen.queryByText('口播稿')).toBeNull()
    expect(screen.getAllByText('央行发布流动性操作').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('节目结构')).toBeTruthy()
    expect(screen.getByLabelText('本期概要')).toBeTruthy()
    expect(screen.queryByText('原始素材')).toBeNull()
    expect(document.querySelectorAll('.creation-news-item')).toHaveLength(2)

    const generateButton = screen.getByRole('button', { name: '生成初稿' })
    expect(generateButton.className).toContain('ant-btn-primary')
    expect(generateButton.querySelector('.ant-btn-icon')).toBeTruthy()
    fireEvent.click(generateButton)

    await waitFor(() => expect(onRunNodes).toHaveBeenNthCalledWith(1, ['facts']))
    expect(onRunNodes).toHaveBeenNthCalledWith(2, ['script'])
  })

  it('keeps the organize-page deep dive as the final news slot in the draft structure', async () => {
    const onStateChange = vi.fn()
    render(
      <EpisodeDraftStudio
        visible
        onClose={vi.fn()}
        rawContents={[
          { title: facts[0].title, summary: facts[0].summary, url: facts[0].source_url },
          { title: facts[1].title, summary: facts[1].summary, url: facts[1].source_url, _isDeepDive: true },
          { title: facts[2].title, summary: facts[2].summary, url: facts[2].source_url },
        ]}
        initialFacts={facts}
        onStateChange={onStateChange}
      />,
    )

    const newsRows = Array.from(document.querySelectorAll('.creation-news-item'))
    expect(newsRows).toHaveLength(3)
    expect(newsRows[2].textContent).toContain('科技公司更新模型能力')
    expect(within(newsRows[2] as HTMLElement).getByText('深度稿')).toBeTruthy()

    await waitFor(() => expect(onStateChange).toHaveBeenCalled())
    const latestStructure = onStateChange.mock.calls.at(-1)?.[0]
    expect(latestStructure.selected_topics.at(-1)).toMatchObject({
      fact_id: 'fact_002',
      is_deep_dive: true,
    })
    expect(latestStructure.blocks.at(-2)).toMatchObject({
      type: 'deep_dive',
      title: '科技公司更新模型能力',
    })
  })

  it('persists script edits when moving to production without overwriting generated script', async () => {
    const onProceedToProduction = vi.fn().mockResolvedValue(undefined)
    const workflow = createWorkflow({
      script: {
        id: 'script_generated',
        title: '早报标题',
        description: '早报简介',
        segments: [
          {
            id: 'seg_opening',
            type: 'opening',
            title: '开场导语',
            text: '大家早上好，欢迎收听今天的通勤早咖啡。',
            source_fact_ids: [],
            estimated_seconds: 20,
          },
          {
            id: 'seg_quick_1',
            type: 'quick_news',
            title: '央行发布流动性操作',
            text: '第一条新闻，央行公告公开市场操作，维持市场流动性合理充裕。',
            source_fact_ids: ['fact_001'],
            estimated_seconds: 45,
          },
          {
            id: 'seg_closing',
            type: 'closing',
            title: '结尾总结',
            text: '以上就是今天的重点，祝你通勤顺利。',
            source_fact_ids: [],
            estimated_seconds: 20,
          },
        ],
      },
      facts,
    })

    render(
      <EpisodeDraftStudio
        visible
        onClose={vi.fn()}
        rawContents={[{
          title: facts[0].title,
          summary: facts[0].summary,
          url: facts[0].source_url,
        }]}
        initialFacts={facts}
        initialSelectedTopics={facts.map((fact, index) => ({ id: `topic_${index + 1}`, title: fact.title, fact_id: fact.id }))}
        workflow={workflow}
        onProceedToProduction={onProceedToProduction}
      />,
    )

    const scriptEditor = screen.getByDisplayValue('第一条新闻，央行公告公开市场操作，维持市场流动性合理充裕。')
    fireEvent.change(scriptEditor, { target: { value: '未保存的口播稿修改。' } })
    fireEvent.change(screen.getByLabelText('本期标题'), { target: { value: '更新后的早报标题' } })
    const quickSegmentCard = scriptEditor.closest('.writing-segment-card') as HTMLElement
    fireEvent.change(
      within(quickSegmentCard).getByLabelText('段落标题：央行发布流动性操作'),
      { target: { value: '央行流动性操作解读' } },
    )
    expect(screen.getByDisplayValue('未保存的口播稿修改。')).toBeTruthy()
    expect(Array.from(document.querySelectorAll('.writing-structure-item-label')).some(item => item.textContent === '央行流动性操作解读')).toBe(true)

    expect(screen.queryByRole('button', { name: '保存稿件' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '进入制作' }))

    await waitFor(() => {
      expect(onProceedToProduction).toHaveBeenCalled()
    })

    const patch = onProceedToProduction.mock.calls[0][0]
    expect(patch.script).toBeUndefined()
    expect(patch.edited_script.edited_from).toBe('script_generated')
    expect(patch.edited_script.segments.find((segment: any) => segment.id === 'seg_quick_1').title).toBe('央行流动性操作解读')
    expect(patch.edited_script.segments.find((segment: any) => segment.id === 'seg_quick_1').source_fact_ids).toEqual(['fact_001'])
  }, 15000)

  it('does not guess a source binding when a script lacks one', async () => {
    const onProceedToProduction = vi.fn().mockResolvedValue(undefined)
    const workflow = createWorkflow({
      script: {
        id: 'script_without_source_ids',
        title: '早报标题',
        description: '早报简介',
        segments: [
          {
            id: 'seg_quick_2',
            type: 'quick_news',
            title: '科技公司更新模型能力',
            text: '第二条新闻，一家科技公司发布新模型能力更新。',
            source_fact_ids: [],
            estimated_seconds: 45,
          },
        ],
      },
      facts,
    })

    render(
      <EpisodeDraftStudio
        visible
        onClose={vi.fn()}
        rawContents={[]}
        initialFacts={facts}
        workflow={workflow}
        onProceedToProduction={onProceedToProduction}
      />,
    )

    await waitFor(() => expect(screen.getByDisplayValue('第二条新闻，一家科技公司发布新模型能力更新。')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: '进入制作' }))

    await waitFor(() => expect(onProceedToProduction).toHaveBeenCalled())
    const patch = onProceedToProduction.mock.calls[0][0]
    expect(patch.edited_script.segments[0].source_fact_ids).toEqual([])
  })

  it('reorders segments from the structure list and keeps the duration on the right', async () => {
    const workflow = createWorkflow({
      script: {
        id: 'script_for_reorder',
        title: '早报标题',
        segments: [
          { id: 'seg_opening', type: 'opening', title: '开场导语', text: '第一段内容。', source_fact_ids: [], estimated_seconds: 2 },
          { id: 'seg_quick_1', type: 'quick_news', title: '快讯一', text: '第二段内容。', source_fact_ids: [], estimated_seconds: 2 },
        ],
      },
    })

    render(<EpisodeDraftStudio visible onClose={vi.fn()} rawContents={[]} workflow={workflow} />)

    await waitFor(() => expect(screen.getByDisplayValue('第一段内容。')).toBeTruthy())
    const structureItems = Array.from(document.querySelectorAll<HTMLButtonElement>('.writing-structure-item'))
    const [opening, quickNews] = structureItems

    expect(opening.draggable).toBe(true)
    expect(opening.querySelector('.writing-structure-item-top')?.lastElementChild?.textContent).toMatch(/\d+秒/)
    expect(quickNews.textContent).toContain('快讯一')
    const openingCard = screen.getByDisplayValue('第一段内容。').closest('.writing-segment-card') as HTMLDivElement | null
    expect(openingCard?.draggable).toBe(false)

    fireEvent.dragStart(opening)
    fireEvent.dragOver(quickNews)
    expect(Array.from(document.querySelectorAll('.writing-structure-item-label')).map(item => item.textContent)).toEqual(['快讯一', '开场导语'])
    expect(quickNews.classList.contains('is-drop-target')).toBe(true)
    fireEvent.drop(quickNews)

    expect(Array.from(document.querySelectorAll('.writing-structure-item-label')).map(item => item.textContent)).toEqual(['快讯一', '开场导语'])
  })

  it('requires confirmation before deleting a segment from the programme structure', async () => {
    const onProceedToProduction = vi.fn().mockResolvedValue(undefined)
    const workflow = createWorkflow({
      script: {
        id: 'script_for_deletion',
        title: '早报标题',
        segments: [
          { id: 'seg_opening', type: 'opening', title: '开场导语', text: '第一段内容。', source_fact_ids: [], estimated_seconds: 2 },
          { id: 'seg_quick_1', type: 'quick_news', title: '快讯一', text: '第二段内容。', source_fact_ids: [], estimated_seconds: 2 },
        ],
      },
    })

    render(
      <EpisodeDraftStudio
        visible
        onClose={vi.fn()}
        rawContents={[]}
        workflow={workflow}
        onProceedToProduction={onProceedToProduction}
      />,
    )

    const findQuickNewsEditor = () => Array.from(document.querySelectorAll('textarea'))
      .find(editor => editor.value === '第二段内容。')
    await waitFor(() => expect(findQuickNewsEditor()).toBeTruthy())
    const deleteButton = document.querySelector<HTMLButtonElement>(
      'button[aria-label="删除快讯一"]',
    )
    expect(deleteButton).toBeTruthy()
    fireEvent.click(deleteButton!)

    expect(screen.getByText('删除「快讯一」？')).toBeTruthy()
    expect(findQuickNewsEditor()).toBeTruthy()

    let confirmation = document.querySelector<HTMLElement>('[role="dialog"]')
    expect(confirmation).toBeTruthy()
    fireEvent.click(within(confirmation!).getByText('取消'))
    expect(findQuickNewsEditor()).toBeTruthy()

    fireEvent.click(deleteButton!)

    confirmation = document.querySelector<HTMLElement>('[role="dialog"]')
    expect(confirmation).toBeTruthy()
    fireEvent.click(within(confirmation!).getByText('确认删除'))

    await waitFor(() => expect(findQuickNewsEditor()).toBeUndefined())
    const proceedButton = document.querySelector<HTMLButtonElement>(
      '.stage-header-nav-button.next',
    )
    expect(proceedButton).toBeTruthy()
    fireEvent.click(proceedButton!)

    await waitFor(() => expect(onProceedToProduction).toHaveBeenCalled())
    expect(onProceedToProduction.mock.calls[0][0].edited_script.segments.map((segment: any) => segment.id)).toEqual(['seg_opening'])
  })

  it('uses a completion marker and confirms regeneration', async () => {
    const onRunNodes = vi.fn().mockResolvedValue(undefined)
    const onPrepareGeneration = vi.fn().mockResolvedValue(undefined)
    const workflow = createWorkflow({
      script: {
        id: 'script_for_completion',
        title: '早报标题',
        segments: [
          {
            id: 'seg_opening',
            type: 'opening',
            title: '开场导语',
            text: '四字稿件',
            source_fact_ids: [],
            estimated_seconds: 1,
          },
        ],
      },
    })

    render(
      <EpisodeDraftStudio
        visible
        onClose={vi.fn()}
        rawContents={[{
          title: facts[0].title,
          summary: facts[0].summary,
          url: facts[0].source_url,
        }]}
        initialFacts={[facts[0]]}
        workflow={workflow}
        onRunNodes={onRunNodes}
        onPrepareGeneration={onPrepareGeneration}
      />,
    )

    await waitFor(() => expect(screen.getByDisplayValue('四字稿件')).toBeTruthy())
    expect(screen.queryByText('整体语气')).toBeNull()
    expect(screen.queryByRole('button', { name: 'AI 润色' })).toBeNull()
    expect(screen.queryByRole('combobox')).toBeNull()
    expect(screen.getByText('约 1秒')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '标记完成' }))
    expect(screen.getByLabelText('已完成')).toBeTruthy()
    expect(screen.getByText('1/1 段已完成')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '生成初稿' }))
    expect((await screen.findAllByText('重新生成初稿？')).length).toBeGreaterThan(0)
    expect(onRunNodes).not.toHaveBeenCalled()
    expect(onPrepareGeneration).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '继续生成' }))

    await waitFor(() => expect(onRunNodes).toHaveBeenNthCalledWith(1, ['facts']))
    expect(onRunNodes).toHaveBeenNthCalledWith(2, ['script'])
    expect(onPrepareGeneration).toHaveBeenCalledWith('regenerate', expect.any(Object))
  }, 15000)

  it('renders real publish results without smart or quick publish modes', async () => {
    const workflow = createWorkflow({
      edited_script: {
        title: '早报标题',
        description: '早报简介',
        segments: [{ id: 'seg_news_1', type: 'quick_news', title: '新闻一', text: '第一条新闻。', source_fact_ids: [], estimated_seconds: 5 }],
      },
      audio_outputs: { final_audio_path: 'out/episodes/episode_test/final.mp3' },
      publish_outputs: {
        status: 'success',
        published_at: '2026-07-18T00:20:00.000Z',
        episode_dir: 'dist/episodes/episode_test',
        feed_xml: 'out/rss/feed.xml',
        enclosure_url: 'dist/episodes/episode_test/final.mp3',
        platforms: {
          local: 'success',
          rss: 'success',
        },
        rss_validation: {
          ok: true,
          errors: [],
          warnings: ['public_base_url is empty; RSS feed is local-preview only'],
          enclosure_url: 'dist/episodes/episode_test/final.mp3',
          local_preview_only: true,
        },
      },
    })

    render(
      <PublishLayer
        visible
        onClose={vi.fn()}
        workflow={workflow}
        onRunNodes={vi.fn().mockResolvedValue(undefined)}
      />,
    )

    await waitFor(() => {
      expect(screen.getByText('发布文件已就绪')).toBeTruthy()
      expect(screen.getByText('节目归档')).toBeTruthy()
      expect(screen.getByText('RSS 订阅源')).toBeTruthy()
      expect(screen.getByText('本地预览')).toBeTruthy()
      expect(screen.getByRole('button', { name: '复制归档路径' })).toBeTruthy()
      expect(screen.getByRole('button', { name: '复制 RSS 路径' })).toBeTruthy()
    })
    expect(screen.queryByText('Apple Podcasts')).toBeNull()
    expect(screen.queryByText('Spotify')).toBeNull()
    expect(screen.queryByText('小宇宙')).toBeNull()
    expect(screen.queryByText('智能发布')).toBeNull()
    expect(screen.queryByText('快速发布')).toBeNull()
    expect(screen.queryByText('采纳建议')).toBeNull()
  })

  it('publishes local archive and RSS once without running review or saving platform config', async () => {
    const onRunNodes = vi.fn().mockResolvedValue(undefined)
    const onSaveWorkflow = vi.fn().mockResolvedValue(undefined)
    render(
      <PublishLayer
        visible
        onClose={vi.fn()}
        workflow={createWorkflow({
          edited_script: {
            title: '早报标题',
            description: '早报简介',
            segments: [{ id: 'seg_1', type: 'opening', title: '开场', text: '早上好。', source_fact_ids: [], estimated_seconds: 5 }],
          },
          audio_outputs: { final_audio_path: 'out/episodes/episode_test/final.mp3' },
        })}
        onRunNodes={onRunNodes}
        onSaveWorkflow={onSaveWorkflow}
      />,
    )

    expect(screen.getByText('把这一期整理成可带走的文件')).toBeTruthy()
    expect(screen.getByText('本地优先')).toBeTruthy()
    expect(screen.queryByRole('group', { name: '可选发布平台' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '生成发布文件' }))

    await waitFor(() => expect(onRunNodes).toHaveBeenCalledWith(['publish']))
    await waitFor(() => expect(onSaveWorkflow).toHaveBeenCalledTimes(1))
    expect(onRunNodes).not.toHaveBeenCalledWith(expect.arrayContaining(['review']))
  }, 60_000)

  it('keeps the publish result open when automatic workflow saving fails', async () => {
    const onClose = vi.fn()
    const onSaveWorkflow = vi.fn()
      .mockRejectedValueOnce(new Error('磁盘写入失败'))
      .mockResolvedValueOnce(undefined)
    render(
      <PublishLayer
        visible
        onClose={onClose}
        workflow={createWorkflow({
          audio_outputs: { final_audio_path: 'out/episodes/episode_test/final.mp3' },
        })}
        onRunNodes={vi.fn().mockResolvedValue(undefined)}
        onSaveWorkflow={onSaveWorkflow}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '生成发布文件' }))

    expect(await screen.findByText('发布文件已生成，但节目尚未保存')).toBeTruthy()
    expect(screen.getByText('磁盘写入失败')).toBeTruthy()
    const completeButton = screen.getByRole('button', { name: /完\s*成/ })
    expect(completeButton.hasAttribute('disabled')).toBe(true)
    expect(onClose).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: '重试保存' }))
    await waitFor(() => expect(onSaveWorkflow).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.queryByText('发布文件已生成，但节目尚未保存')).toBeNull())
    expect(completeButton?.hasAttribute('disabled')).toBe(false)
  })
})
