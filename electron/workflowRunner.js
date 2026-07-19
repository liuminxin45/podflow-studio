/**
 * Workflow Runner — Sequential node execution engine.
 *
 * Extracted from main.js for maintainability.
 * Uses a context-object pattern to access shared dependencies.
 *
 * Features:
 *   - Per-node retry (configurable, default 1 retry for non-LLM nodes)
 *   - Resume-from capability (pass resumeFrom node name)
 *   - Structured logging with orchestrator prefix
 */
const { validateNodeOutput } = require('./nodeValidator')

const NODE_STAGE_LABELS = {
  fetch:             'Discover - fetch',
  preprocess:        'Organize - clean content',
  research:          'Draft - research',
  topic_selection:   'Draft - structure',
  facts:             'Draft - fact cards',
  script:            'Draft - script',
  tts:               'Produce - speech synthesis',
  audio_postprocess: 'Produce - audio processing',
  assets:            'Produce - asset generation',
  review:            'Publish - review',
  publish:           'Publish - archive',
}

// Nodes that are safe to retry (no side effects or idempotent)
const RETRYABLE_NODES = new Set([
  'fetch', 'preprocess',
  'research', 'topic_selection', 'script',
  'assets', 'review',
])
const MAX_RETRIES = 1
const RETRY_DELAY_MS = 2000

const PIPELINE_NODES = [
  'fetch',
  'preprocess',
  'research', 'topic_selection',
  'facts',
  'script',
  'tts', 'audio_postprocess', 'assets',
  'review',
  'publish'
]

function getNodeErrors(result, nodeName) {
  return Array.isArray(result?.errors)
    ? result.errors.filter(error => error?.node === nodeName)
    : []
}

function getNodeResultError(nodeName, result, previousNodeErrorCount = 0) {
  if (!result || typeof result !== 'object') return null
  const nodeErrors = getNodeErrors(result, nodeName).slice(previousNodeErrorCount)
  const requestFailed = nodeName === 'script' && result.generation_request?.status === 'failed'
  if (!requestFailed && nodeErrors.length === 0) return null
  const detail = nodeErrors.at(-1)?.message || `${nodeName} node failed.`
  return new Error(detail)
}

function resolveDownstreamStale(state, executedNodes) {
  if (
    state?.downstream_stale?.is_stale
    && executedNodes.includes('audio_postprocess')
    && state.audio_outputs?.final_audio_path
  ) {
    state.downstream_stale = {}
  }
}

const RUNTIME_SECRET_FIELD = /(^|_)(api_key|access_token|secret)$/i
const RUNTIME_CAMEL_SECRET_FIELD = /(apiKey|accessToken|secret)$/

function redactRuntimeConfigSecrets(state) {
  const runtimeConfig = state?.runtime_config
  if (!runtimeConfig || typeof runtimeConfig !== 'object') return state

  const visit = value => {
    if (!value || typeof value !== 'object') return
    for (const [key, nested] of Object.entries(value)) {
      if (RUNTIME_SECRET_FIELD.test(key) || RUNTIME_CAMEL_SECRET_FIELD.test(key)) {
        value[key] = ''
      } else {
        visit(nested)
      }
    }
  }
  visit(runtimeConfig)
  return state
}

/**
 * @param {object} ctx
 * @param {() => Electron.BrowserWindow | null} ctx.getMainWindow
 * @param {() => import('./configManager') | null} ctx.getConfigManager
 * @param {(name: string, state: object, timeout?: number) => Promise<object>} ctx.runPythonNode
 * @param {() => object} ctx.getCurrentWorkflow
 * @param {(wf: object) => void} ctx.setCurrentWorkflow
 */
