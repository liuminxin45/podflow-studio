import type { AppSettings } from '../../types/settings'
import type { LLMConfig } from './llmConfigResolver'
import { isLocalAgentLLMConfig, llmConfigResolver } from './llmConfigResolver'
import { settingsRepository } from './repository'
import { resolveMorningNewsProfile } from '../writing/morningNewsProfile'

const DEFAULT_WRITING_TIMEOUT_SECONDS = 60
const MAX_WRITING_TIMEOUT_SECONDS = 600

function writingTimeoutSeconds(config: LLMConfig | null): number {
  if (!Number.isFinite(config?.timeout) || Number(config?.timeout) <= 0) {
    return DEFAULT_WRITING_TIMEOUT_SECONDS
  }
  return Math.min(MAX_WRITING_TIMEOUT_SECONDS, Math.max(1, Math.ceil(Number(config?.timeout) / 1000)))
}

function llmRuntimeFields(config: LLMConfig | null): Record<string, unknown> {
  const isLocalAgent = isLocalAgentLLMConfig(config)
  return {
    // `local-agent://...` is a renderer-only routing marker. Python keeps
    // local-agent transport in explicit fields and reserves api_base for HTTP.
    api_key: isLocalAgent ? '' : config?.apiKey || '',
    api_key_env_var: isLocalAgent ? '' : config?.apiKeyEnvVar || '',
    api_base: isLocalAgent ? '' : config?.apiBase || '',
    // Keep the persisted node config schema-valid even when no AI target is
    // selected. Missing credentials are still rejected by the strict
    // generation request before any draft can be overwritten.
    llm_model: config?.model || 'gpt-4o-mini',
    provider_kind: isLocalAgent ? 'local_agent' : config?.providerKind || 'openai_compatible',
    ai_target: config?.aiTarget || '',
    local_agent_id: config?.localAgentId || '',
    local_agent_command: config?.localAgentCommand || '',
    local_agent_args: config?.localAgentArgs || [],
    local_agent_output_mode: config?.localAgentOutputMode || 'stdout',
    // Renderer LLM timeouts use milliseconds; Python node configs use seconds.
    timeout: writingTimeoutSeconds(config),
  }
}

export function buildWritingNodeConfigs(
  settings: AppSettings,
  llmConfig: LLMConfig | null,
): Record<'facts' | 'script', Record<string, unknown>> {
  const profile = resolveMorningNewsProfile(settings)
  return {
    facts: {
      max_facts: 20,
      selected_topic_count: profile.recommendedNewsItemCount,
    },
    script: {
      ...llmRuntimeFields(llmConfig),
      preset_id: 'morning_news_brief',
      content_type: 'news_brief',
      editorial_voice: profile.editorialVoice,
      target_duration_minutes: profile.targetDurationMinutes,
      num_hosts: 1,
      recommended_news_item_count: profile.recommendedNewsItemCount,
      quick_news_recommended_count: profile.quickNewsRecommendedCount,
      deep_dive_recommended_count: profile.deepDiveRecommendedCount,
      quick_news_chars_min: profile.quickNewsChars.min,
      quick_news_chars_max: profile.quickNewsChars.max,
      deep_dive_chars_min: profile.deepDiveChars.min,
      deep_dive_chars_max: profile.deepDiveChars.max,
      episode_chars_min: profile.episodeChars.min,
      episode_chars_max: profile.episodeChars.max,
      tone: profile.tone,
      content_tendency: settings.creatorPreferences.contentTendency,
      content_guidance: profile.contentGuidance,
      language: 'zh-CN',
      require_approval: true,
      words_per_minute: profile.wordsPerMinute,
    },
  }
}

export async function persistCurrentWritingNodeConfigs(): Promise<void> {
  if (!window.electronAPI?.saveNodeConfig) return
  const configs = buildWritingNodeConfigs(
    settingsRepository.load(),
    llmConfigResolver.getLLMConfig('draft'),
  )
  const results = await Promise.all(
    (Object.entries(configs) as Array<[keyof typeof configs, Record<string, unknown>]>).map(
      ([nodeName, config]) => window.electronAPI.saveNodeConfig(nodeName, config),
    ),
  )
  const failed = results.find(result => !result?.success)
  if (failed) throw new Error(failed.error || '成稿模型配置同步失败')
}
