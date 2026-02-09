const NODE_EXPECTED_OUTPUTS = {
  'fetch': ['raw_contents'],
  'manual': ['raw_contents'],
  'preprocess': ['cleaned_contents'],
  'research': ['researched_contents'],
  'topic_selection': ['selected_topic', 'selected_materials'],
  'script': ['script'],
  'stages': ['stages'],
  'tts': ['audio_segments'],
  'audio_postprocess': ['final_audio_path'],
  'assets': ['cover_path'],
  'store': ['storage_info'],
  'publish': ['publish_status']
}

function validateNodeOutput(nodeName, result) {
  // Handle conditional validation for source nodes
  const sourceType = result.selected_source_type
  
  // If manual source is selected, skip validation for fetch node
  if (nodeName === 'fetch' && sourceType === 'manual') {
    return
  }
  
  // If fetch source is selected, skip validation for manual node
  if (nodeName === 'manual' && sourceType === 'fetch') {
    return
  }

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
  
  if (emptyOutputs.length > 0) {
    throw new Error(`节点 ${nodeName} 的输出字段为空: ${emptyOutputs.join(', ')}`)
  }
}

module.exports = { validateNodeOutput, NODE_EXPECTED_OUTPUTS }
