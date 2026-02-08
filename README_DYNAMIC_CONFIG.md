# 自动化配置解析系统

## 功能说明

这个系统实现了**节点配置的自动化解析和UI生成**，当你在Python节点配置类中添加新参数时，前端UI会自动识别并生成对应的表单字段。

## 快速开始

### 1. 添加新配置参数

在任意节点的`config.py`中添加参数，例如 `nodes/research/config.py`:

```python
from pydantic import Field
from protocol.config_base import NodeConfigBase

class ResearchConfig(NodeConfigBase):
    # 原有参数
    enable_web_search: bool = Field(default=False, description="启用网络搜索")
    max_search_results: int = Field(default=5, ge=1, le=100, description="最大搜索结果数")
    
    # 新增参数 - 只需添加这里，UI会自动识别！
    search_depth: int = Field(default=3, ge=1, le=10, description="搜索深度")
    enable_cache: bool = Field(default=True, description="启用缓存")
    timeout_seconds: int = Field(default=30, ge=5, le=300, description="超时时间（秒）")
```

### 2. 查看UI效果

1. 启动应用: `npm run dev`
2. 点击工作流中的任意节点
3. 在右侧面板切换到"配置"标签
4. 新添加的参数会自动显示在表单中！

## 系统架构

```
┌─────────────────────────────────────────────────────────────┐
│  Python配置类 (nodes/*/config.py)                           │
│  - Pydantic模型或dataclass                                  │
│  - 定义字段类型、默认值、验证规则                            │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│  Schema提取脚本 (scripts/extract_node_schemas.py)           │
│  - 自动分析配置类                                            │
│  - 提取字段类型、约束、描述等信息                            │
│  - 生成JSON schema                                          │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│  Electron API (electron/main.js)                            │
│  - node:getSchema - 获取单个节点schema                       │
│  - node:getAllSchemas - 获取所有节点schema                   │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│  动态表单组件 (src/components/DynamicConfigForm.tsx)        │
│  - 根据schema自动生成表单字段                                │
│  - 支持多种字段类型和验证规则                                │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│  节点详情面板 (src/components/NodeDetailPanel.tsx)          │
│  - 显示节点状态、日志、配置                                  │
│  - 允许用户编辑配置                                          │
└─────────────────────────────────────────────────────────────┘
```

## 支持的字段类型

| Python类型 | UI控件 | 示例 |
|-----------|--------|------|
| `bool` | Switch开关 | `enable_feature: bool = True` |
| `int` | 数字输入框 | `max_count: int = Field(default=10, ge=1, le=100)` |
| `float` | 数字输入框（小数） | `temperature: float = Field(default=0.7, ge=0, le=2)` |
| `str` | 文本框 | `model_name: str = "gpt-4"` |
| `str` (长文本) | 多行文本框 | `prompt: str = Field(max_length=1000)` |
| `str` (密码) | 密码框 | `api_key: str = ""` |
| `List[T]` | JSON文本框 | `items: List[str] = []` |
| `Dict[K,V]` | JSON文本框 | `mapping: Dict[str, str] = {}` |

## 验证规则自动映射

Pydantic的验证规则会自动应用到UI：

```python
# Python配置
max_results: int = Field(
    default=10,
    ge=1,           # 最小值 → UI的min属性
    le=100,         # 最大值 → UI的max属性
    description="最大结果数"  # 描述 → UI的tooltip
)

# 自动生成的UI
# <InputNumber min={1} max={100} defaultValue={10} tooltip="最大结果数" />
```

## 测试命令

```bash
# 测试单个节点的schema提取
python scripts/extract_node_schemas.py research

# 测试所有节点的schema提取
python scripts/extract_node_schemas.py

# 输出示例：
# {
#   "type": "pydantic",
#   "fields": {
#     "enable_web_search": {
#       "type": "boolean",
#       "default": false,
#       "description": "启用网络搜索",
#       "required": false
#     },
#     ...
#   }
# }
```

## 使用示例

### 示例1: 添加简单参数

```python
# nodes/research/config.py
class ResearchConfig(NodeConfigBase):
    # 添加一个布尔开关
    enable_debug: bool = Field(default=False, description="启用调试模式")
```

UI会自动生成一个Switch开关，带有"启用调试模式"的提示。

### 示例2: 添加带约束的数字参数

```python
# nodes/tts/config.py
class TTSConfig(NodeConfigBase):
    # 添加音量控制
    volume: int = Field(
        default=100,
        ge=0,
        le=200,
        description="音量百分比 (0-200)"
    )
```

UI会生成一个数字输入框，限制范围0-200，默认值100。

### 示例3: 添加列表参数

```python
# nodes/fetch/config.py
class FetchConfig(NodeConfigBase):
    # 添加URL列表
    urls: List[str] = Field(
        default_factory=list,
        description="要抓取的URL列表"
    )
```

UI会生成一个多行文本框，用户可以输入JSON数组格式的URL列表。

## 文件清单

### 新增文件
- `scripts/extract_node_schemas.py` - Schema提取脚本
- `src/components/DynamicConfigForm.tsx` - 动态表单组件
- `docs/DYNAMIC_CONFIG_GUIDE.md` - 详细使用指南

### 修改文件
- `electron/main.js` - 添加schema获取API
- `electron/preload.js` - 暴露API到前端
- `src/App.tsx` - 更新类型定义
- `src/components/NodeDetailPanel.tsx` - 集成配置编辑功能

## 注意事项

1. **配置生效时机**: 配置修改会在下次工作流运行时生效
2. **JSON格式**: List和Dict类型需要输入有效的JSON格式
3. **推荐使用Pydantic**: 相比dataclass，Pydantic提供更好的验证和文档支持
4. **字段命名**: 包含`password`、`key`的字段会自动使用密码输入框

## 下一步改进

- [ ] 配置持久化存储（保存到文件）
- [ ] 配置模板和预设
- [ ] 配置导入/导出功能
- [ ] 更多字段类型支持（日期、颜色选择器等）
- [ ] 配置验证和错误提示优化
- [ ] 实时配置更新（无需重启工作流）

## 相关文档

- [详细使用指南](docs/DYNAMIC_CONFIG_GUIDE.md)
- [Pydantic文档](https://docs.pydantic.dev/)
- [Ant Design表单组件](https://ant.design/components/form-cn/)
