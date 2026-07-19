const path = require('path')
const { spawn } = require('child_process')
const { resolvePythonCommand } = require('../scripts/python313')

const READY_PREFIX = 'LLM_GATEWAY_READY '
const START_TIMEOUT_MS = 12000

let gatewayProcess = null
let gatewayInfo = null
let starting = null

function spawnGateway() {
  const projectRoot = path.join(__dirname, '..')
  const [executable, ...prefixArgs] = resolvePythonCommand()
  return spawn(
    executable,
    [...prefixArgs, '-m', 'protocol.llm_gateway', '--host', '127.0.0.1', '--port', '0'],
    {
      cwd: projectRoot,
      env: {
        ...process.env,
        PYTHONIOENCODING: 'utf-8',
        PYTHONUNBUFFERED: '1',
      },
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  )
}

async function ensureLLMGateway() {
  if (gatewayProcess && gatewayInfo) return gatewayInfo
  if (starting) return starting

  starting = new Promise((resolve, reject) => {
    const proc = spawnGateway()
    gatewayProcess = proc
    let stdoutBuffer = ''

    const cleanupStartListeners = () => {
      proc.stdout?.off('data', onStdout)
      proc.off('error', onError)
      proc.off('exit', onExitBeforeReady)
      clearTimeout(timer)
    }

    const fail = (error) => {
      cleanupStartListeners()
      if (gatewayProcess === proc) {
        gatewayProcess = null
        gatewayInfo = null
      }
      starting = null
      reject(error)
    }

    const onStdout = (chunk) => {
      const text = chunk.toString('utf8')
      stdoutBuffer += text

      let newlineIndex = stdoutBuffer.indexOf('\n')
      while (newlineIndex >= 0) {
        const line = stdoutBuffer.slice(0, newlineIndex).trim()
        stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1)
        if (line.startsWith(READY_PREFIX)) {
          try {
            gatewayInfo = JSON.parse(line.slice(READY_PREFIX.length))
            cleanupStartListeners()
            console.log('[LLM Gateway] ready', gatewayInfo)
            starting = null
            resolve(gatewayInfo)
            return
          } catch (error) {
            fail(new Error(`Invalid LLM gateway ready payload: ${error.message}`))
            return
          }
        } else if (line) {
          console.log('[LLM Gateway]', line)
        }
        newlineIndex = stdoutBuffer.indexOf('\n')
      }
    }

    const onError = (error) => fail(error)
    const onExitBeforeReady = (code, signal) => {
      fail(new Error(`LLM gateway exited before ready (code=${code}, signal=${signal})`))
    }
    const timer = setTimeout(() => {
      try {
        proc.kill()
      } catch {
        // Ignore process cleanup errors during startup failure.
      }
      fail(new Error(`LLM gateway startup timeout (${START_TIMEOUT_MS}ms)`))
    }, START_TIMEOUT_MS)

    proc.stdout?.on('data', onStdout)
    proc.stderr?.on('data', (chunk) => {
      const text = chunk.toString('utf8').trim()
      if (text) console.warn('[LLM Gateway]', text)
    })
    proc.on('error', onError)
    proc.on('exit', onExitBeforeReady)
    proc.once('exit', (code, signal) => {
      if (gatewayProcess === proc) {
        console.log('[LLM Gateway] exited', { code, signal })
        gatewayProcess = null
        gatewayInfo = null
      }
    })
  })

  return starting
}

function stopLLMGateway() {
  const proc = gatewayProcess
  gatewayProcess = null
  gatewayInfo = null
  starting = null
  if (!proc || proc.killed) return
  try {
    proc.kill()
  } catch (error) {
    console.warn('[LLM Gateway] failed to stop', error)
  }
}

module.exports = {
  ensureLLMGateway,
  stopLLMGateway,
}