function create(ctx) {

  function broadcastUpdate() {
    const win = ctx.getMainWindow()
    const wf = ctx.getCurrentWorkflow()
    if (win && wf) {
      const safeWorkflow = JSON.parse(JSON.stringify(wf))
      redactRuntimeConfigSecrets(safeWorkflow.state)
      win.webContents.send('workflow:update', safeWorkflow)
    }
  }

  async function run(workflowId, resumeFrom = null, onlyNodes = null) {
    const currentWorkflow = ctx.getCurrentWorkflow()
    if (!currentWorkflow) return

    const nodes = Array.isArray(onlyNodes) && onlyNodes.length > 0 ? onlyNodes : PIPELINE_NODES
    let startIndex = 0
    if (resumeFrom === 'auto') {
      // Auto-detect resume point from pipeline manifest
      const manifest = currentWorkflow.state?._manifest?.nodes || {}
      for (let i = 0; i < nodes.length; i++) {
        const entry = manifest[nodes[i]]
        if (entry && entry.status === 'ok') {
          startIndex = i + 1
        } else {
          break
        }
      }
      if (startIndex > 0) {
        console.log(`[Workflow] Auto-resume: skipping ${startIndex} completed nodes, starting from ${nodes[startIndex] || 'END'}`)
      }
    } else if (resumeFrom) {
      startIndex = nodes.indexOf(resumeFrom)
    }
    if (startIndex < 0) startIndex = 0
    const workflowStartTime = Date.now()
    const episodeId = currentWorkflow.state.episode_id || 'unknown'

    if (startIndex === 0) {
      const debugMode = currentWorkflow.state.runtime_config?.debug_mode?.enabled ?? false
      const autoExecute = currentWorkflow.state.runtime_config?.auto_execute ?? false
      currentWorkflow.state.logs = currentWorkflow.state.logs || []
      currentWorkflow.state.logs.push(`[Workflow] ========================================`)
      currentWorkflow.state.logs.push(`[Workflow] Workflow started`)
      currentWorkflow.state.logs.push(`[Workflow] episode_id: ${episodeId}`)
      currentWorkflow.state.logs.push(`[Workflow] started_at: ${new Date().toISOString()}`)
      currentWorkflow.state.logs.push(`[Workflow] pending_nodes=${nodes.length}`)
      currentWorkflow.state.logs.push(`[Workflow] auto_execute=${autoExecute}`)
      if (debugMode) {
        currentWorkflow.state.logs.push(`[Workflow] DEBUG MODE ACTIVE: LLM calls will use compact prompts and lower token limits`)
        currentWorkflow.state.logs.push(`[Workflow]   draft nodes: research, topic_selection, script`)
      } else {
        currentWorkflow.state.logs.push(`[Workflow] debug_mode=false`)
      }
      currentWorkflow.state.logs.push(`[Workflow] ========================================`)
    }

    const configManager = ctx.getConfigManager()

    for (let i = startIndex; i < nodes.length; i++) {
      const nodeName = nodes[i]
      const stageLabel = NODE_STAGE_LABELS[nodeName] || nodeName

      console.log(`[Workflow] Starting node: ${nodeName} (${i+1}/${nodes.length})`)

      currentWorkflow.currentNode = nodeName
      currentWorkflow.nodeExecutions[nodeName] = {
        status: 'running',
        startedAt: new Date().toISOString()
      }

      currentWorkflow.state.logs = currentWorkflow.state.logs || []
      currentWorkflow.state.logs.push(`[Orchestrator] ----------------------------------------`)
      currentWorkflow.state.logs.push(`[Orchestrator] Start node [${i+1}/${nodes.length}]: ${stageLabel}`)
      currentWorkflow.state.logs.push(`[Orchestrator] node=${nodeName} | time=${new Date().toISOString()}`)

      broadcastUpdate()

      try {
        const nodeConfig = configManager ? configManager.loadNodeConfig(nodeName) : null

        if (nodeConfig) {
          currentWorkflow.state.runtime_config = currentWorkflow.state.runtime_config || {}
          currentWorkflow.state.runtime_config[nodeName] = nodeConfig
        }

        // Preload script config for nodes that need LLM access (research, topic_selection)
        if ((nodeName === 'research' || nodeName === 'topic_selection') && configManager) {
          currentWorkflow.state.runtime_config = currentWorkflow.state.runtime_config || {}
          const scriptConfig = configManager.loadNodeConfig('script')
          if (scriptConfig) {
            currentWorkflow.state.runtime_config.script = scriptConfig
            console.log(`[${nodeName}] Preloaded script config for LLM access (api_key: ${scriptConfig.api_key ? 'SET' : 'NOT SET'})`)
          } else {
            console.log(`[${nodeName}] Failed to load script config; LLM analysis will be skipped`)
          }
        }

        // Execute node with retry for retryable nodes
        let result = null
        let lastError = null
        let previousNodeErrorCount = 0
        const maxAttempts = RETRYABLE_NODES.has(nodeName) ? 1 + MAX_RETRIES : 1

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          try {
            const startTime = Date.now()
            previousNodeErrorCount = getNodeErrors(currentWorkflow.state, nodeName).length
            result = await ctx.runPythonNode(nodeName, currentWorkflow.state)
            const duration = (Date.now() - startTime) / 1000
            console.log(`[${nodeName}] Completed in ${duration.toFixed(2)}s${attempt > 1 ? ` (attempt ${attempt})` : ''}`)

            // Print Python logs to console
            if (result.logs && result.logs.length > 0) {
              console.log(`[${nodeName}:py] Python logs captured: ${result.logs.length} entries`)
            }

            if (!result || typeof result !== 'object') {
              throw new Error(`Invalid result from ${nodeName}: expected object, got ${typeof result}`)
            }

            const resultError = getNodeResultError(nodeName, result, previousNodeErrorCount)
            if (resultError) throw resultError
            validateNodeOutput(nodeName, result)

            currentWorkflow.nodeExecutions[nodeName] = {
              status: 'completed',
              startedAt: currentWorkflow.nodeExecutions[nodeName].startedAt,
              completedAt: new Date().toISOString(),
              duration,
              attempts: attempt,
            }
            lastError = null
            break  // success
          } catch (attemptError) {
            lastError = attemptError
            if (attempt < maxAttempts) {
              console.warn(`[${nodeName}] Attempt ${attempt} failed; retrying in ${RETRY_DELAY_MS}ms...`)
              currentWorkflow.state.logs = currentWorkflow.state.logs || []
              currentWorkflow.state.logs.push(`[Orchestrator] WARN node ${stageLabel} attempt ${attempt} failed; retrying in ${RETRY_DELAY_MS/1000}s`)
              broadcastUpdate()
              await new Promise(r => setTimeout(r, RETRY_DELAY_MS))
            }
          }
        }

        if (lastError) {
          if (result && typeof result === 'object') currentWorkflow.state = redactRuntimeConfigSecrets(result)
          throw lastError
        }

        if (result.errors && result.errors.length > 0) {
          console.warn(`Node ${nodeName} completed with ${result.errors.length} error(s)`)
        }

        // Inject orchestration success log
        if (!result.logs) result.logs = []
        const duration = currentWorkflow.nodeExecutions[nodeName].duration
        const nodeErrors = getNodeErrors(result, nodeName).slice(previousNodeErrorCount)
        if (nodeErrors.length > 0) {
          result.logs.push(`[Orchestrator] WARN node completed with errors: ${stageLabel} | duration=${duration.toFixed(2)}s | errors=${nodeErrors.length}`)
          for (const e of nodeErrors) {
            result.logs.push(`[Orchestrator]   error: ${e.message}`)
          }
        } else {
          result.logs.push(`[Orchestrator] OK node completed: ${stageLabel} | duration=${duration.toFixed(2)}s`)
        }

        // State snapshot log
        const stateLog = `[Orchestrator] State snapshot: fetch=${result.fetch_contents?.length || 0}, cleaned=${result.cleaned_contents?.length || 0}, researched=${result.researched_contents?.length || 0}, materials=${result.selected_materials?.length || 0}, segments=${result.edited_script?.segments?.length || 0}`
        console.log(stateLog)
        result.logs.push(stateLog)
        currentWorkflow.state = redactRuntimeConfigSecrets(result)

        broadcastUpdate()

        // Approval gate after script node
        if (nodeName === 'script' && !currentWorkflow.approvals?.script) {
          const scriptConfig = configManager ? configManager.loadNodeConfig('script') : null
          const isAutoExecute = currentWorkflow.state?.runtime_config?.auto_execute ?? false
          const requireApproval = isAutoExecute ? false : (scriptConfig?.require_approval ?? false)
          console.log('[Approval Check] require_approval:', requireApproval, '| auto_execute:', isAutoExecute)

          if (requireApproval) {
            console.log('[Approval] Pausing workflow for approval')
            currentWorkflow.status = 'waiting_approval'
            currentWorkflow.nodeExecutions[nodeName].status = 'waiting_approval'

            const win = ctx.getMainWindow()
            if (win) {
              win.webContents.send('workflow:update', currentWorkflow)
              win.webContents.send('workflow:needApproval', {
                workflowId,
                nodeName,
                data: currentWorkflow.state
              })
            }
            return
          } else {
            console.log('[Approval] Auto-approval mode, continuing workflow')
          }
        }
      } catch (error) {
        console.error(`Node ${nodeName} failed`)

        redactRuntimeConfigSecrets(currentWorkflow.state)

        currentWorkflow.nodeExecutions[nodeName] = {
          status: 'failed',
          startedAt: currentWorkflow.nodeExecutions[nodeName].startedAt,
          completedAt: new Date().toISOString(),
          error: error.message,
          errorStack: error.stack
        }
        currentWorkflow.status = 'failed'
        currentWorkflow.state.errors = currentWorkflow.state.errors || []
        currentWorkflow.state.errors.push({
          node: nodeName,
          message: error.message,
          timestamp: new Date().toISOString()
        })
        currentWorkflow.state.logs = currentWorkflow.state.logs || []
        currentWorkflow.state.logs.push(`[Orchestrator] FAILED node: ${stageLabel}`)
        currentWorkflow.state.logs.push(`[Orchestrator]   error: ${error.message}`)
        currentWorkflow.state.logs.push(`[Orchestrator]   time: ${new Date().toISOString()}`)

        broadcastUpdate()
        return
      }
    }

    // Workflow completed successfully
    const workflowDuration = ((Date.now() - workflowStartTime) / 1000).toFixed(1)
    const completedNodes = Object.entries(currentWorkflow.nodeExecutions)
      .filter(([, v]) => v.status === 'completed').length
    const failedNodes = Object.entries(currentWorkflow.nodeExecutions)
      .filter(([, v]) => v.status === 'failed').length
    currentWorkflow.state.logs = currentWorkflow.state.logs || []
    currentWorkflow.state.logs.push(`[Workflow] ========================================`)
    currentWorkflow.state.logs.push(`[Workflow] Workflow completed`)
    currentWorkflow.state.logs.push(`[Workflow] episode_id: ${episodeId}`)
    currentWorkflow.state.logs.push(`[Workflow] completed_at: ${new Date().toISOString()}`)
    currentWorkflow.state.logs.push(`[Workflow] duration=${workflowDuration}s`)
    currentWorkflow.state.logs.push(`[Workflow] node_stats: completed=${completedNodes}, failed=${failedNodes}, total=${nodes.length}`)
    currentWorkflow.state.logs.push(`[Workflow] ========================================`)
    resolveDownstreamStale(currentWorkflow.state, nodes)
    currentWorkflow.status = 'completed'
    currentWorkflow.currentNode = null
    broadcastUpdate()
  }

  return { run, PIPELINE_NODES, NODE_STAGE_LABELS }
}

module.exports = { create, getNodeResultError, redactRuntimeConfigSecrets, resolveDownstreamStale }
