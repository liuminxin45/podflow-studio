const PIPELINE_NODES = [
  'fetch',
  'preprocess',
  'research',
  'topic_selection',
  'facts',
  'script',
  'tts',
  'audio_postprocess',
  'assets',
  'review',
  'publish',
]

const NODE_OUTPUTS = {
  fetch: ['fetch_contents', 'discover_meta'],
  preprocess: ['cleaned_contents'],
  research: ['researched_contents'],
  topic_selection: ['selected_topic', 'selected_topics', 'auto_selected_items', 'auto_rejected_items'],
  facts: ['facts', 'episode_brief'],
  script: ['script', 'edited_script', 'generation_request', 'generation_meta', 'script_snapshots', 'writing_meta'],
  tts: ['voice_segments', 'production_plan'],
  audio_postprocess: ['audio_outputs', 'subtitle_path'],
  assets: ['cover_path', 'intro_outro_paths'],
  review: ['review_summary', 'run_report'],
  publish: ['publish_outputs'],
}

const EMPTY_VALUES = {
  fetch_contents: [],
  discover_meta: {},
  cleaned_contents: [],
  researched_contents: [],
  selected_topic: {},
  selected_topics: [],
  auto_selected_items: [],
  auto_rejected_items: [],
  facts: [],
  episode_brief: {},
  script: {},
  edited_script: {},
  generation_request: {},
  generation_meta: {},
  script_snapshots: [],
  writing_meta: {},
  voice_segments: [],
  production_plan: {},
  audio_outputs: {},
  subtitle_path: '',
  cover_path: '',
  intro_outro_paths: {},
  review_summary: {},
  run_report: {},
  publish_outputs: {},
}

const FIELD_LABELS = {
  fetch_contents: '发现结果',
  discover_meta: '发现统计',
  cleaned_contents: '清洗内容',
  researched_contents: '研究结果',
  selected_topic: '主选题',
  selected_topics: '选题列表',
  auto_selected_items: '自动入选素材',
  auto_rejected_items: '自动排除素材',
  facts: '事实卡',
  episode_brief: '节目简报',
  script: '生成稿',
  edited_script: '编辑稿',
  generation_request: '生成请求',
  generation_meta: '生成记录',
  script_snapshots: '稿件快照',
  writing_meta: '写作状态',
  voice_segments: '语音片段',
  production_plan: '制作计划',
  audio_outputs: '音频成片',
  subtitle_path: '字幕',
  cover_path: '封面',
  intro_outro_paths: '片头片尾',
  review_summary: '审核结果',
  run_report: '运行报告',
  publish_outputs: '发布包',
}

function hasValue(value) {
  if (Array.isArray(value)) return value.length > 0
  if (value && typeof value === 'object') return Object.keys(value).length > 0
  return value !== '' && value !== null && value !== undefined
}

function nodeIndex(nodeName) {
  const index = PIPELINE_NODES.indexOf(String(nodeName || ''))
  if (index < 0) throw new Error(`Unsupported workflow node: ${String(nodeName || '')}`)
  return index
}

function buildRecoveryPlan(workflow, nodeName) {
  const startIndex = nodeIndex(nodeName)
  const rerunNodes = PIPELINE_NODES.slice(startIndex)
  const clearFields = [...new Set(rerunNodes.flatMap(node => NODE_OUTPUTS[node] || []))]
  const populatedFields = clearFields.filter(field => hasValue(workflow?.state?.[field]))
  const preserveFields = Object.keys(workflow?.state || {}).filter(field => !clearFields.includes(field))

  return {
    nodeName,
    recommendedNode: recommendRecoveryNode(workflow),
    rerunNodes,
    clearFields,
    clearLabels: clearFields.map(field => FIELD_LABELS[field] || field),
    populatedFields,
    populatedLabels: populatedFields.map(field => FIELD_LABELS[field] || field),
    preserveFields,
  }
}

function recommendRecoveryNode(workflow) {
  const failed = PIPELINE_NODES.find(node => workflow?.nodeExecutions?.[node]?.status === 'failed')
  if (failed) return failed
  if (workflow?.state?.downstream_stale?.is_stale) return 'tts'
  const lastCompletedIndex = PIPELINE_NODES.reduce((index, node, currentIndex) => (
    workflow?.nodeExecutions?.[node]?.status === 'completed' ? currentIndex : index
  ), -1)
  return PIPELINE_NODES[Math.min(lastCompletedIndex + 1, PIPELINE_NODES.length - 1)] || 'fetch'
}

function applyRecoveryPlan(workflow, plan) {
  for (const field of plan.clearFields) {
    workflow.state[field] = JSON.parse(JSON.stringify(EMPTY_VALUES[field]))
  }
  workflow.state.downstream_stale = {}
  workflow.state.errors = (workflow.state.errors || []).filter(error => !plan.rerunNodes.includes(error?.node))
  for (const node of plan.rerunNodes) {
    const history = workflow.nodeExecutions[node]?.history || []
    workflow.nodeExecutions[node] = { status: 'pending', history }
  }
  workflow.approvals = workflow.approvals || {}
  if (plan.rerunNodes.includes('script')) delete workflow.approvals.script
  return workflow
}

module.exports = {
  PIPELINE_NODES,
  NODE_OUTPUTS,
  applyRecoveryPlan,
  buildRecoveryPlan,
  recommendRecoveryNode,
}
