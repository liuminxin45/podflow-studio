下面给你一份**可直接丢给 Windsurf 实施**的「Auto-Podcast 实时新闻播客流水线设计文档（v1）」：覆盖你提到的 Metaso 返回结构（含 date）、“实时优先 / 调研可预留”、以及基于你现有目录的**模块拆分、数据结构、配置、缓存、幂等、去重、冷却、多样性、研究预算、证据包、可观测**等关键流程。

> 目标：在不推翻你现有 `src/{fetch,research,llm,tts,audio,publish,store}` 结构的前提下，补齐“商业化可长期稳定运行”的关键环节。

---

# Auto-Podcast 实时新闻播客流水线设计文档（v1）

## 0. 背景与目标

### 0.1 当前流水线

1. 指定网站爬数据
2. 合规检查并过滤
3. 调用 Metaso API 对新闻做网络调查（增强真实性）
4. LLM 基于调查结果生成播客文案
5. 豆包 TTS 生成语音

### 0.2 关键痛点（需要设计补齐）

* 热点连续霸榜导致节目重复
* Metaso 成本与文本限制：不能“全文调查”，需要调查预算与断言/证据包
* 实时性：新闻类对时间敏感，调研类相对不敏感（需可配置）
* 工程化：幂等、缓存、可回放、可观测、失败重试、版本记录
* 音频专业度：BGM + 响度标准化 + ducking + 分段节奏

### 0.3 设计目标（Definition of Done）

* 每期节目生成可复现：记录每一步输入输出、版本、成本、决策原因
* 具备去重/聚类/冷却/多样性：显著降低重复率与“霸榜”
* 研究阶段“按断言调查”并可控预算：单位成本提升真实性与深度
* 音频一致性：响度一致、BGM 不盖人声、有章节点
* 配置化支持“领域切换 / 关键词触发 / 实时 vs 调研策略”

---

## 1. 总体架构

### 1.1 分层模块（映射到现有 src 目录）

* `src/fetch`：多源采集 + 抽取/清洗 + 归一化
* `src/store`：内容归档、缓存、索引、去重用指纹/embedding（可先 SQLite/文件）
* `src/research`：Metaso 调用、断言抽取、调查预算、证据包组装
* `src/llm`：节目策划（Editorial Planner）+ 脚本生成 + shownotes + chapters
* `src/audio`：音频后期（BGM/ducking/LUFS/混音/切段）
* `src/tts`：TTS 适配器（豆包）+ 分段/节奏控制
* `src/publish`：输出到 episodes、RSS/平台发布（或导出）
* `src/utils`：日志、追踪、哈希、文本相似度、时间解析

> 你现有 run 目录结构已经很接近 “pipeline run workspace”，建议保留并强化“manifest + artifacts”。

### 1.2 Pipeline（建议明确阶段与产物）

**Stage A: Fetch & Normalize**

* A1 Source selection（来源管理/领域配置）
* A2 Crawl / Fetch raw
* A3 Extract main text (boilerplate removal)
* A4 Normalize fields + time parse（解析发布时间）

**Stage B: Dedup & Cluster**

* B1 Exact dedup（canonical_url/hash）
* B2 Near-dup（simhash/embedding cosine）
* B3 Story clustering（按事件聚合）

**Stage C: Rank & Schedule**

* C1 Score ranking（新鲜度/影响力/来源可信度/多样性）
* C2 Cooldown filter（同一 story 冷却期）
* C3 Diversity constraints（每期类别配额、来源配额）

**Stage D: Compliance Gate**

* D1 合规检测（敏感/违法/PII/版权/外链风险…）
* D2 风险分流（high 丢弃，medium 待审/降权，low 标记）

**Stage E: Research (Metaso)**

* E1 Claim extraction（从正文抽 3–8 条可核查断言）
* E2 Budgeting（决定调查哪些断言/哪些新闻）
* E3 Metaso queries（按断言查询，收集 web results）
* E4 Evidence pack（合并 sources，给每条断言支持/反证/置信度）

**Stage F: Editorial & Script**

* F1 Editorial planner（主线主题、结构、价值点、争议点）
* F2 Script writer（结合证据包，强制 So what/Uncertainty/Takeaway）
* F3 Chapters & shownotes（章节、引用来源列表、免责声明）

