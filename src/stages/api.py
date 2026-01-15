"""
Stage API Server

FastAPI 服务，为前端提供 Stage 运行接口
"""

import json
import logging
import asyncio
import yaml
import httpx
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, List, Optional
from queue import Queue

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from src.stages.state_manager import StateManager

# 确保 stages 模块已导入
from src.stages.registry import StageRegistry
from src.stages.impl import (
    FetchStage, ClusterStage, SelectionStage,
    ResearchStage, ScriptStage, AudioStage, PublishStage,
)

# 导入 fetch 模块以注册所有 fetchers
import src.fetch  # noqa: F401

app = FastAPI(title="Podcast Pipeline API", version="1.0.0")

# CORS 配置
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:5174", "http://127.0.0.1:5174"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 日志配置
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("stages.api")

# 日志队列用于流式传输
log_queue: Queue = Queue(maxsize=1000)

class QueueHandler(logging.Handler):
    """自定义日志处理器，将日志发送到队列"""
    def emit(self, record):
        try:
            log_entry = {
                "timestamp": datetime.fromtimestamp(record.created).isoformat(),
                "level": record.levelname.lower(),
                "message": record.getMessage(),
                "stage": getattr(record, 'stage', None)
            }
            if not log_queue.full():
                log_queue.put(log_entry)
        except Exception:
            pass

# 添加队列处理器到根日志记录器
queue_handler = QueueHandler()
queue_handler.setLevel(logging.INFO)
logging.getLogger().addHandler(queue_handler)
logging.getLogger().setLevel(logging.INFO)

# 加载配置
def load_config() -> Dict[str, Any]:
    """加载配置文件"""
    config_path = Path("config/optimized_settings.yaml")
    if config_path.exists():
        with open(config_path, 'r', encoding='utf-8') as f:
            return yaml.safe_load(f)
    logger.warning("Config file not found, using defaults")
    return {}

config = load_config()

# 全局状态管理器
state_manager = StateManager()

# 存储运行状态
run_state: Dict[str, Any] = {
    "run_id": None,
    "episode_date": None,
    "run_dir": None,
    "stage_outputs": {},
    "stage_results": {},
}

def load_persisted_state():
    """从磁盘加载持久化状态"""
    global run_state
    persisted = state_manager.load_state()
    run_state["run_id"] = persisted.get("run_id")
    run_state["episode_date"] = persisted.get("episode_date")
    run_state["run_dir"] = persisted.get("run_dir")
    run_state["stage_outputs"] = persisted.get("stage_outputs", {})
    run_state["stage_results"] = persisted.get("stage_results", {})
    logger.info(f"Loaded persisted state: run_id={run_state['run_id']}, outputs={len(run_state['stage_outputs'])} stages")

