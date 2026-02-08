# 示例：为Research节点添加新参数

## 场景

假设你想为research节点添加以下新功能：
1. 搜索深度控制
2. 启用事实核查
3. 自定义提示词

## 步骤演示

### 当前配置（修改前）

`nodes/research/config.py`:
```python
from dataclasses import dataclass
from typing import Dict, Any

@dataclass
class ResearchConfig:
    enable_web_search: bool = False
    max_search_results: int = 5
    llm_model: str = "gpt-4o-mini"
    api_key: str = ""
    api_base: str = ""
    temperature: float = 0.5

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "ResearchConfig":
        defaults = {"enable_web_search": False, "max_search_results": 5,
                    "llm_model": "gpt-4o-mini", "api_key": "", "api_base": "", "temperature": 0.5}
        merged = {**defaults, **data}
        return cls(**{k: v for k, v in merged.items() if k in cls.__dataclass_fields__})
```

### 升级到Pydantic（推荐）

将配置类升级为Pydantic模型，获得更好的验证和文档支持：

```python
from pydantic import Field
from protocol.config_base import NodeConfigBase, LLMConfigMixin

class ResearchConfig(NodeConfigBase, LLMConfigMixin):
    """Research node configuration with web search and fact-checking capabilities."""
    
    # 原有参数（从LLMConfigMixin继承了llm_model, api_key等）
    enable_web_search: bool = Field(
        default=False, 
        description="启用网络搜索功能"
    )
    max_search_results: int = Field(
        default=5, 
        ge=1, 
        le=100, 
        description="每次搜索返回的最大结果数"
    )
    
    # 新增参数 - 只需添加这些，UI会自动识别！
    search_depth: int = Field(
        default=3,
        ge=1,
        le=10,
        description="搜索深度级别，数值越大搜索越深入"
    )
    enable_fact_check: bool = Field(
        default=True,
        description="启用AI事实核查，验证搜索结果的准确性"
    )
    custom_prompt: str = Field(
        default="",
        max_length=2000,
        description="自定义研究提示词，留空使用默认提示"
    )
    cache_results: bool = Field(
        default=True,
        description="缓存搜索结果以提高性能"
    )
    timeout_seconds: int = Field(
        default=60,
        ge=10,
        le=300,
        description="单次搜索超时时间（秒）"
    )
```

### 测试Schema提取

运行命令查看生成的schema：

```bash
python scripts/extract_node_schemas.py research
```

预期输出：
```json
{
  "type": "pydantic",
  "fields": {
    "enable_web_search": {
      "type": "boolean",
      "default": false,
      "description": "启用网络搜索功能",
      "required": false
    },
    "max_search_results": {
      "type": "integer",
      "default": 5,
      "min": 1,
      "max": 100,
      "description": "每次搜索返回的最大结果数",
      "required": false
    },
    "search_depth": {
      "type": "integer",
      "default": 3,
      "min": 1,
      "max": 10,
      "description": "搜索深度级别，数值越大搜索越深入",
      "required": false
    },
    "enable_fact_check": {
      "type": "boolean",
      "default": true,
      "description": "启用AI事实核查，验证搜索结果的准确性",
      "required": false
    },
    "custom_prompt": {
      "type": "string",
      "default": "",
      "maxLength": 2000,
      "description": "自定义研究提示词，留空使用默认提示",
      "required": false
    },
    "cache_results": {
      "type": "boolean",
      "default": true,
      "description": "缓存搜索结果以提高性能",
      "required": false
    },
    "timeout_seconds": {
      "type": "integer",
      "default": 60,
      "min": 10,
      "max": 300,
      "description": "单次搜索超时时间（秒）",
      "required": false
    }
  }
}
```

### UI效果

启动应用后，在research节点的配置面板中，你会看到：

1. **Enable Web Search** - Switch开关
2. **Max Search Results** - 数字输入框（范围1-100）
3. **Search Depth** - 数字输入框（范围1-10）✨ 新增
4. **Enable Fact Check** - Switch开关 ✨ 新增
5. **Custom Prompt** - 多行文本框（最大2000字符）✨ 新增
6. **Cache Results** - Switch开关 ✨ 新增
7. **Timeout Seconds** - 数字输入框（范围10-300）✨ 新增

每个字段都会显示对应的描述作为tooltip提示。

### 在节点代码中使用新参数

更新 `nodes/research/node.py` 使用新参数：

```python
from typing import Dict, Any
from nodes.research.config import ResearchConfig

def run(state: Dict[str, Any], config: ResearchConfig = None) -> Dict[str, Any]:
    config = config or ResearchConfig()
    logs = state.get("logs", [])
    errors = state.get("errors", [])

    logs.append("[ResearchNode] Starting research")
    cleaned = state.get("cleaned_contents", [])
    researched = []

    try:
        # 使用新参数
        if config.cache_results:
            logs.append("[ResearchNode] Cache enabled")
        
        for item in cleaned:
            researched_item = {
                **item,
                "research_notes": "",
                "key_points": [],
                "verified": False,
            }
            
            if config.enable_web_search:
                # 使用search_depth参数
                logs.append(f"[ResearchNode] Searching with depth: {config.search_depth}")
                
                # 使用custom_prompt参数
                prompt = config.custom_prompt or "Default research prompt"
                
                # 使用timeout_seconds参数
                # search_results = web_search(item, timeout=config.timeout_seconds)
                
                researched_item["research_notes"] = f"Research notes for: {item.get('title', '')}"
                
                # 使用enable_fact_check参数
                if config.enable_fact_check:
                    logs.append("[ResearchNode] Running fact check")
                    researched_item["verified"] = True
            
            researched.append(researched_item)
            
    except Exception as e:
        errors.append({"node": "research", "message": str(e), "detail": str(e)})

    state["researched_contents"] = researched
    logs.append(f"[ResearchNode] Researched {len(researched)} items")
    state["logs"] = logs
    state["errors"] = errors
    return state
```

## 总结

通过这个示例，你可以看到：

1. ✅ **只需修改Python配置类** - 添加新字段和验证规则
2. ✅ **UI自动更新** - 无需手动编写前端代码
3. ✅ **类型安全** - Pydantic提供运行时验证
4. ✅ **用户友好** - 自动生成的表单带有提示和验证

这就是自动化配置解析系统的强大之处！
