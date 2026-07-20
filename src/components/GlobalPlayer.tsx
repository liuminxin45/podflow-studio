import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, Select, Slider, Spin } from 'antd'
import { CaretDown, CaretUp, Pause, Play, WarningCircle, X } from '@phosphor-icons/react'
import type { FactCard, ScriptSegment, Workflow, WorkflowSummary } from '../types/workflow'

interface Props {
  episode: WorkflowSummary | null
  workflow: Workflow | null
  onClose: () => void
  onPlaybackPersisted: () => void
  onEnded: () => void
}

function formatTime(value: number) {
  const seconds = Math.max(0, Math.trunc(value || 0))
  const minutes = Math.trunc(seconds / 60)
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`
}

function currentSegment(segments: ScriptSegment[], position: number, duration: number) {
  if (segments.length === 0) return null
  const weights = segments.map(segment => Math.max(1, Number(segment.estimated_seconds || 0)))
  const total = weights.reduce((sum, value) => sum + value, 0)
  const scaledPosition = duration > 0 ? (position / duration) * total : position
  let elapsed = 0
  for (let index = 0; index < segments.length; index += 1) {
    elapsed += weights[index]
    if (scaledPosition <= elapsed) return segments[index]
  }
  return segments.at(-1) || null
}

export default function GlobalPlayer({ episode, workflow, onClose, onPlaybackPersisted, onEnded }: Props) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const episodeRef = useRef(episode)
  episodeRef.current = episode
  const onPlaybackPersistedRef = useRef(onPlaybackPersisted)
  onPlaybackPersistedRef.current = onPlaybackPersisted
  const loadedEpisodeIdRef = useRef<string | null>(null)
  const initialPositionRef = useRef(0)
  const playbackSnapshotRef = useRef({ positionSeconds: 0, durationSeconds: 0, speed: 1 })
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const countedPlayRef = useRef(false)
  const playCountBaseRef = useRef(0)
  const [mediaUrl, setMediaUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [playing, setPlaying] = useState(false)
  const [position, setPosition] = useState(0)
  const [duration, setDuration] = useState(0)
  const [expanded, setExpanded] = useState(false)
  const [speed, setSpeed] = useState(1)

  const episodeId = episode?.id
  const segments = useMemo(
    () => workflow?.state.edited_script?.segments || workflow?.state.script?.segments || [],
    [workflow?.state.edited_script?.segments, workflow?.state.script?.segments],
  )
  const segment = useMemo(() => currentSegment(segments, position, duration), [duration, position, segments])
  const facts = useMemo(() => {
    const ids = new Set(segment?.source_fact_ids || [])
    return (workflow?.state.facts || []).filter(fact => ids.has(fact.id))
  }, [segment, workflow?.state.facts])

  useEffect(() => {
    const currentEpisode = episodeRef.current
    if (!currentEpisode || !episodeId) return
    let disposed = false
    const updatePlayback = window.electronAPI.updatePlayback
    loadedEpisodeIdRef.current = null
    setMediaUrl('')
    countedPlayRef.current = false
    playCountBaseRef.current = Number(currentEpisode.playback?.playCount || 0)
    initialPositionRef.current = Number(currentEpisode.playback?.positionSeconds || 0)
    playbackSnapshotRef.current = {
      positionSeconds: initialPositionRef.current,
      durationSeconds: Number(currentEpisode.playback?.durationSeconds || currentEpisode.durationSeconds || 0),
      speed: Number(currentEpisode.playback?.speed || 1),
    }
    setLoading(true)
    setError('')
    setPlaying(false)
    setPosition(Number(currentEpisode.playback?.positionSeconds || 0))
    setDuration(Number(currentEpisode.playback?.durationSeconds || currentEpisode.durationSeconds || 0))
    setSpeed(Number(currentEpisode.playback?.speed || 1))
    void window.electronAPI.getMediaUrl(episodeId)
      .then(result => {
        if (!disposed) {
          loadedEpisodeIdRef.current = episodeId
          setMediaUrl(result.url)
        }
      })
      .catch(reason => {
        if (!disposed) setError(reason instanceof Error ? reason.message : String(reason))
      })
      .finally(() => {
        if (!disposed) setLoading(false)
      })
    return () => {
      disposed = true
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current)
      persistTimerRef.current = null
      if (loadedEpisodeIdRef.current === episodeId) {
        const snapshot = playbackSnapshotRef.current
        void updatePlayback(episodeId, {
          positionSeconds: snapshot.positionSeconds,
          durationSeconds: snapshot.durationSeconds,
          completed: Boolean(snapshot.durationSeconds > 0 && snapshot.positionSeconds >= snapshot.durationSeconds - 3),
          speed: snapshot.speed,
          playCount: playCountBaseRef.current + (countedPlayRef.current ? 1 : 0),
        }).then(() => onPlaybackPersistedRef.current()).catch(() => {})
      }
      loadedEpisodeIdRef.current = null
    }
  }, [episodeId])

  useEffect(() => {
    if (!audioRef.current) return
    audioRef.current.playbackRate = speed
  }, [speed])

  const persist = (immediate = false) => {
    const targetEpisodeId = loadedEpisodeIdRef.current
    if (!targetEpisodeId) return
    const run = () => {
      persistTimerRef.current = null
      if (loadedEpisodeIdRef.current !== targetEpisodeId) return
      const audio = audioRef.current
      const currentPosition = audio?.currentTime ?? position
      const currentDuration = Number.isFinite(audio?.duration) ? Number(audio?.duration) : duration
      const payload = {
        positionSeconds: currentPosition,
        durationSeconds: currentDuration,
        completed: Boolean(audio?.ended || (currentDuration > 0 && currentPosition >= currentDuration - 3)),
        speed: audio?.playbackRate || speed,
        playCount: playCountBaseRef.current + (countedPlayRef.current ? 1 : 0),
      }
      playbackSnapshotRef.current = {
        positionSeconds: payload.positionSeconds,
        durationSeconds: payload.durationSeconds,
        speed: payload.speed,
      }
      void window.electronAPI.updatePlayback(targetEpisodeId, payload)
        .then(() => onPlaybackPersistedRef.current())
        .catch(reason => {
          if (loadedEpisodeIdRef.current === targetEpisodeId) {
            setError(reason instanceof Error ? reason.message : String(reason))
          }
        })
    }
    if (immediate) {
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current)
      run()
    } else if (!persistTimerRef.current) {
      persistTimerRef.current = setTimeout(run, 5000)
    }
  }

  const togglePlaying = async () => {
    const audio = audioRef.current
    if (!audio) return
    if (audio.paused) {
      if (!countedPlayRef.current) countedPlayRef.current = true
      await audio.play()
    } else {
      audio.pause()
    }
  }

  if (!episode) return null

  return (
    <aside className={`global-player ${expanded ? 'is-expanded' : ''}`} aria-label="全局播放器">
      {mediaUrl && (
        <audio
          ref={audioRef}
          src={mediaUrl}
          preload="metadata"
          onLoadedMetadata={event => {
            const audio = event.currentTarget
            const restored = Math.min(initialPositionRef.current, audio.duration || 0)
            audio.currentTime = restored
            audio.playbackRate = speed
            playbackSnapshotRef.current = { positionSeconds: restored, durationSeconds: audio.duration || 0, speed }
            setPosition(restored)
            setDuration(audio.duration || 0)
          }}
          onPlay={() => setPlaying(true)}
          onPause={() => { setPlaying(false); persist(true) }}
          onEnded={() => { setPlaying(false); persist(true); onEnded() }}
          onTimeUpdate={event => {
            playbackSnapshotRef.current = {
              positionSeconds: event.currentTarget.currentTime,
              durationSeconds: Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : duration,
              speed: event.currentTarget.playbackRate,
            }
            setPosition(event.currentTarget.currentTime)
            persist(false)
          }}
        />
      )}
      <div className="global-player-main">
        <Button
          type="primary"
          shape="circle"
          icon={loading ? <Spin size="small" /> : playing ? <Pause weight="fill" /> : <Play weight="fill" />}
          onClick={() => void togglePlaying()}
          disabled={loading || Boolean(error) || !mediaUrl}
          aria-label={playing ? '暂停' : '播放'}
        />
        <div className="global-player-title">
          <strong>{episode.title}</strong>
          <span>{segment?.title || episode.series?.title || '节目成片'}</span>
        </div>
        <span className="global-player-time">{formatTime(position)}</span>
        <Slider
          className="global-player-slider"
          min={0}
          max={Math.max(1, duration)}
          value={Math.min(position, Math.max(1, duration))}
          tooltip={{ formatter: value => formatTime(Number(value || 0)) }}
          onChange={value => setPosition(Number(value))}
          onChangeComplete={value => {
            if (audioRef.current) audioRef.current.currentTime = Number(value)
            persist(true)
          }}
        />
        <span className="global-player-time">{formatTime(duration)}</span>
        <Select
          size="small"
          value={speed}
          aria-label="播放速度"
          options={[0.75, 1, 1.25, 1.5, 2].map(value => ({ value, label: `${value}x` }))}
          onChange={value => {
            setSpeed(value)
            if (audioRef.current) audioRef.current.playbackRate = value
            persist(true)
          }}
          popupMatchSelectWidth={72}
        />
        <Button
          type="text"
          icon={expanded ? <CaretDown /> : <CaretUp />}
          onClick={() => setExpanded(value => !value)}
          aria-label={expanded ? '收起稿件与来源' : '展开稿件与来源'}
        />
        <Button type="text" icon={<X />} onClick={() => { persist(true); onClose() }} aria-label="关闭播放器" />
      </div>
      {error && <div className="global-player-error"><WarningCircle /> {error}</div>}
      {expanded && (
        <div className="global-player-evidence">
          <div>
            <span>当前稿件</span>
            <p>{segment?.text || '当前播放位置没有可关联的稿件段落。'}</p>
          </div>
          <div>
            <span>事实来源</span>
            {facts.length === 0 ? (
              <p>这个段落没有绑定事实卡。</p>
            ) : facts.map((fact: FactCard) => (
              <button
                type="button"
                className="global-player-fact"
                key={fact.id}
                onClick={() => fact.source_url && void window.electronAPI.openExternal(fact.source_url)}
                disabled={!fact.source_url}
              >
                <strong>{fact.title}</strong>
                <small>{fact.source_title || fact.source_url}</small>
              </button>
            ))}
          </div>
        </div>
      )}
    </aside>
  )
}
