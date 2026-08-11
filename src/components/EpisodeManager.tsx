import { useEffect, useMemo, useState } from 'react'
import { Button, Dropdown, Empty, Input, Modal, Segmented, Select, Skeleton, Space, Tag } from 'antd'
import {
  ArrowClockwise,
  CaretDown,
  CaretUp,
  Copy,
  DownloadSimple,
  Export,
  FileImage,
  FolderSimple,
  FolderOpen,
  ListPlus,
  DotsThree,
  Play,
  Plus,
  Rows,
  Trash,
} from '@phosphor-icons/react'
import type { Series, WorkflowSummary } from '../types/workflow'

interface EpisodeMetaPatch {
  title: string
  description: string
  previewPath: string
}

interface Props {
  episodes: WorkflowSummary[]
  loading: boolean
  series: Series[]
  activeWorkflowId?: string
  activeWorkflowDirty?: boolean
  hasElectronBackend: boolean
  onCreate: (seriesId?: string) => Promise<void> | void
  onOpen: (workflowId: string) => Promise<void> | void
  onPlay: (workflowId: string) => Promise<void> | void
  onShowArtifact: (targetPath: string) => Promise<void> | void
  onRerun: (workflowId: string) => Promise<void> | void
  onDelete: (workflowId: string) => Promise<void> | void
  onDuplicate?: (workflowId: string) => Promise<void> | void
  onImport: () => Promise<void> | void
  onExport: (workflowId: string) => Promise<void> | void
  onEdit: (workflowId: string, patch: EpisodeMetaPatch) => Promise<void> | void
  onUpsertSeries: (series: Partial<Series> & { title: string }) => Promise<Series>
  onAssignSeries: (seriesId: string, workflowId: string) => Promise<void>
  onReorderSeries: (seriesId: string, episodeIds: string[]) => Promise<void>
  onGenerateSeriesFeed: (seriesId: string) => Promise<void>
  createRequested?: boolean
  onCreateRequestHandled?: () => void
}

