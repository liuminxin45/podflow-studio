# Auto-Podcast vNext Pipeline Architecture

## 概述

Auto-Podcast vNext 是一个完全重构的播客自动生成系统，采用模块化、可观测、可复现的架构设计。

## 核心设计原则

1. **不烧钱**：强制缓存，外部API调用必须经过缓存层
2. **不重复**：多层去重机制（URL、内容、SimHash）
3. **可复现**：稳定序列化、确定性哈希、Manifest记录
4. **可追责**：完整的追踪、指标、成本记录

## Pipeline 架构

```
┌─────────────────────────────────────────────────────────────┐
│                         Phase 1: Fetch                       │
│  RSS订阅 → 内容抓取 → 正文提取 → 规范化 → 源层合规检查      │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                    Phase 2: Store (去重+聚类+选择)           │
│  URL去重 → 内容去重 → SimHash聚类 → 评分 → 约束过滤 → 选择  │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                    Phase 3: Research (断言+证据)             │
│  断言提取 → 规范化 → 去重 → 预算控制 → 查询构建 → 证据收集  │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                    Phase 4: Editorial (5W框架)               │
│  What → So What → Impact → Uncertainty → Takeaway           │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                    Phase 5: Script (质量门控)                │
│  脚本生成 → 质量评估 → 修订 → 通过/拒绝                      │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                    Phase 6: TTS & Audio                      │
│  文本分段 → TTS合成 → BGM混音 → 响度标准化 → 章节标记       │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                    Phase 7: Publish                          │
│  Manifest生成 → 字幕生成 → 章节导出 → 成本统计              │
└─────────────────────────────────────────────────────────────┘
```

## Phase 详解

### Phase 1: Fetch Layer

**目标**：从多个源获取高质量、可授权的内容

**模块**：
- `src/fetch/rss.py`: RSS订阅解析
- `src/fetch/extractor.py`: 正文提取（trafilatura + BeautifulSoup）
- `src/fetch/normalize.py`: NewsItem标准化
- `src/fetch/source_guard.py`: 源层合规检查
- `src/fetch/compliance.py`: 内容合规验证

**关键流程**：
1. RSS订阅解析 → 获取原始条目
2. 正文提取 → 清洗HTML，提取核心内容
3. 规范化 → 统一为NewsItem格式
4. 源层检查 → license/crawl_allowed验证
5. 合规验证 → PII/敏感词/版权检测

**产物**：
- `fetch/artifacts/normalized_items.jsonl`
- `fetch/artifacts/source_guard_blocked.jsonl`
- `fetch/artifacts/non_compliant_items.jsonl`

### Phase 2: Store Layer (去重+聚类+选择)

**目标**：从大量内容中选择最有价值的故事

**模块**：
- `src/store/dedup.py`: 多层去重
- `src/store/clustering.py`: SimHash聚类
- `src/store/scoring.py`: 多维度评分
- `src/store/constraints.py`: 约束过滤
- `src/store/selector.py`: 选择引擎

**去重策略**：
1. **URL去重**：规范化URL（去参数、统一协议）
2. **内容去重**：SHA256哈希完全匹配
3. **SimHash去重**：近似内容检测（汉明距离≤3）

**聚类算法**：
- SimHash + 标题Jaccard相似度
- 动态阈值调整
- 冷却期机制

**评分维度**：
```python
score = (
    freshness * 0.3 +      # 新鲜度
    impact * 0.25 +         # 影响力
    source_trust * 0.25 +   # 来源可信度
    quality * 0.2           # 内容质量
)
```

**约束条件**：
- 冷却期：相似话题N小时内不重复
- 多样性：每个主题/域名最多M个
- 标题相似度：避免标题过于相似
- 例外关键词：重大事件可突破约束

**产物**：
- `store/artifacts/clusters.jsonl`
- `store/artifacts/selected_clusters.jsonl`
- `store/artifacts/rejected_clusters.jsonl`
- `store/artifacts/metrics.json`

### Phase 3: Research Layer

**目标**：按断言调查，可控成本，高置信证据

**模块**：
- `src/research/claims.py`: 断言提取
- `src/research/claim_normalize.py`: 断言规范化
- `src/research/claim_dedup.py`: 断言去重
- `src/research/budget.py`: 预算控制
- `src/research/query_builder.py`: 查询构建
- `src/research/evidence.py`: 证据包组装

**断言类型**：
- `factual`: 事实性陈述
- `causal`: 因果关系
- `predictive`: 预测性陈述
- `comparative`: 比较性陈述
- `opinion`: 观点性陈述（可选）

**预算控制**：
```
Top-N 新闻 × M 断言/新闻 ≤ 总预算
```

**查询策略**：
- **主查询**：直接验证断言
- **对照查询**：寻找反驳证据
- **时间约束**：realtime vs research模式

**产物**：
- `research/artifacts/claims_deduped.jsonl`
- `research/artifacts/metaso_results.jsonl`
- `research/artifacts/evidence_packs.jsonl`

### Phase 4: Editorial Layer (5W框架)

**目标**：确保"即使是AI播客，也值得听"

**模块**：
- `src/llm/editorial.py`: 编辑规划器

**5W框架**：
1. **What**: 核心事实（最有力的证据）
2. **So What**: 为什么重要（因果关系、预测）
3. **Impact**: 影响分析（针对目标听众）
4. **Uncertainty**: 不确定性（矛盾证据、争议点）
5. **Takeaway**: 关键要点（行动建议）

