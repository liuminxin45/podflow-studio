const { spawn } = require('child_process')
const fs = require('fs/promises')
const os = require('os')
const path = require('path')

const LOCAL_AGENT_TIMEOUT = 180000
const LOCAL_AGENT_MAX_BUFFER = 10 * 1024 * 1024
const DIRECT_CODEX_PROMPT_LIMIT = 24000
const activeAgentProcesses = new Set()

function terminateProcessTree(child) {
  if (!child?.pid) return
  if (process.platform === 'win32') {
    const killer = spawn('taskkill.exe', ['/pid', String(child.pid), '/t', '/f'], {
      stdio: 'ignore',
      windowsHide: true,
    })
    killer.on('error', () => {
      try { child.kill('SIGTERM') } catch { /* Process may already be gone. */ }
    })
    return
  }
  try { child.kill('SIGTERM') } catch { /* Process may already be gone. */ }
}

function firstLine(value) {
  return String(value || '').split(/\r?\n/).map(line => line.trim()).find(Boolean) || ''
}

function quoteForCmd(value) {
  return `"${String(value).replace(/"/g, '\\"')}"`
}

function runProcess(file, args, timeout = LOCAL_AGENT_TIMEOUT, signal) {
  return new Promise((resolve) => {
    const child = spawn(file, args, {
      env: {
        ...process.env,
        LANG: process.env.LANG || 'C.UTF-8',
        LC_ALL: process.env.LC_ALL || 'C.UTF-8',
        PYTHONIOENCODING: 'utf-8',
        PYTHONUTF8: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    activeAgentProcesses.add(child)
    let stdout = ''
    let stderr = ''
    let settled = false
    const cleanup = () => {
      activeAgentProcesses.delete(child)
      signal?.removeEventListener('abort', handleAbort)
    }
    const settle = (result) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      cleanup()
      resolve(result)
    }
    const failIfOutputTooLarge = () => {
      if (stdout.length + stderr.length <= LOCAL_AGENT_MAX_BUFFER) return
      terminateProcessTree(child)
      settle({ ok: false, output: stdout.trim(), diagnostic: 'Process output exceeded buffer limit' })
    }
    const timer = setTimeout(() => {
      terminateProcessTree(child)
      settle({ ok: false, output: stdout.trim(), diagnostic: `Process timeout after ${timeout}ms` })
    }, timeout)
    const handleAbort = () => {
      terminateProcessTree(child)
      settle({ ok: false, output: stdout.trim(), diagnostic: 'Request canceled' })
    }
    if (signal?.aborted) handleAbort()
    else signal?.addEventListener('abort', handleAbort, { once: true })

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
      failIfOutputTooLarge()
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
      failIfOutputTooLarge()
    })
    child.on('error', (error) => {
      settle({ ok: false, output: stdout.trim(), diagnostic: String(error?.message || '').trim() })
    })
    child.on('close', (code) => {
      settle({ ok: code === 0, output: stdout.trim(), diagnostic: stderr.trim() })
    })
  })
}

function runProcessStream(file, args, timeout = LOCAL_AGENT_TIMEOUT, handlers = {}, signal) {
  return new Promise((resolve) => {
    const child = spawn(file, args, {
      env: {
        ...process.env,
        LANG: process.env.LANG || 'C.UTF-8',
        LC_ALL: process.env.LC_ALL || 'C.UTF-8',
        PYTHONIOENCODING: 'utf-8',
        PYTHONUTF8: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    activeAgentProcesses.add(child)
    let stdout = ''
    let stderr = ''
    let stdoutRemainder = ''
    let settled = false
    const cleanup = () => {
      activeAgentProcesses.delete(child)
      signal?.removeEventListener('abort', handleAbort)
    }
    const settle = (result) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      cleanup()
      resolve(result)
    }
    const failIfOutputTooLarge = () => {
      if (stdout.length + stderr.length <= LOCAL_AGENT_MAX_BUFFER) return false
      terminateProcessTree(child)
      settle({ ok: false, output: stdout.trim(), diagnostic: 'Process output exceeded buffer limit' })
      return true
    }
    const flushStdoutLines = (text, final = false) => {
      stdoutRemainder += text
      const lines = stdoutRemainder.split(/\r?\n/)
      if (final) {
        stdoutRemainder = ''
      } else {
        stdoutRemainder = lines.pop() || ''
      }
      for (const line of lines) {
        handlers.onStdoutLine?.(line)
      }
    }
    const timer = setTimeout(() => {
      terminateProcessTree(child)
      settle({ ok: false, output: stdout.trim(), diagnostic: `Process timeout after ${timeout}ms` })
    }, timeout)
    const handleAbort = () => {
      terminateProcessTree(child)
      settle({ ok: false, output: stdout.trim(), diagnostic: 'Request canceled' })
    }
    if (signal?.aborted) handleAbort()
    else signal?.addEventListener('abort', handleAbort, { once: true })

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString()
      stdout += text
      handlers.onStdoutChunk?.(text)
      flushStdoutLines(text)
      failIfOutputTooLarge()
    })
    child.stderr.on('data', (chunk) => {
      const text = chunk.toString()
      stderr += text
      handlers.onStderrChunk?.(text)
      failIfOutputTooLarge()
    })
    child.on('error', (error) => {
      settle({ ok: false, output: stdout.trim(), diagnostic: String(error?.message || '').trim() })
    })
    child.on('close', (code) => {
      if (stdoutRemainder) flushStdoutLines('', true)
      settle({ ok: code === 0, output: stdout.trim(), diagnostic: stderr.trim() })
    })
  })
}

