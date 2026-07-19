import { useState } from 'react'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import SettingsAPIConfig from '../SettingsAPIConfig'
import { DEFAULT_SETTINGS, type AppSettings } from '../../types/settings'

function SettingsAPIConfigHarness({
  defaultAITarget = 'agent:codex',
  globalPatch,
}: {
  defaultAITarget?: string
  globalPatch?: Partial<AppSettings['apiConfig']['global']>
}) {
  const [settings, setSettings] = useState<AppSettings>(() => ({
    ...DEFAULT_SETTINGS,
    apiConfig: {
      ...DEFAULT_SETTINGS.apiConfig,
      global: {
        ...DEFAULT_SETTINGS.apiConfig.global,
        defaultAITarget,
        ...globalPatch,
        localAgents: DEFAULT_SETTINGS.apiConfig.global.localAgents.map(agent => ({ ...agent })),
        aiModelProviders: DEFAULT_SETTINGS.apiConfig.global.aiModelProviders.map(provider => ({
          ...provider,
          modelOptions: [...provider.modelOptions],
          ...(defaultAITarget === `model:${provider.id}` && provider.targetKind === 'api_model' ? {
            apiKeySet: true,
            apiKeyMasked: 'sk-t····-key',
            model: provider.id === 'api-openai-compatible' ? 'deepseek-v4-flash' : provider.model,
          } : {}),
        })),
      },
    },
  }))

  function updateSettings<K extends keyof AppSettings>(
    module: K,
    updater: (previous: AppSettings[K]) => AppSettings[K],
  ) {
    setSettings(previous => ({ ...previous, [module]: updater(previous[module]) }))
  }

  return <SettingsAPIConfig settings={settings} updateSettings={updateSettings} />
}

