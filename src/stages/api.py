"""
Stage API Server

FastAPI 服务，为前端提供 Stage 运行接口
"""

import json
import logging
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# 确保 stages 模块已导入
from src.stages.registry import StageRegistry
from src.stages.impl import (
    FetchStage, ClusterStage, SelectionStage,
    ResearchStage, ScriptStage, AudioStage, PublishStage,
)

app = FastAPI(title="Podcast Pipeline API", version="1.0.0")

# CORS 配置
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("stages.api")

# 存储运行状态
run_state: Dict[str, Any] = {
    "run_id": None,
    "episode_date": None,
    "run_dir": None,
    "stage_outputs": {},  # stage_id -> output
    "stage_results": {},  # stage_id -> result
}


class RunStageRequest(BaseModel):
    stage_id: str
    episode_date: str
    input_override: Optional[Dict[str, Any]] = None
    use_previous_output: bool = True


class StageResponse(BaseModel):
    status: str
    stage_id: str
    output: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    duration_seconds: Optional[float] = None


class PipelineStateResponse(BaseModel):
    run_id: Optional[str]
    episode_date: Optional[str]
    run_dir: Optional[str]
    stage_outputs: Dict[str, Any]
    stage_results: Dict[str, Any]


# Stage 顺序
STAGE_ORDER = ["fetch", "cluster", "selection", "research", "script", "audio", "publish"]


def get_previous_stage(stage_id: str) -> Optional[str]:
    """获取上一个 Stage"""
    try:
        idx = STAGE_ORDER.index(stage_id)
        if idx > 0:
            return STAGE_ORDER[idx - 1]
    except ValueError:
        pass
    return None


