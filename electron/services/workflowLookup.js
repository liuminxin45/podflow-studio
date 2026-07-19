function resolveWorkflowById(workflowId, currentWorkflow, loadSavedWorkflow) {
  const id = String(workflowId || '')
  if (!id) return null
  if (String(currentWorkflow?.id || '') === id) return currentWorkflow
  return loadSavedWorkflow(id)
}

module.exports = { resolveWorkflowById }
