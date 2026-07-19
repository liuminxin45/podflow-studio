const { spawnSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const MIN_VERSION = [3, 13]
const VERSION_CHECK = [
  'import sys',
  `raise SystemExit(0 if sys.version_info >= (${MIN_VERSION[0]}, ${MIN_VERSION[1]}) else 1)`
].join('; ')

function localVenvPython() {
  return process.platform === 'win32'
    ? path.join(process.cwd(), '.venv', 'Scripts', 'python.exe')
    : path.join(process.cwd(), '.venv', 'bin', 'python')
}

function pythonCandidates({ includeVenv = true, includeUv = false } = {}) {
  return [
    includeVenv && fs.existsSync(localVenvPython()) ? [localVenvPython()] : null,
    process.env.PYTHON ? [process.env.PYTHON] : null,
    ['python3.13'],
    process.platform === 'win32' ? ['py', '-3.13'] : null,
    includeUv ? uvPythonCandidate() : null,
    ['python3'],
    ['python']
  ].filter(Boolean)
}

function uvPythonCandidate() {
  const result = spawnSync('uv', ['python', 'find', '3.13'], {
    encoding: 'utf8',
    shell: process.platform === 'win32'
  })

  const executable = result.stdout?.trim()
  return result.status === 0 && executable ? [executable] : null
}

function canRunPython(command) {
  const [executable, ...args] = command
  const result = spawnSync(executable, [...args, '-c', VERSION_CHECK], {
    env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    stdio: 'ignore'
  })
  return result.status === 0
}

function resolvePythonCommand(options = {}) {
  const command = pythonCandidates(options).find(canRunPython)
  if (command) return command

  throw new Error(
    'Python 3.13+ is required. Install Python 3.13 or set PYTHON to a Python 3.13 executable.'
  )
}

function spawnChecked(command, args) {
  const [executable, ...prefixArgs] = command
  const result = spawnSync(executable, [...prefixArgs, ...args], {
    env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    stdio: 'inherit'
  })

  if (result.error) {
    console.error(result.error.message)
    process.exit(1)
  }

  return result.status ?? 1
}

function pipIndexArgs() {
  return ['--index-url', process.env.PODFLOW_PIP_INDEX_URL || 'https://pypi.org/simple']
}

function setupVenv() {
  const venvCommand = [localVenvPython()]
  if (!canRunPython(venvCommand)) {
    const basePython = resolvePythonCommand({ includeVenv: false, includeUv: true })
    const venvStatus = spawnChecked(basePython, ['-m', 'venv', '.venv'])
    if (venvStatus !== 0) process.exit(venvStatus)
  }

  const pipStatus = spawnChecked(venvCommand, ['-m', 'ensurepip', '--upgrade'])
  if (pipStatus !== 0) process.exit(pipStatus)

  const buildToolsStatus = spawnChecked(venvCommand, [
    '-m',
    'pip',
    'install',
    ...pipIndexArgs(),
    'setuptools>=68',
    'wheel',
  ])
  if (buildToolsStatus !== 0) process.exit(buildToolsStatus)

  const installStatus = spawnChecked(venvCommand, [
    '-m',
    'pip',
    'install',
    '--no-build-isolation',
    ...pipIndexArgs(),
    '-e',
    '.[dev]',
  ])
  process.exit(installStatus)
}

function runCli() {
  if (process.argv[2] === '--setup') {
    setupVenv()
  }

  const command = resolvePythonCommand()
  process.exit(spawnChecked(command, process.argv.slice(2)))
}

if (require.main === module) {
  runCli()
}

module.exports = {
  resolvePythonCommand
}