def save_persisted_state():
    """保存状态到磁盘"""
    state_manager.save_run_metadata(
        run_id=run_state["run_id"],
        episode_date=run_state["episode_date"],
        run_dir=run_state["run_dir"]
    )
    for stage_id, output in run_state["stage_outputs"].items():
        state_manager.save_stage_output(stage_id, output)
    for stage_id, result in run_state["stage_results"].items():
        state_manager.save_stage_result(stage_id, result)

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
        # 从配置加载 sources
        sources_config = config.get("sources", {}).get("rss", [])
        sources = []
        for src in sources_config:
            if src.get("enabled", False):
                # 转换为 SourceConfig 格式
                for url in src.get("urls", []):
                    sources.append({
                        "name": src["name"],
                        "fetcher": src["fetcher"],
                        "url": url,
                        "enabled": True,
                        "extra": {"category": src.get("category", "general")}
                    })
        
        base_input["sources"] = sources
        base_input["timeout_seconds"] = 30
        
        if len(sources) == 0:
            logger.warning("No enabled sources found in configuration!", extra={'stage': 'fetch'})
        else:
            logger.info(f"Prepared fetch input with {len(sources)} sources", extra={'stage': 'fetch'})
            for i, src in enumerate(sources[:3], 1):  # Log first 3 sources
                logger.info(f"  Source {i}: {src['name']} ({src['fetcher']}) - {src.get('url', 'no url')}", extra={'stage': 'fetch'})
        
    elif stage_id == "cluster":
        base_input["items"] = {}
        base_input["cluster_config"] = {}
        if use_previous_output and "fetch" in run_state["stage_outputs"]:
            prev = run_state["stage_outputs"]["fetch"]
            items_dedup = prev.get("items_dedup", {})
            base_input["items"] = items_dedup
            logger.info(f"Cluster input: received {len(items_dedup)} items from fetch", extra={'stage': 'cluster'})
        else:
            logger.warning(f"Cluster input: use_previous_output={use_previous_output}, fetch in outputs={('fetch' in run_state['stage_outputs'])}", extra={'stage': 'cluster'})
            
    elif stage_id == "selection":
        base_input["clusters"] = []
        base_input["items"] = {}
        
        # 从配置加载 selection_config
        selection_cfg = config.get("selection", {})
        auto_topic_cfg = config.get("auto_topic", {})
        channel_cfg = config.get("channel", {})
        
        base_input["selection_config"] = {
            "max_clusters": selection_cfg.get("constraints", {}).get("max_clusters", 5),
            "weights": {
                "freshness": 0.4,
                "impact": 0.3,
                "source_trust": 0.2,
                "quality": 0.1,
            },
            "auto_topic_enabled": auto_topic_cfg.get("enabled", False),
            "strategy": channel_cfg.get("auto_topic_strategy", "balanced"),
        }
        
        if use_previous_output and "cluster" in run_state["stage_outputs"]:
            prev = run_state["stage_outputs"]["cluster"]
            clusters = prev.get("clusters", [])
            items = prev.get("items", {})
            base_input["clusters"] = clusters
            base_input["items"] = items
            logger.info(f"Selection input: received {len(clusters)} clusters, {len(items)} items from cluster", extra={'stage': 'selection'})
            logger.info(f"Selection config: auto_topic_enabled={base_input['selection_config']['auto_topic_enabled']}, strategy={base_input['selection_config']['strategy']}", extra={'stage': 'selection'})
        else:
            logger.warning(f"Selection input: use_previous_output={use_previous_output}, cluster in outputs={('cluster' in run_state['stage_outputs'])}", extra={'stage': 'selection'})
            
    elif stage_id == "research":
        base_input["items"] = []
        
        # Load research config from settings
        research_cfg = config.get("research", {})
        base_input["research_config"] = {
            "enabled": research_cfg.get("enabled", True),
            "provider": research_cfg.get("provider", "anspire"),
            "max_total_claims": research_cfg.get("max_items", 20),
            "max_claims_per_item": research_cfg.get("max_sources", 5),
            "min_claim_confidence": 0.6,
            "include_opinions": False,
            "include_contrast_queries": True,
        }
        
        logger.info(f"Research config: enabled={base_input['research_config']['enabled']}, provider={base_input['research_config']['provider']}", extra={'stage': 'research'})
        
        if use_previous_output and "selection" in run_state["stage_outputs"]:
            prev = run_state["stage_outputs"]["selection"]
            items_selected = prev.get("items_selected", [])
            base_input["items"] = items_selected
            logger.info(f"Research input: received {len(items_selected)} items from selection", extra={'stage': 'research'})
        else:
            logger.warning(f"Research input: use_previous_output={use_previous_output}, selection in outputs={('selection' in run_state['stage_outputs'])}", extra={'stage': 'research'})
            
    elif stage_id == "script":
        base_input["items"] = []
        base_input["channel"] = {}
        base_input["script_config"] = {}
        if use_previous_output:
            if "research" in run_state["stage_outputs"]:
                prev = run_state["stage_outputs"]["research"]
                items_enhanced = prev.get("items_enhanced", [])
                base_input["items"] = items_enhanced
                logger.info(f"Script input: received {len(items_enhanced)} items from research", extra={'stage': 'script'})
            elif "selection" in run_state["stage_outputs"]:
                prev = run_state["stage_outputs"]["selection"]
                items_selected = prev.get("items_selected", [])
                base_input["items"] = items_selected
                logger.info(f"Script input: received {len(items_selected)} items from selection (research skipped)", extra={'stage': 'script'})
            else:
                logger.warning(f"Script input: no previous stage output found", extra={'stage': 'script'})
                
    elif stage_id == "audio":
        base_input["ssml"] = ""
        base_input["segments"] = []
        base_input["audio_config"] = {}
        if use_previous_output and "script" in run_state["stage_outputs"]:
            prev = run_state["stage_outputs"]["script"]
            ssml = prev.get("ssml", "")
            segments = prev.get("segments", [])
            base_input["ssml"] = ssml
            base_input["segments"] = segments
            logger.info(f"Audio input: received {len(segments)} segments from script", extra={'stage': 'audio'})
        else:
            logger.warning(f"Audio input: use_previous_output={use_previous_output}, script in outputs={('script' in run_state['stage_outputs'])}", extra={'stage': 'audio'})
            
    elif stage_id == "publish":
        base_input["audio_paths"] = {}
        base_input["title"] = ""
        base_input["shownotes"] = ""
        base_input["tags"] = []
        base_input["publish_config"] = {}
        if use_previous_output:
            if "audio" in run_state["stage_outputs"]:
                prev = run_state["stage_outputs"]["audio"]
                logger.info(f"Publish input: received audio output from audio stage", extra={'stage': 'publish'})
            else:
                logger.warning(f"Publish input: no audio output found", extra={'stage': 'publish'})
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
    """重置整个 Pipeline 状态"""
    run_state["run_id"] = None
    run_state["episode_date"] = None
    run_state["run_dir"] = None
    run_state["stage_outputs"] = {}
    run_state["stage_results"] = {}
    
    # 持久化重置
    state_manager.reset_all()
    
    return {"status": "ok", "message": "State reset"}


