"""Registered, typed AI business tasks for PodFlow Studio."""

from __future__ import annotations

import json
from dataclasses import dataclass
from types import SimpleNamespace
from typing import Any

from pydantic import BaseModel, ConfigDict, Field
from pydantic_ai import Agent, ModelSettings

from protocol.ai_contract import AITaskRequest, AITaskResult, AIUsage
from protocol.ai_provider import LLMError, create_local_agent_model, create_pydantic_model
from protocol.llm_runtime import LocalAgentRuntimeClient, resolve_llm_target


class TaskContext(BaseModel):
    model_config = ConfigDict(extra="forbid")

    context: dict[str, Any] = Field(default_factory=dict)


class ConnectionTestOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    ok: bool
    message: str


@dataclass(frozen=True)
class TaskSpec:
    instructions: str
    output_type: Any = dict[str, Any]
    temperature: float = 0.2
    max_tokens: int = 3000
    timeout: int = 180


TASKS: dict[str, TaskSpec] = {
    "discover.classify_news": TaskSpec("对输入新闻逐条分类。返回对象 {categories:[类别ID]}，数组顺序和长度必须与输入一致。", max_tokens=2000),
    "discover.analyze_topic": TaskSpec("分析每条新闻与核心主题的关系，只使用输入材料，返回对象 {items:[{index,score,decision,reason,angle}]}。", max_tokens=4000),
    "organize.plan_research": TaskSpec("你是严谨的中文播客研究编辑。制定结构化研究计划，覆盖事实、机制、影响、反证和听众价值。"),
    "organize.expand_knowledge": TaskSpec("扩展背景、机制、对照和反方知识；明确区分待核验知识与已给来源。"),
    "organize.assess_evidence": TaskSpec("逐条判断搜索结果能否服务报道目标，拒绝误命中、重复转载和无可核验贡献的内容。"),
    "organize.synthesize_research": TaskSpec("只依据输入来源综合研究结果，保留来源索引、冲突、限制和事实边界。", max_tokens=4200),
    "organize.verify_claim": TaskSpec("判断网页摘录能否直接支持待核验陈述；主题相关但无直接证据不算支持。", max_tokens=1000),
    "organize.ai_web_search": TaskSpec("使用模型可用的联网能力搜索并返回可核验来源；不得编造URL。", max_tokens=3000),
    "organize.verify_web_search": TaskSpec("使用联网能力查找当天科技新闻并返回至少两个含URL和摘录的独立来源。", max_tokens=1000),
    "organize.select_deep_dive": TaskSpec("按输入评价维度选择最值得深挖的主题，严格返回结构化判断。", max_tokens=4000),
    "writing.optimize_quick_news": TaskSpec("在不改变事实绑定和来源边界的前提下优化快讯口播，返回结构化结果。", max_tokens=1600),
    "settings.connection_test": TaskSpec(
        "这是模型连接测试。仅确认当前模型可完成结构化请求。",
        output_type=ConnectionTestOutput,
        temperature=0,
        max_tokens=100,
        timeout=30,
    ),
}


def _build_model(target_config: dict[str, Any]):
    config = SimpleNamespace(**target_config)
    target = resolve_llm_target(config)
    if not target.configured:
        raise LLMError("AI target is not configured", "CONFIG", target.masked_summary())
    if target.provider_kind != "local_agent":
        return target, create_pydantic_model(target)
    backend = LocalAgentRuntimeClient(
        target.local_agent_id,
        target.model,
        local_agent_command=target.local_agent_command,
        local_agent_args=target.local_agent_args,
        local_agent_output_mode=target.local_agent_output_mode,
    )
    return target, create_local_agent_model(backend, target.local_agent_id)


def run_ai_task(request_payload: dict[str, Any], target_config: dict[str, Any]) -> dict[str, Any]:
    request = AITaskRequest.model_validate(request_payload)
    spec = TASKS.get(request.task_id)
    if spec is None:
        raise LLMError(f"Unknown AI task: {request.task_id}", "CONFIG")
    task_input = TaskContext.model_validate(request.input)
    target, model = _build_model(target_config)
    agent = Agent(
        model,
        output_type=spec.output_type,
        instructions=spec.instructions,
        retries=2,
        name=request.task_id.replace(".", "_"),
    )
    result = agent.run_sync(
        json.dumps(task_input.context, ensure_ascii=False),
        run_id=request.request_id,
        model_settings=ModelSettings(
            temperature=spec.temperature,
            max_tokens=spec.max_tokens,
            timeout=spec.timeout,
        ),
    )
    output = result.output
    output_payload = output.model_dump(mode="json") if isinstance(output, BaseModel) else output
    if not isinstance(output_payload, dict):
        output_payload = {"value": output_payload}
    usage = result.usage()
    return AITaskResult(
        request_id=request.request_id,
        task_id=request.task_id,
        output=output_payload,
        usage=AIUsage(
            input_tokens=usage.input_tokens or 0,
            output_tokens=usage.output_tokens or 0,
            total_tokens=usage.total_tokens or 0,
            requests=usage.requests,
        ),
    ).model_dump(mode="json")
