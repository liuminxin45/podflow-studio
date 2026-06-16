import { useEffect, useState } from 'react'
import { Button, Empty, Input, Modal, Popconfirm, Space, Tag, Tooltip } from 'antd'
import {
  CopyOutlined,
  DeleteOutlined,
  DownloadOutlined,
  EditOutlined,
  ExportOutlined,
  FileImageOutlined,
  FolderOpenOutlined,
  ImportOutlined,
  PlusOutlined,
} from '@ant-design/icons'
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

function statusLabel(status?: string) {
  switch (status) {
    case 'draft': return '草稿'
    case 'running': return '运行中'
    case 'completed': return '已完成'
    case 'failed': return '失败'
    case 'waiting_approval': return '待确认'
    default: return '未开始'
  }
}

function statusColor(status?: string) {
  switch (status) {
    case 'completed': return 'success'
    case 'running': return 'processing'
    case 'failed': return 'error'
    case 'waiting_approval': return 'warning'
    default: return 'default'
  }
}

function formatDate(value?: string) {
  if (!value) return '未知时间'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function fileUrl(filePath?: string) {
  if (!filePath) return ''
  return `file:///${filePath.replace(/\\/g, '/')}`
}

export default function EpisodeManager({
  episodes,
  activeWorkflowId,
  activeWorkflowDirty,
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
  const [selectedEpisodeId, setSelectedEpisodeId] = useState<string | null>(activeWorkflowId || null)
  const [hoveredEpisodeId, setHoveredEpisodeId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editPreviewPath, setEditPreviewPath] = useState('')

  useEffect(() => {
    if (activeWorkflowId) {
      setSelectedEpisodeId(activeWorkflowId)
    }
  }, [activeWorkflowId])

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
    <section style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)' }}>节目管理</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
            管理本地节目库，支持新增、导入、导出、编辑和删除
          </div>
        </div>
        <Space size="small">
          <Button icon={<ImportOutlined />} disabled={!hasElectronBackend} onClick={onImport}>
            导入节目
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
          gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
          gap: 12,
        }}>
          {episodes.map(episode => {
            const active = episode.id === activeWorkflowId || episode.isCurrent
            const selected = episode.id === selectedEpisodeId
            const hovered = episode.id === hoveredEpisodeId
            const previewSrc = fileUrl(episode.previewPath)
            return (
              <div
                key={episode.id}
                onClick={() => setSelectedEpisodeId(episode.id)}
                onDoubleClick={() => onOpen(episode.id)}
                onMouseEnter={() => setHoveredEpisodeId(episode.id)}
                onMouseLeave={() => setHoveredEpisodeId(prev => prev === episode.id ? null : prev)}
                style={{
                  border: `1px solid ${active || selected || hovered ? 'var(--accent-primary)' : 'var(--border-color)'}`,
                  background: hovered || selected ? 'var(--accent-light)' : 'var(--bg-secondary)',
                  borderRadius: 8,
                  overflow: 'hidden',
                  boxShadow: active || selected || hovered ? '0 8px 22px rgba(37, 99, 235, 0.12)' : 'var(--shadow-sm)',
                  cursor: 'pointer',
                  transform: hovered ? 'translateY(-1px)' : 'translateY(0)',
                  transition: 'border-color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease, transform 0.15s ease',
                }}
              >
                <div style={{
                  height: 104,
                  background: 'linear-gradient(135deg, #eef2ff, #f8fafc)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--text-tertiary)',
                  overflow: 'hidden',
                }}>
                  {previewSrc ? (
                    <img
                      src={previewSrc}
                      alt={`${episode.title} 预览图`}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                      <FileImageOutlined style={{ fontSize: 24 }} />
                      <span style={{ fontSize: 12 }}>暂无预览图</span>
                    </div>
                  )}
                </div>

                <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ minHeight: 58 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                      <Tag color={statusColor(episode.status)} style={{ margin: 0 }}>{statusLabel(episode.status)}</Tag>
                      {active && <Tag color="blue" style={{ margin: 0 }}>当前</Tag>}
                      {((!episode.isSaved && active) || (active && activeWorkflowDirty)) && (
                        <Tag color="orange" style={{ margin: 0 }}>
                          {episode.isSaved ? '未保存更改' : '未保存'}
                        </Tag>
                      )}
                    </div>
                    <Tooltip title="点击编辑按钮可手动修改节目名称；双击卡片打开节目">
                      <div style={{
                        fontSize: 15,
                        fontWeight: 750,
                        color: 'var(--text-primary)',
                        lineHeight: 1.35,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                      }}>
                        {episode.title || '未命名节目'}
                      </div>
                    </Tooltip>
                    <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 6 }}>
                      新增时间：{formatDate(episode.createdAt)}
                    </div>
                  </div>

                  <div
                    onClick={event => event.stopPropagation()}
                    onDoubleClick={event => event.stopPropagation()}
                    style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}
                  >
                    <Tooltip title="打开节目">
                      <Button
                        size="small"
                        icon={<FolderOpenOutlined />}
                        onClick={event => {
                          event.stopPropagation()
                          onOpen(episode.id)
                        }}
                        aria-label="打开节目"
                      />
                    </Tooltip>
                    <Tooltip title="复制节目">
                      <Button
                        size="small"
                        icon={<CopyOutlined />}
                        disabled={!hasElectronBackend || !onDuplicate}
                        onClick={event => {
                          event.stopPropagation()
                          onDuplicate?.(episode.id)
                        }}
                        aria-label="复制节目"
                      />
                    </Tooltip>
                    <Tooltip title="编辑节目名称与信息">
                      <Button
                        size="small"
                        icon={<EditOutlined />}
                        onClick={event => {
                          event.stopPropagation()
                          openEdit(episode)
                        }}
                        aria-label="编辑节目"
                      />
                    </Tooltip>
                    <Tooltip title="导出节目">
                      <Button
                        size="small"
                        icon={<ExportOutlined />}
                        disabled={!hasElectronBackend}
                        onClick={event => {
                          event.stopPropagation()
                          onExport(episode.id)
                        }}
                        aria-label="导出节目"
                      />
                    </Tooltip>
                    <Popconfirm
                      title="删除节目"
                      description="确认删除这个本地节目？"
                      okText="删除"
                      cancelText="取消"
                      okButtonProps={{ danger: true }}
                      onConfirm={() => onDelete(episode.id)}
                    >
                      <Tooltip title="删除节目">
                        <Button
                          size="small"
                          danger
                          icon={<DeleteOutlined />}
                          disabled={!hasElectronBackend}
                          aria-label="删除节目"
                        />
                      </Tooltip>
                    </Popconfirm>
                  </div>
                </div>
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
              placeholder="例如 E:\\Neo\\auto-podcast\\cover.png"
              prefix={<DownloadOutlined />}
            />
          </div>
        </div>
      </Modal>
    </section>
  )
}
