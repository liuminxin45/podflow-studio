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
      const enabled = sources.map(source => source.id).filter(id => id !== 'example_custom')
      await window.electronAPI.saveNodeConfig('fetch', {
        enabled_sources: enabled,
        max_articles: 10,
        breadth: 2,
        quality: 1,
        freshness: 1,
        min_relevance: 1,
        language_mix: 'mixed',
        include_summary: true
      })
      await window.electronAPI.runWorkflowNodes(id, ['fetch'])
      const workflow = await window.electronAPI.getWorkflow(id)
      const items = workflow?.state?.fetch_contents || []
      await window.electronAPI.updateWorkflowState(id, {
        selected_materials: items.slice(0, 1),
        raw_contents: items.slice(0, 1),
        discover_meta: {
          generated_at: new Date().toISOString(),
          item_count: items.length
        },
        discover_ui: {
          selectedCount: Math.min(items.length, 1),
          proceededAt: new Date().toISOString()
        }
      })
      return await window.electronAPI.getWorkflow(id)
    })()`)
    const firstDiscoveredItem = discoverWorkflow?.state?.fetch_contents?.[0]
    assert('内置采集写入当前 workflow', Boolean(firstDiscoveredItem?.title || firstDiscoveredItem?.content), JSON.stringify(firstDiscoveredItem || {}))
    assert('发现素材采用后写入 selected_materials', Boolean(discoverWorkflow?.state?.selected_materials?.[0]), JSON.stringify(discoverWorkflow?.state?.selected_materials || []))
    recordStep('内置发现采集与采用', 'PASS', `items=${discoverWorkflow?.state?.fetch_contents?.length || 0}`)
    await screenshot('02-discover-fetch-state')

    const settingsProbe = await evaluate(`(async () => {
      const sources = await window.electronAPI.getFetchSources()
      const config = await window.electronAPI.loadNodeConfig('fetch')
      return { sources, config }
    })()`)
    assert('采集设置读取到内置来源', settingsProbe?.sources?.length > 0, JSON.stringify(settingsProbe?.sources || []))
    assert('采集设置保存 enabled_sources', Array.isArray(settingsProbe?.config?.enabled_sources) && settingsProbe.config.enabled_sources.length > 0, JSON.stringify(settingsProbe?.config || {}))
    recordStep('采集设置参数 live 验证', 'PASS', `sources=${settingsProbe?.sources?.map(source => source.id).join(',') || ''}`)
    await screenshot('02-discover-settings-live')

    const scriptedWorkflow = await evaluate(`(async () => {
      const id = window.__acceptanceWorkflowId
      const patch = {
        selected_topic: {
          title: 'CDP 验收节目',
          description: '用于验证写作、真人录制、音频处理和本地发布闭环'
        },
        script: {
          title: 'CDP 验收节目',
          description: '通过 Electron CDP 自验收生成的测试节目',
          dialogue: [
            { speaker: 'Host A', text: '这是第一段 CDP 自验收脚本。' },
            { speaker: 'Host B', text: '这是第二段，用于确认 stages 与 script 会写入真实 workflow state。' }
          ]
        },
        stages: [
          { id: 'cdp-stage-1', order: 0, speaker: 'Host A', label: '开场', text: '这是第一段 CDP 自验收脚本。', estimated_duration: 3 },
          { id: 'cdp-stage-2', order: 1, speaker: 'Host B', label: '验证', text: '这是第二段，用于确认 stages 与 script 会写入真实 workflow state。', estimated_duration: 4 }
        ]
      }
      await window.electronAPI.updateWorkflowState(id, patch)
      return await window.electronAPI.getWorkflow(id)
    })()`)
    assert('写作状态已保存 script/stages', scriptedWorkflow?.state?.script?.title === 'CDP 验收节目' && scriptedWorkflow?.state?.stages?.length === 2, JSON.stringify(scriptedWorkflow?.state?.script || {}))
    recordStep('写作页保存脚本状态', 'PASS', `stages=${scriptedWorkflow?.state?.stages?.length || 0}`)
    await screenshot('02-script-state')

    const recordingResult = await evaluate(`(async () => {
      const id = window.__acceptanceWorkflowId
      const workflow = await window.electronAPI.getWorkflow(id)
      const episodeId = workflow.state.episode_id
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm'
      const recorder = new MediaRecorder(stream, { mimeType })
      const chunks = []
      recorder.ondataavailable = event => { if (event.data && event.data.size > 0) chunks.push(event.data) }
      await new Promise(resolve => {
        recorder.onstop = resolve
        recorder.start(100)
        setTimeout(() => recorder.stop(), 700)
      })
      stream.getTracks().forEach(track => track.stop())
      const blob = new Blob(chunks, { type: recorder.mimeType || mimeType })
      const buffer = await blob.arrayBuffer()
      const saved = await window.electronAPI.saveRecording({
        episodeId,
        segmentId: 'cdp-stage-1',
        mimeType: blob.type || mimeType,
        durationSeconds: 0.7,
        data: buffer
      })
      await window.electronAPI.updateWorkflowState(id, {
        recording_segments: [{
          id: saved.segmentId || 'cdp-stage-1',
          segment_id: 'cdp-stage-1',
          path: saved.path,
          mime_type: saved.mimeType,
          duration_seconds: saved.durationSeconds,
          size: saved.size
        }],
        audio_segments: [{
          index: 0,
          speaker: 'Host A',
          text: '这是第一段 CDP 自验收脚本。',
          path: saved.path,
          duration_seconds: saved.durationSeconds,
          source: 'recording'
        }]
      })
      return { saved, workflow: await window.electronAPI.getWorkflow(id), blobSize: blob.size, blobType: blob.type }
    })()`)
    const recordingPath = recordingResult?.saved?.path
    const recordingFile = await fileInfo(recordingPath)
    assert('真人录制 WebM 已保存', recordingFile.exists && recordingFile.size > 0, `${recordingPath} size=${recordingFile.size}`)
    assert('录音段写入 workflow state', Boolean(recordingResult?.workflow?.state?.recording_segments?.[0]?.path), JSON.stringify(recordingResult?.workflow?.state?.recording_segments || []))
    recordStep('真人录制与保存', 'PASS', `path=${recordingPath}, blobSize=${recordingResult?.blobSize}`)
    await screenshot('03-recording-state')

    const audioWorkflow = await evaluate(`(async () => {
      const id = window.__acceptanceWorkflowId
      await window.electronAPI.runWorkflowNodes(id, ['audio_postprocess', 'assets', 'review'])
      return await window.electronAPI.getWorkflow(id)
    })()`)
    const finalAudioPath = audioWorkflow?.state?.final_audio_path
    const finalAudioFile = await fileInfo(finalAudioPath)
    assert('final_audio_path 存在且文件大于 0', finalAudioFile.exists && finalAudioFile.size > 0, `${finalAudioPath} size=${finalAudioFile.size}`)
    assert('review_summary 已生成', Boolean(audioWorkflow?.state?.review_summary?.checks?.length), JSON.stringify(audioWorkflow?.state?.review_summary || {}))
    recordStep('运行音频生成与 review', 'PASS', `final_audio_path=${finalAudioPath}`)

    const publishWorkflow = await evaluate(`(async () => {
      const id = window.__acceptanceWorkflowId
      await window.electronAPI.runWorkflowNodes(id, ['review', 'publish'])
      return await window.electronAPI.getWorkflow(id)
    })()`)
    const rssPath = publishWorkflow?.state?.rss_path
    const publishDir = publishWorkflow?.state?.storage_info?.base_dir
    const rssFile = await fileInfo(rssPath)
    const publishDirExists = Boolean(publishDir && fs.existsSync(publishDir))
    assert('rss_path 存在且文件大于 0', rssFile.exists && rssFile.size > 0, `${rssPath} size=${rssFile.size}`)
    assert('storage_info.base_dir 存在', publishDirExists, String(publishDir || ''))
    assert('publish_status 标记本地/RSS 成功', publishWorkflow?.state?.publish_status?.platforms?.local === 'success' && publishWorkflow?.state?.publish_status?.platforms?.rss === 'success', JSON.stringify(publishWorkflow?.state?.publish_status || {}))
    recordStep('运行本地发布与 RSS 导出', 'PASS', `rss=${rssPath}, dir=${publishDir}`)
    await screenshot('04-publish-state')

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
