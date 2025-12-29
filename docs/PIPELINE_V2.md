# Auto-Podcast Pipeline 文档

## 概述

Auto-Podcast Pipeline 采用**二次检索**和**二阶段LLM终稿生成**架构，显著提升播客内容的数据密度和质量。

## 当前流程

```
RSS → LLM过滤 → 主题分类 → 
  ↓
步骤1: 新闻拆分（LLM拆分多主题）
  ↓
步骤2: 批量研究（安思派初次搜索）
  ↓
步骤3: Pipeline内容增强
  ├─ LLM#1增强（生成draft + retrieval_plan）
  ├─ Retrieval#2二次检索（安思派 + 本地缓存 + 历史播客）
  └─ LLM#2终稿（基于retrieval_bundle生成final_script）
  ↓
步骤4: TTS语音合成
```

**注意**：旧的单阶段流程（V1）已废弃，当前流程为唯一实现。

## 核心组件

### 1. 数据模型 (`src/research/models.py`)

#### LLM#1输出
```python
class LLM1Output(BaseModel):
    draft_script: str              # 播客草稿
    enhancement: EnhancementFields # 增强字段
    retrieval_plan: RetrievalPlan  # 检索计划
```

#### 检索计划
```python
class RetrievalPlan(BaseModel):
    queries: List[RetrievalQuery]  # 检索查询列表
    constraints: Dict[str, bool]   # 约束条件
```

#### 检索结果包
```python
class RetrievalBundle(BaseModel):
    hard_facts: List[str]                      # 硬事实
    stats_and_rankings: List[StatOrRanking]    # 统计和排名
    comparisons: List[Comparison]              # 对比数据
    timeline: List[TimelineEvent]              # 时间线
    history_podcast_hits: List[HistoryPodcastHit]  # 历史播客命中
    citations: List[Citation]                  # 引用来源
    gaps: List[str]                            # 缺失项
```

#### LLM#2输出
```python
class LLM2Output(BaseModel):
    final_podcast_script: str      # 最终播客脚本
    shownotes: Optional[str]       # 节目笔记
    citations_used: List[str]      # 使用的引用
    has_hard_data: bool            # 是否包含硬数据
    degraded: bool                 # 是否降级输出
    data_quality_score: float      # 数据质量分数
```

### 2. 缓存管理器 (`src/research/cache_manager.py`)

**功能**：
- TTL缓存（默认24小时）
- 内存+磁盘双层缓存
- 版本控制
- 自动过期清理

**使用**：
```python
cache = CacheManager(cache_dir=".cache/research", default_ttl=86400)
cache.set("查询", {"result": "数据"}, ttl=3600)
result = cache.get("查询")
```

### 3. 历史播客检索 (`src/research/history_search.py`)

**功能**：
- 按关键词/实体/主题检索历史播客
- 简单全文检索（可升级为embedding）
- TopK结果返回

**使用**：
```python
searcher = HistoryPodcastSearcher(history_dir="out/history_podcasts")
hits = searcher.search(
    query="春晚分会场",
    entities=["春晚", "哈尔滨"],
    topics=["文化"],
    top_k=5
)
```

### 4. 二次检索执行器 (`src/research/retrieval_v2.py`)

**功能**：
- 并发执行多个检索查询
- 自动去重
- 缓存优先策略
- 安思派搜索 + 历史播客检索

**使用**：
```python
executor = RetrievalV2Executor(
    cache_manager=cache_manager,
    history_searcher=history_searcher,
    max_concurrent=3
)
bundle = executor.execute(retrieval_plan)
```

### 5. LLM阶段 (`src/research/llm_stages.py`)

#### LLM#1（增强阶段）
- 输入：topic_title + research_summary
- 输出：draft_script + enhancement + retrieval_plan

#### LLM#2（终稿阶段）
- 输入：LLM#1输出 + retrieval_bundle
- 输出：final_podcast_script + shownotes + citations
- **硬约束**：无硬数据时禁止精确数字/排名

## 配置说明

### config/settings.yaml

