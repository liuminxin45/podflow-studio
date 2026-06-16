import { Button, Empty } from 'antd'
import { PlayCircleOutlined, ArrowRightOutlined } from '@ant-design/icons'
import EpisodeManager from './EpisodeManager'
import type { Workflow, WorkflowSummary } from '../types/workflow'
import {
  STAGES,
  getNextStage,
  getStageStats,
  getStageStatus,
  getStatusColor,
  getStatusLabel,
  type StageDefinition,
} from './workflowStages'

interface Notice {
  type: 'success' | 'warning' | 'error' | 'info'
  text: string
}

interface Props {
  workflow: Workflow | null
  hasElectronBackend: boolean
  notice?: Notice | null
  episodes: WorkflowSummary[]
  onCreateEpisode: () => void
  onStageClick: (stageId: string) => void
  onOpenEpisode: (workflowId: string) => Promise<void> | void
  onDeleteEpisode: (workflowId: string) => Promise<void> | void
  onImportEpisode: () => Promise<void> | void
  onExportEpisode: (workflowId: string) => Promise<void> | void
  onEditEpisode: (workflowId: string, patch: { title: string; description: string; previewPath: string }) => Promise<void> | void
}

function getWorkflowStatusLabel(status?: string) {
  switch (status) {
    case 'draft': return '草稿'
    case 'running': return '运行中'
    case 'completed': return '已完成'
    case 'failed': return '失败'
    case 'waiting_approval': return '待确认'
    default: return '未开始'
  }
}

function getNoticeColor(type: Notice['type']) {
  switch (type) {
    case 'success': return ['var(--success-bg)', 'var(--success-color)']
    case 'warning': return ['var(--warning-bg)', 'var(--warning-color)']
    case 'error': return ['var(--error-bg)', 'var(--error-color)']
    default: return ['var(--info-bg)', 'var(--info-color)']
  }
}

function Metric({ label, value, tone = 'default' }: { label: string; value: string | number; tone?: 'default' | 'success' | 'warning' | 'error' }) {
  const color = tone === 'success' ? 'var(--success-color)'
    : tone === 'warning' ? 'var(--warning-color)'
      : tone === 'error' ? 'var(--error-color)'
        : 'var(--text-primary)'
  return (
    <div style={{
      border: '1px solid var(--border-color)',
      background: 'var(--bg-secondary)',
      borderRadius: 8,
      padding: '14px 16px',
      minWidth: 0,
    }}>
      <div style={{ fontSize: 22, lineHeight: 1, fontWeight: 800, color }}>{value}</div>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 8 }}>{label}</div>
    </div>
  )
}

function StageLine({ stage, workflow, onStageClick }: {
  stage: StageDefinition
  workflow: Workflow | null
  onStageClick: (stageId: string) => void
}) {
  const status = getStageStatus(stage, workflow)
  const statusColor = getStatusColor(status, stage.color)
  return (
    <button
      type="button"
      onClick={() => onStageClick(stage.id)}
      style={{
        width: '100%',
        border: '1px solid var(--border-color)',
        background: 'var(--bg-secondary)',
        borderRadius: 8,
        padding: '10px 12px',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        cursor: 'pointer',
        textAlign: 'left',
      }}
    >
      <span style={{
        width: 26,
        height: 26,
        borderRadius: 7,
        background: `${stage.color}12`,
        color: statusColor,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 12,
        fontWeight: 700,
      }}>
        {stage.icon}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 13, fontWeight: 650, color: 'var(--text-primary)' }}>{stage.label}</span>
        <span style={{ display: 'block', fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>{stage.subtitle}</span>
      </span>
      <span style={{
        fontSize: 11,
        height: 22,
        lineHeight: '22px',
        borderRadius: 11,
        padding: '0 8px',
        color: statusColor,
        background: status === 'pending' ? 'var(--bg-tertiary)' : `${stage.color}12`,
        whiteSpace: 'nowrap',
      }}>
        {getStatusLabel(status)}
      </span>
    </button>
  )
}

