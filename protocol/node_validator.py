"""
Node execution validator
验证节点执行结果，确保节点产生了预期的输出
"""
from typing import Dict, Any, List


def validate_node_output(node_name: str, state: Dict[str, Any], expected_outputs: List[str]) -> tuple[bool, str]:
    """
    验证节点是否产生了预期的输出
    
    Args:
        node_name: 节点名称
        state: 节点执行后的状态
        expected_outputs: 预期的输出字段列表
    
    Returns:
        (is_valid, error_message)
    """
    # Handle conditional validation for source nodes
    source_type = state.get("selected_source_type")
    
    # If manual source is selected, skip validation for fetch node
    if node_name == 'fetch' and source_type == 'manual':
        return True, ""
    
    # If fetch source is selected, skip validation for manual node
    if node_name == 'manual' and source_type == 'fetch':
        return True, ""

    missing_outputs = []
    empty_outputs = []
    
    for output_key in expected_outputs:
        if output_key not in state:
            missing_outputs.append(output_key)
        elif state[output_key] is None:
            empty_outputs.append(output_key)
        elif isinstance(state[output_key], (list, dict, str)) and not state[output_key]:
            empty_outputs.append(output_key)
    
    if missing_outputs:
        return False, f"节点 {node_name} 缺少必需的输出字段: {', '.join(missing_outputs)}"
    
    if empty_outputs:
        return False, f"节点 {node_name} 的输出字段为空: {', '.join(empty_outputs)}"
    
    return True, ""


# 定义每个节点的预期输出
NODE_EXPECTED_OUTPUTS = {
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


def validate_node_execution(node_name: str, state: Dict[str, Any]) -> tuple[bool, str]:
    """
    验证节点执行结果
    
    Args:
        node_name: 节点名称
        state: 执行后的状态
    
    Returns:
        (is_valid, error_message)
    """
    # 检查是否有错误
    errors = state.get('errors', [])
    node_errors = [e for e in errors if e.get('node') == node_name]
    if node_errors:
        error_msgs = [e.get('message', 'Unknown error') for e in node_errors]
        return False, f"节点 {node_name} 执行出错: {'; '.join(error_msgs)}"
    
    # 检查预期输出
    expected_outputs = NODE_EXPECTED_OUTPUTS.get(node_name, [])
    if expected_outputs:
        return validate_node_output(node_name, state, expected_outputs)
    
    return True, ""
