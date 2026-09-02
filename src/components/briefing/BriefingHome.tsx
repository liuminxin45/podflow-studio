import { useState } from 'react'
import { Button, Empty, Skeleton } from 'antd'
import { Books, Play } from '@phosphor-icons/react'
import type { Workflow, WorkflowSummary } from '../../types/workflow'
import type { BriefingReadiness, BriefingRequest } from '../../services/briefingRun'
import { briefingStageForNode, isQuickBriefWorkflow, latestBriefingFailure } from '../../services/briefingRun'
import BriefingComposer from './BriefingComposer'
import BriefingProgress from './BriefingProgress'
import BriefingResult from './BriefingResult'

interface Props {
  workflow: Workflow | null
  episodes: WorkflowSummary[]
  libraryLoading: boolean
  busy: boolean
  hasElectronBackend: boolean
  readiness: BriefingReadiness
  onStart: (request: BriefingRequest) => Promise<void> | void
  onOpenSettings: () => void
  onOpenSample: () => void
  onOpenLibrary: () => void
  onPlay: (workflowId: string) => void
  onOpenStudio: (stageId: string) => void
}

export default function BriefingHome({
  workflow,
  episodes,
  libraryLoading,
  busy,
  hasElectronBackend,
  readiness,
  onStart,
  onOpenSettings,
  onOpenSample,
  onOpenLibrary,
  onPlay,
  onOpenStudio,
}: Props) {
  const [composeNew, setComposeNew] = useState(false)
  const quickWorkflow = isQuickBriefWorkflow(workflow) ? workflow : null
  const hasAudio = Boolean(quickWorkflow?.state?.audio_outputs?.final_audio_path)
  const hasFailure = Boolean(latestBriefingFailure(quickWorkflow))
  const showProgress = Boolean(quickWorkflow && !composeNew && (busy || quickWorkflow.status === 'running' || hasFailure) && !hasAudio)
  const showResult = Boolean(quickWorkflow && !composeNew && hasAudio)
  const recentEpisodes = episodes.filter(item => item.audioPath).slice(0, 4)

  return (
    <div className="briefing-home">
      {showProgress && quickWorkflow ? (
        <BriefingProgress
          workflow={quickWorkflow}
          onOpenStudio={() => onOpenStudio(briefingStageForNode(
            latestBriefingFailure(quickWorkflow)?.node || quickWorkflow.currentNode,
          ))}
          onStartNew={() => setComposeNew(true)}
        />
      ) : showResult && quickWorkflow ? (
        <BriefingResult
          workflow={quickWorkflow}
          onPlay={() => onPlay(quickWorkflow.id)}
          onOpenStudio={() => onOpenStudio('draft')}
          onOpenPublish={() => onOpenStudio('publish')}
          onStartNew={() => setComposeNew(true)}
        />
      ) : (
        <BriefingComposer
          busy={busy}
          hasElectronBackend={hasElectronBackend}
          readiness={readiness}
          onStart={async request => {
            await onStart(request)
            setComposeNew(false)
          }}
          onOpenSettings={onOpenSettings}
          onOpenSample={onOpenSample}
        />
      )}

      <section className="briefing-recents" aria-labelledby="briefing-recents-title">
        <header>
          <div>
            <h2 id="briefing-recents-title">最近生成</h2>
            <p>继续收听已经完成的节目。</p>
          </div>
          <Button type="text" icon={<Books />} onClick={onOpenLibrary}>查看节目库</Button>
        </header>
        {libraryLoading ? (
          <Skeleton active paragraph={{ rows: 2 }} />
        ) : recentEpisodes.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没有可以播放的节目" />
        ) : (
          <div className="briefing-recent-list">
            {recentEpisodes.map(episode => (
              <button type="button" key={episode.id} onClick={() => onPlay(episode.id)}>
                <span><strong>{episode.title || '未命名节目'}</strong><small>{episode.series?.title || '独立节目'}</small></span>
                <span>{episode.durationSeconds ? `${Math.max(1, Math.round(episode.durationSeconds / 60))} 分钟` : '播放'}<Play weight="fill" /></span>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
