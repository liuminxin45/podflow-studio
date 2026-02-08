# 动态配置系统使用指南

## 概述

这个系统允许你在Python节点配置类中添加新参数，前端UI会自动解析并生成对应的表单字段，无需手动修改前端代码。

## 工作原理

1. **Python Schema提取**: `scripts/extract_node_schemas.py` 脚本会自动分析节点的配置类（支持Pydantic和dataclass）
2. **Electron API**: 主进程提供API来获取节点的配置schema
3. **动态表单渲染**: 前端`DynamicConfigForm`组件根据schema自动生成表单字段
4. **配置编辑**: 用户可以在NodeDetailPanel的"配置"标签页中编辑节点配置

## 示例：为Research节点添加新参数

### 步骤1: 修改配置类

编辑 `nodes/research/config.py`:

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
    
    # 新增参数示例
    search_depth: int = 3  # 搜索深度
    enable_fact_check: bool = True  # 启用事实核查
    custom_prompt: str = ""  # 自定义提示词

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "ResearchConfig":
        defaults = {
            "enable_web_search": False, 
            "max_search_results": 5,
            "llm_model": "gpt-4o-mini", 
            "api_key": "", 
            "api_base": "", 
            "temperature": 0.5,
            "search_depth": 3,
            "enable_fact_check": True,
            "custom_prompt": ""
        }
        merged = {**defaults, **data}
        return cls(**{k: v for k, v in merged.items() if k in cls.__dataclass_fields__})
```

### 步骤2: 使用Pydantic（推荐）

如果你想要更强大的验证功能，可以使用Pydantic：

```python
from pydantic import Field
from protocol.config_base import NodeConfigBase

class ResearchConfig(NodeConfigBase):
    enable_web_search: bool = Field(default=False, description="启用网络搜索")
    max_search_results: int = Field(default=5, ge=1, le=100, description="最大搜索结果数")
    llm_model: str = Field(default="gpt-4o-mini", description="LLM模型名称")
    api_key: str = Field(default="", description="API密钥")
    api_base: str = Field(default="", description="API基础URL")
    temperature: float = Field(default=0.5, ge=0.0, le=2.0, description="温度参数")
    
    # 新增参数 - 带验证和描述
    search_depth: int = Field(default=3, ge=1, le=10, description="搜索深度（1-10）")
    enable_fact_check: bool = Field(default=True, description="启用事实核查")
    custom_prompt: str = Field(default="", max_length=1000, description="自定义提示词")
```

### 步骤3: 前端自动识别

无需修改前端代码！系统会自动：

1. 提取新参数的类型、默认值、验证规则和描述
2. 在UI中生成对应的表单控件：
   - `bool` → Switch开关
   - `int` → InputNumber数字输入框（带最小/最大值限制）
   - `float` → InputNumber数字输入框（小数）
   - `str` → Input文本框或TextArea
   - `List` → TextArea（JSON格式）
   - `Dict` → TextArea（JSON格式）

### 步骤4: 测试

1. 启动应用: `npm run dev`
2. 点击任意节点查看详情
3. 切换到"配置"标签页
4. 你会看到所有参数的表单字段，包括新添加的参数

## 支持的字段类型

### 基础类型

- **boolean**: 渲染为Switch开关
- **integer**: 渲染为InputNumber（整数）
- **number/float**: 渲染为InputNumber（小数）
- **string**: 渲染为Input或TextArea

### 复杂类型

- **List[T]**: 渲染为TextArea，需要输入JSON数组
- **Dict[K, V]**: 渲染为TextArea，需要输入JSON对象
- **Optional[T]**: 字段标记为非必填

### 特殊处理

- 字段名包含`password`或`key`: 自动使用密码输入框
- 字段名包含`url`或`path`: 使用普通输入框
- `maxLength > 100`: 自动使用TextArea

## Pydantic验证规则映射

| Pydantic约束 | UI效果 |
|-------------|--------|
| `ge=N` (大于等于) | InputNumber的min属性 |
| `le=N` (小于等于) | InputNumber的max属性 |
| `min_length=N` | Input的minLength |
| `max_length=N` | Input的maxLength |
| `description="..."` | 字段的tooltip提示 |
| `default=X` | 表单的默认值 |

## 测试Schema提取

你可以手动测试schema提取：

```bash
# 提取单个节点的schema
python scripts/extract_node_schemas.py research

# 提取所有节点的schema
python scripts/extract_node_schemas.py
```

## 注意事项

1. **配置持久化**: 当前版本配置保存在前端状态中，刷新后会丢失。未来版本会支持持久化存储。
2. **运行时生效**: 配置修改需要在下次工作流运行时才会生效。
3. **JSON格式**: 对于List和Dict类型，需要输入有效的JSON格式。
4. **类型安全**: 使用Pydantic可以获得更好的类型验证和错误提示。

## 最佳实践

1. **使用Pydantic**: 推荐使用Pydantic而不是dataclass，可以获得更好的验证和文档支持
2. **添加描述**: 为每个字段添加`description`，会显示为tooltip
3. **设置约束**: 使用`ge`, `le`, `min_length`, `max_length`等约束，UI会自动应用
4. **合理默认值**: 设置合理的默认值，方便用户快速开始使用

## 扩展

如果需要支持更多字段类型或自定义渲染逻辑，可以修改：

- `scripts/extract_node_schemas.py`: 添加新的类型解析逻辑
- `src/components/DynamicConfigForm.tsx`: 添加新的字段渲染器