function stopLocalAgentProcesses() {
  for (const child of Array.from(activeAgentProcesses)) {
    try {
      terminateProcessTree(child)
    } catch {
      // Ignore cleanup errors while the app is quitting.
    }
  }
  activeAgentProcesses.clear()
}

function runAgentBinary(binary, args, timeout, signal) {
  if (process.platform === 'win32' && /\.(cmd|bat)$/i.test(binary)) {
    const commandLine = [quoteForCmd(binary), ...args.map(quoteForCmd)].join(' ')
    return runProcess('cmd.exe', ['/d', '/s', '/c', commandLine], timeout, signal)
  }
  return runProcess(binary, args, timeout, signal)
}

function runAgentBinaryStream(binary, args, timeout, handlers, signal) {
  if (process.platform === 'win32' && /\.(cmd|bat)$/i.test(binary)) {
    const commandLine = [quoteForCmd(binary), ...args.map(quoteForCmd)].join(' ')
    return runProcessStream('cmd.exe', ['/d', '/s', '/c', commandLine], timeout, handlers, signal)
  }
  return runProcessStream(binary, args, timeout, handlers, signal)
}

async function resolveFromPath(command) {
  if (process.platform === 'win32') {
    const result = await runProcess('where.exe', [command], 1500)
    return result.ok ? firstLine(result.output) : ''
  }

  const result = await runProcess('sh', ['-lc', `command -v ${quoteForShell(command)}`], 1500)
  return result.ok ? firstLine(result.output) : ''
}

