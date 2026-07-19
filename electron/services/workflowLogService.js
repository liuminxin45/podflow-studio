function normalizeLogEntries(entries) {
  if (!Array.isArray(entries)) return []
  return entries
    .map(entry => String(entry || '').trim())
    .filter(Boolean)
    .slice(0, 50)
}

function createAppendWorkflowLogsHandler({ getCurrentWorkflow, markDirty, broadcastWorkflowUpdate }) {
  return async function appendWorkflowLogs(_event, workflowId, entries = []) {
    const workflow = getCurrentWorkflow()
    if (!workflow || workflow.id !== workflowId) throw new Error('Workflow not found')
    const safeEntries = normalizeLogEntries(entries)
    if (safeEntries.length === 0) return workflow
    workflow.state.logs = workflow.state.logs || []
    workflow.state.logs.push(...safeEntries)
    markDirty()
    broadcastWorkflowUpdate()
    return workflow
  }
}

module.exports = {
  createAppendWorkflowLogsHandler,
  normalizeLogEntries,
}
