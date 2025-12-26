下面是**整合后、完整且一致的「Auto-Podcast vNext 九阶段开发计划（Windsurf 风格 · Final）」**。
我已把你原始 Windsurf 计划 **+ 我前面指出的所有遗漏点** 全部补齐、并合理嵌入到 9 个阶段里（不再出现 2.5 / 4.5 这种“外挂阶段”，方便 Windsurf 直接照 Phase 执行）。

你可以**原样整体丢给 Windsurf**作为最终实施蓝本。

---

# Auto-Podcast vNext —— 完整九阶段开发计划（Final）

> **目标**
> 构建一个「实时新闻优先、可扩展到深度调研」的 AI 播客生产系统，具备：
> 可复现、可解释、可控成本、低重复率、专业音频质量、可长期商业化运行。

---

## **Phase 1: Core Infrastructure – 时间解析 & 统一数据模型**

### 🎯 目标

为全流水线建立**统一数据语言**与**时间认知能力**，支撑实时性判断、证据评分、回放复现。

### 新增模块

* `src/utils/time_parser.py`

  * 支持：

    * `2022年04月29日`
    * `2025-07-25`
    * `2016-09-17`
  * 失败兜底：保留 `raw_date`
* `src/utils/models.py`

  * `NewsItem`
  * `StoryCluster`
  * `Claim`
  * `Evidence`
  * `MetasoSearchResult`
* `src/utils/hash_utils.py`

  * `content_sha256`
  * `stable_json_hash`

### 关键要求

* **所有时间字段统一输出 ISO**
* **所有对象都必须可序列化、可落盘**
* 后续阶段禁止私有 dict 乱传数据

---

## **Phase 2: Store Layer – 指纹、去重、聚类、冷却、多样性调度**

### 🎯 目标

彻底解决 **重复新闻 / 热点霸榜 / 来源单一** 问题，并且**决策可解释**。

### 新增模块

* `src/store/fingerprints.py`

  * URL normalize（去 tracking）
  * SimHash（中文分词）
* `src/store/dedup.py`

  * URL 级去重
  * 内容级近似去重（SimHash 距离 ≤ 3）
* `src/store/clusters.py`

  * Story 聚类（SimHash + 标题相似度）
* `src/store/selector.py`

  * **选题调度核心**
* `src/store/scoring.py`

  * freshness / impact / source_trust / quality
* `src/store/constraints.py`

  * 冷却期、多样性、来源配额

### 核心策略

* **Cluster 冷却期**（默认 2 天）
* **重大进展例外**（标题信号）
* **多样性约束**

  * `max_per_topic`
  * `max_per_domain`
  * `min_distance_between_clusters`

### 产物

```
dedup/
 ├── artifacts/
 │   ├── clusters.jsonl
 │   ├── selected_clusters.jsonl
 │   └── rejected_clusters.jsonl   # 含 rejection_reason
 └── metrics.json
```

---

## **Phase 3: Fetch Layer – 正文抽取、归一化、源层合规**

### 🎯 目标

把“网页文本”变成**高质量、可控、可授权**的 NewsItem。

### 新增模块

* `src/fetch/extractor.py`

  * readability / trafilatura
* `src/fetch/normalize.py`

  * 生成 NewsItem schema
* `src/fetch/source_guard.py`

  * 源层合规（license / crawl_allowed）

### 新增配置

* `config/sources/*.yaml`

  * `license: allowed | unknown | forbidden`
  * `crawl_allowed`
  * `source_type`

### 合规增强

* PII 检测
* “禁止转载 / 未经授权”关键词
* 外链/导流风险

---

## **Phase 4: Research Layer – 断言抽取、去重、预算、证据包**

### 🎯 目标

把“全文调查”升级为 **按断言调查 + 可控成本 + 高置信证据**。

### 新增模块

* `src/research/claims.py`

  * 断言抽取（规则优先）
* `src/research/claim_normalize.py`
* `src/research/claim_dedup.py`

  * 跨新闻合并断言
* `src/research/budget.py`

  * Top-N 新闻 × M 断言
* `src/research/query_builder.py`

  * 主查询 + 对照查询
* `src/research/evidence.py`

  * EvidencePack 组装
* 改造 `src/research/metaso.py`

### 时间策略（关键）

* realtime：

  * 证据超过 `max_age_days` → 强降权
* research：

  * 时间权重低或为 0

### 产物

```
research/
 ├── artifacts/
 │   ├── claims_deduped.jsonl
 │   ├── metaso_results.jsonl
 │   └── evidence_packs.jsonl
 └── metrics.json
```

---

## **Phase 5: LLM Layer – Editorial Planner & Script Generation**

### 🎯 目标

确保 **“即使是 AI 播客，也值得听”**。

### 新增模块

* `src/llm/editorial.py`

  * 节目主线
  * What / So what / Impact / Uncertainty / Takeaway
* `src/llm/script_builder.py`（升级）
* `src/llm/chapters.py`
* `src/llm/quality_gate.py`

  * pass / revise / drop
* `src/llm/rewrite.py`（可选）

### 强制规则

* 无 evidence → 不得输出结论性语句
* mixed / contradicted → 必须口播免责声明

---

## **Phase 6: TTS & Audio – 分段、混音、响度、章节点**

### 🎯 目标

听感达到「**专业播客**」而不是「AI 念稿」。

### 新增模块

* `src/tts/segmenter.py`

  * 25–35 字分段
  * 数字/日期读法
* `src/audio/mixer.py`

  * intro / mid / outro BGM
  * ducking
  * loudness normalize（-16 LUFS）
* `src/audio/timeline.py`

  * 音频段落时间轴
* `src/publish/subtitles.py`（可选）

  * `.vtt / .srt`

### 产物

* `episode.mp3`
* `chapters_with_timestamps.json`
* （可选）字幕文件

---

## **Phase 7: Pipeline Orchestration – Manifest、Cache、幂等、可观测**

### 🎯 目标

**不烧钱、不重复、可复现、可追责**。

### 新增模块

* `src/utils/trace.py`
* `src/utils/metrics.py`
* `src/utils/manifest.py`
* `src/store/cache.py`
* `src/store/cache_keys.py`
* `src/utils/serialization.py`

### 强制规范

* 外部调用（Metaso / LLM / TTS）必须：

  1. build payload
  2. stable serialize
  3. hash → cache key
  4. cache lookup
  5. miss 才请求

### Manifest 必含

* 版本号
* 成本
* cache hit/miss
* selection reasons

---

## **Phase 8: Configuration System & Demo**

### 🎯 目标

支持 **领域切换 / 关键词启动 / 实时 vs 调研**。

### 配置

* `config/topics/realtime.yaml`
* `config/topics/research.yaml`
* `config/source_policy.yaml`
* `config/pipeline.yaml`

### Demo

* `demo/run_realtime.py`
* `demo/run_research.py`

---

## **Phase 9: Testing, Docs & Acceptance Metrics**

### 🎯 目标

让系统 **能长期维护、能持续进化**。

### Tests

* time_parser
* simhash / dedup
* claim_dedup
* evidence scoring
* selector constraints
* pipeline e2e

### Docs

* `PIPELINE.md`
* `SELECTION_ENGINE.md`
* `SOURCE_POLICY.md`
* `CACHE_IDEMPOTENCY.md`

### 核心验收指标

* 7 天重复率 < 5%
* 单期 Metaso credits < 30
* 平均 evidence_confidence ≥ 阈值
* chapters 时间戳误差 < 1s
* 同 run_id 复跑结果一致

---
