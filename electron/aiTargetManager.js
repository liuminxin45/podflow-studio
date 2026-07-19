const { execFile } = require('child_process')

const LOCAL_AGENT_DEFINITIONS = [
  {
    id: 'claude_code',
    name: 'Claude Code',
    commands: ['claude'],
    versionArgs: ['--version'],
  },
  {
    id: 'codex',
    name: 'Codex',
    commands: ['codex'],
    versionArgs: ['--version'],
  },
  {
    id: 'opencode',
    name: 'OpenCode',
    commands: ['opencode'],
    versionArgs: ['--version'],
  },
  {
    id: 'pi',
    name: 'Pi',
    commands: ['pi'],
    versionArgs: ['--version'],
  },
  {
    id: 'gemini_cli',
    name: 'Gemini CLI',
    commands: ['gemini'],
    versionArgs: ['--version'],
  },
  {
    id: 'kiro',
    name: 'Kiro',
    commands: ['kiro'],
    versionArgs: ['--version'],
  },
  {
    id: 'hermes',
    name: 'Hermes Agent',
    commands: ['hermes', 'hermes-agent'],
    versionArgs: ['--version'],
  },
]

function runProcess(file, args, timeout = 1500) {
  return new Promise((resolve) => {
    let settled = false
    const child = execFile(file, args, {
      timeout,
      windowsHide: true,
    }, (error, stdout, stderr) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (error) {
        resolve({ ok: false, output: String(stderr || error.message || '').trim() })
        return
      }
      resolve({ ok: true, output: String(stdout || stderr || '').trim() })
    })

    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      try {
        child.kill('SIGKILL')
      } catch {
        // Best-effort cleanup only.
      }
      resolve({ ok: false, output: 'timeout' })
    }, timeout)
  })
}

function firstLine(value) {
  return String(value || '').split(/\r?\n/).map(line => line.trim()).find(Boolean) || ''
}

function quoteForCmd(value) {
  return `"${String(value).replace(/"/g, '\\"')}"`
}

async function resolveCommandPath(command) {
  if (process.platform === 'win32') {
    const result = await runProcess('where.exe', [command], 1200)
    if (!result.ok) return ''
    return firstLine(result.output)
  }

  const result = await runProcess('sh', ['-lc', `command -v ${quoteForCmd(command)}`], 1200)
  if (!result.ok) return ''
  return firstLine(result.output)
}

async function readCommandVersion(commandPath, args) {
  if (!commandPath) return ''

  if (process.platform === 'win32' && /\.(cmd|bat)$/i.test(commandPath)) {
    const commandLine = [quoteForCmd(commandPath), ...args.map(quoteForCmd)].join(' ')
    const result = await runProcess('cmd.exe', ['/d', '/s', '/c', commandLine], 15000)
    return result.ok ? firstLine(result.output) : ''
  }

  const result = await runProcess(commandPath, args, 15000)
  return result.ok ? firstLine(result.output) : ''
}

async function detectLocalAgent(definition) {
  for (const command of definition.commands) {
    const commandPath = await resolveCommandPath(command)
    if (commandPath) {
      const version = await readCommandVersion(commandPath, definition.versionArgs)
      return {
        id: definition.id,
        name: definition.name,
        command,
        version,
        available: true,
        statusText: version || '已安装',
      }
    }
  }

  return {
    id: definition.id,
    name: definition.name,
    command: definition.commands[0],
    version: '',
    available: false,
    statusText: '缺失',
  }
}

async function detectLocalAgents() {
  return Promise.all(LOCAL_AGENT_DEFINITIONS.map(detectLocalAgent))
}

module.exports = {
  detectLocalAgents,
}