**Stage G: TTS & Audio Post**

* G1 Script segmentation（可播分段、语速节奏）
* G2 TTS render（生成人声）
* G3 Mix（BGM intro/mid/outro + ducking + loudness normalize）

**Stage H: Publish & Archive**

* H1 Save episode artifacts（mp3、shownotes、json）
* H2 Publish（RSS/平台/导出）
* H3 Metrics（成本、通过率、重复率、调查冲突率等）

---

## 2. 数据模型（核心 Schema）

### 2.1 归一化新闻条目 `NewsItem`

建议统一字段（存入 `store`，也写入每次 run artifacts）：

```json
{
  "id": "sha1:c1a8...",
  "source": {
    "name": "163",
    "domain": "m.163.com",
    "url": "https://m.163.com/dy/article/xxx.html",
    "canonical_url": "https://... (可选)",
    "fetch_time": "2025-12-26T11:23:45+08:00"
  },
  "title": "...",
  "summary": "...",
  "content": "...(clean_text)",
  "lang": "zh",
  "published_at": "2022-04-29T00:00:00+08:00",
  "published_at_raw": "2022年04月29日",
  "tags": ["AI", "Security"],
  "entities": {
    "people": [],
    "orgs": [],
    "places": []
  },
  "fingerprints": {
    "content_sha256": "...",
    "simhash": "....",
    "embedding_id": "vec:..." 
  },
  "quality": {
    "extractor": "readability-v1",
    "extract_confidence": 0.87,
    "length": 1832
  }
}
```

### 2.2 Story Cluster `StoryCluster`

用于解决“连续霸榜”和跨媒体重复：

```json
{
  "cluster_id": "clu:xxxx",
  "headline": "....(聚类代表标题)",
  "topic": "AI/Business/...",
  "items": ["sha1:...", "sha1:..."],
  "first_seen_at": "...",
  "last_seen_at": "...",
  "cooldown_until": "...",
  "signals": {
    "freshness": 0.92,
    "impact": 0.65,
    "source_diversity": 0.7
  }
}
```

### 2.3 Metaso 原始结果 `MetasoSearchResult`

保留原样 + 解析时间字段（你给的数据里 `date` 有多格式）：

```json
{
  "query": "...",
  "credits": 3,
  "raw": { "...metaso json..." },
  "webpages": [
    {
      "title": "...",
      "link": "...",
      "snippet": "...",
      "score": "high",
      "position": 1,
      "date_raw": "2022年04月29日",
      "date_iso": "2022-04-29"
    }
  ]
}
```

### 2.4 Claim & Evidence Pack

**Claim**（可核查断言）：

```json
{
  "claim_id": "clm:...",
  "text": "英国整形专家用黄金分割...发现某人契合度 91.85%",
  "claim_type": "numeric|event|attribution|policy",
  "priority": 0.83,
  "entities": ["Amber Heard", "golden ratio"],
  "needs_research": true
}
```

**Evidence**（每条断言的证据聚合）：

```json
{
  "claim_id": "clm:...",
  "verdict": "supported|contradicted|mixed|unverified",
  "confidence": 0.72,
  "sources": [
    {
      "title": "...",
      "url": "...",
      "published_at": "2023-02-09",
      "stance": "support",
      "reliability": 0.6,
      "snippet": "..."
    }
  ],
  "notes": "时间较旧，且来源为聚合站"
}
```

---

## 3. 时间策略（实时新闻优先，调研预留）

### 3.1 解析规则

Metaso `date` 字段可能是：

* `2025-07-25`（ISO）
* `2022年04月29日`（中文）
* `2016-09-17`
* 甚至错误/缺失

要求：

* 统一解析为 `date_iso`（YYYY-MM-DD）或 `published_at`（带时区）
* 解析失败置空，但保留 `date_raw`

### 3.2 Freshness 评分（用于实时新闻）

对“实时模式”使用时间衰减：

* `freshness_score = exp(-days_since / half_life_days)`
* half_life 默认 3 天（可配置）
* 调研模式 half_life 可设 30/90 天，或者直接忽略时间

### 3.3 预留：按领域配置

`config/topics/{topic}.yaml`

* `mode: realtime | research`
* `freshness.half_life_days`
* `freshness.max_age_days`（超过直接丢弃或降权）

---

