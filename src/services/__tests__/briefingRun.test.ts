import { describe, expect, it } from 'vitest'
import type { Workflow } from '../../types/workflow'
import {
  BRIEFING_PHASES,
  buildBriefingFetchConfig,
  latestBriefingFailure,
  parseBriefingMaterials,
  phaseStatus,
} from '../briefingRun'

describe('briefing run helpers', () => {
  it('parses URLs and paragraph text into current source_inputs', () => {
    const items = parseBriefingMaterials([
      'https://example.com/news',
      '',
      '人工材料标题',
      '第二行正文',
    ].join('\n'))

    expect(items).toEqual([
      expect.objectContaining({ url: 'https://example.com/news', type: 'manual_url', content: '' }),
      expect.objectContaining({ title: '人工材料标题', content: '人工材料标题\n第二行正文', type: 'manual_note' }),
    ])
  })

  it('keeps saved source selection while applying the requested topic', () => {
    expect(buildBriefingFetchConfig({
      enabled_sources: ['newsnow'],
      newsnow_source_ids: ['ithome'],
      result_limit: 6,
    }, 'AI 编程')).toEqual(expect.objectContaining({
      topic: 'AI 编程',
      enabled_sources: ['newsnow'],
      newsnow_source_ids: ['ithome'],
      result_limit: 6,
    }))
  })

  it('derives honest progress and failure from node executions', () => {
    const workflow = {
      status: 'failed',
      currentNode: null,
      nodeExecutions: {
        fetch: { status: 'completed' },
        preprocess: { status: 'failed' },
      },
      state: {
        errors: [{ node: 'preprocess', message: '没有可用正文' }],
      },
    } as unknown as Workflow

    expect(phaseStatus(workflow, BRIEFING_PHASES[0])).toBe('failed')
    expect(latestBriefingFailure(workflow)).toEqual({ node: 'preprocess', message: '没有可用正文' })
  })
})