**强制规则**：
- 无证据 → 不得输出结论性语句
- 证据矛盾 → 必须口播免责声明
- 证据不足 → 标注"待确认"

### Phase 5: Script Layer (质量门控)

**目标**：pass / revise / drop 决策

**模块**：
- `src/llm/quality_gate.py`: 质量评估
- `src/llm/rewrite.py`: 内容修订

**评估维度**：
- **内容质量** (30%): 结构完整性、逻辑连贯性
- **证据支持** (40%): 最重要，必须有充分证据
- **听众价值** (20%): 实用性、要点总结
- **语言质量** (10%): 流畅度、多样性

**决策逻辑**：
- **DROP**: 有critical问题 OR 分数 < 0.4
- **REVISE**: 有major问题 OR 分数 < 0.7
- **PASS**: 无major+问题 AND 分数 ≥ 0.7

### Phase 6: TTS & Audio Layer

**目标**：专业播客音质，而非"AI念稿"

**模块**：
- `src/tts/segmenter.py`: 文本分段
- `src/audio/mixer.py`: 音频混音
- `src/audio/timeline.py`: 时间轴管理

**分段策略**：
- 25-35字为一段
- 在自然停顿处分割
- 数字/日期规范化

**音频处理**：
- **Intro BGM**: 5秒开场
- **Mid BGM + Ducking**: 背景音乐自动降低
- **Outro BGM**: 3秒结尾
- **响度标准化**: -16 LUFS

### Phase 7: Orchestration Layer

**目标**：不烧钱、不重复、可复现、可追责

**模块**：
- `src/utils/trace.py`: 追踪系统
- `src/utils/metrics.py`: 指标收集
- `src/utils/serialization.py`: 稳定序列化
- `src/store/cache.py`: 缓存系统
- `src/utils/manifest.py`: 清单生成

**强制规范**：
```python
# 外部API调用必须经过缓存
1. build payload
2. stable serialize
3. hash → cache key
4. cache lookup
5. miss 才请求
```

**Manifest 必含**：
- 版本号
- 成本（按API分类）
- cache hit/miss率
- selection reasons
- 完整的追踪树

## 配置系统

### 模式切换

**Realtime模式**：
- 时间范围：24小时
- 新鲜度权重：0.4
- 证据时效：7天
- 目标时长：15-20分钟

**Research模式**：
- 时间范围：30天
- 新鲜度权重：0.1
- 证据时效：90天
- 目标时长：30-45分钟

### 配置文件

- `config/topics/realtime.yaml`: 实时模式主题配置
- `config/topics/research.yaml`: 调研模式主题配置
- `config/pipeline.yaml`: 流水线参数配置
- `config/source_policy.yaml`: 源策略配置
- `config/settings.yaml`: 通用设置

## 数据流

```
RSS Feed
  ↓
NewsItem (normalized)
  ↓
Deduplicated Items
  ↓
Story Clusters
  ↓
Selected Clusters
  ↓
Claims (extracted)
  ↓
Evidence Packs
  ↓
Editorial Plan (5W)
  ↓
Script (quality-gated)
  ↓
Audio Segments (TTS)
  ↓
Final Episode (mixed)
  ↓
Manifest + Artifacts
```

## 产物结构

```
output/{episode_id}/
├── episode.mp3                    # 最终音频
├── manifest.json                  # 完整清单
├── chapters.json                  # 章节标记
├── timeline.json                  # 时间轴
├── metrics.json                   # 指标统计
├── trace.json                     # 追踪数据
├── episode.srt                    # 字幕（SRT）
├── episode.vtt                    # 字幕（VTT）
└── artifacts/                     # 中间产物
    ├── normalized_items.jsonl
    ├── clusters.jsonl
    ├── selected_clusters.jsonl
    ├── claims_deduped.jsonl
    ├── evidence_packs.jsonl
    └── editorial_plan.json
```

## 性能指标

### 质量指标
- 7天重复率 < 5%
- 平均evidence_confidence ≥ 0.7
- 质量门控通过率 ≥ 80%

### 成本指标
- 单期Metaso credits < 30
- 单期总成本 < $1.0
- 缓存命中率 > 60%

### 技术指标
- 章节时间戳误差 < 1s
- 同run_id复跑结果一致
- 响度标准：-16 LUFS ± 1

## 运行示例

### Realtime模式
```bash
python demo/run_realtime.py --topic "科技前沿"
```

### Research模式
```bash
python demo/run_research.py --topic "技术趋势" --depth "deep"
```

## 维护指南

### 添加新的内容源
1. 在 `config/sources/` 添加YAML配置
2. 设置 `license`, `crawl_allowed`, `trust_score`
3. 测试源策略加载

### 调整选择策略
1. 修改 `config/pipeline.yaml` 中的权重
2. 调整约束条件（冷却期、多样性）
3. 运行测试验证影响

### 优化成本
1. 检查缓存命中率
2. 调整预算配置
3. 优化查询策略

## 故障排查

### 重复内容过多
- 检查去重配置
- 调整SimHash阈值
- 增加冷却期

### 成本超标
- 检查缓存是否生效
- 减少预算上限
- 优化查询数量

### 质量不达标
- 检查证据质量
- 调整质量门控阈值
- 增加修订次数

## 参考文档

- [SELECTION_ENGINE.md](./SELECTION_ENGINE.md): 选择引擎详解
- [SOURCE_POLICY.md](./SOURCE_POLICY.md): 源策略管理
- [CACHE_IDEMPOTENCY.md](./CACHE_IDEMPOTENCY.md): 缓存和幂等性