## 4. 去重、聚类、冷却、多样性（解决霸榜）

### 4.1 去重层级

1. **URL 级**：canonical_url / normalized_url（去 tracking 参数）
2. **标题近似**：Jaccard/编辑距离
3. **正文近似**：SimHash 或 Embedding cosine

### 4.2 聚类策略（Story Clustering）

* 基于 embedding 相似度阈值（例如 >0.86）
* 或 SimHash 距离阈值（<=3）
* 同时加时间窗口：只与最近 N 天的 clusters 比较（提升性能）

### 4.3 冷却期（Cooldown）

对 cluster 设置 `cooldown_days`（例如 2 天）

* 如果 cluster 在冷却期内：默认不入选
* 例外：出现“重大进展信号”才允许（需要规则）

  * 标题包含“最新/宣布/确认/发布/裁决/修正/更新”
  * 或同 cluster 的“新来源权威度显著提升”

### 4.4 多样性约束（Diversity Constraints）

每期节目选 K 条 story：

* `max_per_topic`: 每个 topic 最多 2 条
* `max_per_domain`: 每个 domain 最多 1 条
* `min_dist_between_clusters`: cluster embedding 距离要足够（避免同质）

---

## 5. 合规与风险（你已有基础，建议补齐）

在你已有合规脚本基础上建议加入/增强：

* PII 检测：手机号/邮箱/身份证/ip
* 版权风险：缺少来源字段、出现“禁止转载/未经授权”等
* 外链/导流风险：外链数量过多、带推广参数
* 风险分流：high 丢弃，medium 进入 “待审” 或降权
* 记录证据链：命中 span/context，便于复核与迭代词库

输出需要写入 `item["_compliance"]`，并落盘到 run artifacts。

---

## 6. Metaso 调研设计（按断言调查 + 预算控制）

### 6.1 为什么不能“全文调查”

* 成本高、回报低
* 结果噪声大：全文里大量不可核查句子

### 6.2 Claim Extraction（断言抽取）

对每条新闻抽 3–8 个断言：

* 数字/比例/排名
* “某机构/某人表示/宣布”
* 时间地点事件
* 因果结论（谨慎）

可以先用 LLM 低成本模型抽取，也可用规则：

* 提取包含数字/百分号/“宣布/确认/称/表示/报告/研究发现”的句子

### 6.3 Research Budgeter（预算器）

输入：news ranking + 合规结果 + 重要性 + 来源可信度
输出：需要调研的 item 列表 + 每条 item 的 claims 子集 + 每条 claim 的 query 数量

推荐策略：

* 默认每期只深挖 Top N（如 5 条）
* 每条最多 M 个 claims（如 4）
* 每个 claim 对应 1~2 个查询（主查询 + 反向查询）

### 6.4 Metaso Query 模板

对每条 claim 生成 query：

* 主查询：`claim 原句`（或精简关键词）
* 反向查询：`主体 + 关键数字/时间 + "来源" / "官方"`
* 可加限定：`site:gov` / `site:edu`（如适用）

### 6.5 利用 Metaso 返回 date

你以实时为主，Metaso 结果里的 `webpages[].date` 必须进入 Evidence scoring：

* 若证据源太旧：降低 reliability/confidence
* 若同一断言只找到陈旧来源：标记 `unverified` 或 `mixed`

---

## 7. Editorial Planner（深度与价值的核心）

**这是你现在最缺的“护城河层”。**
建议在 LLM 写稿前插入一个“策划器”步骤：

输入：

* 本期入选 clusters（每个 cluster 多来源摘要）
* 每条的 evidence pack（支持/反证/未证）
* 领域配置（realtime/research、受众画像）

输出：

* 节目主线主题（1 句）
* 每条新闻的结构化要点：

  * What / So what / Impact / Uncertainty / Takeaway
* 需要在口播里明确的“免责声明句式”（例如：仍在核实、信息来源较少…）

---

## 8. TTS 与音频后期（专业听感）

### 8.1 分段与节奏控制（TTS 前）

* 句子长度限制（例如 25–35 字一断）
* 数字读法标准化（2025/12/26、%）
* 外文/缩写处理（AI / GPU / Meta…）
* 断句与强调（尽量不用冗长 SSML，保持跨引擎）

### 8.2 混音（audio 后期）

