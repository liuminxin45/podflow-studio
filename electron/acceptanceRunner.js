const fs = require('fs')
const path = require('path')

function nowStamp() {
  return new Date().toISOString().replace(/[:.]/g, '-')
}

function markdownList(items) {
  if (!items.length) return '- 无'
  return items.map(item => `- ${item}`).join('\n')
}

function toPosixPath(value) {
  return String(value || '').replace(/\\/g, '/')
}

async function runCdpAcceptance({ app, mainWindow, projectRoot }) {
  const webContents = mainWindow.webContents
  const debuggerApi = webContents.debugger
  const startedAt = new Date()
  const stamp = nowStamp()
  const acceptanceDir = path.join(projectRoot, 'docs', 'acceptance')
  const screenshotDir = path.join(acceptanceDir, 'screenshots', stamp)
  const reportPath = path.join(acceptanceDir, 'CDP_ACCEPTANCE_REPORT.md')
  const steps = []
  const assertions = []
  const failures = []
  const screenshots = []
  const consoleErrors = []
  const networkFailures = []
  const exceptions = []

  fs.mkdirSync(screenshotDir, { recursive: true })

  function recordStep(name, status, detail = '') {
    steps.push({ name, status, detail })
    if (status === 'FAIL') failures.push(`${name}: ${detail}`)
  }

  function assert(name, ok, detail = '') {
    assertions.push({ name, ok, detail })
    if (!ok) failures.push(`${name}: ${detail}`)
  }

  function attachListeners() {
    webContents.on('console-message', (_event, level, message, line, sourceId) => {
      if (level >= 2) {
        consoleErrors.push(`${message} (${sourceId}:${line})`)
      }
    })
    webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
      networkFailures.push(`${errorCode} ${errorDescription}: ${validatedURL}`)
    })
    webContents.on('render-process-gone', (_event, details) => {
      exceptions.push(`renderer gone: ${details.reason}`)
    })
    debuggerApi.on('message', (_event, method, params) => {
      if (method === 'Runtime.exceptionThrown') {
        exceptions.push(params?.exceptionDetails?.text || 'Runtime.exceptionThrown')
      }
      if (method === 'Log.entryAdded') {
        const entry = params?.entry
        if (entry?.level === 'error') {
          consoleErrors.push(entry.text || 'Log.entryAdded error')
        }
      }
      if (method === 'Network.loadingFailed') {
        networkFailures.push(`${params?.errorText || 'loadingFailed'}: ${params?.requestId || ''}`)
      }
    })
  }

  async function send(method, params = {}) {
    return debuggerApi.sendCommand(method, params)
  }

  async function evaluate(expression) {
    const response = await send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    })
    if (response.exceptionDetails) {
      throw new Error(response.exceptionDetails.text || 'Runtime.evaluate failed')
    }
    return response.result?.value
  }

  async function screenshot(name) {
    const filePath = path.join(screenshotDir, `${name}.png`)
    const result = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })
    fs.writeFileSync(filePath, Buffer.from(result.data, 'base64'))
    screenshots.push(filePath)
    return filePath
  }

  async function fileInfo(filePath) {
    if (!filePath || !fs.existsSync(filePath)) return { exists: false, size: 0 }
    const stat = fs.statSync(filePath)
    return { exists: true, size: stat.size }
  }

  try {
    attachListeners()
    debuggerApi.attach('1.3')
    await send('Page.enable')
    await send('Runtime.enable')
    await send('Log.enable')
    await send('Network.enable')

    await screenshot('01-home')
    const domState = await evaluate(`(() => ({
      title: document.title,
      body: document.body.innerText,
      hasElectronAPI: !!window.electronAPI,
      hasMediaDevices: !!navigator.mediaDevices?.getUserMedia,
      hasMediaRecorder: typeof MediaRecorder !== 'undefined'
    }))()`)
    assert('首页 DOM 可读取', Boolean(domState?.body?.trim()), `bodyLength=${domState?.body?.length || 0}`)
    assert('未出现剪枝后的精简主路径', !/LeanSettings|精简组件|剪枝/.test(domState?.body || ''), 'DOM 中不应包含剪枝标记')
    assert('Electron API 已注入', Boolean(domState?.hasElectronAPI), 'window.electronAPI 必须存在')
    assert('媒体 API 可用', Boolean(domState?.hasMediaDevices && domState?.hasMediaRecorder), 'getUserMedia 与 MediaRecorder 必须存在')
    recordStep('读取首页 DOM', 'PASS', `title=${domState?.title || ''}`)

    const workflowResult = await evaluate(`(async () => {
      const result = await window.electronAPI.createWorkflow({ autoRun: false, acceptance: true })
      window.__acceptanceWorkflowId = result.workflowId
      return result
    })()`)
    assert('workflow:create 生成 episode_id', Boolean(workflowResult?.workflowId && workflowResult?.episodeId), JSON.stringify(workflowResult))
    recordStep('创建 episode', 'PASS', `workflowId=${workflowResult?.workflowId}, episodeId=${workflowResult?.episodeId}`)

    const discoverWorkflow = await evaluate(`(async () => {
      const id = window.__acceptanceWorkflowId
      const sources = await window.electronAPI.getFetchSources()
      const preferredSourceIds = ['newsnow', 'ai_news_daily']
      const availableIds = (sources || []).map(source => source.id).filter(Boolean)
      const selectedSource = preferredSourceIds.find(sourceId => availableIds.includes(sourceId)) || availableIds[0]
      if (!selectedSource) throw new Error('No fetch source available for CDP acceptance')
      await window.electronAPI.saveNodeConfig('fetch', {
        enabled_sources: [selectedSource],
        newsnow_source_ids: selectedSource === 'newsnow' ? ['weibo', 'zhihu', 'baidu'] : [],
        result_limit: 3,
        quality: 1,
        freshness: 1,
        min_relevance: 1,
        allow_duplicates: true,
        event_detection: false,
        group_by_topic: false,
        max_articles: 10,
        include_summary: true
      })
      await window.electronAPI.runWorkflowNodes(id, ['fetch'])
      const workflow = await window.electronAPI.getWorkflow(id)
      const items = workflow?.state?.fetch_contents || []
      await window.electronAPI.updateWorkflowState(id, {
        selected_materials: items,
        cleaned_contents: items,
        discover_meta: {
          generated_at: new Date().toISOString(),
          item_count: items.length
        },
        discover_ui: {
          selectedCount: items.length,
          proceededAt: new Date().toISOString()
        }
      })
      return { workflow: await window.electronAPI.getWorkflow(id), selectedSource }
    })()`)
    const firstDiscoveredItem = discoverWorkflow?.workflow?.state?.fetch_contents?.[0]
    assert('内置采集写入当前 workflow', Boolean(firstDiscoveredItem?.title || firstDiscoveredItem?.content), JSON.stringify(firstDiscoveredItem || {}))
    assert('发现素材采用后写入 selected_materials', Boolean(discoverWorkflow?.workflow?.state?.selected_materials?.[0]), JSON.stringify(discoverWorkflow?.workflow?.state?.selected_materials || []))
    recordStep('内置发现采集与采用', 'PASS', `source=${discoverWorkflow?.selectedSource || ''}, items=${discoverWorkflow?.workflow?.state?.fetch_contents?.length || 0}`)
    await screenshot('02-discover-fetch-state')

    const settingsProbe = await evaluate(`(async () => {
      const sources = await window.electronAPI.getFetchSources()
      const config = await window.electronAPI.loadNodeConfig('fetch')
      return { sources, config }
    })()`)
    assert('数据源配置读取到内置来源', settingsProbe?.sources?.length > 0, JSON.stringify(settingsProbe?.sources || []))
    assert('数据源配置保存当前可用来源', settingsProbe?.sources?.some(source => settingsProbe?.config?.enabled_sources?.includes(source.id)), JSON.stringify(settingsProbe?.config || {}))
    recordStep('数据源配置 live 验证', 'PASS', `sources=${settingsProbe?.sources?.map(source => source.id).join(',') || ''}`)
    await screenshot('02-discover-sources-live')

    const scriptedWorkflow = await evaluate(`(async () => {
      const id = window.__acceptanceWorkflowId
      await window.electronAPI.saveNodeConfig('facts', {
        max_facts: 20,
        selected_topic_count: 10,
      })
      await window.electronAPI.saveNodeConfig('script', {
        preset_id: 'morning_news_brief',
        content_type: 'news_brief',
        target_duration_minutes: 22,
        num_hosts: 1,
        recommended_news_item_count: 10,
        quick_news_recommended_count: 9,
        deep_dive_recommended_count: 1,
        episode_chars_min: 5200,
        episode_chars_max: 6200,
        language: 'zh-CN',
        require_approval: false,
        words_per_minute: 250
      })
      await window.electronAPI.runWorkflowNodes(id, ['research', 'topic_selection'])
      const selectedWorkflow = await window.electronAPI.getWorkflow(id)
      const acceptedMaterials = (selectedWorkflow.state.selected_materials || []).map(item => ({
        ...item,
        _status: 'ready',
      }))
      await window.electronAPI.updateWorkflowState(id, {
        selected_materials: acceptedMaterials,
      })
      await window.electronAPI.runWorkflowNodes(id, ['facts', 'script'])
      const workflow = await window.electronAPI.getWorkflow(id)
      const generated = workflow.state.script || {}
      const generatedSegments = Array.isArray(generated.segments) ? generated.segments : []
      const editedSegments = generatedSegments.map(segment => ({
        ...segment,
        text: String(segment.text || '') + '（CDP 已保存编辑稿。）'
      }))
      const edited = {
        ...generated,
        id: 'cdp_edited_script',
        title: generated.title || 'CDP 验收节目',
        description: generated.description || '用于验证 facts、写作、音频处理和本地发布闭环',
        segments: editedSegments,
        edited_from: generated.id || 'script.generated',
        edit_mode: 'cdp_acceptance'
      }
      await window.electronAPI.updateWorkflowState(id, {
        edited_script: edited
      })
      return await window.electronAPI.getWorkflow(id)
    })()`)
    const cdpFacts = scriptedWorkflow?.state?.facts || []
    const cdpScriptSegments = scriptedWorkflow?.state?.script?.segments || []
    const cdpEditedSegments = scriptedWorkflow?.state?.edited_script?.segments || []
    const cdpNewsSegment = cdpEditedSegments.find(segment => ['quick_news', 'deep_dive'].includes(segment.type))
    assert('facts 节点写入 FactCard', cdpFacts.length > 0, JSON.stringify({
      facts: cdpFacts,
      errors: scriptedWorkflow?.state?.errors || [],
    }))
    assert('script 使用结构化 segments', cdpScriptSegments.length > 0, JSON.stringify({
      script: scriptedWorkflow?.state?.script || {},
      errors: scriptedWorkflow?.state?.errors || [],
    }))
    assert('script 使用 22 分钟 9+1 默认配置',
      scriptedWorkflow?.state?.preset?.target_duration_minutes === 22
        && scriptedWorkflow?.state?.preset?.quick_news_recommended_count === 9
        && scriptedWorkflow?.state?.preset?.deep_dive_recommended_count === 1,
      JSON.stringify(scriptedWorkflow?.state?.preset || {}))
    assert('edited_script 保存并保留 fact 引用', Boolean(cdpNewsSegment?.source_fact_ids?.length), JSON.stringify(cdpNewsSegment || {}))
    assert('写作状态已保存 edited_script.segments', cdpEditedSegments.length > 0, JSON.stringify(scriptedWorkflow?.state?.edited_script || {}))
    recordStep('facts 与写作状态保存', 'PASS', `facts=${cdpFacts.length}, segments=${cdpEditedSegments.length}`)
    await screenshot('02-script-state')

    // Keep upstream generation failures visible in the assertions above, but provide
    // the minimum valid stage contract needed to navigate to the publish UI later.
    await evaluate(`(async () => {
      const id = window.__acceptanceWorkflowId
      const workflow = await window.electronAPI.getWorkflow(id)
      const material = workflow.state.selected_materials?.[0] || { title: 'CDP 验收素材' }
      await window.electronAPI.updateWorkflowState(id, {
        organize_ui: { candidates: [{ ...material, _status: 'ready' }] },
        selected_topic: { title: 'CDP 验收节目', description: '发布页面验收' },
        facts: workflow.state.facts?.length ? workflow.state.facts : [{ id: 'cdp-fact-1', claim: 'CDP 发布验收事实' }],
        edited_script: workflow.state.edited_script?.segments?.length
          ? workflow.state.edited_script
          : { id: 'cdp-script', title: 'CDP 验收节目', segments: [{ id: 'cdp-stage-1', text: '这是 CDP 发布验收脚本。' }] }
      })
    })()`)

    const recordingResult = await evaluate(`(async () => {
      const id = window.__acceptanceWorkflowId
      const workflow = await window.electronAPI.getWorkflow(id)
      const episodeId = workflow.state.episode_id
      const segment = workflow.state.edited_script?.segments?.[0] || {
        id: 'cdp-stage-1',
        text: '这是第一段 CDP 自验收脚本。',
        speaker: 'Host A',
        source_fact_ids: []
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm'
      const recorder = new MediaRecorder(stream, { mimeType })
      const chunks = []
      recorder.ondataavailable = event => { if (event.data && event.data.size > 0) chunks.push(event.data) }
      await new Promise(resolve => {
        recorder.onstop = resolve
        recorder.start(100)
        setTimeout(() => recorder.stop(), 11000)
      })
      stream.getTracks().forEach(track => track.stop())
      const blob = new Blob(chunks, { type: recorder.mimeType || mimeType })
      const buffer = await blob.arrayBuffer()
      const saved = await window.electronAPI.saveRecording({
        episodeId,
        segmentId: segment.id,
        mimeType: blob.type || mimeType,
        durationSeconds: 11,
        data: buffer
      })
      await window.electronAPI.updateWorkflowState(id, {
        voice_segments: [{
          segment_id: segment.id,
          path: saved.path,
          text: segment.text || '这是第一段 CDP 自验收脚本。',
          speaker: segment.speaker || 'Host A',
          source_fact_ids: segment.source_fact_ids || [],
          engine: 'recording',
          voice: 'recording',
          mime_type: saved.mimeType,
          duration_seconds: saved.durationSeconds,
          size: saved.size
        }]
      })
      return { saved, workflow: await window.electronAPI.getWorkflow(id), blobSize: blob.size, blobType: blob.type }
    })()`)
    const recordingPath = recordingResult?.saved?.path
    const recordingFile = await fileInfo(recordingPath)
    assert('真人录制 WebM 已保存', recordingFile.exists && recordingFile.size > 0, `${recordingPath} size=${recordingFile.size}`)
    assert('录音段写入 workflow state', Boolean(recordingResult?.workflow?.state?.voice_segments?.[0]?.path), JSON.stringify(recordingResult?.workflow?.state?.voice_segments || []))
    recordStep('真人录制与保存', 'PASS', `path=${recordingPath}, blobSize=${recordingResult?.blobSize}`)
    await screenshot('03-recording-state')

    const audioWorkflow = await evaluate(`(async () => {
      const id = window.__acceptanceWorkflowId
      await window.electronAPI.runWorkflowNodes(id, ['audio_postprocess', 'assets'])
      return await window.electronAPI.getWorkflow(id)
    })()`)
    const finalAudioPath = audioWorkflow?.state?.audio_outputs?.final_audio_path
    const finalAudioFile = await fileInfo(finalAudioPath)
    assert('final_audio_path 存在且文件大于 0', finalAudioFile.exists && finalAudioFile.size > 0, `${finalAudioPath} size=${finalAudioFile.size}`)
    recordStep('运行音频生成与素材处理', 'PASS', `final_audio_path=${finalAudioPath}`)

    const publishWorkflow = await evaluate(`(async () => {
      const id = window.__acceptanceWorkflowId
      await window.electronAPI.saveNodeConfig('publish', {
        storage_type: 'local',
        local_base_dir: 'dist/episodes',
        rss_output_dir: 'out/rss',
        public_base_url: 'https://podcast.example.com/podflow-cdp',
        podcast_title: '通勤早咖啡',
        podcast_description: 'CDP 验收 RSS feed',
        podcast_author: 'PodFlow Studio',
        podcast_language: 'zh-CN'
      })
      await window.electronAPI.runWorkflowNodes(id, ['publish'])
      return await window.electronAPI.getWorkflow(id)
    })()`)
    const rssPath = publishWorkflow?.state?.publish_outputs?.feed_xml
    const publishDir = publishWorkflow?.state?.publish_outputs?.episode_dir
    const rssFile = await fileInfo(rssPath)
    const publishDirExists = Boolean(publishDir && fs.existsSync(publishDir))
    assert('rss_path 存在且文件大于 0', rssFile.exists && rssFile.size > 0, `${rssPath} size=${rssFile.size}`)
    assert('publish_outputs.episode_dir 存在', publishDirExists, String(publishDir || ''))
    assert('publish_outputs 标记本地/RSS 成功', publishWorkflow?.state?.publish_outputs?.platforms?.local === 'success' && publishWorkflow?.state?.publish_outputs?.platforms?.rss === 'success', JSON.stringify(publishWorkflow?.state?.publish_outputs || {}))
    assert('publish_outputs 不包含外部平台结果', Object.keys(publishWorkflow?.state?.publish_outputs?.platforms || {}).every(key => ['local', 'rss'].includes(key)), JSON.stringify(publishWorkflow?.state?.publish_outputs || {}))
    const rssValidation = publishWorkflow?.state?.publish_outputs?.rss_validation || publishWorkflow?.state?.run_report?.rss_validation || {}
    assert('RSS validation 通过', rssValidation?.ok === true, JSON.stringify(rssValidation || {}))
    assert('RSS 使用公网 enclosure', rssValidation?.local_preview_only === false && String(rssValidation?.enclosure_url || '').startsWith('https://podcast.example.com/podflow-cdp/'), JSON.stringify(rssValidation || {}))
    recordStep('运行本地发布与公网 RSS 导出', 'PASS', `rss=${rssPath}, dir=${publishDir}`)

    const publishUi = await evaluate(`(async () => {
      const sourceWorkflow = await window.electronAPI.getWorkflow(window.__acceptanceWorkflowId)
      const visual = await window.electronAPI.createWorkflow({ autoRun: false, acceptance: true })
      const material = { title: 'CDP 发布页面素材', _status: 'ready' }
      await window.electronAPI.updateWorkflowState(visual.workflowId, {
        fetch_contents: [material],
        selected_materials: [material],
        organize_ui: { candidates: [material] },
        selected_topic: { title: 'CDP 发布页面验收', description: '单一发布流程' },
        facts: [{ id: 'cdp-publish-fact', claim: '发布页面验收事实' }],
        edited_script: { id: 'cdp-publish-script', segments: [{ id: 'cdp-publish-segment', text: '发布页面验收脚本。' }] },
        audio_outputs: sourceWorkflow.state.audio_outputs,
        publish_outputs: sourceWorkflow.state.publish_outputs
      })
      await new Promise(resolve => setTimeout(resolve, 500))
      const openButton = document.querySelector('[aria-label="打开节目：CDP 发布页面验收"]')
        || [...document.querySelectorAll('[aria-label^="打开节目："]')][0]
      openButton?.click()
      await new Promise(resolve => setTimeout(resolve, 400))
      const publishStage = [...document.querySelectorAll('button')].find(button => button.title?.startsWith('发布：'))
      publishStage?.click()
      await new Promise(resolve => setTimeout(resolve, 400))
      return { body: document.body.innerText, publishStageDisabled: publishStage?.disabled ?? null }
    })()`)
    assert('发布页只展示节目归档与 RSS', /节目归档/.test(publishUi?.body || '') && /RSS 订阅源/.test(publishUi?.body || ''), String(publishUi?.body || ''))
    assert('发布页不含外部平台或智能发布入口', !/Apple Podcasts|Spotify|小宇宙|喜马拉雅|微信听书|智能发布|快速发布|AI 建议|风险审查/.test(publishUi?.body || ''), String(publishUi?.body || ''))
    await screenshot('04-publish-state')

    const publishReadyUi = await evaluate(`(async () => {
      const regenerateButton = [...document.querySelectorAll('button')].find(button => button.textContent?.trim() === '再次生成')
      regenerateButton?.click()
      await new Promise(resolve => setTimeout(resolve, 300))
      return document.body.innerText
    })()`)
    assert('发布准备页展示本地交付清单', /把这一期整理成可带走的文件/.test(publishReadyUi || '') && /生成发布文件/.test(publishReadyUi || ''), String(publishReadyUi || ''))
    await screenshot('04-publish-ready-state')

    const settingsUi = await evaluate(`(async () => {
      const settingsButton = [...document.querySelectorAll('button')].find(button => button.textContent?.trim() === '设置')
      settingsButton?.click()
      await new Promise(resolve => setTimeout(resolve, 400))
      return document.body.innerText
    })()`)
    assert('设置页已删除系统发布、数据表现与成长入口', !/系统与发布|数据与表现|创作者成长/.test(settingsUi || ''), String(settingsUi || ''))
    await screenshot('05-settings-state')

    assert('无前端 console error', consoleErrors.length === 0, markdownList(consoleErrors))
    assert('无 Runtime exception', exceptions.length === 0, markdownList(exceptions))
    assert('无 Network failure', networkFailures.length === 0, markdownList(networkFailures))
  } catch (error) {
    recordStep('CDP 验收执行', 'FAIL', error?.stack || error?.message || String(error))
  } finally {
    try {
      if (debuggerApi.isAttached()) debuggerApi.detach()
    } catch (error) {
      failures.push(`CDP detach failed: ${error?.message || String(error)}`)
    }

    const status = failures.length ? 'FAIL' : 'PASS'
    const endedAt = new Date()
    const report = [
      '# CDP Acceptance Report',
      '',
      `- Status: ${status}`,
      `- Started: ${startedAt.toISOString()}`,
      `- Ended: ${endedAt.toISOString()}`,
      `- Duration: ${Math.round((endedAt.getTime() - startedAt.getTime()) / 1000)}s`,
      `- CDP transport: Electron webContents.debugger`,
      '',
      '## Steps',
      '',
      steps.map(step => `- ${step.status} ${step.name}${step.detail ? `: ${step.detail}` : ''}`).join('\n') || '- 无',
      '',
      '## Assertions',
      '',
      assertions.map(item => `- ${item.ok ? 'PASS' : 'FAIL'} ${item.name}${item.detail ? `: ${item.detail}` : ''}`).join('\n') || '- 无',
      '',
      '## Screenshots',
      '',
      screenshots.map(filePath => `- ${toPosixPath(filePath)}`).join('\n') || '- 无',
      '',
      '## Console Errors',
      '',
      markdownList(consoleErrors),
      '',
      '## Runtime Exceptions',
      '',
      markdownList(exceptions),
      '',
      '## Network Failures',
      '',
      markdownList(networkFailures),
      '',
      '## Failure Reasons',
      '',
      markdownList(failures),
      '',
    ].join('\n')

    fs.writeFileSync(reportPath, report, 'utf-8')
    console.log(`[CDP Acceptance] ${status}: ${reportPath}`)

    if (process.env.CDP_ACCEPTANCE_QUIT !== '0') {
      const exitCode = status === 'PASS' ? 0 : 1
      console.log(`[CDP Acceptance] exiting with code ${exitCode}`)
      app.exit(exitCode)
      process.kill(process.pid, exitCode === 0 ? 'SIGTERM' : 'SIGINT')
    }
  }
}

module.exports = { runCdpAcceptance }
