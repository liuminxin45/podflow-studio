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
  it('locks every downstream stage until discover has valid output', () => {
    const statuses = deriveWorkflowStageStatusMap(createWorkflow({
      cleaned_contents: [{ title: 'old organized item' }],
      facts: [{ id: 'f1', title: 'Fact', summary: 'Summary', source_title: 'Source', source_url: 'https://example.com', published_at: '', claim: 'Claim', confidence: 'high' }],
      selected_topic: { title: 'Old topic' },
    }))

    expect(statuses.discover.status).toBe('pending')
    expect(statuses.organize.status).toBe('stale')
    expect(statuses.organize.completed).toBe(false)
    expect(statuses.organize.canEnter).toBe(false)
    expect(statuses.draft.status).toBe('stale')
  })

  it('unlocks only the next unfinished stage in strict serial order', () => {
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
    expect(statuses.draft.status).toBe('stale')
    expect(statuses.draft.canEnter).toBe(false)
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
      'locked',
    ])
  })
})