function quoteForShell(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`
}

function codexBinaryCandidates() {
  const home = os.homedir()
  const candidates = []
  if (home) {
    candidates.push(
      path.join(home, '.local', 'bin', 'codex'),
      path.join(home, '.local', 'bin', 'codex.exe'),
      path.join(home, '.local', 'bin', 'codex.cmd'),
      path.join(home, '.codex', 'bin', 'codex'),
      path.join(home, '.codex', 'bin', 'codex.exe'),
      path.join(home, '.codex', 'bin', 'codex.cmd'),
      path.join(home, '.npm-global', 'bin', 'codex'),
      path.join(home, '.npm-global', 'bin', 'codex.cmd'),
      path.join(home, '.npm', 'bin', 'codex'),
      path.join(home, '.npm', 'bin', 'codex.cmd'),
      path.join(home, '.bun', 'bin', 'codex'),
      path.join(home, '.bun', 'bin', 'codex.cmd'),
      path.join(home, 'AppData', 'Roaming', 'npm', 'codex.cmd'),
      path.join(home, 'AppData', 'Roaming', 'npm', 'codex.exe'),
      path.join(home, 'AppData', 'Local', 'pnpm', 'codex.cmd'),
      path.join(home, 'AppData', 'Local', 'pnpm', 'codex.exe'),
      path.join(home, 'scoop', 'shims', 'codex.cmd'),
      path.join(home, 'scoop', 'shims', 'codex.exe'),
    )
  }
  if (process.env.APPDATA) {
    candidates.push(
      path.join(process.env.APPDATA, 'npm', 'codex.cmd'),
      path.join(process.env.APPDATA, 'npm', 'codex.exe'),
    )
  }
  if (process.env.LOCALAPPDATA) {
    candidates.push(
      path.join(process.env.LOCALAPPDATA, 'pnpm', 'codex.cmd'),
      path.join(process.env.LOCALAPPDATA, 'pnpm', 'codex.exe'),
    )
  }
  candidates.push('/opt/homebrew/bin/codex', '/usr/local/bin/codex')
  return candidates
}

async function firstExistingFile(paths) {
  for (const candidate of paths) {
    try {
      const stat = await fs.stat(candidate)
      if (stat.isFile()) return candidate
    } catch {
      // Continue probing known install locations.
    }
  }
  return ''
}

async function resolveCodexBinary() {
  return await resolveFromPath('codex') || await firstExistingFile(codexBinaryCandidates())
}

async function resolveLocalAgentBinary(commands) {
  for (const command of commands) {
    const resolved = await resolveFromPath(command)
    if (resolved) return resolved
  }
  return ''
}

function renderLocalAgentArgs(argsTemplate, prompt) {
  const template = Array.isArray(argsTemplate) && argsTemplate.length ? argsTemplate : ['{prompt}']
  return template.map(arg => String(arg).replace('{prompt}', prompt))
}

function messagesToPrompt(messages) {
  return (Array.isArray(messages) ? messages : [])
    .map(message => {
      const role = String(message?.role || 'user')
      const content = String(message?.content || '')
      return `[${role}]\n${content}`
    })
    .join('\n\n')
    .trim()
}

function extractCodexText(stdout) {
  const textParts = []
  for (const line of String(stdout || '').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('{')) continue
    try {
      const json = JSON.parse(trimmed)
      const item = json.item || json
      if (item.type === 'agent_message' && typeof item.text === 'string') {
        textParts.push(item.text)
      }
      if (json.type === 'message' && typeof json.content === 'string') {
        textParts.push(json.content)
      }
    } catch {
      // Non-JSON diagnostic lines are ignored.
    }
  }
  return textParts.join('\n').trim()
}

function eventTextField(item) {
  if (typeof item?.text === 'string') return item.text
  if (typeof item?.content === 'string') return item.content
  if (Array.isArray(item?.content)) {
    return item.content
      .map(part => {
        if (typeof part === 'string') return part
        if (typeof part?.text === 'string') return part.text
        return ''
      })
      .filter(Boolean)
      .join('')
  }
  return ''
}

function stringifyEventPayload(value) {
  if (value == null) return undefined
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function mapCodexJsonLine(line) {
  const trimmed = String(line || '').trim()
  if (!trimmed.startsWith('{')) return null

  let json
  try {
    json = JSON.parse(trimmed)
  } catch {
    return null
  }

  const item = json.item || json
  if (json.type === 'thread.started' || item.type === 'thread.started') {
    return { type: 'init', sessionId: json.thread_id || item.thread_id || json.session_id || item.session_id || '' }
  }
  if (json.type === 'item.started' && item.type === 'command_execution') {
    return {
      type: 'tool_start',
      toolName: 'command',
      toolId: String(item.id || item.call_id || 'command'),
      input: stringifyEventPayload(item.command || item.arguments || item.input),
    }
  }
  if (json.type === 'item.completed' && item.type === 'command_execution') {
    return {
      type: 'tool_done',
      toolId: String(item.id || item.call_id || 'command'),
      output: stringifyEventPayload(item.aggregated_output || item.output || item.result),
    }
  }
  if (json.type === 'item.started' && item.type === 'mcp_tool_call') {
    return {
      type: 'tool_start',
      toolName: String(item.tool || item.name || 'mcp_tool'),
      toolId: String(item.id || item.call_id || item.tool_call_id || 'mcp_tool'),
      input: stringifyEventPayload(item.arguments || item.input),
    }
  }
  if (json.type === 'item.completed' && item.type === 'mcp_tool_call') {
    return {
      type: 'tool_done',
      toolId: String(item.id || item.call_id || item.tool_call_id || 'mcp_tool'),
      output: stringifyEventPayload(item.error || item.result || item.output),
    }
  }
  if (item.type === 'agent_message' || json.type === 'message') {
    const text = eventTextField(item || json)
    return text ? { type: 'text_delta', text } : null
  }
  if (json.type === 'turn.completed') {
    return { type: 'done' }
  }
  if (json.type === 'error' || item.type === 'error') {
    return { type: 'error', message: String(json.message || item.message || 'Codex CLI error') }
  }
  return null
}

function requireSuccessfulAgentContent(result, content, label) {
  const normalizedContent = String(content || '').trim()
  if (!result?.ok) {
    const detail = String(result?.diagnostic || normalizedContent || '').trim()
    throw new Error(detail || `${label} CLI call failed`)
  }
  if (!normalizedContent) {
    throw new Error(result?.diagnostic || `${label} CLI returned an empty response`)
  }
  return normalizedContent
}

async function callCodexAgent({ messages, timeout, localAgentCommand, signal }, streamHandlers = {}) {
  const command = String(localAgentCommand || 'codex').trim()
  const binary = await resolveLocalAgentBinary([command]) || (command === 'codex' ? await resolveCodexBinary() : '')
  if (!binary) {
    throw new Error(`${command} CLI not found. Install it or make sure it is available on PATH.`)
  }

  const prompt = messagesToPrompt(messages)
  if (!prompt) {
    throw new Error('Codex CLI request is empty')
  }

  const cwd = process.cwd()
  const workspaceTempRoot = path.join(cwd, 'out', 'tmp')
  await fs.mkdir(workspaceTempRoot, { recursive: true })
  const tempDir = await fs.mkdtemp(path.join(workspaceTempRoot, 'podflow-codex-'))
  const lastMessagePath = path.join(tempDir, 'last-message.txt')
  let promptMode = 'direct'
  let promptRequest = prompt
  let promptPath = ''
  if (prompt.length > DIRECT_CODEX_PROMPT_LIMIT) {
    promptMode = 'workspace-file'
    promptPath = path.join(tempDir, 'prompt.txt')
    await fs.writeFile(promptPath, prompt, 'utf8')
    promptRequest = [
      'Read the UTF-8 request file below and complete it exactly.',
      'Return only the final answer requested by that file.',
      promptPath,
    ].join('\n')
  }
  const args = [
    '--sandbox',
    'read-only',
    '--ask-for-approval',
    'never',
    'exec',
    '--json',
    '-C',
    cwd,
    '--output-last-message',
    lastMessagePath,
    promptRequest,
  ]

  try {
    const startedAt = Date.now()
    let streamedText = ''
    let emittedDone = false
    const emitAgentEvent = (event) => {
      if (!event) return
      if (event.type === 'text_delta') {
        streamedText += event.text || ''
        streamHandlers.onChunk?.(event.text || '')
      }
      if (event.type === 'done') {
        emittedDone = true
      }
      streamHandlers.onEvent?.(event)
    }
    console.log('[LocalAgent][codex] call start', {
      binary,
      cwd,
      timeout: timeout || LOCAL_AGENT_TIMEOUT,
      promptChars: prompt.length,
      promptMode,
      promptPath,
      stream: Boolean(streamHandlers.onEvent || streamHandlers.onChunk),
    })
    const result = streamHandlers.onEvent || streamHandlers.onChunk
      ? await runAgentBinaryStream(binary, args, timeout || LOCAL_AGENT_TIMEOUT, {
        onStdoutLine: (line) => emitAgentEvent(mapCodexJsonLine(line)),
      }, signal)
      : await runAgentBinary(binary, args, timeout || LOCAL_AGENT_TIMEOUT, signal)
    if (signal?.aborted) throw new Error('Request canceled')
    console.log('[LocalAgent][codex] process closed', {
      ok: result.ok,
      duration: Date.now() - startedAt,
      stdoutLength: result.output.length,
      diagnosticLength: result.diagnostic.length,
      diagnosticPreview: result.diagnostic.slice(0, 300),
    })
    let content = ''
    try {
      content = (await fs.readFile(lastMessagePath, 'utf8')).trim()
    } catch {
      content = ''
    }
    if (!content) content = streamedText.trim() || extractCodexText(result.output)
    content = requireSuccessfulAgentContent(result, content, 'Codex')
    console.log('[LocalAgent][codex] call success', {
      duration: Date.now() - startedAt,
      contentChars: content.length,
    })
    if ((streamHandlers.onEvent || streamHandlers.onChunk) && !streamedText.trim()) {
      emitAgentEvent({ type: 'text_delta', text: content })
    }
    if ((streamHandlers.onEvent || streamHandlers.onChunk) && !emittedDone) {
      emitAgentEvent({ type: 'done' })
    }
    return content
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {})
  }
}

async function callStdoutAgent(localAgentId, { messages, timeout, localAgentCommand, localAgentArgs, signal }, streamHandlers = {}) {
  const command = String(localAgentCommand || '').trim()
  if (!command) {
    throw new Error(`Local agent "${localAgentId}" is missing a command in settings.`)
  }

  const binary = await resolveLocalAgentBinary([command])
  if (!binary) {
    throw new Error(`${command} CLI not found. Install it or make sure it is available on PATH.`)
  }

  const prompt = messagesToPrompt(messages)
  if (!prompt) {
    throw new Error(`${localAgentId} request is empty`)
  }

  const cwd = process.cwd()
  const workspaceTempRoot = path.join(cwd, 'out', 'tmp')
  await fs.mkdir(workspaceTempRoot, { recursive: true })
  const tempDir = await fs.mkdtemp(path.join(workspaceTempRoot, `podflow-${localAgentId}-`))
  try {
    let promptRequest = prompt
    let promptPath = ''
    if (prompt.length > DIRECT_CODEX_PROMPT_LIMIT) {
      promptPath = path.join(tempDir, 'prompt.txt')
      await fs.writeFile(promptPath, prompt, 'utf8')
      promptRequest = [
        'Read the UTF-8 request file below and complete it exactly.',
        'Return only the final answer requested by that file.',
        promptPath,
      ].join('\n')
    }

    const args = renderLocalAgentArgs(localAgentArgs, promptRequest)
    const startedAt = Date.now()
    let streamedText = ''
    let emittedDone = false
    const emitDone = () => {
      if (emittedDone) return
      emittedDone = true
      streamHandlers.onEvent?.({ type: 'done' })
    }

    streamHandlers.onEvent?.({ type: 'init', sessionId: `${localAgentId}-${startedAt}` })
    console.log('[LocalAgent][generic] call start', {
      localAgentId,
      binary,
      cwd,
      timeout: timeout || LOCAL_AGENT_TIMEOUT,
      promptChars: prompt.length,
      promptPath,
      stream: Boolean(streamHandlers.onEvent || streamHandlers.onChunk),
    })

    const result = streamHandlers.onEvent || streamHandlers.onChunk
      ? await runAgentBinaryStream(binary, args, timeout || LOCAL_AGENT_TIMEOUT, {
        onStdoutChunk: (text) => {
          streamedText += text
          streamHandlers.onChunk?.(text)
        },
      }, signal)
      : await runAgentBinary(binary, args, timeout || LOCAL_AGENT_TIMEOUT, signal)
    if (signal?.aborted) throw new Error('Request canceled')

    console.log('[LocalAgent][generic] process closed', {
      localAgentId,
      ok: result.ok,
      duration: Date.now() - startedAt,
      stdoutLength: result.output.length,
      diagnosticLength: result.diagnostic.length,
      diagnosticPreview: result.diagnostic.slice(0, 300),
    })

    const content = requireSuccessfulAgentContent(result, streamedText || result.output, localAgentId)
    if ((streamHandlers.onEvent || streamHandlers.onChunk) && !streamedText.trim()) {
      streamHandlers.onChunk?.(content)
    }
    emitDone()
    return content
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {})
  }
}

async function callLocalAgent(localAgentId, params, streamHandlers = {}) {
  const outputMode = String(params.localAgentOutputMode || '').trim() || (localAgentId === 'codex' ? 'codex-json' : 'stdout')
  if (outputMode === 'codex-json') {
    return callCodexAgent(params, streamHandlers)
  }
  return callStdoutAgent(localAgentId, params, streamHandlers)
}

async function callLocalAgentLLM(params) {
  const localAgentId = String(params.localAgentId || params.aiTarget || '').replace(/^agent:/, '') || 'codex'
  const content = await callLocalAgent(localAgentId, params)
  return {
    id: `local-agent-${Date.now()}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: `local-agent:${localAgentId}`,
    choices: [
      {
        index: 0,
        message: { role: 'assistant', content },
        finish_reason: 'stop',
      },
    ],
  }
}

async function callLocalAgentLLMStream(params, streamHandlers = {}) {
  const localAgentId = String(params.localAgentId || params.aiTarget || '').replace(/^agent:/, '') || 'codex'
  const content = await callLocalAgent(localAgentId, params, streamHandlers)
  return {
    id: `local-agent-${Date.now()}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: `local-agent:${localAgentId}`,
    choices: [
      {
        index: 0,
        message: { role: 'assistant', content },
        finish_reason: 'stop',
      },
    ],
  }
}

module.exports = {
  callLocalAgentLLM,
  callLocalAgentLLMStream,
  stopLocalAgentProcesses,
  requireSuccessfulAgentContent,
}