```yaml
pipeline_v2:
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

## 可靠性保障

### 1. 降级策略

| 场景 | 降级方案 |
|------|---------|
| Retrieval#2失败 | 仍进入LLM#2，但标记无硬数据 |
| LLM#2失败 | 使用LLM#1的draft_script |
| 部分查询失败 | 使用已成功的查询结果 |

### 2. 硬约束

**无硬数据时LLM#2必须**：
- ❌ 禁止输出精确数字（如"增长23.5%"）
- ❌ 禁止输出具体排名（如"排名第3"）
- ✅ 只能使用模糊表达：通常、大约、往往在...区间

### 3. 日志与可观测性

每个阶段记录：
- stage_name
- item_id
- 耗时（processing_time_ms）
- 成功/失败状态
- 检索命中率
- 缓存命中数

## 测试

### 运行完整流程测试
```bash
python demo/test_pipeline_v2.py
```

### 运行单元测试
```bash
pytest tests/test_retrieval_v2.py -v
```

### 测试覆盖

- ✅ 数据模型解析
- ✅ 缓存读写
- ✅ 历史播客检索
- ✅ 检索去重
- ✅ 无硬数据约束验证
- ✅ 降级场景

## 使用示例

### 完整流程

```python
from src.research.llm_stages import LLMStage1, LLMStage2
from src.research.retrieval_v2 import RetrievalV2Executor
from src.research.cache_manager import CacheManager
from src.research.history_search import HistoryPodcastSearcher

# 阶段1: LLM#1增强
llm_stage1 = LLMStage1()
llm1_output = llm_stage1.process(topic_title, research_summary)

# 阶段2: 二次检索
cache_manager = CacheManager()
history_searcher = HistoryPodcastSearcher()
retrieval_executor = RetrievalV2Executor(
    cache_manager=cache_manager,
    history_searcher=history_searcher
)
retrieval_bundle = retrieval_executor.execute(llm1_output.retrieval_plan)

# 阶段3: LLM#2终稿
llm_stage2 = LLMStage2()
llm2_output = llm_stage2.process(llm1_output, retrieval_bundle)

# 获取最终脚本
final_script = llm2_output.final_podcast_script
```

## 性能指标

| 指标 | 目标值 |
|------|--------|
| LLM#1耗时 | < 60s |
| Retrieval#2耗时 | < 60s |
| LLM#2耗时 | < 60s |
| 总耗时 | < 180s |
| 缓存命中率 | > 30% |
| 检索成功率 | > 80% |

## 环境准备

### 创建必要目录

```bash
# 创建历史播客目录
mkdir -p out/history_podcasts

# 创建缓存目录
mkdir -p .cache/research
```

### 运行测试

```bash
# 运行完整流程测试
python demo/test_pipeline_v2.py

# 运行单元测试
pytest tests/test_retrieval_v2.py -v
```

## 未来优化

### 短期（1-2周）
- [ ] 历史播客检索升级为embedding索引
- [ ] 增加更多检索来源（本地数据库、知识图谱）
- [ ] 优化LLM Prompt

### 中期（1-2月）
- [ ] 增加A/B测试框架
- [ ] 实时监控Dashboard
- [ ] 自动化质量评估

### 长期（3-6月）
- [ ] 多模态检索（图片、视频）
- [ ] 实时数据流接入
- [ ] 个性化推荐

## 常见问题

### Q: 为什么需要两次LLM调用？
A: LLM#1生成检索计划，LLM#2基于检索结果生成终稿。分离职责提高质量。

### Q: 缓存会占用多少空间？
A: 默认TTL 24小时，单个缓存条目约1-10KB，预计每天100-500MB。

### Q: 如何验证无硬数据约束？
A: 运行`pytest tests/test_retrieval_v2.py::TestLLM2OutputValidation -v`

### Q: 降级会影响用户体验吗？
A: 降级使用draft_script，质量略低于终稿但仍可用。

## 联系与支持

- 技术文档：`docs/PIPELINE_V2.md`（当前文档）
- 测试示例：`demo/test_pipeline_v2.py`
- 单元测试：`tests/test_retrieval_v2.py`
- 废弃模块：`src/research/podcast_enhancer.py`（已标记为DEPRECATED）