function formatDate(value?: string) {
  if (!value) return '未知时间'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const pad = (part: number) => String(part).padStart(2, '0')
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function playbackPercent(episode: WorkflowSummary) {
  if (episode.playback?.completed) return 100
  const duration = Number(episode.playback?.durationSeconds || episode.durationSeconds || 0)
  if (duration <= 0) return 0
  return Math.max(0, Math.min(100, (Number(episode.playback?.positionSeconds || 0) / duration) * 100))
}

function formatDuration(value?: number) {
  const seconds = Math.max(0, Math.round(Number(value || 0)))
  if (!seconds) return '未知时长'
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

function productionStatus(episode: WorkflowSummary) {
  if (episode.failedNode || episode.status === 'failed') return { label: '失败', tone: 'error' }
  if (episode.audioPath) return { label: '已成片', tone: 'success' }
  if (episode.status === 'running' || episode.status === 'waiting_approval') return { label: '制作中', tone: 'processing' }
  if (episode.status === 'completed') return { label: '待成片', tone: 'warning' }
  return { label: '草稿', tone: 'default' }
}

export default function EpisodeManager({
  episodes,
  loading,
  series,
  activeWorkflowId,
  hasElectronBackend,
  onCreate,
  onOpen,
  onPlay,
  onShowArtifact,
  onRerun,
  onDelete,
  onDuplicate,
  onImport,
  onExport,
  onEdit,
  onUpsertSeries,
  onAssignSeries,
  onReorderSeries,
  onGenerateSeriesFeed,
  createRequested = false,
  onCreateRequestHandled = () => undefined,
}: Props) {
  const [editing, setEditing] = useState<WorkflowSummary | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editPreviewPath, setEditPreviewPath] = useState('')
  const [previewSources, setPreviewSources] = useState<Record<string, string>>({})
  const [query, setQuery] = useState('')
  const [playbackFilter, setPlaybackFilter] = useState<'all' | 'continue' | 'completed'>('all')
  const [seriesFilter, setSeriesFilter] = useState<string>('all')
  const [createVisible, setCreateVisible] = useState(false)
  const [createSeriesId, setCreateSeriesId] = useState<string>('')
  const [seriesVisible, setSeriesVisible] = useState(false)
  const [activeSeriesId, setActiveSeriesId] = useState<string>('')
  const [seriesTitle, setSeriesTitle] = useState('')
  const [seriesDescription, setSeriesDescription] = useState('')
  const [seriesCadence, setSeriesCadence] = useState<'daily' | 'weekly'>('daily')
  const [seriesDuration, setSeriesDuration] = useState(14)
  const [seriesAuthor, setSeriesAuthor] = useState('PodFlow Studio')
  const [seriesCoverPath, setSeriesCoverPath] = useState('')
  const [seriesHostName, setSeriesHostName] = useState('')
  const [seriesDefaultVoice, setSeriesDefaultVoice] = useState('')
  const [seriesPlatforms, setSeriesPlatforms] = useState('local, rss')
  const [assigning, setAssigning] = useState<WorkflowSummary | null>(null)
  const [assignSeriesId, setAssignSeriesId] = useState('')
  const [seriesError, setSeriesError] = useState('')
  const [seriesSaving, setSeriesSaving] = useState(false)
  const [assignError, setAssignError] = useState('')
  const [assigningBusy, setAssigningBusy] = useState(false)

  useEffect(() => {
    let disposed = false
    async function loadPreviewSources() {
      const entries = await Promise.all(episodes.map(async episode => {
        const previewPath = episode.previewPath || ''
        if (!previewPath) return [episode.id, ''] as const
        if (/^(https?:|data:|blob:)/i.test(previewPath)) return [episode.id, previewPath] as const
        if (!window.electronAPI?.readImageAsDataUrl) return [episode.id, ''] as const
        const result = await window.electronAPI.readImageAsDataUrl(previewPath)
        return [episode.id, result.success && result.dataUrl ? result.dataUrl : ''] as const
      }))
      if (!disposed) setPreviewSources(Object.fromEntries(entries))
    }
    void loadPreviewSources()
    return () => { disposed = true }
  }, [episodes])

  useEffect(() => {
    if (!createRequested) return
    setCreateVisible(true)
    onCreateRequestHandled()
  }, [createRequested, onCreateRequestHandled])

  const visibleEpisodes = useMemo(() => episodes.filter(episode => {
    const text = `${episode.title} ${episode.description || ''} ${episode.series?.title || ''}`.toLocaleLowerCase()
    if (query && !text.includes(query.trim().toLocaleLowerCase())) return false
    if (seriesFilter !== 'all' && episode.series?.id !== seriesFilter) return false
    const percent = playbackPercent(episode)
    if (playbackFilter === 'continue' && !(percent > 0 && percent < 100)) return false
    if (playbackFilter === 'completed' && percent < 100) return false
    return true
  }), [episodes, playbackFilter, query, seriesFilter])

  const activeSeries = series.find(item => item.id === activeSeriesId)
  const activeSeriesEpisodes = (activeSeries?.episodeIds || [])
    .map(id => episodes.find(episode => episode.id === id))
    .filter((episode): episode is WorkflowSummary => Boolean(episode))
  const activeSeriesMetrics = useMemo(() => {
    const topics = activeSeriesEpisodes.flatMap(episode => episode.topicKeys || [])
    const repeatedTopics = topics.length - new Set(topics).size
    const sources = new Set(activeSeriesEpisodes.flatMap(episode => episode.sourceDomains || []))
    return { repeatedTopics, sourceDomains: sources.size }
  }, [activeSeriesEpisodes])

  const openEdit = (episode: WorkflowSummary) => {
    setEditing(episode)
    setEditTitle(episode.title || '')
    setEditDescription(episode.description || '')
    setEditPreviewPath(episode.previewPath || '')
  }

  const populateSeries = (value?: Series) => {
    setActiveSeriesId(value?.id || '')
    setSeriesTitle(value?.title || '')
    setSeriesDescription(value?.description || '')
    setSeriesCadence(value?.cadence || 'daily')
    setSeriesDuration(value?.defaults.targetDurationMinutes || 14)
    setSeriesAuthor(value?.defaults.author || 'PodFlow Studio')
    setSeriesCoverPath(value?.coverPath || '')
    setSeriesHostName(value?.defaults.hostName || '')
    setSeriesDefaultVoice(value?.defaults.defaultVoice || '')
    setSeriesPlatforms((value?.defaults.enabledPlatforms || ['local', 'rss']).join(', '))
    setSeriesError('')
  }

  const selectSeries = (id: string) => {
    populateSeries(series.find(item => item.id === id))
  }

  const saveSeries = async () => {
    setSeriesSaving(true)
    setSeriesError('')
    try {
      const saved = await onUpsertSeries({
        id: activeSeriesId || undefined,
        title: seriesTitle.trim(),
        description: seriesDescription.trim(),
        coverPath: seriesCoverPath.trim(),
        cadence: seriesCadence,
        defaults: {
          language: 'zh-CN',
          targetDurationMinutes: seriesDuration,
          author: seriesAuthor.trim() || 'PodFlow Studio',
          hostName: seriesHostName.trim(),
          defaultVoice: seriesDefaultVoice.trim(),
          enabledPlatforms: seriesPlatforms.split(/[,，]/).map(value => value.trim()).filter(Boolean),
          templateVariant: 'quick_6_plus_deep_1',
        },
      })
      populateSeries(saved)
    } catch (error) {
      setSeriesError(error instanceof Error ? error.message : String(error))
    } finally {
      setSeriesSaving(false)
    }
  }

  const moveSeriesEpisode = async (index: number, direction: -1 | 1) => {
    if (!activeSeries) return
    const target = index + direction
    if (target < 0 || target >= activeSeries.episodeIds.length) return
    const order = [...activeSeries.episodeIds]
    ;[order[index], order[target]] = [order[target], order[index]]
    try {
      setSeriesError('')
      await onReorderSeries(activeSeries.id, order)
    } catch (error) {
      setSeriesError(error instanceof Error ? error.message : String(error))
    }
  }

  const assignEpisode = async () => {
    if (!assigning || !assignSeriesId) return
    setAssigningBusy(true)
    setAssignError('')
    try {
      await onAssignSeries(assignSeriesId, assigning.id)
      setAssigning(null)
    } catch (error) {
      setAssignError(error instanceof Error ? error.message : String(error))
    } finally {
      setAssigningBusy(false)
    }
  }

  return (
    <section className="episode-library">
      <header className="episode-library-header">
        <div>
          <h1>节目库</h1>
          <p>继续收听、恢复生产，或按栏目组织发布。</p>
        </div>
        <div className="episode-library-header-actions">
          <Button type="text" icon={<Rows />} onClick={() => { setSeriesVisible(true); if (!activeSeriesId && series[0]) selectSeries(series[0].id) }}>
            栏目
          </Button>
          <Button type="text" icon={<DownloadSimple />} disabled={!hasElectronBackend} onClick={onImport}>导入</Button>
        </div>
      </header>

      <div className="episode-library-filters">
        <Input.Search allowClear value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索节目、描述或栏目" aria-label="搜索节目" />
        <Segmented
          value={playbackFilter}
          onChange={value => setPlaybackFilter(value as typeof playbackFilter)}
          options={[{ label: '全部', value: 'all' }, { label: '继续收听', value: 'continue' }, { label: '已听完', value: 'completed' }]}
        />
        <Select
          value={seriesFilter}
          onChange={setSeriesFilter}
          aria-label="按栏目筛选"
          options={[{ value: 'all', label: '全部栏目' }, ...series.map(item => ({ value: item.id, label: item.title }))]}
        />
      </div>

      {loading ? (
        <div className="episode-library-empty" aria-label="正在加载节目库"><Skeleton active paragraph={{ rows: 3 }} /></div>
      ) : visibleEpisodes.length === 0 ? (
        <div className="episode-library-empty">
          <Empty description={episodes.length === 0 ? '还没有节目，从一次新闻发现开始。' : '没有符合当前筛选条件的节目。'} />
        </div>
      ) : (
        <div className="episode-library-table-wrap">
          <table className="episode-library-table">
            <thead>
              <tr>
                <th scope="col">节目</th>
                <th scope="col">制作状态</th>
                <th scope="col">成片与收听</th>
                <th scope="col">更新时间</th>
                <th scope="col"><span className="sr-only">操作</span></th>
              </tr>
            </thead>
            <tbody>
          {visibleEpisodes.map(episode => {
            const active = episode.id === activeWorkflowId || episode.isCurrent
            const previewSrc = previewSources[episode.id] || ''
            const percent = playbackPercent(episode)
            const status = productionStatus(episode)
            return (
              <tr key={episode.id} className={active ? 'is-active' : ''}>
                <td className="episode-library-title-cell">
                  <span className="episode-library-cover">
                    {previewSrc ? <img src={previewSrc} alt={`${episode.title} 预览图`} /> : <><FileImage aria-hidden="true" /><b>{(episode.title || '节').slice(0, 1)}</b></>}
                  </span>
                  <span className="episode-library-copy">
                    <span className="episode-library-meta">
                      {episode.series?.title && <Tag bordered={false}>{episode.series.title}</Tag>}
                      {episode.failedNode && <Tag color="error">{episode.failedNode} 失败</Tag>}
                    </span>
                    <button
                      type="button"
                      className="episode-library-title-button"
                      onClick={() => void onOpen(episode.id)}
                      title={episode.title}
                      aria-label={`打开节目：${episode.title || '未命名节目'}`}
                    >
                      {episode.title || '未命名节目'}
                    </button>
                    <small>{episode.description || '暂无节目简介'}</small>
                  </span>
                </td>
                <td data-label="制作状态">
                  <Tag bordered={false} color={status.tone}>{status.label}</Tag>
                </td>
                <td data-label="成片与收听">
                  <div className="episode-library-audio">
                    <span>{episode.audioPath ? formatDuration(episode.durationSeconds) : '暂无成片'}</span>
                    {episode.audioPath && (
                      <>
                        <small>{percent >= 100 ? '已听完' : percent > 0 ? `已听 ${Math.round(percent)}%` : '未收听'}</small>
                        <span className="episode-library-progress" aria-label={`收听进度 ${Math.round(percent)}%`}>
                          <i style={{ width: `${percent}%` }} />
                        </span>
                      </>
                    )}
                  </div>
                </td>
                <td className="episode-library-date" data-label="更新时间">{formatDate(episode.updatedAt)}</td>
                <td className="episode-library-actions">
                  {episode.audioPath && (
                    <Button type="text" icon={<Play weight="fill" />} onClick={() => void onPlay(episode.id)}>
                      {percent > 0 && percent < 100 ? '继续收听' : '播放'}
                    </Button>
                  )}
                  <Button type="primary" onClick={() => void onOpen(episode.id)}>继续制作</Button>
                  <Dropdown
                    trigger={['click']}
                    menu={{
                      items: [
                        { key: 'assign', icon: <ListPlus />, label: '加入栏目', disabled: series.length === 0 },
                        { key: 'duplicate', icon: <Copy />, label: '复制节目', disabled: !onDuplicate },
                        { key: 'directory', icon: <FolderSimple />, label: '打开成片目录', disabled: !episode.audioPath },
                        { key: 'edit', icon: <FolderOpen />, label: '编辑信息' },
                        { key: 'rerun', icon: <ArrowClockwise />, label: '重跑工作流' },
                        { key: 'export', icon: <Export />, label: '导出 .pfs' },
                        { type: 'divider' },
                        { key: 'delete', icon: <Trash />, label: '删除节目', danger: true },
                      ],
                      onClick: ({ key }) => {
                        if (key === 'assign') { setAssigning(episode); setAssignSeriesId(episode.series?.id || series[0]?.id || ''); setAssignError('') }
                        if (key === 'duplicate') void onDuplicate?.(episode.id)
                        if (key === 'directory' && episode.audioPath) void onShowArtifact(episode.audioPath)
                        if (key === 'edit') openEdit(episode)
                        if (key === 'rerun') void onRerun(episode.id)
                        if (key === 'export') void onExport(episode.id)
                        if (key === 'delete') Modal.confirm({ title: '删除节目', content: '确认删除这个本地节目？', okText: '删除', cancelText: '取消', okButtonProps: { danger: true }, onOk: () => onDelete(episode.id) })
                      },
                    }}
                  >
                    <Button type="text" icon={<DotsThree />} aria-label={`更多操作：${episode.title}`} />
                  </Dropdown>
                </td>
              </tr>
            )
          })}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        className="create-episode-modal"
        width={560}
        title={null}
        open={createVisible}
        onCancel={() => setCreateVisible(false)}
        footer={null}
      >
        <div className="create-episode">
          <header>
            <span className="create-episode-kicker">NEW EPISODE</span>
            <h2>开始一期新节目</h2>
            <p>从素材发现开始。选择栏目后，将继承它的时长、主持人与发布设置。</p>
          </header>
          <div className="create-episode-choice">
            <button type="button" className={!createSeriesId ? 'is-selected' : ''} onClick={() => setCreateSeriesId('')}>
              <span className="create-episode-choice-mark"><Plus /></span>
              <span><strong>独立节目</strong><small>稍后再归入栏目</small></span>
            </button>
            {series.map(item => (
              <button type="button" className={createSeriesId === item.id ? 'is-selected' : ''} key={item.id} onClick={() => setCreateSeriesId(item.id)}>
                <span className="create-episode-choice-mark">{item.title.slice(0, 1)}</span>
                <span><strong>{item.title}</strong><small>{item.defaults.targetDurationMinutes} 分钟 · {item.cadence === 'daily' ? '每日' : '每周'}</small></span>
              </button>
            ))}
          </div>
          <footer>
            <Button type="text" onClick={() => setCreateVisible(false)}>取消</Button>
            <Button type="primary" icon={<Plus />} onClick={async () => { await onCreate(createSeriesId || undefined); setCreateVisible(false) }}>
              创建并进入发现
            </Button>
          </footer>
        </div>
      </Modal>

      <Modal title="编辑节目信息" open={Boolean(editing)} onOk={async () => { if (!editing) return; await onEdit(editing.id, { title: editTitle.trim() || '未命名节目', description: editDescription.trim(), previewPath: editPreviewPath.trim() }); setEditing(null) }} onCancel={() => setEditing(null)} okText="保存" cancelText="取消">
        <div className="ui-form-stack">
          <label className="ui-field"><span>节目标题</span><Input value={editTitle} onChange={event => setEditTitle(event.target.value)} /></label>
          <label className="ui-field"><span>节目描述</span><Input.TextArea value={editDescription} onChange={event => setEditDescription(event.target.value)} autoSize={{ minRows: 3, maxRows: 5 }} /></label>
          <label className="ui-field"><span>预览图片路径</span><Input value={editPreviewPath} onChange={event => setEditPreviewPath(event.target.value)} prefix={<DownloadSimple />} /></label>
        </div>
      </Modal>

      <Modal title="加入栏目" open={Boolean(assigning)} confirmLoading={assigningBusy} onCancel={() => setAssigning(null)} onOk={() => void assignEpisode()} okText="加入" cancelText="取消">
        <div className="ui-form-stack">
          <label className="ui-field"><span>栏目</span><Select value={assignSeriesId} onChange={setAssignSeriesId} options={series.map(item => ({ value: item.id, label: item.title }))} /></label>
          {assignError && <div className="series-manager-error" role="alert">{assignError}</div>}
        </div>
      </Modal>

      <Modal className="series-manager-modal" width={960} title={null} open={seriesVisible} onCancel={() => setSeriesVisible(false)} footer={null}>
        <div className="series-manager">
          <nav className="series-manager-nav" aria-label="栏目列表">
            <header><span>LIBRARY</span><h2>栏目</h2><p>统一管理节目的连续发布设置。</p></header>
            <Button type="primary" icon={<Plus />} onClick={() => populateSeries()}>新建栏目</Button>
            {series.map(item => <button type="button" className={item.id === activeSeriesId ? 'is-active' : ''} key={item.id} onClick={() => selectSeries(item.id)}><strong>{item.title}</strong><small>{item.episodeIds.length} 期</small></button>)}
          </nav>
          <div className="series-manager-content">
            <header className="series-manager-heading">
              <div><span>{activeSeries ? 'SERIES SETTINGS' : 'NEW SERIES'}</span><h2>{activeSeries?.title || '创建栏目'}</h2></div>
              {activeSeries && <Button onClick={() => void onGenerateSeriesFeed(activeSeries.id)}>生成 RSS</Button>}
            </header>
            <div className="ui-form-stack">
              <label className="ui-field"><span>栏目名称</span><Input value={seriesTitle} onChange={event => setSeriesTitle(event.target.value)} /></label>
              <label className="ui-field"><span>栏目简介</span><Input.TextArea value={seriesDescription} onChange={event => setSeriesDescription(event.target.value)} autoSize={{ minRows: 2, maxRows: 4 }} /></label>
              <label className="ui-field"><span>默认封面路径</span><Input value={seriesCoverPath} onChange={event => setSeriesCoverPath(event.target.value)} /></label>
              <div className="series-manager-defaults">
                <label className="ui-field"><span>更新节奏</span><Select value={seriesCadence} onChange={setSeriesCadence} options={[{ value: 'daily', label: '每日' }, { value: 'weekly', label: '每周' }]} /></label>
                <label className="ui-field"><span>默认时长（分钟）</span><Input type="number" min={1} max={240} value={seriesDuration} onChange={event => setSeriesDuration(Number(event.target.value || 14))} /></label>
                <label className="ui-field"><span>RSS 作者</span><Input value={seriesAuthor} onChange={event => setSeriesAuthor(event.target.value)} /></label>
              </div>
              <div className="series-manager-defaults">
                <label className="ui-field"><span>主持人名称</span><Input value={seriesHostName} onChange={event => setSeriesHostName(event.target.value)} /></label>
                <label className="ui-field"><span>默认音色 ID</span><Input value={seriesDefaultVoice} onChange={event => setSeriesDefaultVoice(event.target.value)} /></label>
                <label className="ui-field"><span>发布目标</span><Input value={seriesPlatforms} onChange={event => setSeriesPlatforms(event.target.value)} /></label>
              </div>
              {seriesError && <div className="series-manager-error" role="alert">{seriesError}</div>}
              <div className="series-manager-save"><Button type="primary" loading={seriesSaving} disabled={!seriesTitle.trim()} onClick={() => void saveSeries()}>保存栏目</Button></div>
            </div>
            {activeSeries && (
              <div className="series-manager-order">
                <h3>连续播放顺序</h3>
                <div className="series-manager-metrics">
                  <span><b>{activeSeriesMetrics.repeatedTopics}</b> 个重复选题</span>
                  <span><b>{activeSeriesMetrics.sourceDomains}</b> 个来源域名</span>
                </div>
                {activeSeriesEpisodes.length === 0 ? <p>还没有节目加入这个栏目。</p> : activeSeriesEpisodes.map((episode, index) => (
                  <div key={episode.id}><span>{episode.title}</span><Space size={2}><Button type="text" icon={<CaretUp />} disabled={index === 0} onClick={() => void moveSeriesEpisode(index, -1)} aria-label="上移" /><Button type="text" icon={<CaretDown />} disabled={index === activeSeriesEpisodes.length - 1} onClick={() => void moveSeriesEpisode(index, 1)} aria-label="下移" /></Space></div>
                ))}
              </div>
            )}
          </div>
        </div>
      </Modal>
    </section>
  )
}
