import { describe, expect, it } from 'vitest'

const { applySeriesDefaults, getNodeResultError, redactRuntimeConfigSecrets, resolveDownstreamStale } = require('../workflowRunner')

describe('workflow runner result guards', () => {
  it('applies series defaults to script, speech and publish nodes', () => {
    const state = {
      selected_topic: { title: '今日科技' },
      series: {
        id: 'daily',
        title: '每日科技',
        description: '科技早报',
        defaults: {
          language: 'zh-CN',
          targetDurationMinutes: 18,
          author: '编辑部',
          hostName: '小流',
          defaultVoice: 'voice-a',
          enabledPlatforms: ['local', 'rss'],
          templateVariant: 'quick_9_plus_deep_1',
        },
      },
    }

    expect(applySeriesDefaults('script', { temperature: 0.2 }, state)).toMatchObject({
      target_duration_minutes: 18,
      language: 'zh-CN',
    })
    expect(state.selected_topic).toMatchObject({ show_name: '每日科技', host_name: '小流' })
    expect(applySeriesDefaults('tts', {}, state).default_voice).toBe('voice-a')
    expect(applySeriesDefaults('publish', {}, state)).toMatchObject({
      podcast_title: '每日科技',
      podcast_author: '编辑部',
      enabled_platforms: ['local', 'rss'],
    })
  })

  it('fails a script result that returned an old draft together with a node error', () => {
    const error = getNodeResultError('script', {
      script: { id: 'old-script' },
      edited_script: { id: 'old-script' },
      generation_request: { mode: 'regenerate', status: 'failed' },
      errors: [{ node: 'script', message: 'model unavailable' }],
    })

    expect(error).toBeInstanceOf(Error)
    expect(error.message).toBe('model unavailable')
  })

  it('ignores historical script errors after a later generation succeeds', () => {
    const error = getNodeResultError('script', {
      script: { id: 'new-script' },
      generation_request: {},
      errors: [{ node: 'script', message: 'old model outage' }],
    }, 1)

    expect(error).toBeNull()
  })

  it('fails any node that appends a new node-scoped error', () => {
    const error = getNodeResultError('publish', {
      publish_outputs: {},
      errors: [
        { node: 'publish', message: 'review contains blocking errors' },
      ],
    })

    expect(error).toBeInstanceOf(Error)
    expect(error.message).toBe('review contains blocking errors')
  })

  it('ignores historical errors for non-script nodes after a clean rerun', () => {
    const error = getNodeResultError('publish', {
      publish_outputs: { feed_xml: 'feed.xml' },
      errors: [{ node: 'publish', message: 'old publish failure' }],
    }, 1)

    expect(error).toBeNull()
  })

  it('clears stale downstream metadata only after a new final audio is assembled', () => {
    const state = {
      downstream_stale: { is_stale: true, artifacts: { audio_outputs: { final_audio_path: 'old.mp3' } } },
      audio_outputs: {},
    }
    resolveDownstreamStale(state, ['tts'])
    expect(state.downstream_stale.is_stale).toBe(true)

    state.audio_outputs = { final_audio_path: 'new.mp3' }
    resolveDownstreamStale(state, ['audio_postprocess'])
    expect(state.downstream_stale).toEqual({})
  })

  it('removes credentials from runtime config before workflow state is persisted or broadcast', () => {
    const state = {
      runtime_config: {
        script: {
          api_key: 'direct-secret',
          api_key_env_var: 'OPENAI_API_KEY',
          llm_model: 'test-model',
        },
        tts: {
          doubao_access_token: 'audio-secret',
          model: 'tts-model',
        },
      },
    }

    redactRuntimeConfigSecrets(state)

    expect(state.runtime_config.script).toEqual({
      api_key: '',
      api_key_env_var: 'OPENAI_API_KEY',
      llm_model: 'test-model',
    })
    expect(state.runtime_config.tts).toEqual({
      doubao_access_token: '',
      model: 'tts-model',
    })
  })
})
