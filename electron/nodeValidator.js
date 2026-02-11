const NODE_EXPECTED_OUTPUTS = {
  'fetch': ['fetch_contents'],
  'manual': ['manual_contents'],
  'merge': ['raw_contents'],
  'preprocess': ['cleaned_contents'],
  'research': ['researched_contents'],
  'topic_selection': ['selected_topic', 'selected_materials'],
  'script': ['script', 'stages'],
  'tts': ['audio_segments'],
  'audio_postprocess': ['final_audio_path'],
  'assets': ['cover_path'],
  'review': ['review_summary'],
  'publish': ['publish_status']
}

// Nodes that are allowed to produce empty output (graceful empty handling)
const ALLOW_EMPTY_NODES = ['fetch', 'manual']

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
  
  // Allow fetch and manual to produce empty output (the other channel may have data)
  if (emptyOutputs.length > 0 && !ALLOW_EMPTY_NODES.includes(nodeName)) {
    throw new Error(`节点 ${nodeName} 的输出字段为空: ${emptyOutputs.join(', ')}`)
  }
}

module.exports = { validateNodeOutput, NODE_EXPECTED_OUTPUTS }