@app.post("/stage/{stage_id}/reset")
async def reset_stage(stage_id: str):
    """重置单个 Stage 的状态"""
    if stage_id not in STAGE_ORDER:
        raise HTTPException(status_code=400, detail=f"Unknown stage: {stage_id}")
    
    # 清除内存状态
    if stage_id in run_state["stage_outputs"]:
        del run_state["stage_outputs"][stage_id]
    if stage_id in run_state["stage_results"]:
        del run_state["stage_results"][stage_id]
    
    # 持久化重置
    state_manager.reset_stage(stage_id)
    
    return {"status": "ok", "message": f"Stage {stage_id} reset"}


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
    
    logger.info(f"Running stage: {stage_id}", extra={'stage': stage_id})
    
    try:
        # 获取 Stage 实例
        stage = StageRegistry.get(stage_id, {})
        logger.info(f"Stage instance: {stage.__class__.__name__}", extra={'stage': stage_id})
        
        # 准备输入
        input_data = prepare_stage_input(
            stage_id=stage_id,
            episode_date=episode_date,
            run_dir=run_state["run_dir"],
            run_id=run_state["run_id"],
            use_previous_output=request.use_previous_output,
            input_override=request.input_override,
        )
        
        logger.debug(f"Input data keys: {list(input_data.keys())}", extra={'stage': stage_id})
        
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
        
        # 持久化保存
        save_persisted_state()
        
        logger.info(f"Stage {stage_id} completed: {result.status.value}", extra={'stage': stage_id})
        
        return StageResponse(
            status=result.status.value,
            stage_id=stage_id,
            output=output_dict,
            error=result.error,
            duration_seconds=result.metadata.duration_seconds,
        )
        
    except Exception as e:
        logger.error(f"Stage {stage_id} failed: {e}", extra={'stage': stage_id})
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
    
    # Don't return anything if stage hasn't run yet
    if output is None:
        output = {}
    
    return {
        "stage_id": stage_id,
        "output": output,
        "result": result,
    }