* 片头 BGM（固定 6–10s）
* 中间转场 BGM（每 2–3 条新闻 2–4s）
* 片尾轻柔 BGM（10–15s）
* ducking：人声期间 BGM 自动压低
* loudness normalize：统一 LUFS（例如 -16 LUFS 立体声常见值；可配置）

---

## 9. 运行产物与目录（对齐你现有 out/runs）

你已有：
`out/runs/YYYY-MM-DD/HHMMSS_xxxxxx/{fetch,script,tts,audio,publish,logs}`

建议每个阶段统一写：

* `manifest.json`：本次 run 的全局元数据（版本/时间/配置/成本）
* `artifacts/*.jsonl`：阶段输出列表（便于 diff、复跑、调试）
* `metrics.json`：关键指标

示例 `manifest.json`：

```json
{
  "run_id": "2025-12-26/115350_6c55c3",
  "topic_profile": "realtime_ai_news",
  "versions": {
    "extractor": "readability-v1",
    "compliance": "2.0.0",
    "research": "1.0.0",
    "llm_prompt": "script-v7",
    "tts": "doubao-v3",
    "audio": "mix-v2"
  },
  "costs": {
    "metaso_credits": 18,
    "llm_input_tokens": 0,
    "llm_output_tokens": 0
  }
}
```

---

## 10. 配置系统（领域切换 / 关键词触发）

建议 `config/` 下增加：

* `config/topics/*.yaml`：领域档案（sources、freshness、cooldown、多样性、研究预算）
* `config/sources/*.yaml`：站点配置（入口 URL、抽取规则、频率、是否允许）
* `config/pipeline.yaml`：全局默认参数

`topics/realtime.yaml` 示例：

```yaml
mode: realtime
freshness:
  half_life_days: 3
  max_age_days: 7
selection:
  items_per_episode: 8
  cooldown_days: 2
  diversity:
    max_per_topic: 2
    max_per_domain: 1
research:
  enabled: true
  max_items: 5
  max_claims_per_item: 4
  metaso:
    size: 10
    scope: webpage
```

---

## 11. 需要 Windsurf 实施的改造清单（按你现有 src 对齐）

### 11.1 src/fetch

* 新增 `extractor.py`：正文抽取/清洗/归一化
* 新增 `time_parser.py`：解析中文日期/ISO/缺失兜底
* 新增 `normalize.py`：统一 NewsItem schema

### 11.2 src/store

* 新增 `fingerprints.py`：content_sha256、simhash、url normalize
* 新增 `dedup.py`：exact/near dedup
* 新增 `clusters.py`：story clustering（可先简单 embedding 预留接口）
* 新增 `cache.py`：Metaso/LLM 缓存（key=hash(query)+params）

### 11.3 src/research

* 新增 `claims.py`：断言抽取（规则+LLM 任选，可配置）
* 新增 `budget.py`：研究预算器（按 importance/freshness/risk）
* 改造 `metaso_client.py`：

  * 统一返回 `MetasoSearchResult`
  * 增加 `date` 解析与 evidence scoring 钩子
* 新增 `evidence.py`：证据包组装（stance/support/mixed）

### 11.4 src/llm

* 新增 `editorial.py`：节目主线策划输出大纲
* 改造 `script_builder.py`：

  * 输入从 “news items” 升级为 “clusters + evidence packs”
  * 强制结构：What/So what/Impact/Uncertainty/Takeaway
* 新增 `chapters.py`：章节点生成

### 11.5 src/tts + src/audio

* `tts/segmenter.py`：可播分段、数字读法统一
* `audio/mixer.py`：BGM 片头/转场/片尾 + ducking + loudness normalize

### 11.6 src/publish

* `publisher.py`：输出统一的 episode bundle（mp3 + shownotes + metadata.json）
* （可选）rss generator

### 11.7 src/utils

* `trace.py`：run_id、阶段耗时、成本、错误码统一
* `metrics.py`：合规通过率、重复率、冲突率、成本统计

---

## 12. 关键算法与策略（落地优先：先简单可用）

### 12.1 去重/聚类的“最小可用版本”

* 先做 URL normalized + content_sha256 去重
* 再做 SimHash 近似去重（无需 embedding）
* 聚类先用 SimHash 距离 + 标题相似度

> 后续再引入 embedding（成本更高，但聚类质量更好）。

