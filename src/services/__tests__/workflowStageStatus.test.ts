import { describe, expect, it } from 'vitest'
import { deriveWorkflowStageStatusMap, deriveWorkflowStageStatuses } from '../workflowStageStatus'
import type { PodcastState, Workflow } from '../../types/workflow'

function createState(patch: Partial<PodcastState> = {}): PodcastState {
  return {
    episode_id: 'ep_test',
    created_at: '2026-07-04T00:00:00.000Z',
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
    ...patch,
  }
}

function createWorkflow(statePatch: Partial<PodcastState> = {}): Workflow {
  return {
    id: 'workflow_test',
    state: createState(statePatch),
    status: 'draft',
    currentNode: null,
    nodeExecutions: {},
  }
}

describe('workflowStageStatus', () => {
  it('keeps persisted downstream work accessible without marking it stale', () => {
    const statuses = deriveWorkflowStageStatusMap(createWorkflow({
      cleaned_contents: [{ title: 'old organized item' }],
      facts: [{ id: 'f1', title: 'Fact', summary: 'Summary', source_title: 'Source', source_url: 'https://example.com', published_at: '', claim: 'Claim', confidence: 'high' }],
      selected_topic: { title: 'Old topic' },
    }))

    expect(statuses.discover.status).toBe('pending')
    expect(statuses.organize.status).toBe('pending')
    expect(statuses.organize.completed).toBe(false)
    expect(statuses.organize.canEnter).toBe(true)
    expect(statuses.draft.status).toBe('pending')
    expect(statuses.draft.canEnter).toBe(true)
  })

  it('keeps downstream work accessible while the next stage is unfinished', () => {
    const statuses = deriveWorkflowStageStatusMap(createWorkflow({
      fetch_contents: [{ title: 'raw' }],
      cleaned_contents: [],
      facts: [{ id: 'f1', title: 'Fact', summary: 'Summary', source_title: 'Source', source_url: 'https://example.com', published_at: '', claim: 'Claim', confidence: 'high' }],
      selected_topic: { title: 'Old topic' },
    }))

    expect(statuses.discover.status).toBe('completed')
    expect(statuses.discover.completed).toBe(true)
    expect(statuses.organize.status).toBe('pending')
    expect(statuses.organize.canEnter).toBe(true)
    expect(statuses.draft.status).toBe('pending')
    expect(statuses.draft.canEnter).toBe(true)
  })

  it('treats a persisted discovery selection as valid discovery output', () => {
    const statuses = deriveWorkflowStageStatusMap(createWorkflow({
      discover_ui: {
        selectedCount: 1,
        selectedItems: [{ title: 'persisted selection' }],
      },
    }))

    expect(statuses.discover.status).toBe('completed')
    expect(statuses.organize.canEnter).toBe(true)
  })

  it('does not unlock draft merely because organize contains unfinished candidates', () => {
    const unfinished = {
      _id: 0,
      _order: 0,
      _priority: 'important',
      _status: 'needs_context',
      title: '尚未整理完成的新闻',
    }
    const statuses = deriveWorkflowStageStatusMap(createWorkflow({
      fetch_contents: [unfinished],
      selected_materials: [unfinished],
      cleaned_contents: [unfinished],
      organize_ui: { candidates: [unfinished] },
    }))

    expect(statuses.organize.completed).toBe(false)
    expect(statuses.organize.contract.outputs.ready_organize_candidates_count).toBe(0)
    expect(statuses.draft.canEnter).toBe(false)
  })

  it('unlocks draft when at least one organize candidate is explicitly ready', () => {
    const ready = {
      _id: 0,
      _order: 0,
      _priority: 'important',
      _status: 'ready',
      title: '已整理完成的新闻',
    }
    const unfinished = {
      ...ready,
      _id: 1,
      _order: 1,
      _status: 'editing',
      title: '仍在整理的新闻',
    }
    const statuses = deriveWorkflowStageStatusMap(createWorkflow({
      fetch_contents: [ready, unfinished],
      selected_materials: [ready, unfinished],
      organize_ui: { candidates: [ready, unfinished] },
    }))

    expect(statuses.organize.completed).toBe(true)
    expect(statuses.organize.contract.outputs.ready_organize_candidates_count).toBe(1)
    expect(statuses.draft.canEnter).toBe(true)
  })

  it('marks the whole completed chain when all prior outputs are valid', () => {
    const statuses = deriveWorkflowStageStatuses(createWorkflow({
      fetch_contents: [{ title: 'raw' }],
      selected_materials: [{
        title: 'raw',
        _id: 0,
        _order: 0,
        _priority: 'important',
        _status: 'ready',
      } as any],
      cleaned_contents: [{ title: 'clean' }],
      facts: [{ id: 'f1', title: 'Fact', summary: 'Summary', source_title: 'Source', source_url: 'https://example.com', published_at: '', claim: 'Claim', confidence: 'high' }],
      selected_topic: { title: 'Topic' },
      edited_script: { segments: [{ id: 's1', type: 'quick_news', title: 'Segment', text: 'Text', source_fact_ids: ['f1'], estimated_seconds: 10 }] },
    }))

    expect(statuses.map(status => status.status)).toEqual([
      'completed',
      'completed',
      'completed',
      'pending',
      'pending',
    ])
  })

  it('marks a generated script complete without per-segment completion flags', () => {
    const statuses = deriveWorkflowStageStatusMap(createWorkflow({
      fetch_contents: [{ title: 'raw' }],
      selected_materials: [{ title: 'ready', _status: 'ready' } as any],
      script: {
        segments: [{
          id: 's1',
          type: 'quick_news',
          title: 'Segment',
          text: 'Generated text',
          source_fact_ids: [],
          estimated_seconds: 10,
        }],
      },
    }))

    expect(statuses.draft.status).toBe('completed')
    expect(statuses.produce.canEnter).toBe(true)
  })

  it('does not complete draft for blank generated segments', () => {
    const statuses = deriveWorkflowStageStatusMap(createWorkflow({
      script: {
        segments: [{
          id: 's1',
          type: 'quick_news',
          title: 'Segment',
          text: '   ',
          source_fact_ids: [],
          estimated_seconds: 0,
        }],
      },
    }))

    expect(statuses.draft.completed).toBe(false)
  })

  it('prefers generated production artifacts over an old failed execution', () => {
    const workflow = createWorkflow({
      voice_segments: [{ segment_id: 's1', path: 'out/voice.mp3' } as any],
      audio_outputs: {
        final_audio_path: 'out/final.mp3',
        status: 'ok',
        format: 'mp3',
        file_size: 1024,
        duration_seconds: 30,
        segments_count: 1,
      },
    })
    workflow.nodeExecutions = {
      tts: { status: 'failed', startedAt: '', completedAt: '', error: 'old failure' },
    }

    const statuses = deriveWorkflowStageStatusMap(workflow)

    expect(statuses.produce.status).toBe('completed')
    expect(statuses.publish.canEnter).toBe(true)
  })

  it('does not unlock publish for an unverified audio path or loose voice segments', () => {
    const statuses = deriveWorkflowStageStatusMap(createWorkflow({
      voice_segments: [{ segment_id: 's1', path: 'out/voice.mp3' } as any],
      audio_outputs: { final_audio_path: 'out/final.mp3' },
    }))

    expect(statuses.produce.completed).toBe(false)
    expect(statuses.publish.canEnter).toBe(false)
  })
})