@app.get("/stage/{stage_id}/config")
async def get_stage_config(stage_id: str):
    """获取 Stage 的配置参数"""
    if stage_id not in STAGE_ORDER:
        raise HTTPException(status_code=400, detail=f"Unknown stage: {stage_id}")
    
    stage_config = {}
    
    if stage_id == "fetch":
        sources_config = config.get("sources", {}).get("rss", [])
        stage_config = {
            "sources": sources_config,
            "timeout_seconds": 30,
            "total_sources": len(sources_config),
            "enabled_sources": len([s for s in sources_config if s.get("enabled", False)])
        }
    elif stage_id == "cluster":
        stage_config = config.get("selection", {}).get("clustering", {})
    elif stage_id == "selection":
        stage_config = config.get("selection", {}).get("constraints", {})
    elif stage_id == "research":
        stage_config = config.get("research", {})
    elif stage_id == "script":
        stage_config = {
            "llm": config.get("llm", {}),
            "channel": config.get("channel", {})
        }
    elif stage_id == "audio":
        stage_config = config.get("tts", {})
    elif stage_id == "publish":
        stage_config = config.get("publish", {})
    
    return {
        "stage_id": stage_id,
        "config": stage_config
    }


class FetchConfigUpdate(BaseModel):
    sources: List[Dict[str, Any]]


@app.put("/stage/fetch/config")
async def update_fetch_config(update: FetchConfigUpdate):
    """更新 Fetch Stage 的配置"""
    global config
    
    if "sources" not in config:
        config["sources"] = {}
    config["sources"]["rss"] = update.sources
    
    config_path = Path("config/optimized_settings.yaml")
    try:
        with open(config_path, 'w', encoding='utf-8') as f:
            yaml.dump(config, f, allow_unicode=True, default_flow_style=False)
        logger.info(f"Fetch config updated: {len(update.sources)} sources")
        return {"status": "ok", "message": f"Updated {len(update.sources)} sources"}
    except Exception as e:
        logger.error(f"Failed to save config: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to save config: {e}")


@app.get("/global/config")
async def get_global_config():
    """获取全局配置"""
    return {
        "config": {
            "llm": config.get("llm", {}),
            "channel": config.get("channel", {}),
            "output": config.get("output", {}),
        }
    }


@app.put("/global/config")
async def update_global_config(update: Dict[str, Any]):
    """更新全局配置"""
    global config
    
    # Update LLM config
    if "llm" in update:
        if "llm" not in config:
            config["llm"] = {}
        for key, value in update["llm"].items():
            config["llm"][key] = value
    
    # Update Channel config
    if "channel" in update:
        if "channel" not in config:
            config["channel"] = {}
        for key, value in update["channel"].items():
            config["channel"][key] = value
    
    # Update Output config
    if "output" in update:
        if "output" not in config:
            config["output"] = {}
        for key, value in update["output"].items():
            config["output"][key] = value
    
    # Save to file
    config_path = Path("config/optimized_settings.yaml")
    try:
        with open(config_path, 'w', encoding='utf-8') as f:
            yaml.dump(config, f, allow_unicode=True, default_flow_style=False)
        logger.info("Global config updated")
        return {"status": "ok", "message": "Global configuration updated"}
    except Exception as e:
        logger.error(f"Failed to save global config: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to save config: {e}")


@app.put("/stage/{stage_id}/config")
async def update_stage_config(stage_id: str, update: Dict[str, Any]):
    """更新任意 Stage 的配置"""
    global config
    
    if stage_id not in STAGE_ORDER:
        raise HTTPException(status_code=400, detail=f"Unknown stage: {stage_id}")
    
    # 更新内存中的配置
    if stage_id == "cluster":
        if "selection" not in config:
            config["selection"] = {}
        if "clustering" not in config["selection"]:
            config["selection"]["clustering"] = {}
        config["selection"]["clustering"].update(update)
    elif stage_id == "selection":
        if "selection" not in config:
            config["selection"] = {}
        if "constraints" not in config["selection"]:
            config["selection"]["constraints"] = {}
        config["selection"]["constraints"].update(update)
    elif stage_id == "research":
        if "research" not in config:
            config["research"] = {}
        config["research"].update(update)
    elif stage_id == "script":
        if "llm" in update:
            if "llm" not in config:
                config["llm"] = {}
            config["llm"].update(update["llm"])
        if "channel" in update:
            if "channel" not in config:
                config["channel"] = {}
            config["channel"].update(update["channel"])
    elif stage_id == "audio":
        if "tts" not in config:
            config["tts"] = {}
        config["tts"].update(update)
    elif stage_id == "publish":
        if "publish" not in config:
            config["publish"] = {}
        config["publish"].update(update)
    
    # 保存到文件
    config_path = Path("config/optimized_settings.yaml")
    try:
        with open(config_path, 'w', encoding='utf-8') as f:
            yaml.dump(config, f, allow_unicode=True, default_flow_style=False)
        logger.info(f"{stage_id} config updated")
        return {"status": "ok", "message": f"Updated {stage_id} configuration"}
    except Exception as e:
        logger.error(f"Failed to save config: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to save config: {e}")


