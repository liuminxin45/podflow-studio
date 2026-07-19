"""
Node execution validator
验证节点执行结果，确保节点产生了预期的输出
"""

from typing import Any


def validate_node_output(
    node_name: str, state: dict[str, Any], expected_outputs: list[str]
) -> tuple[bool, str]:
    """
    验证节点是否产生了预期的输出

    Args:
        node_name: 节点名称
        state: 节点执行后的状态
        expected_outputs: 预期的输出字段列表

    Returns:
        (is_valid, error_message)
    """
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


# 定义当前 6 阶段流程中每个节点的预期输出
NODE_EXPECTED_OUTPUTS = {
    # discover
    "fetch": ["fetch_contents"],
    # organize
    "preprocess": ["cleaned_contents"],
    # ideate
    "research": ["researched_contents"],
    "topic_selection": ["selected_topic", "selected_materials"],
    "facts": ["facts", "selected_topics"],
    # write
    "script": ["script", "edited_script"],
    # produce
    "tts": ["voice_segments"],
    "audio_postprocess": ["audio_outputs"],
    "assets": ["cover_path"],
    # publish
    "review": ["review_summary"],
    "publish": ["publish_outputs"],
}

# 允许产出为空的节点（由 UI 暴露数据源/配置问题）
ALLOW_EMPTY_NODES = {"fetch"}


def _is_empty_value(value: Any) -> bool:
    if value is None:
        return True
    if isinstance(value, (list, dict, str)) and not value:
        return True
    return False


def validate_node_execution(node_name: str, state: dict[str, Any]) -> tuple[bool, str]:
    """
    验证节点执行结果

    Args:
        node_name: 节点名称
        state: 执行后的状态

    Returns:
        (is_valid, error_message)
    """
    # 检查是否有错误
    errors = state.get("errors", [])
    node_errors = [e for e in errors if e.get("node") == node_name]
    if node_errors:
        error_msgs = [e.get("message", "Unknown error") for e in node_errors]
        return False, f"节点 {node_name} 执行出错: {'; '.join(error_msgs)}"

    # 检查预期输出
    expected_outputs = NODE_EXPECTED_OUTPUTS.get(node_name, [])
    if expected_outputs:
        is_valid, msg = validate_node_output(node_name, state, expected_outputs)
        if not is_valid:
            return False, msg

        if node_name not in ALLOW_EMPTY_NODES:
            empty_outputs = [k for k in expected_outputs if _is_empty_value(state.get(k))]
            if empty_outputs:
                return False, f"节点 {node_name} 的输出字段为空: {', '.join(empty_outputs)}"

    return True, ""
