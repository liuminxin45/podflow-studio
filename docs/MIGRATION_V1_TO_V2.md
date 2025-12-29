# V1到当前架构的迁移说明

## 概述

Auto-Podcast已完成架构升级，**V1流程已完全移除**，当前使用的是基于二次检索和二阶段LLM的新架构。

## 主要变化

### 1. 配置变化

**旧配置（V1）**：
```yaml
# 无需配置，V1为默认流程
```

**新配置（当前）**：
```yaml
pipeline_v2:  # 注意：虽然名为v2，但已是唯一流程
  retrieval:
    max_concurrent: 3
    timeout_seconds: 60
    cache_ttl_seconds: 86400
    cache_dir: ".cache/research"
    history_podcast_dir: "out/history_podcasts"
    top_k_history: 5
  llm_stage1:
    timeout_seconds: 60
    max_tokens: 3000
  llm_stage2:
    timeout_seconds: 60
    max_tokens: 2500
  fallback:
    use_draft_on_failure: true
```

### 2. 代码变化

#### 废弃的模块

| 模块 | 状态 | 替代方案 |
|------|------|---------|
| `src/research/podcast_enhancer.py` | ⚠️ DEPRECATED | `src/research/llm_stages.py` |
| `EnhancedContent` 模型 | ⚠️ DEPRECATED | `LLM1Output`, `LLM2Output` |

#### 新增的模块

| 模块 | 功能 |
|------|------|
| `src/research/models.py` | 完整的数据模型定义 |
| `src/research/cache_manager.py` | 缓存管理（TTL、版本控制） |
| `src/research/history_search.py` | 历史播客检索 |
| `src/research/retrieval_v2.py` | 二次检索执行器 |
| `src/research/llm_stages.py` | LLM#1和LLM#2阶段 |

### 3. 流程变化

**V1流程（已移除）**：
```
RSS → 过滤 → 研究 → 单次LLM润色 → TTS
```

**当前流程**：
```
RSS → 过滤 → 
  ↓
步骤1: 新闻拆分（LLM）
  ↓
步骤2: 批量研究（安思派）
  ↓
步骤3: Pipeline内容增强
  ├─ LLM#1：生成draft + retrieval_plan
  ├─ Retrieval#2：二次检索（安思派 + 缓存 + 历史播客）
  └─ LLM#2：生成final_script（基于检索结果）
  ↓
步骤4: TTS
```

### 4. API变化

#### 旧方式（已废弃）
```python
from src.research.podcast_enhancer import PodcastEnhancer

enhancer = PodcastEnhancer()
enhanced = enhancer.enhance_research_result(research_result, topic)
script = enhanced.podcast_script
```

#### 新方式（推荐）
```python
from src.research.llm_stages import LLMStage1, LLMStage2
from src.research.retrieval_v2 import RetrievalV2Executor
from src.research.cache_manager import CacheManager
from src.research.history_search import HistoryPodcastSearcher

# LLM#1增强
llm_stage1 = LLMStage1()
llm1_output = llm_stage1.process(topic_title, research_summary)

# Retrieval#2
cache_manager = CacheManager()
history_searcher = HistoryPodcastSearcher()
retrieval_executor = RetrievalV2Executor(
    cache_manager=cache_manager,
    history_searcher=history_searcher
)
retrieval_bundle = retrieval_executor.execute(llm1_output.retrieval_plan)

# LLM#2终稿
llm_stage2 = LLMStage2()
llm2_output = llm_stage2.process(llm1_output, retrieval_bundle)

# 获取最终脚本
final_script = llm2_output.final_podcast_script if llm2_output else llm1_output.draft_script
```

## 环境准备

### 创建必要目录
```bash
mkdir -p out/history_podcasts
mkdir -p .cache/research
```

### 依赖检查
所有依赖已包含在 `requirements.txt` 中，无需额外安装。

## 测试验证

### 运行完整流程
```bash
python run.py --step fetch --date 2025-12-29
```

### 运行单元测试
```bash
pytest tests/test_retrieval_v2.py -v
```

### 运行集成测试
```bash
python demo/test_pipeline_v2.py
```

## 常见问题

### Q: 为什么还保留 `podcast_enhancer.py`？
A: 为了向后兼容和代码历史追溯，该文件已标记为DEPRECATED但未删除。新代码不应使用它。

### Q: 配置中的 `pipeline_v2` 名称会改吗？
A: 暂时保持不变以避免破坏现有配置。未来可能重命名为 `pipeline`。

### Q: 如何回滚到V1？
A: **无法回滚**。V1代码已完全移除。如需旧版本，请查看Git历史。

### Q: 性能有提升吗？
A: 虽然增加了两次LLM调用，但内容质量显著提升。总耗时约增加60-120秒。

### Q: 缓存会自动清理吗？
A: 是的，缓存管理器会自动清理过期条目（默认TTL 24小时）。

## 技术支持

- 完整文档：`docs/PIPELINE_V2.md`
- 问题反馈：提交Issue到项目仓库
- 代码示例：`demo/test_pipeline_v2.py`

---

**更新日期**：2025-12-29  
**架构版本**：V2（唯一版本）