def prepare_stage_input(
    stage_id: str,
    episode_date: str,
    run_dir: str,
    run_id: str,
    use_previous_output: bool,
    input_override: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """准备 Stage 输入"""
    base_input = {
        "run_id": run_id,
        "episode_date": episode_date,
        "run_dir": run_dir,
        "config": {},
    }
    
    # 根据 Stage 类型构建输入
    if stage_id == "fetch":
        base_input["sources"] = []
        base_input["timeout_seconds"] = 30
        
    elif stage_id == "cluster":
        base_input["items"] = {}
        base_input["cluster_config"] = {}
        if use_previous_output and "fetch" in run_state["stage_outputs"]:
            prev = run_state["stage_outputs"]["fetch"]
            base_input["items"] = prev.get("items_dedup", {})
            
    elif stage_id == "selection":
        base_input["clusters"] = []
        base_input["items"] = {}
        base_input["selection_config"] = {}
        if use_previous_output and "cluster" in run_state["stage_outputs"]:
            prev = run_state["stage_outputs"]["cluster"]
            base_input["clusters"] = prev.get("clusters", [])
            base_input["items"] = prev.get("items", {})
            
    elif stage_id == "research":
        base_input["items"] = []
        base_input["research_config"] = {"enabled": False}
        if use_previous_output and "selection" in run_state["stage_outputs"]:
            prev = run_state["stage_outputs"]["selection"]
            base_input["items"] = prev.get("items_selected", [])
            
    elif stage_id == "script":
        base_input["items"] = []
        base_input["channel"] = {}
        base_input["script_config"] = {}
        if use_previous_output:
            if "research" in run_state["stage_outputs"]:
                prev = run_state["stage_outputs"]["research"]
                base_input["items"] = prev.get("items_enhanced", [])
            elif "selection" in run_state["stage_outputs"]:
                prev = run_state["stage_outputs"]["selection"]
                base_input["items"] = prev.get("items_selected", [])
                
    elif stage_id == "audio":
        base_input["ssml"] = ""
        base_input["segments"] = []
        base_input["audio_config"] = {}
        if use_previous_output and "script" in run_state["stage_outputs"]:
            prev = run_state["stage_outputs"]["script"]
            base_input["ssml"] = prev.get("ssml", "")
            base_input["segments"] = prev.get("segments", [])
            
    elif stage_id == "publish":
        base_input["audio_paths"] = {}
        base_input["title"] = ""
        base_input["shownotes"] = ""
        base_input["tags"] = []
        base_input["publish_config"] = {}
        if use_previous_output:
            if "audio" in run_state["stage_outputs"]:
                prev = run_state["stage_outputs"]["audio"]
                base_input["audio_paths"] = prev.get("audio_paths", {})
            if "script" in run_state["stage_outputs"]:
                script = run_state["stage_outputs"]["script"]
                base_input["title"] = script.get("title", "")
                base_input["shownotes"] = script.get("shownotes", "")
                base_input["tags"] = script.get("tags", [])
    
    # 应用 override
    if input_override:
        base_input.update(input_override)
    
    return base_input


@app.get("/")
async def root():
    return {"status": "ok", "message": "Podcast Pipeline API"}


@app.get("/stages")
async def list_stages():
    """列出所有 Stage"""
    stages = []
    for stage_id in STAGE_ORDER:
        stage = StageRegistry.get(stage_id, {})
        stages.append({
            "id": stage_id,
            "name": stage.name,
            "version": stage.version,
        })
    return {"stages": stages}


@app.get("/state", response_model=PipelineStateResponse)
async def get_state():
    """获取当前 Pipeline 状态"""
    return PipelineStateResponse(
        run_id=run_state["run_id"],
        episode_date=run_state["episode_date"],
        run_dir=run_state["run_dir"],
        stage_outputs=run_state["stage_outputs"],
        stage_results=run_state["stage_results"],
    )


@app.post("/reset")
async def reset_state():
    """重置 Pipeline 状态"""
    run_state["run_id"] = None
    run_state["episode_date"] = None
    run_state["run_dir"] = None
    run_state["stage_outputs"] = {}
    run_state["stage_results"] = {}
    return {"status": "ok", "message": "State reset"}


@app.post("/run", response_model=StageResponse)
async def run_stage(request: RunStageRequest):
    """运行单个 Stage"""
    stage_id = request.stage_id
    episode_date = request.episode_date
    
    # 验证 Stage 存在
    if stage_id not in STAGE_ORDER:
        raise HTTPException(status_code=400, detail=f"Unknown stage: {stage_id}")
    
    # 初始化 run 状态
    if run_state["run_id"] is None or run_state["episode_date"] != episode_date:
        run_state["run_id"] = datetime.now().strftime("%H%M%S_%f")[:13]
        run_state["episode_date"] = episode_date
        run_dir = Path("out") / "runs" / episode_date.replace("-", "") / run_state["run_id"]
        run_dir.mkdir(parents=True, exist_ok=True)
        run_state["run_dir"] = str(run_dir)
        run_state["stage_outputs"] = {}
        run_state["stage_results"] = {}
    
    logger.info(f"Running stage: {stage_id}")
    
    try:
        # 获取 Stage 实例
        stage = StageRegistry.get(stage_id, {})
        
        # 准备输入
        input_data = prepare_stage_input(
            stage_id=stage_id,
            episode_date=episode_date,
            run_dir=run_state["run_dir"],
            run_id=run_state["run_id"],
            use_previous_output=request.use_previous_output,
            input_override=request.input_override,
        )
        
        # 运行 Stage
        result = stage.run_from_json(input_data)
        
        # 保存结果
        output_dict = result.output.model_dump() if result.output else {}
        run_state["stage_outputs"][stage_id] = output_dict
        run_state["stage_results"][stage_id] = {
            "status": result.status.value,
            "error": result.error,
            "duration_seconds": result.metadata.duration_seconds,
        }
        
        logger.info(f"Stage {stage_id} completed: {result.status.value}")
        
        return StageResponse(
            status=result.status.value,
            stage_id=stage_id,
            output=output_dict,
            error=result.error,
            duration_seconds=result.metadata.duration_seconds,
        )
        
    except Exception as e:
        logger.error(f"Stage {stage_id} failed: {e}")
        run_state["stage_results"][stage_id] = {
            "status": "failed",
            "error": str(e),
        }
        return StageResponse(
            status="failed",
            stage_id=stage_id,
            error=str(e),
        )


@app.get("/stage/{stage_id}/input")
async def get_stage_input(stage_id: str, episode_date: str = "2025-01-15"):
    """获取 Stage 的预期输入（基于上一 Stage 输出）"""
    if stage_id not in STAGE_ORDER:
        raise HTTPException(status_code=400, detail=f"Unknown stage: {stage_id}")
    
    run_id = run_state["run_id"] or "preview"
    run_dir = run_state["run_dir"] or "./out/preview"
    
    input_data = prepare_stage_input(
        stage_id=stage_id,
        episode_date=episode_date,
        run_dir=run_dir,
        run_id=run_id,
        use_previous_output=True,
    )
    
    return {"stage_id": stage_id, "input": input_data}


@app.get("/stage/{stage_id}/output")
async def get_stage_output(stage_id: str):
    """获取 Stage 的输出"""
    if stage_id not in STAGE_ORDER:
        raise HTTPException(status_code=400, detail=f"Unknown stage: {stage_id}")
    
    output = run_state["stage_outputs"].get(stage_id)
    result = run_state["stage_results"].get(stage_id)
    
    return {
        "stage_id": stage_id,
        "output": output,
        "result": result,
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