### 12.2 “霸榜”治理

* cluster 冷却期：默认 2 天
* 同一期节目：同 cluster 只取 1 条（但可在 shownotes 列出其它来源）

### 12.3 调研“按断言”

* 每条新闻抽 3–8 claim
* 只调查 top claims（优先包含数字/机构/关键结论）
* evidence 评分考虑：

  * 时间（越新越好，实时模式强权重）
  * 域名可信度（可配置白名单/黑名单/中立）
  * 多来源一致性（支持/反证数量）

---

## 13. 非功能性要求（稳定性）

* 幂等：每个阶段写入可复用的 artifacts；重复运行同 run_id 不重复扣费
* 缓存：Metaso 调用按 query+params 缓存；LLM 按输入 hash 缓存
* 重试：网络错误指数退避；失败写明 error_code
* 追踪：每条 item/claim/query 具备 trace_id

---

## 14. 交付物（Windsurf 要输出的东西）

1. 新增/改造模块代码（按 11.x）
2. 增加 `docs/` 下本设计文档落地版（可生成 markdown）
3. 增加一个 `demo/run_realtime.py`：本地一键跑通
4. 增加 tests：对 time_parser、dedup、claims、evidence 做最小单测
5. 增加示例 topic 配置：`config/topics/realtime.yaml`

---

# 附：给 Windsurf 的“实施 Prompt”（可直接复制）

下面这段你可以直接扔给 Windsurf，让它按你现有项目结构落地（它会更容易按任务拆解开发）：

```text
你在一个已有 Python 项目中实现 Auto-Podcast 实时新闻播客流水线增强。
目标：在不推翻现有目录结构的前提下，新增“时间解析、去重聚类冷却、多样性选择、按断言调研预算、证据包、策划层、音频后期指标与产物manifest”。

项目根目录：E:\NEO\AUTO-PODCAST
现有 src 目录包含：audio/fetch/llm/publish/research/store/tts/utils
现有 out/runs 结构用于每次 run 的阶段产物输出（fetch/script/tts/audio/publish/logs）。

请严格按以下设计实现（优先最小可用版本）：
1) src/fetch: 实现 extractor+normalize+time_parser
  - 解析 Metaso/网页 date：支持 '2022年04月29日'、'2025-07-25'、'2016-09-17'；失败保留 raw。
  - 生成统一 NewsItem schema（含 published_at、published_at_raw、source_domain、content_sha256、simhash）
2) src/store: 实现 fingerprints、dedup（url normalize + content_sha256 + simhash）、clusters（simhash+title相似聚类）、cache（文件或sqlite均可）
3) src/research:
  - claims.py：从新闻文本抽取 3-8 条可核查断言（规则优先，必要时可用轻量 llm 抽取接口占位）
  - budget.py：研究预算器，默认每期最多调研 5 条新闻，每条最多 4 个断言
  - metaso_client.py：封装 metaso 返回结构，解析 webpages[].date 并输出 date_iso
  - evidence.py：组装 EvidencePack，考虑时间新鲜度与域名可信度（先做简单配置表）
4) src/llm:
  - editorial.py：生成本期主线主题和每条新闻结构化要点（What/So what/Impact/Uncertainty/Takeaway）
  - script_builder.py：输入 clusters+evidence 输出脚本+shownotes+chapters（保留现有输出格式兼容）
5) src/tts + src/audio:
  - tts/segmenter.py：句子分段、数字读法处理
  - audio/mixer.py：片头/转场/片尾 BGM + ducking + loudness normalize（可先留 TODO，但要有接口与产物结构）
6) out/runs 每个阶段写入：
  - manifest.json（记录版本、配置、成本、输入输出摘要）
  - artifacts/*.jsonl（每阶段的列表输出）
  - metrics.json（通过率、重复率、冲突率、成本）
7) 配置系统：
  - 新增 config/topics/realtime.yaml（freshness half-life、max_age_days、cooldown、diversity、research budget）
8) 提供 demo/run_realtime.py 一键跑通（可用假数据或已有 fetch 逻辑）
9) 增加最小单测：time_parser、url normalize、simhash dedup、claim extraction（规则版）

输出：直接提交代码改动（以文件为单位给出完整内容），不要讲教程，不要泛泛解释。
```

---