# ============ LLM Provider Management ============

class LLMProviderModel(BaseModel):
    id: str
    name: str
    apiUrl: str
    modelsUrl: Optional[str] = None
    apiKey: str
    models: List[str] = Field(default_factory=list)
    defaultModel: str = ""
    isCustom: bool = False


class TestConnectionRequest(BaseModel):
    apiUrl: str
    modelsUrl: Optional[str] = None
    apiKey: str


class SelectProviderRequest(BaseModel):
    provider_id: str


class FetchModelsRequest(BaseModel):
    modelsUrl: str
    apiKey: str


# Default LLM providers with BLTCY preset
DEFAULT_PROVIDERS = {
    "deepseek": {
        "id": "deepseek",
        "name": "DeepSeek",
        "apiUrl": "https://api.deepseek.com/v1/chat/completions",
        "modelsUrl": "https://api.deepseek.com/v1/models",
        "apiKey": "",
        "models": ["deepseek-chat", "deepseek-coder"],
        "defaultModel": "deepseek-chat",
        "isCustom": False
    },
    "moonshot": {
        "id": "moonshot",
        "name": "Moonshot AI",
        "apiUrl": "https://api.moonshot.cn/v1/chat/completions",
        "modelsUrl": "https://api.moonshot.cn/v1/models",
        "apiKey": "",
        "models": ["moonshot-v1-8k", "moonshot-v1-32k", "moonshot-v1-128k"],
        "defaultModel": "moonshot-v1-8k",
        "isCustom": False
    },
    "openai": {
        "id": "openai",
        "name": "OpenAI",
        "apiUrl": "https://api.openai.com/v1/chat/completions",
        "modelsUrl": "https://api.openai.com/v1/models",
        "apiKey": "",
        "models": ["gpt-4", "gpt-4-turbo", "gpt-3.5-turbo"],
        "defaultModel": "gpt-4",
        "isCustom": False
    },
    "bltcy": {
        "id": "bltcy",
        "name": "BLTCY AI",
        "apiUrl": "https://api.bltcy.ai/v1/chat/completions",
        "modelsUrl": "https://api.bltcy.ai/v1/models",
        "apiKey": "<api-key>",
        "models": [],
        "defaultModel": "gpt-5.2-all",
        "isCustom": False
    }
}


def load_llm_providers() -> Dict[str, Dict[str, Any]]:
    """Load LLM providers from config"""
    providers_config = config.get("llm_providers", {})
    
    # Merge default providers with custom ones
    all_providers = DEFAULT_PROVIDERS.copy()
    
    # Update default providers with saved API keys
    for provider_id, provider_data in providers_config.items():
        if provider_id in all_providers:
            all_providers[provider_id].update(provider_data)
        else:
            all_providers[provider_id] = provider_data
    
    return all_providers


def save_llm_providers(providers: Dict[str, Dict[str, Any]]):
    """Save LLM providers to config"""
    global config
    config["llm_providers"] = providers
    
    config_path = Path("config/optimized_settings.yaml")
    try:
        with open(config_path, 'w', encoding='utf-8') as f:
            yaml.dump(config, f, allow_unicode=True, default_flow_style=False)
    except Exception as e:
        logger.error(f"Failed to save LLM providers: {e}")
        raise