describe('SettingsAPIConfig editing focus', () => {
  it('prevents unavailable local agents from becoming the default target', () => {
    render(<SettingsAPIConfigHarness defaultAITarget="" />)

    fireEvent.click(screen.getByRole('button', { name: /^本地代理/ }))
    const codex = screen.getByRole('button', { name: /^Codex/ }) as HTMLButtonElement
    expect(codex.disabled).toBe(true)
    fireEvent.click(codex)
    expect(screen.queryByText(/本地代理：Codex/)).toBeNull()
  })

  it('configures all four voice providers and keeps Doubao profiles independent', () => {
    render(<SettingsAPIConfigHarness />)

    expect(screen.getAllByText('语音生成').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: /^Edge TTS/ }).getAttribute('aria-pressed')).toBe('true')

    fireEvent.click(screen.getByRole('button', { name: /^豆包语音生成/ }))
    expect(screen.getByText('Access Key ID')).toBeTruthy()
    expect(screen.getByText('Secret Access Key')).toBeTruthy()
    expect(screen.getByRole('link', { name: '打开密钥管理' }).getAttribute('href')).toBe('https://console.volcengine.com/iam/keymanage/')
    fireEvent.change(screen.getByLabelText('豆包语音 App ID'), { target: { value: 'tts-app-id' } })
    fireEvent.change(screen.getByRole('combobox', { name: '豆包语音 Voice Type' }), { target: { value: 'zh_female_custom_bigtts' } })
    expect(screen.getByDisplayValue('volc.service_type.10029')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /^豆包语音克隆/ }))
    fireEvent.change(screen.getByLabelText('豆包克隆 App ID'), { target: { value: 'clone-app-id' } })
    fireEvent.change(screen.getByRole('combobox', { name: '豆包克隆 Speaker ID' }), { target: { value: 'S_clone_01' } })
    expect(screen.getByDisplayValue('volc.megatts.default')).toBeTruthy()
    expect(screen.getByText(/这里只选择已有 Speaker ID/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /^豆包语音生成/ }))
    expect(screen.getByDisplayValue('tts-app-id')).toBeTruthy()
    expect(screen.getByDisplayValue('zh_female_custom_bigtts')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /^豆包语音克隆/ }))
    expect(screen.getByDisplayValue('clone-app-id')).toBeTruthy()
    expect(screen.getByDisplayValue('S_clone_01')).toBeTruthy()
  })

  it('fetches preset Doubao voices and saves the selected voice type in page state', async () => {
    const listDoubaoVoices = vi.fn().mockResolvedValue([{
      id: 'zh_female_morning_bigtts',
      name: '晨曦女声',
      description: '清晰自然',
      status: 'available',
      resourceId: 'seed-tts-1.0',
      previewUrl: '',
    }])
    window.electronAPI = { ...(window.electronAPI || {}), listDoubaoVoices } as any
    render(<SettingsAPIConfigHarness globalPatch={{
      audioProvider: 'doubao_tts',
      audioDoubaoAppId: 'tts-app',
      audioDoubaoAccessToken: 'tts-token',
      audioDoubaoOpenAccessKey: 'AKLT-test',
      audioDoubaoOpenSecretKey: 'open-secret',
    }} />)

    expect(screen.getByText('tts-····oken').parentElement?.style.height).toBe('32px')

    fireEvent.click(screen.getByRole('button', { name: '刷新音色' }))

    await waitFor(() => expect(listDoubaoVoices).toHaveBeenCalledWith({
      kind: 'preset',
      appId: undefined,
      accessKey: 'AKLT-test',
      secretKey: 'open-secret',
    }))
    fireEvent.change(screen.getByRole('combobox', { name: '豆包语音 Voice Type' }), {
      target: { value: 'zh_female_morning_bigtts' },
    })
    expect(screen.getByDisplayValue('zh_female_morning_bigtts')).toBeTruthy()
  })

  it('opens only the actual default API provider on first render', () => {
    render(<SettingsAPIConfigHarness defaultAITarget="model:api-openai-compatible" />)

    const openAI = screen.getByRole('button', { name: /^OpenAI 待配置/ })
    const compatible = screen.getByRole('button', { name: /^OpenAI 兼容 deepseek-v4-flash/ })

    expect(screen.queryByRole('combobox', { name: '默认 AI 目标' })).toBeNull()
    expect(screen.getByText(/API 模型：OpenAI 兼容/)).toBeTruthy()
    expect(screen.getByText('API 模型供应商')).toBeTruthy()
    expect(screen.getByDisplayValue('deepseek-v4-flash')).toBeTruthy()
    expect(openAI.style.border).toContain('var(--border-color)')
    expect(compatible.style.border).toContain('var(--text-primary)')
  })

  it('places provider actions beside the fields they operate on', () => {
    render(<SettingsAPIConfigHarness defaultAITarget="model:api-openai-compatible" />)

    const modelRow = screen.getByTestId('provider-model-row')
    const keyRow = screen.getByTestId('provider-key-row')

    expect(within(modelRow).getByRole('button', { name: '获取模型' })).toBeTruthy()
    expect(within(modelRow).queryByRole('button', { name: '测试连接' })).toBeNull()
    expect(within(keyRow).getByRole('button', { name: '测试连接' })).toBeTruthy()
    expect(within(keyRow).queryByRole('button', { name: '获取模型' })).toBeNull()
  })

  it('allows clearing a saved provider key and limits no-key mode to compatible providers', async () => {
    render(<SettingsAPIConfigHarness defaultAITarget="model:api-openai-compatible" />)

    const keyRow = screen.getByTestId('provider-key-row')
    fireEvent.click(within(keyRow).getByRole('button', { name: '清除' }))
    await waitFor(() => expect(within(keyRow).getByText('点击配置接入密钥')).toBeTruthy())
    expect(screen.getByRole('button', { name: /^无密钥/ })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /^OpenAI 待配置/ }))
    expect(screen.queryByRole('button', { name: /^无密钥/ })).toBeNull()
  })

  it('stays on the selected API provider while editing fields and saving a key', async () => {
    render(<SettingsAPIConfigHarness />)

    fireEvent.click(screen.getByRole('button', { name: /^API 模型/ }))
    fireEvent.click(screen.getByRole('button', { name: /^OpenRouter/ }))

    const apiBaseInput = screen.getByDisplayValue('https://openrouter.ai/api/v1')
    fireEvent.change(apiBaseInput, { target: { value: 'https://openrouter.ai/api/' } })

    expect(screen.getByText('API 模型供应商')).toBeTruthy()
    expect(screen.getByDisplayValue('https://openrouter.ai/api/')).toBeTruthy()

    fireEvent.click(screen.getAllByText('点击配置接入密钥')[0])
    fireEvent.change(screen.getByPlaceholderText('粘贴你的接入密钥'), {
      target: { value: 'sk-test-api-key' },
    })
    fireEvent.click(screen.getByRole('button', { name: /^保\s*存$/ }))

    expect(screen.getByText('API 模型供应商')).toBeTruthy()
    await waitFor(() => expect(screen.getByText('sk-t····-key')).toBeTruthy())
    expect(screen.getByDisplayValue('https://openrouter.ai/api/')).toBeTruthy()
  })

  it('uses the configured API provider when the API target kind is selected', async () => {
    render(<SettingsAPIConfigHarness />)

    fireEvent.click(screen.getByRole('button', { name: /^API 模型/ }))
    fireEvent.click(screen.getByRole('button', { name: /^OpenRouter/ }))
    fireEvent.click(screen.getAllByText('点击配置接入密钥')[0])
    fireEvent.change(screen.getByPlaceholderText('粘贴你的接入密钥'), {
      target: { value: 'sk-openrouter-test' },
    })
    fireEvent.click(screen.getByRole('button', { name: /^保\s*存$/ }))
    await waitFor(() => expect(screen.getByText('sk-o····test')).toBeTruthy())

    expect(screen.queryByText(/本地代理：Codex/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /^本地代理/ }))
    fireEvent.click(screen.getByRole('button', { name: /^API 模型/ }))
    expect(screen.queryByText(/本地代理：Codex/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /^OpenRouter/ }))

    expect(screen.getByText(/API 模型：OpenRouter/)).toBeTruthy()
  })

  it('keeps the current API target and editor open when required fields are cleared', () => {
    render(<SettingsAPIConfigHarness defaultAITarget="model:api-openai-compatible" />)

    const modelInput = screen.getByTestId('provider-model-row').querySelector('input') as HTMLInputElement
    const apiBaseInput = screen.getByDisplayValue('https://api.openai.com/v1') as HTMLInputElement
    expect(modelInput.value).toBe('deepseek-v4-flash')
    modelInput.focus()
    modelInput.setSelectionRange(0, modelInput.value.length)
    fireEvent.select(modelInput)
    fireEvent.keyDown(modelInput, { key: 'Backspace', code: 'Backspace' })
    fireEvent.change(modelInput, { target: { value: '' } })

    expect(screen.getByText('API 模型供应商')).toBeTruthy()
    expect(screen.getByText(/API 模型：OpenAI 兼容/)).toBeTruthy()
    expect(document.body.contains(apiBaseInput)).toBe(true)
    expect(modelInput.value).toBe('')

    fireEvent.change(apiBaseInput, { target: { value: '' } })

    expect(screen.getByText('API 模型供应商')).toBeTruthy()
    expect(screen.getByText(/API 模型：OpenAI 兼容/)).toBeTruthy()
    expect(apiBaseInput.value).toBe('')
  })

  it('keeps nearby local-model and environment-variable editors open after updates', () => {
    render(<SettingsAPIConfigHarness />)

    fireEvent.click(screen.getByRole('button', { name: /^本地模型/ }))
    fireEvent.click(screen.getByRole('button', { name: /^LM Studio/ }))
    fireEvent.change(screen.getByDisplayValue('http://127.0.0.1:1234/v1'), {
      target: { value: 'http://127.0.0.1:1234/' },
    })

    expect(screen.getByText('本地模型服务')).toBeTruthy()
    expect(screen.getByDisplayValue('http://127.0.0.1:1234/')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /^API 模型/ }))
    fireEvent.click(screen.getByRole('button', { name: /^Anthropic/ }))
    fireEvent.change(screen.getByDisplayValue('ANTHROPIC_API_KEY'), {
      target: { value: 'CLAUDE_API_KEY' },
    })

    expect(screen.getByText('API 模型供应商')).toBeTruthy()
    expect(screen.getByDisplayValue('CLAUDE_API_KEY')).toBeTruthy()
  })

  it('keeps Tavily and 博查 edits in page state for the outer save action', async () => {
    render(<SettingsAPIConfigHarness />)

    fireEvent.click(screen.getAllByText('点击配置接入密钥').at(-1)!)
    fireEvent.change(screen.getByPlaceholderText('粘贴你的接入密钥'), {
      target: { value: 'tavily-test-key' },
    })
    fireEvent.click(screen.getByRole('button', { name: /^保\s*存$/ }))

    await waitFor(() => expect(screen.getByText('tavi····-key')).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: /^博查 API/ }))
    fireEvent.click(screen.getAllByText('点击配置接入密钥').at(-1)!)
    fireEvent.change(screen.getByPlaceholderText('粘贴你的接入密钥'), {
      target: { value: 'bocha-test-key' },
    })
    fireEvent.click(screen.getByRole('button', { name: /^保\s*存$/ }))

    await waitFor(() => expect(screen.getByText('boch····-key')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: /^Tavily API/ }))
    expect(screen.getByText('tavi····-key')).toBeTruthy()
  }, 20_000)

  it('does not overwrite a newer search edit when an older connection test finishes', async () => {
    const originalElectronAPI = window.electronAPI
    let resolveSearch!: (value: any) => void
    const tavilySearch = vi.fn(() => new Promise(resolve => { resolveSearch = resolve }))
    ;(window as any).electronAPI = { ...(originalElectronAPI || {}), tavilySearch }

    try {
      render(<SettingsAPIConfigHarness />)
      fireEvent.click(screen.getAllByText('点击配置接入密钥').at(-1)!)
      fireEvent.change(screen.getByPlaceholderText('粘贴你的接入密钥'), {
        target: { value: 'tavily-test-key' },
      })
      fireEvent.click(screen.getByRole('button', { name: /^保\s*存$/ }))
      await waitFor(() => expect(screen.getByText('tavi····-key')).toBeTruthy())

      fireEvent.click(screen.getByRole('button', { name: '测试搜索能力' }))
      await waitFor(() => expect(tavilySearch).toHaveBeenCalledTimes(1))
      fireEvent.change(screen.getByDisplayValue('https://api.tavily.com'), {
        target: { value: 'https://search-new.example.com' },
      })
      await act(async () => {
        resolveSearch({ results: [{ title: '来源', url: 'https://example.com' }] })
      })

      await waitFor(() => expect(screen.getByDisplayValue('https://search-new.example.com')).toBeTruthy())
    } finally {
      ;(window as any).electronAPI = originalElectronAPI
    }
  }, 20_000)
})
