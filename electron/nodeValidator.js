const NODE_EXPECTED_OUTPUTS = {
  'fetch': ['fetch_contents'],
  'preprocess': ['cleaned_contents'],
  'research': ['researched_contents'],
  'topic_selection': ['selected_topic', 'selected_materials'],
  'facts': ['facts', 'selected_topics'],
  'script': ['script', 'edited_script'],
  'tts': ['voice_segments'],
  'audio_postprocess': ['audio_outputs'],
  'assets': ['cover_path'],
  'review': ['review_summary'],
  'publish': ['publish_outputs']
}

// Nodes that are allowed to produce empty output (graceful empty handling)
const ALLOW_EMPTY_NODES = ['fetch']

function validateNodeOutput(nodeName, result) {
  const expectedOutputs = NODE_EXPECTED_OUTPUTS[nodeName] || []
  const missingOutputs = []
  const emptyOutputs = []
  
  for (const outputKey of expectedOutputs) {
    if (!(outputKey in result)) {
      missingOutputs.push(outputKey)
    } else if (result[outputKey] === null || result[outputKey] === undefined) {
      emptyOutputs.push(outputKey)
    } else if (Array.isArray(result[outputKey]) && result[outputKey].length === 0) {
      emptyOutputs.push(outputKey)
    } else if (typeof result[outputKey] === 'object' && Object.keys(result[outputKey]).length === 0) {
      emptyOutputs.push(outputKey)
    }
  }
  
  if (missingOutputs.length > 0) {
    throw new Error(`节点 ${nodeName} 缺少必需的输出字段: ${missingOutputs.join(', ')}`)
  }
  
  // Allow fetch to produce empty output so the UI can surface source/config issues.
  if (emptyOutputs.length > 0 && !ALLOW_EMPTY_NODES.includes(nodeName)) {
    throw new Error(`节点 ${nodeName} 的输出字段为空: ${emptyOutputs.join(', ')}`)
  }
}

module.exports = { validateNodeOutput, NODE_EXPECTED_OUTPUTS }