@app.get("/llm/providers")
async def get_llm_providers():
    """Get all LLM providers"""
    providers = load_llm_providers()
    selected_provider = config.get("llm", {}).get("provider", "deepseek")
    
    return {
        "providers": list(providers.values()),
        "selected_provider": selected_provider
    }


@app.post("/llm/providers")
async def add_or_update_llm_provider(provider: LLMProviderModel):
    """Add or update an LLM provider"""
    providers = load_llm_providers()
    
    providers[provider.id] = provider.model_dump()
    save_llm_providers(providers)
    
    logger.info(f"LLM provider {provider.id} saved")
    return {"status": "ok", "message": f"Provider {provider.name} saved"}


@app.delete("/llm/providers/{provider_id}")
async def delete_llm_provider(provider_id: str):
    """Delete a custom LLM provider"""
    providers = load_llm_providers()
    
    if provider_id not in providers:
        raise HTTPException(status_code=404, detail="Provider not found")
    
    if not providers[provider_id].get("isCustom", False):
        raise HTTPException(status_code=400, detail="Cannot delete default provider")
    
    del providers[provider_id]
    save_llm_providers(providers)
    
    logger.info(f"LLM provider {provider_id} deleted")
    return {"status": "ok", "message": "Provider deleted"}


@app.post("/llm/providers/select")
async def select_llm_provider(request: SelectProviderRequest):
    """Select active LLM provider"""
    global config
    
    providers = load_llm_providers()
    if request.provider_id not in providers:
        raise HTTPException(status_code=404, detail="Provider not found")
    
    if "llm" not in config:
        config["llm"] = {}
    
    provider = providers[request.provider_id]
    config["llm"]["provider"] = request.provider_id
    
    # Update API key and base URL if available
    if provider.get("apiKey"):
        config["llm"]["api_key"] = provider["apiKey"]
    if provider.get("apiUrl"):
        config["llm"]["base_url"] = provider["apiUrl"]
    if provider.get("defaultModel"):
        config["llm"]["model"] = provider["defaultModel"]
    
    # Save to file
    config_path = Path("config/optimized_settings.yaml")
    try:
        with open(config_path, 'w', encoding='utf-8') as f:
            yaml.dump(config, f, allow_unicode=True, default_flow_style=False)
        logger.info(f"Selected LLM provider: {request.provider_id}")
        return {"status": "ok", "message": f"Provider {request.provider_id} selected"}
    except Exception as e:
        logger.error(f"Failed to save config: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to save config: {e}")


