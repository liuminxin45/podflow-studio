const MAX_WORKFLOW_LOG_ENTRIES = 10_000

function normalizeLogEntries(entries) {
  if (!Array.isArray(entries)) return []
  return entries
    .map(entry => String(entry || '').trim())
    .filter(Boolean)
    .slice(0, 50)
}

function capWorkflowLogs(workflow) {
  if (!workflow?.state) return workflow
  const logs = Array.isArray(workflow.state.logs) ? workflow.state.logs : []
  workflow.state.logs = logs.slice(-MAX_WORKFLOW_LOG_ENTRIES)
  return workflow
}

function createAppendWorkflowLogsHandler({ getCurrentWorkflow, markDirty, broadcastWorkflowUpdate }) {
  return async function appendWorkflowLogs(_event, workflowId, entries = []) {
    const workflow = getCurrentWorkflow()
    if (!workflow || workflow.id !== workflowId) throw new Error('Workflow not found')
    const safeEntries = normalizeLogEntries(entries)
    if (safeEntries.length === 0) return workflow
    workflow.state.logs = [...(Array.isArray(workflow.state.logs) ? workflow.state.logs : []), ...safeEntries]
    capWorkflowLogs(workflow)
    markDirty()
    broadcastWorkflowUpdate()
    return workflow
  }
}

function createClearWorkflowLogsHandler({ getCurrentWorkflow, markDirty, broadcastWorkflowUpdate }) {
  return async function clearWorkflowLogs(_event, workflowId) {
    const workflow = getCurrentWorkflow()
    if (!workflow || workflow.id !== workflowId) throw new Error('Workflow not found')
    workflow.state.logs = []
    markDirty()
    broadcastWorkflowUpdate()
    return workflow
  }
}

module.exports = {
  MAX_WORKFLOW_LOG_ENTRIES,
  capWorkflowLogs,
  createAppendWorkflowLogsHandler,
  createClearWorkflowLogsHandler,
  normalizeLogEntries,
}
