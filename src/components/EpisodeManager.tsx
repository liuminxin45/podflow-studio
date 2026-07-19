import { useEffect, useState } from 'react'
import { Button, Dropdown, Empty, Input, Modal, Space } from 'antd'
import {
  CopyOutlined,
  DeleteOutlined,
  DownloadOutlined,
  EditOutlined,
  ExportOutlined,
  FileImageOutlined,
  ImportOutlined,
  MoreOutlined,
  PlusOutlined,
} from '../icons/antdCompat'
import type { WorkflowSummary } from '../types/workflow'

interface EpisodeMetaPatch {
  title: string
  description: string
  previewPath: string
}

interface Props {
  episodes: WorkflowSummary[]
  activeWorkflowId?: string
  activeWorkflowDirty?: boolean
  hasElectronBackend: boolean
  onCreate: () => Promise<void> | void
  onOpen: (workflowId: string) => Promise<void> | void
  onDelete: (workflowId: string) => Promise<void> | void
  onDuplicate?: (workflowId: string) => Promise<void> | void
  onImport: () => Promise<void> | void
  onExport: (workflowId: string) => Promise<void> | void
  onEdit: (workflowId: string, patch: EpisodeMetaPatch) => Promise<void> | void
}

function formatDate(value?: string) {
  if (!value) return '未知时间'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const pad = (part: number) => String(part).padStart(2, '0')
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export default function EpisodeManager({
  episodes,
  activeWorkflowId,
  hasElectronBackend,
  onCreate,
  onOpen,
  onDelete,
  onDuplicate,
  onImport,
  onExport,
  onEdit,
}: Props) {
  const [editing, setEditing] = useState<WorkflowSummary | null>(null)
  const [hoveredEpisodeId, setHoveredEpisodeId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editPreviewPath, setEditPreviewPath] = useState('')
  const [previewSources, setPreviewSources] = useState<Record<string, string>>({})

  useEffect(() => {
    let disposed = false

    async function loadPreviewSources() {
      const entries = await Promise.all(episodes.map(async episode => {
        const previewPath = episode.previewPath || ''
        if (!previewPath) return [episode.id, ''] as const
        if (/^(https?:|data:|blob:)/i.test(previewPath)) {
          return [episode.id, previewPath] as const
        }
        if (!window.electronAPI?.readImageAsDataUrl) {
          return [episode.id, ''] as const
        }
        const result = await window.electronAPI.readImageAsDataUrl(previewPath)
        return [episode.id, result.success && result.dataUrl ? result.dataUrl : ''] as const
      }))

      if (!disposed) {
        setPreviewSources(Object.fromEntries(entries))
      }
    }

    void loadPreviewSources()
    return () => {
      disposed = true
    }
  }, [episodes])

  const openEdit = (episode: WorkflowSummary) => {
    setEditing(episode)
    setEditTitle(episode.title || '')
    setEditDescription(episode.description || '')
    setEditPreviewPath(episode.previewPath || '')
  }

  const saveEdit = async () => {
    if (!editing) return
    await onEdit(editing.id, {
      title: editTitle.trim() || '未命名节目',
      description: editDescription.trim(),
      previewPath: editPreviewPath.trim(),
    })
    setEditing(null)
  }

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 16, width: '100%', maxWidth: 1200 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)' }}>节目管理</div>
        </div>
        <Space size="small">
          <Button icon={<ImportOutlined />} disabled={!hasElectronBackend} onClick={onImport}>
            导入 .pfs
          </Button>
          <Button type="primary" icon={<PlusOutlined />} disabled={!hasElectronBackend} onClick={onCreate}>
            新增节目
          </Button>
        </Space>
      </div>

      {episodes.length === 0 ? (
        <div style={{
          border: '1px dashed var(--border-color)',
          borderRadius: 8,
          padding: 24,
          background: 'var(--bg-secondary)',
        }}>
          <Empty description={hasElectronBackend ? '暂无节目' : '需要 Electron 后端才能读取节目列表'} />
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 320px), 1fr))',
          gap: 12,
        }}>
          {episodes.map(episode => {
            const active = episode.id === activeWorkflowId || episode.isCurrent
            const hovered = episode.id === hoveredEpisodeId
            const previewSrc = previewSources[episode.id] || ''
            return (
              <div
                key={episode.id}
                role="button"
                tabIndex={0}
                aria-label={`打开节目：${episode.title || '未命名节目'}`}
                onClick={() => onOpen(episode.id)}
                onKeyDown={event => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    void onOpen(episode.id)
                  }
                }}
                onMouseEnter={() => setHoveredEpisodeId(episode.id)}
                onMouseLeave={() => setHoveredEpisodeId(prev => prev === episode.id ? null : prev)}
                style={{
                  minWidth: 0,
                  minHeight: 88,
                  padding: 12,
                  display: 'grid',
                  gridTemplateColumns: '64px minmax(0, 1fr) 32px',
                  alignItems: 'center',
                  gap: 12,
                  border: `1px solid ${active ? 'var(--accent-primary)' : 'var(--border-color)'}`,
                  background: hovered ? 'var(--bg-tertiary)' : 'var(--bg-secondary)',
                  borderRadius: 10,
                  boxShadow: hovered ? '0 4px 12px rgba(15, 23, 42, 0.06)' : '0 1px 2px rgba(15, 23, 42, 0.04)',
                  cursor: 'pointer',
                  transition: 'border-color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease, transform 0.15s ease',
                  transform: hovered ? 'translateY(-1px)' : 'none',
                }}
              >
                <div style={{
                  width: 64,
                  height: 64,
                  borderRadius: 8,
                  background: 'linear-gradient(145deg, var(--bg-tertiary), var(--border-color))',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--text-tertiary)',
                  overflow: 'hidden',
                  flexShrink: 0,
                }}>
                  {previewSrc ? (
                    <img
                      src={previewSrc}
                      alt={`${episode.title} 预览图`}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : (
                    <div aria-hidden="true" style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <FileImageOutlined style={{ position: 'absolute', fontSize: 30, opacity: 0.16 }} />
                      <span style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-secondary)' }}>
                        {(episode.title || '节').trim().slice(0, 1)}
                      </span>
                    </div>
                  )}
                </div>

                <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                  <div title={episode.title || '未命名节目'} style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                    lineHeight: 1.4,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {episode.title || '未命名节目'}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 6 }}>
                    更新于 {formatDate(episode.updatedAt)}
                  </div>
                </div>

                <Dropdown
                  trigger={['click']}
                  menu={{
                    items: [
                      { key: 'duplicate', icon: <CopyOutlined />, label: '复制节目', disabled: !hasElectronBackend || !onDuplicate },
                      { key: 'edit', icon: <EditOutlined />, label: '编辑信息' },
                      { key: 'export', icon: <ExportOutlined />, label: '导出 .pfs', disabled: !hasElectronBackend },
                      { type: 'divider' },
                      { key: 'delete', icon: <DeleteOutlined />, label: '删除节目', danger: true, disabled: !hasElectronBackend },
                    ],
                    onClick: ({ key, domEvent }) => {
                      domEvent.stopPropagation()
                      if (key === 'duplicate') void onDuplicate?.(episode.id)
                      if (key === 'edit') openEdit(episode)
                      if (key === 'export') void onExport(episode.id)
                      if (key === 'delete') {
                        Modal.confirm({
                          title: '删除节目',
                          content: '确认删除这个本地节目？',
                          okText: '删除',
                          cancelText: '取消',
                          okButtonProps: { danger: true },
                          onOk: () => onDelete(episode.id),
                        })
                      }
                    },
                  }}
                >
                  <Button
                    type="text"
                    size="small"
                    icon={<MoreOutlined />}
                    aria-label={`更多操作：${episode.title || '未命名节目'}`}
                    onClick={event => event.stopPropagation()}
                    style={{ color: 'var(--text-secondary)' }}
                  />
                </Dropdown>
              </div>
            )
          })}
        </div>
      )}

      <Modal
        title="编辑节目名称与信息"
        open={Boolean(editing)}
        onOk={saveEdit}
        onCancel={() => setEditing(null)}
        okText="保存"
        cancelText="取消"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>节目标题</div>
            <Input value={editTitle} onChange={event => setEditTitle(event.target.value)} placeholder="请输入节目标题" />
          </div>
          <div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>节目描述</div>
            <Input.TextArea
              value={editDescription}
              onChange={event => setEditDescription(event.target.value)}
              placeholder="请输入节目描述"
              autoSize={{ minRows: 3, maxRows: 5 }}
            />
          </div>
          <div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>预览图片路径</div>
            <Input
              value={editPreviewPath}
              onChange={event => setEditPreviewPath(event.target.value)}
              placeholder="例如 C:\\path\\cover.png"
              prefix={<DownloadOutlined />}
            />
          </div>
        </div>
      </Modal>
    </section>
  )
}