@app.post("/llm/test-connection")
async def test_llm_connection(request: TestConnectionRequest):
    """Test LLM provider connection"""
    try:
        # Validate API key
        if not request.apiKey or not request.apiKey.strip():
            return {
                "success": False,
                "message": "API key is required"
            }
        
        async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
            # Test basic connectivity with models endpoint if available
            if request.modelsUrl:
                headers = {"Authorization": f"Bearer {request.apiKey.strip()}"}
                try:
                    response = await client.get(request.modelsUrl, headers=headers)
                    
                    if response.status_code == 200:
                        try:
                            data = response.json()
                            models = []
                            
                            # Parse models from response - handle different formats
                            if "data" in data:
                                models = [m.get("id", m.get("model", "")) for m in data["data"] if isinstance(m, dict)]
                            elif isinstance(data, list):
                                models = [m.get("id", m.get("model", "")) for m in data if isinstance(m, dict)]
                            elif "object" in data and data.get("object") == "list":
                                models = [m.get("id", m.get("model", "")) for m in data.get("data", []) if isinstance(m, dict)]
                            
                            # Filter out empty strings
                            models = [m for m in models if m]
                            
                            return {
                                "success": True,
                                "message": f"Connection successful! Found {len(models)} models.",
                                "models": models
                            }
                        except Exception as parse_error:
                            logger.warning(f"Failed to parse models response: {parse_error}")
                            return {
                                "success": True,
                                "message": "Connection successful but could not parse models list.",
                                "models": []
                            }
                    elif response.status_code == 401:
                        return {
                            "success": False,
                            "message": "Authentication failed: Invalid API key"
                        }
                    elif response.status_code == 403:
                        return {
                            "success": False,
                            "message": "Access forbidden: Check API key permissions"
                        }
                    elif response.status_code == 502:
                        return {
                            "success": False,
                            "message": "Bad Gateway (502): Provider API may be temporarily unavailable"
                        }
                    elif response.status_code == 503:
                        return {
                            "success": False,
                            "message": "Service Unavailable (503): Provider API is down"
                        }
                    else:
                        return {
                            "success": False,
                            "message": f"Connection failed: HTTP {response.status_code} - {response.text[:100] if response.text else 'No details'}"
                        }
                except httpx.HTTPError as http_err:
                    return {
                        "success": False,
                        "message": f"HTTP error: {str(http_err)}"
                    }
            else:
                # Just test if the API URL is reachable
                headers = {"Authorization": f"Bearer {request.apiKey.strip()}"}
                try:
                    response = await client.get(request.apiUrl.replace("/chat/completions", "/models"), headers=headers)
                    
                    if response.status_code in [200, 404]:  # 404 is ok if models endpoint doesn't exist
                        return {
                            "success": True,
                            "message": "Connection successful!",
                            "models": []
                        }
                    else:
                        return {
                            "success": False,
                            "message": f"Connection failed: HTTP {response.status_code}"
                        }
                except httpx.HTTPError:
                    # If models endpoint fails, try a simple HEAD request to base URL
                    try:
                        base_url = request.apiUrl.rsplit('/', 1)[0]
                        response = await client.head(base_url, headers=headers)
                        return {
                            "success": True,
                            "message": "Base URL reachable (models endpoint not available)",
                            "models": []
                        }
                    except Exception:
                        return {
                            "success": False,
                            "message": "Could not reach API endpoint"
                        }
    except httpx.TimeoutException:
        return {
            "success": False,
            "message": "Connection timeout (15s exceeded)"
        }
    except Exception as e:
        logger.error(f"Connection test error: {e}")
        return {
            "success": False,
            "message": f"Connection error: {str(e)}"
        }


@app.post("/llm/fetch-models")
async def fetch_llm_models(request: FetchModelsRequest):
    """Fetch available models from LLM provider"""
    try:
        if not request.apiKey or not request.apiKey.strip():
            return {
                "success": False,
                "message": "API key is required"
            }
        
        async with httpx.AsyncClient(timeout=10.0) as client:
            headers = {"Authorization": f"Bearer {request.apiKey.strip()}"}
            response = await client.get(request.modelsUrl, headers=headers)
            
            if response.status_code == 200:
                data = response.json()
                models = []
                
                # Parse models from response
                if "data" in data:
                    models = [m.get("id", m.get("model", "")) for m in data["data"]]
                elif isinstance(data, list):
                    models = [m.get("id", m.get("model", "")) for m in data]
                
                return {
                    "success": True,
                    "models": models
                }
            else:
                return {
                    "success": False,
                    "message": f"Failed to fetch models: HTTP {response.status_code}"
                }
    except Exception as e:
        return {
            "success": False,
            "message": f"Error fetching models: {str(e)}"
        }


@app.get("/logs/stream")
async def stream_logs():
    """流式传输日志到前端"""
    logger.info("Client connected to log stream")
    
    async def log_generator():
        try:
            # Send initial connection message
            yield f"data: {{\"timestamp\": \"{datetime.now().isoformat()}\", \"level\": \"info\", \"message\": \"Log stream connected\", \"stage\": null}}\n\n"
            
            while True:
                if not log_queue.empty():
                    log_entry = log_queue.get()
                    yield f"data: {json.dumps(log_entry)}\n\n"
                await asyncio.sleep(0.1)
        except asyncio.CancelledError:
            logger.info("Client disconnected from log stream")
            raise
    
    return StreamingResponse(
        log_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        }
    )


logger.info("Starting Podcast Pipeline API server...")
logger.info(f"Configuration loaded, sources found: {len(config.get('sources', {}).get('rss', []))}")

# 加载持久化状态
load_persisted_state()

if __name__ == "__main__":
    import uvicorn
    logger.info("Starting Podcast Pipeline API server...")
    uvicorn.run(app, host="0.0.0.0", port=8000)