export default function HomeOverview({
  workflow,
  hasElectronBackend,
  notice,
  episodes,
  onCreateEpisode,
  onStageClick,
  onOpenEpisode,
  onDeleteEpisode,
  onImportEpisode,
  onExportEpisode,
  onEditEpisode,
}: Props) {
  const stats = getStageStats(workflow)
  const nextStage = getNextStage(workflow)
  const logs = workflow?.state?.logs || []
  const errors = workflow?.state?.errors || []
  const recentLogs = logs.slice(-5).reverse()
  const recentErrors = errors.slice(-3).reverse()
  const topicTitle = workflow?.state?.selected_topic?.title || '尚未确定选题'
  const workflowId = workflow?.state?.episode_id || '尚未创建'
  const [noticeBg, noticeColor] = notice ? getNoticeColor(notice.type) : ['', '']

  return (
    <main style={{
      flex: 1,
      minWidth: 0,
      height: '100%',
      overflow: 'auto',
      background: 'var(--bg-primary)',
      padding: '28px 32px',
    }}>
      <div style={{ maxWidth: 1080, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 18 }}>
        {!hasElectronBackend && (
          <div style={{
            border: '1px solid var(--warning-color)',
            background: 'var(--warning-bg)',
            color: 'var(--text-primary)',
            borderRadius: 8,
            padding: '12px 14px',
            fontSize: 13,
          }}>
            当前浏览器预览没有 Electron 后端，创建节目、录音、文件打开和节点执行能力不可用。
          </div>
        )}

        {notice && (
          <div style={{
            border: `1px solid ${noticeColor}`,
            background: noticeBg,
            color: 'var(--text-primary)',
            borderRadius: 8,
            padding: '12px 14px',
            fontSize: 13,
          }}>
            {notice.text}
          </div>
        )}

        <EpisodeManager
          episodes={episodes}
          activeWorkflowId={workflow?.id}
          hasElectronBackend={hasElectronBackend}
          onCreate={onCreateEpisode}
          onOpen={onOpenEpisode}
          onDelete={onDeleteEpisode}
          onImport={onImportEpisode}
          onExport={onExportEpisode}
          onEdit={onEditEpisode}
        />

        <section style={{
          border: '1px solid var(--border-color)',
          background: 'var(--bg-secondary)',
          borderRadius: 8,
          padding: 22,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 20,
        }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>当前节目</div>
            <div style={{
              fontSize: 24,
              fontWeight: 800,
              color: 'var(--text-primary)',
              lineHeight: 1.25,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              maxWidth: 620,
            }}>
              {topicTitle}
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 12, fontSize: 12, color: 'var(--text-tertiary)' }}>
              <span>节目 ID：{workflowId}</span>
              <span>状态：{getWorkflowStatusLabel(workflow?.status)}</span>
              <span>下一步：{nextStage.label}</span>
            </div>
          </div>
          <Button
            type="primary"
            icon={workflow ? <ArrowRightOutlined /> : <PlayCircleOutlined />}
            onClick={() => workflow ? onStageClick(nextStage.id) : onCreateEpisode()}
            style={{ height: 40, borderRadius: 8, fontWeight: 650, flexShrink: 0 }}
          >
            {workflow ? `进入${nextStage.label}` : '新建节目'}
          </Button>
        </section>

        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12 }}>
          <Metric label="已完成阶段" value={`${stats.completed}/${stats.total}`} tone="success" />
          <Metric label="进行中阶段" value={stats.running} />
          <Metric label="待确认" value={stats.waitingApproval} tone="warning" />
          <Metric label="失败" value={stats.failed} tone="error" />
        </section>

        <section style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(280px, 360px)', gap: 16 }}>
          <div style={{
            border: '1px solid var(--border-color)',
            background: 'var(--bg-secondary)',
            borderRadius: 8,
            padding: 18,
          }}>
            <div style={{ fontSize: 15, fontWeight: 750, color: 'var(--text-primary)', marginBottom: 12 }}>流程总览</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {STAGES.map(stage => (
                <StageLine key={stage.id} stage={stage} workflow={workflow} onStageClick={onStageClick} />
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
            <div style={{
              border: '1px solid var(--border-color)',
              background: 'var(--bg-secondary)',
              borderRadius: 8,
              padding: 18,
              minHeight: 178,
            }}>
              <div style={{ fontSize: 15, fontWeight: 750, color: 'var(--text-primary)', marginBottom: 12 }}>最近日志</div>
              {recentLogs.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {recentLogs.map((log, index) => (
                    <div key={`${log}-${index}`} style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                      {log}
                    </div>
                  ))}
                </div>
              ) : (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无日志" />
              )}
            </div>

            <div style={{
              border: '1px solid var(--border-color)',
              background: 'var(--bg-secondary)',
              borderRadius: 8,
              padding: 18,
              minHeight: 178,
            }}>
              <div style={{ fontSize: 15, fontWeight: 750, color: 'var(--text-primary)', marginBottom: 12 }}>错误摘要</div>
              {recentErrors.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {recentErrors.map((err, index) => (
                    <div key={`${err.node}-${index}`} style={{ fontSize: 12, color: 'var(--error-color)', lineHeight: 1.5 }}>
                      {err.node}：{err.message}
                    </div>
                  ))}
                </div>
              ) : (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无错误" />
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}
