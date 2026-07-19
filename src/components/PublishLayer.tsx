import { useCallback, useEffect, useState } from 'react'
import { Alert, Button, message, Tag, Tooltip } from 'antd'
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  CopyOutlined,
  DownloadOutlined,
  ExclamationCircleOutlined,
  ExportOutlined,
  FileTextOutlined,
  FolderOpenOutlined,
  InfoCircleOutlined,
  LinkOutlined,
  ReloadOutlined,
  SoundOutlined,
} from '../icons/antdCompat'
import { formatDuration } from '../utils'
import type { Workflow } from '../types/workflow'
import StageHeader from './StageHeader'
import './publish/publish.css'

type PublishView = 'ready' | 'publishing' | 'result'

interface Props {
  visible: boolean
  onClose: () => void
  onBackToProduce?: () => void
  workflow?: Workflow | null
  episodeTitle?: string
  episodeDesc?: string
  episodeDuration?: number
  onRunNodes?: (nodes: string[]) => Promise<void> | void
  onSaveWorkflow?: () => Promise<void> | void
  onOpenPath?: (targetPath: string) => Promise<{ success: boolean; error?: string }>
  onShowItemInFolder?: (targetPath: string) => Promise<{ success: boolean; error?: string }>
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function fileName(value: string): string {
  return value.split(/[\\/]/).filter(Boolean).pop() || value
}

function formatBytes(value: unknown): string {
  const bytes = Number(value)
  if (!Number.isFinite(bytes) || bytes <= 0) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function formatPublishedAt(value: string): string {
  if (!value) return '刚刚完成'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN', { hour12: false })
}

export default function PublishLayer({
  visible,
  onClose,
  onBackToProduce,
  workflow,
  episodeTitle = '',
  episodeDesc = '',
  episodeDuration = 0,
  onRunNodes,
  onSaveWorkflow,
  onOpenPath,
  onShowItemInFolder,
}: Props) {
  const [view, setView] = useState<PublishView>('ready')
  const [errorMessage, setErrorMessage] = useState('')
  const [saveErrorMessage, setSaveErrorMessage] = useState('')
  const [savingWorkflow, setSavingWorkflow] = useState(false)
  const [outputRoots, setOutputRoots] = useState({ local: 'dist/episodes', rss: 'out/rss' })

  const publishOutputs = workflow?.state?.publish_outputs || {}
  const audioOutputs = workflow?.state?.audio_outputs || {}
  const finalAudioPath = text(audioOutputs.final_audio_path)
  const coverPath = text(workflow?.state?.cover_path)
  const script = workflow?.state?.edited_script || {}
  const title = text(script.title) || episodeTitle || '未命名节目'
  const description = text(script.description) || episodeDesc || '未填写节目简介'
  const segments = Array.isArray(script.segments) ? script.segments : []
  const duration = Number(audioOutputs.duration_seconds) || episodeDuration
  const audioSize = formatBytes(audioOutputs.file_size)
  const rssPath = text(publishOutputs.feed_xml)
  const publishDir = text(publishOutputs.episode_dir)
  const publishedAt = text(publishOutputs.published_at)
  const localPreviewOnly = publishOutputs.local_preview_only !== false
  const platformResults = publishOutputs.platforms && typeof publishOutputs.platforms === 'object'
    ? publishOutputs.platforms as Record<string, string>
    : {}
  const hasPublishedResult = Boolean(publishedAt || rssPath || publishDir)
  const canPublish = Boolean(finalAudioPath && onRunNodes)
  const localReady = platformResults.local === 'success' && Boolean(publishDir)
  const rssReady = platformResults.rss === 'success' && Boolean(rssPath)

  useEffect(() => {
    if (!visible) return
    setView(hasPublishedResult ? 'result' : 'ready')
    setErrorMessage('')
    setSaveErrorMessage('')
    let cancelled = false
    window.electronAPI?.loadNodeConfig?.('publish')
      .then(config => {
        if (cancelled || !config) return
        setOutputRoots({
          local: text(config.local_base_dir) || 'dist/episodes',
          rss: text(config.rss_output_dir) || 'out/rss',
        })
      })
      .catch(() => undefined)
    return () => { cancelled = true }
  }, [hasPublishedResult, visible])

  useEffect(() => {
    if (!visible || view !== 'publishing') return
    if (workflow?.currentNode === 'publish' || workflow?.status === 'running') return
    if (hasPublishedResult) setView('result')
  }, [hasPublishedResult, view, visible, workflow?.currentNode, workflow?.status])

  const savePublishedWorkflow = useCallback(async () => {
    if (!onSaveWorkflow) {
      setSaveErrorMessage('发布文件已生成，但当前环境无法保存节目。请从 Electron 桌面应用重试。')
      return false
    }
    setSavingWorkflow(true)
    setSaveErrorMessage('')
    try {
      await onSaveWorkflow()
      return true
    } catch (error: any) {
      setSaveErrorMessage(error?.message || String(error) || '发布文件已生成，但节目自动保存失败。')
      return false
    } finally {
      setSavingWorkflow(false)
    }
  }, [onSaveWorkflow])

  const publishEpisode = useCallback(async () => {
    if (!onRunNodes) {
      setErrorMessage('当前环境没有发布执行接口。请从 Electron 桌面应用打开。')
      return
    }
    if (!finalAudioPath) {
      setErrorMessage('缺少最终音频。请先返回制作页生成可发布成品。')
      return
    }

    setErrorMessage('')
    setSaveErrorMessage('')
    setView('publishing')
    try {
      await onRunNodes(['publish'])
      setView('result')
      if (await savePublishedWorkflow()) {
        message.success('本地归档和 RSS 已生成，节目已保存')
      }
    } catch (error: any) {
      setView('ready')
      setErrorMessage(error?.message || String(error) || '发布未完成，请重试。')
    }
  }, [finalAudioPath, onRunNodes, savePublishedWorkflow])

  const openArtifact = useCallback(async (targetPath: string, action: 'open' | 'reveal' = 'open') => {
    if (!targetPath) return
    const result = action === 'reveal'
      ? await onShowItemInFolder?.(targetPath)
      : await onOpenPath?.(targetPath)
    if (!result?.success) message.error(result?.error || '无法打开发布产物')
  }, [onOpenPath, onShowItemInFolder])

  const copyPath = useCallback(async (targetPath: string) => {
    if (!targetPath) return
    try {
      await navigator.clipboard.writeText(targetPath)
      message.success('路径已复制')
    } catch {
      message.error('无法复制路径')
    }
  }, [])

  if (!visible) return null

  return (
    <div className="stage-workbench publish-workbench">
      <StageHeader
        title="发布"
        center={<span className="publish-header-note">本地优先 · 文件透明 · 随时可迁移</span>}
        previous={view !== 'publishing' ? { onClick: onBackToProduce || onClose } : undefined}
      />

      <div className="publish-layout">
        <aside className="publish-summary" aria-label="待发布节目摘要">
          <div className="publish-summary-kicker">本期成品</div>
          <h2>{title}</h2>
          <p>{description}</p>
          <dl className="publish-summary-stats">
            <div><dt><SoundOutlined />音频</dt><dd>{finalAudioPath ? formatDuration(duration) : '未生成'}</dd></div>
            <div><dt><FileTextOutlined />稿件</dt><dd>{segments.length} 段</dd></div>
            <div><dt><CheckCircleOutlined />封面</dt><dd>{coverPath ? '已生成' : '未生成'}</dd></div>
          </dl>
          {finalAudioPath && (
            <div className="publish-source-file">
              <span>成品文件</span>
              <Tooltip title={finalAudioPath}><strong>{fileName(finalAudioPath)}</strong></Tooltip>
              {audioSize && <small>{audioSize}</small>}
            </div>
          )}
          <div className={`publish-readiness ${finalAudioPath ? 'is-ready' : 'is-blocked'}`}>
            {finalAudioPath ? <CheckCircleOutlined /> : <ExclamationCircleOutlined />}
            <div>
              <strong>{finalAudioPath ? '交付条件已满足' : '还不能发布'}</strong>
              <span>{finalAudioPath ? '不会上传内容，只在本机生成可搬运的发布文件。' : '请返回声音工作台完成最终音频。'}</span>
            </div>
          </div>
          {hasPublishedResult && (
            <div className="publish-last-run">
              <span>最近生成</span>
              <strong>{formatPublishedAt(publishedAt)}</strong>
            </div>
          )}
        </aside>

        <main className="publish-main">
          {view === 'ready' && (
            <div className="publish-ready-view">
              <header className="publish-intro">
                <div>
                  <span className="publish-eyebrow">本地交付</span>
                  <h2>把这一期整理成可带走的文件</h2>
                  <p>生成完整节目归档与标准 RSS。文件保留在你的电脑上，不依赖 PodFlow Studio 的服务器。</p>
                </div>
                <span className="publish-scope-badge">2 项产物</span>
              </header>

              {errorMessage && (
                <Alert className="publish-error" type="error" showIcon message="发布未完成" description={errorMessage} />
              )}

              <section className="publish-manifest" aria-label="发布产物清单">
                <article className="publish-manifest-item">
                  <span className="publish-manifest-index">01</span>
                  <div className="publish-manifest-copy">
                    <div><strong>节目归档</strong><Tag>本地文件夹</Tag></div>
                    <p>包含成品音频、节目元数据、RSS 副本与运行报告，适合备份或迁移。</p>
                    <code>{outputRoots.local}\{text(workflow?.state?.episode_id) || '本期节目'}</code>
                  </div>
                  <FolderOpenOutlined className="publish-manifest-icon" />
                </article>
                <article className="publish-manifest-item">
                  <span className="publish-manifest-index">02</span>
                  <div className="publish-manifest-copy">
                    <div><strong>RSS 订阅源</strong><Tag>feed.xml</Tag></div>
                    <p>生成遵循播客规范的订阅文件，可自行托管、备份或交给任意兼容服务。</p>
                    <code>{outputRoots.rss}\feed.xml</code>
                  </div>
                  <LinkOutlined className="publish-manifest-icon" />
                </article>
              </section>

              <div className="publish-local-note">
                <InfoCircleOutlined />
                <span><strong>本地优先</strong> 此操作不会上传节目，也不会调用任何第三方发布接口。</span>
              </div>

              <div className="publish-action-panel">
                <div>
                  <strong>{canPublish ? '已准备好生成发布文件' : '请先完成音频制作'}</strong>
                  <span>{canPublish ? '再次生成会更新本期归档和 RSS。' : '最终音频就绪后，发布入口会自动解锁。'}</span>
                </div>
                <Button type="primary" size="large" icon={<ExportOutlined />} disabled={!canPublish} onClick={publishEpisode}>
                  生成发布文件
                </Button>
              </div>
            </div>
          )}

          {view === 'publishing' && (
            <div className="publish-running-view" role="status" aria-live="polite">
              <div className="publish-running-orbit"><span /><i /></div>
              <span className="publish-running-kicker">正在写入本地文件</span>
              <h2>正在整理节目归档</h2>
              <p>应用正在复制成品、写入节目元数据并更新 RSS，请保持应用运行。</p>
              <div className="publish-running-steps">
                <span className="is-active"><ClockCircleOutlined />整理成品</span>
                <span>写入归档</span>
                <span>校验 RSS</span>
              </div>
            </div>
          )}

          {view === 'result' && (
            <div className="publish-result-view">
              <header className="publish-success-hero">
                <span className="publish-success-mark"><CheckCircleOutlined /></span>
                <div>
                  <span className="publish-eyebrow">本地交付已完成</span>
                  <h2>发布文件已就绪</h2>
                  <p>{formatPublishedAt(publishedAt)} · 所有文件仍保留在本机</p>
                </div>
                <Button type="text" icon={<ReloadOutlined />} onClick={() => setView('ready')}>再次生成</Button>
              </header>

              {saveErrorMessage && (
                <Alert
                  className="publish-error"
                  type="error"
                  showIcon
                  message="发布文件已生成，但节目尚未保存"
                  description={saveErrorMessage}
                  action={<Button loading={savingWorkflow} onClick={() => void savePublishedWorkflow()}>重试保存</Button>}
                />
              )}

              <section className="publish-output-list" aria-label="发布结果">
                <article className={`publish-output-item ${localReady ? 'is-ready' : 'is-failed'}`}>
                  <div className="publish-output-icon"><FolderOpenOutlined /></div>
                  <div className="publish-output-copy">
                    <div className="publish-output-heading">
                      <strong>节目归档</strong>
                      <Tag>{localReady ? '已写入' : '未完成'}</Tag>
                    </div>
                    <p>成品音频、节目元数据、RSS 副本与运行报告</p>
                    <Tooltip title={publishDir}><code>{publishDir || '未生成路径'}</code></Tooltip>
                  </div>
                  <div className="publish-output-actions">
                    <Button type="primary" icon={<DownloadOutlined />} disabled={!publishDir} onClick={() => openArtifact(publishDir)}>打开归档</Button>
                    <Tooltip title="复制路径"><Button aria-label="复制归档路径" icon={<CopyOutlined />} disabled={!publishDir} onClick={() => copyPath(publishDir)} /></Tooltip>
                  </div>
                </article>

                <article className={`publish-output-item ${rssReady ? 'is-ready' : 'is-failed'}`}>
                  <div className="publish-output-icon"><LinkOutlined /></div>
                  <div className="publish-output-copy">
                    <div className="publish-output-heading">
                      <strong>RSS 订阅源</strong>
                      <Tag>{rssReady ? (localPreviewOnly ? '本地预览' : '可公开订阅') : '未完成'}</Tag>
                    </div>
                    <p>{localPreviewOnly ? 'feed.xml 已生成；发布到公网前仍需自行托管音频与订阅文件。' : '订阅文件已使用公开 enclosure 地址。'}</p>
                    <Tooltip title={rssPath}><code>{rssPath || '未生成路径'}</code></Tooltip>
                  </div>
                  <div className="publish-output-actions">
                    <Button icon={<FileTextOutlined />} disabled={!rssPath} onClick={() => openArtifact(rssPath)}>打开 RSS</Button>
                    <Tooltip title="复制路径"><Button aria-label="复制 RSS 路径" icon={<CopyOutlined />} disabled={!rssPath} onClick={() => copyPath(rssPath)} /></Tooltip>
                  </div>
                </article>
              </section>

              {localPreviewOnly && rssReady && (
                <div className="publish-rss-note">
                  <InfoCircleOutlined />
                  <div><strong>当前是本地 RSS</strong><span>它适合预览、备份和迁移；如需公开订阅，请将归档和 feed.xml 部署到你自己的托管空间。</span></div>
                </div>
              )}

              <footer className="publish-result-footer">
                <span>你可以随时重新生成，旧节目源数据不会被删除。</span>
                <Tooltip title={saveErrorMessage ? '请先保存节目' : undefined}>
                  <Button type="primary" disabled={Boolean(saveErrorMessage) || savingWorkflow} onClick={onClose}>完成</Button>
                </Tooltip>
              </footer>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
