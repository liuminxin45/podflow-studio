# 自动选题模块完整交付文档（优化版）

## 0. 目标与范围

自动选题模块用于从大量 RSS items 中自动产出当天应播主题（topics/story clusters），把"主题选择"升级为**可计算、可复用、可观测、可降级**的模块。

**本模块只负责"选题"**：决定"今天播哪些主题、按什么顺序"。
通过 Gate 的 topics 才进入后续：安思派校验 → LLM增强 → 二次检索 → LLM终稿 → TTS。

---

## 1. 总体拓扑与阶段边界

### 1.1 新流程拓扑（启用 auto_topic）

```
RSS → 合规/格式校验 → 去重/归并 →（可选：粗聚类）
  ↓
【Auto Topic Selection】（enable_auto_topic=true）
  1) item_signal_tagging (LLM#0，可缓存/可批量)
  2) topic_candidate_mining（事件级聚合，稳定 topic_id）
  3) proxy_signals_compute（trend/time/persona/history_echo）
  4) topic_scoring_and_filtering（结构性淘汰 + score 排序）
  5) topic_gate_llm（LLM Gate：TopN 决策；失败降级）
  ↓
通过 Gate 的 topics →
  → 安思派搜索校验
  → LLM#1 增强（draft + retrieval_plan）
  → Retrieval#2（安思派+缓存+历史播客）
  → LLM#2 终稿
  → TTS
```

### 1.2 模块输入输出契约（关键）

**输入（AutoTopicSelection.run）**

* `items: list[NewsItem]`（至少含 id/title/summary/url/published_at/source）
* `history_index`（可选：历史播客检索器）
* `config`（权重、窗口、TopN、阈值）

**输出**

* `selected_topics: list[SelectedTopic]` 
* `all_candidates: list[TopicCandidate]`（便于 debug & 指标统计）
* `metrics: dict`（耗时、命中率、降级次数等）

---

## 2. 核心能力（6个）与实现要点

### 2.1 主题母型（Topic Archetypes）

将新闻映射到 6 类"听众兴趣母型"，用于后续聚合/排序：

* `change_happening`（变化发生）
* `personal_impact`（影响到我/工作/钱/习惯）
* `competition_conflict`（输赢/冲突/竞争）
* `risk_opportunity`（风险或机会）
* `counter_intuitive`（反直觉/争议）
* `inflection_trend`（趋势拐点）

> 输出为 0–3（原始），**但在 topic_scoring 中统一归一到 0–100**。

---

### 2.2 主题候选生成（Topic Candidate Mining）

主题候选 = 事件级聚合（同一事件/实体/变化方向），不是按"AI/财经"等粗分类。

关键要求：

* 生成稳定 `topic_id`（跨天一致）
* 合并多个 item 的 signals（平均或加权平均）
* 支持时间窗口（默认 7 天，可配置 30 天）

**稳定topic_id策略（canonical key）**：

使用 `实体Top3 + 动作词 + 领域词` 生成hash，避免标题变化导致ID变化。

---

### 2.3 结构性判断（Publishability）

一个主题是否值得播，优先看结构（可讲性），而不是数量。

结构字段（0–1 原始打分）：

* `continuity`：是否非一次性
* `why_now`：是否"现在讲"合理
* `data_enrichable`：是否能补历史/对比/影响
* `follow_up_potential`：是否可持续跟进

结构性淘汰规则（先淘汰，再打分）：

* `continuity < 0.2` → 丢弃（一次性碎片）
* `data_enrichable < 0.3 AND follow_up_potential < 0.3` → 丢弃（无法扩展且无法跟进）
* `archetypes_mean < 0.7 AND personal_impact < 0.7` → 丢弃（对听众价值弱）

---

### 2.4 代理信号（Proxy Signals）

不依赖真实用户反馈，用代理信号估计听众兴趣：

* `trend_signal`：多源重复出现 / 同主题当日覆盖率 / 标题关键词近 N 天频率
* `time_signal`：发布时间新鲜度与窗口匹配
* `persona_relevance`：能否对某类听众说一句话（普通人/从业者/区域相关）
* `history_echo`：历史播客库命中强度（相似主题/实体）

**降级策略：**

* 无 `published_at`：`time_signal=0.5`（中性，不拉胯）
* 无历史库/无命中：`history_echo=0.0`，但不得导致整体全丢（权重可调）
* 无多源重复：`trend_signal` 不为 0（用"同日内部重复+来源权重"启发式）

---

### 2.5 统一打分体系（Topic Score）

**统一总分范围：0–100**（便于阈值与调参）

分为三块：

1. **内容价值分 `content_score`（0–60）**
   - archetype_mean: 0-3 → 0-40
   - personal_impact: 0-3 → 0-10
   - counter_intuitive: 0-3 → 0-10

2. **代理信号分 `proxy_score`（0–25）**
   - trend_signal: 0-1 → 0-10
   - time_signal: 0-1 → 0-5
   - persona_relevance: 0-1 → 0-5
   - history_echo: 0-1 → 0-5

3. **结构加成/惩罚 `structure_bonus`（-10~+15）**
   - continuity: 0-1 → 0-6
   - data_enrichable: 0-1 → 0-6
   - follow_up_potential: 0-1 → 0-3

最终：
`topic_score = content_score + proxy_score + structure_bonus`（clamp 0..100）

默认阈值（可配置）：

* `>= 70`：必播（priority=5）
* `55–70`：可播（priority=3~4，按排序）
* `< 55`：丢弃或候补（priority=1~2）

---

### 2.6 LLM 决策门（Topic Gate）

对 TopN topics 做 LLM 最终决策（宁缺毋滥），输出：

```json
{
  "should_publish": true|false,
  "publish_priority": 1-5,
  "target_audience": ["普通用户","从业者","区域相关"],
  "core_hook": "一句话为什么值得听",
  "risk": "无聊/争议/数据不足等"
}
```

**优先级定义：5最高，1最低**

**失败降级：**

* LLM Gate 失败 → 直接按 `topic_score` 与阈值决策（不阻断流程）

---

## 3. 数据模型（models.py）

### 3.1 主题母型

```python
class TopicArchetype(str, Enum):
    CHANGE_HAPPENING = "change_happening"
    PERSONAL_IMPACT = "personal_impact"
    COMPETITION_CONFLICT = "competition_conflict"
    RISK_OPPORTUNITY = "risk_opportunity"
    COUNTER_INTUITIVE = "counter_intuitive"
    INFLECTION_TREND = "inflection_trend"
```

### 3.2 ItemSignals（LLM#0 输出契约）

```python
class SignalScores(BaseModel):
    archetypes: Dict[TopicArchetype, float]  # 0-3
    continuity: float                        # 0-1
    why_now: float                           # 0-1
    data_enrichable: float                   # 0-1
    follow_up_potential: float               # 0-1
```

### 3.3 TopicCandidate（聚合后的候选主题）

```python
class TopicCandidate(BaseModel):
    topic_id: str                            # 稳定的主题ID
    title: str
    items: List[str]                         # 包含的item IDs
    entities: List[str]                      # 关键实体
    signal_profile: SignalScores             # 聚合后的均值
    proxy_signals: ProxySignals | None = None

    # 统一分数体系 0-100
    topic_score: float = 0.0                 # 0-100
    score_breakdown: Dict[str, float] = {}   # 详细构成

    # 规则决策
    should_publish_by_rule: bool = False
    publish_priority: int = 1                # 1-5, 5最高
    
    # LLM Gate决策（可选）
    should_publish: bool = False             # 最终是否发布
```

### 3.4 ProxySignals

```python
class ProxySignals(BaseModel):
    trend_signal: float = 0.0       # 0-1
    time_signal: float = 0.5        # 0-1 (默认中性)
    persona_relevance: float = 0.3  # 0-1 (默认基础分)
    history_echo: float = 0.0       # 0-1
```

### 3.5 TopicScoreBreakdown

```python
class TopicScoreBreakdown(BaseModel):
    topic_id: str
    
    # 内容价值分 (0-60)
    content_score: float = 0.0
    archetype_mean_score: float = 0.0
    personal_impact_score: float = 0.0
    counter_intuitive_score: float = 0.0
    
    # 代理信号分 (0-25)
    proxy_score: float = 0.0
    trend_score: float = 0.0
    time_score: float = 0.0
    persona_score: float = 0.0
    history_echo_score: float = 0.0
    
    # 结构加成 (-10 ~ +15)
    structure_bonus: float = 0.0
    continuity_bonus: float = 0.0
    data_enrichable_bonus: float = 0.0
    follow_up_bonus: float = 0.0
    
    # 总分 (0-100)
    total_score: float = 0.0
    
    # 决策阈值
    threshold_must_publish: float = 70.0
    threshold_maybe_publish: float = 55.0
    
    decision: str = "discard"  # must/maybe/discard
```

---

## 4. LLM#0 信号打标签（signal_tagging.py）

### 4.1 Prompt（强制 JSON、低成本）

**System**

```
你是播客选题信号分析器。只输出 JSON，不要解释。
评分必须保守，不确定就给低分。
```

**User**

```
分析这条新闻是否具备"听众会想听"的信号。给出母型得分(0-3)与结构得分(0-1)，并提取实体。

【标题】{title}
【摘要】{summary}
【来源】{source}
【发布时间】{published_at}

输出JSON：
{
  "archetypes": {
    "change_happening": 0-3,
    "personal_impact": 0-3,
    "competition_conflict": 0-3,
    "risk_opportunity": 0-3,
    "counter_intuitive": 0-3,
    "inflection_trend": 0-3
  },
  "continuity": 0-1,
  "why_now": 0-1,
  "data_enrichable": 0-1,
  "follow_up_potential": 0-1,
  "entities": ["..."],
  "why_now_reason": "一句话"
}
```

### 4.2 成本控制（必须实现）

* **去重后再打标签**：相同 `url` 或 `title+source` 直接复用
* **缓存 key**：`sha256(title + summary + url)`，TTL 至少 7 天
* 并发上限、重试、超时可配置
* 可批量（可选）：N 条合并一次调用，降低成本（后续优化）

---

## 5. topic_id 稳定生成（topic_mining.py）

### 5.1 推荐稳定策略（canonical key）

不要用完整标题做主键（太飘）。建议用 **canonical key**：

* 主实体（公司/城市/人物/机构）Top1-3
* 动作词（发布/宣布/裁员/融资/监管/事故/分会场/合作）
* 客体或领域（模型/政策/城市/芯片/平台）
* 时间桶（可选：按月或按季度，仅用于避免完全不同事件碰撞）

示例：
`canonical = "openai|release|gpt5|2025Q4"` 

topic_id：
`topic:{sha256(canonical)[:12]}` 

**降级策略**：如果无法提取动作/领域，使用规范化标题（去年份、去标点、去营销词）

---

## 6. 代理信号计算（proxy_signals.py）

### 6.1 trend_signal（轻量启发式）

* 同一 topic 在当天命中的 RSS 源数量 / 总源数（上限1）
* 同一 topic 在当天 items 数量（归一化）
* 标题关键词近 7 天出现频率上升（可选）

### 6.2 time_signal

* `0-24h: 1.0` 
* `24-48h: 0.7` 
* `>48h: 0.3` 
* 无发布时间：`0.5`（降级：中性值）

### 6.3 persona_relevance

* 基于 `personal_impact`、实体类型（城市/政策/消费产品）推断
* 输出 0–1，默认 0.3（降级：基础分）

### 6.4 history_echo（必须接历史播客检索）

* 先做简单全文检索（title/entities）
* TopK 命中 → 归一成 0–1
* 无命中：返回0.0（降级：不影响整体，权重可调）

---

## 7. 打分与过滤（topic_scoring.py）

### 7.1 统一分数（0–100）

**实现（默认）**：

* `content_score (0–60)`：
  * archetype_mean(0-3) → 0–40
  * personal_impact(0-3) → 0–10
  * counter_intuitive(0-3) → 0–10

* `proxy_score (0–25)`：
  * trend_signal(0-1) → 0–10
  * time_signal(0-1) → 0–5
  * persona_relevance(0-1) → 0–5
  * history_echo(0-1) → 0–5

* `structure_bonus (-10 ~ +15)`：
  * continuity(0-1) → 0–6
  * data_enrichable(0-1) → 0–6
  * follow_up_potential(0-1) → 0–3

最终：
`topic_score = content_score + proxy_score + structure_bonus`（clamp 0..100）

并输出 `score_breakdown`（可观测）。

### 7.2 决策阈值（默认，可配置）

* `>= 70`：必播（priority=5）
* `55–70`：可播（priority=3~4）
* `< 55`：丢弃/候补（priority=1~2）

---

## 8. LLM Topic Gate（topic_gate.py）

### 8.1 Prompt（严格、宁缺毋滥）

**System**

```
你是播客选题编辑。目标是宁缺毋滥：没有明显听众价值就拒绝。
只输出JSON。
publish_priority 1-5，5最高。
```

**User**

```
这是一个主题候选，请判断是否值得做成 1-2 分钟播客主题。

候选摘要：
- topic_id: {topic_id}
- title: {title}
- entities: {entities}
- topic_score: {topic_score}/100
- score_breakdown: {score_breakdown}
- representative_items: {top_items_brief}

输出JSON：
{
  "should_publish": true|false,
  "publish_priority": 1-5,
  "target_audience": ["普通用户","从业者","区域相关"],
  "core_hook": "一句话为什么值得听",
  "risk": "无聊/争议/数据不足等"
}
```

### 8.2 降级

* Gate 超时/解析失败 → 直接用规则阈值与 `topic_score` 产生决策
* `score >= 70`: priority=5, should_publish=True
* `score >= 55`: priority=3, should_publish=True
* `score < 55`: priority=1, should_publish=False

---

## 9. 配置（config/settings.yaml）

```yaml
auto_topic:
  enabled: false
  time_window_days: 7
  
  scoring:
    # 内容价值分 (0-60)
    archetype_mean_max: 40.0
    personal_impact_max: 10.0
    counter_intuitive_max: 10.0
    # 代理信号分 (0-25)
    trend_max: 10.0
    time_max: 5.0
    persona_max: 5.0
    history_echo_max: 5.0
    # 结构加成 (-10 ~ +15)
    continuity_max: 6.0
    data_enrichable_max: 6.0
    follow_up_max: 3.0
    # 阈值 (0-100)
    threshold_must_publish: 70.0
    threshold_maybe_publish: 55.0

  gate:
    top_n: 10
    fallback_to_score: true

  history:
    dir: "out/history_podcasts"
    top_k: 3
```

---

## 10. 使用方式

### 启用自动选题

编辑`config/settings.yaml`：
```yaml
auto_topic:
  enabled: true  # 改为true
```

### 运行fetch流程

```bash
python run.py --step fetch --date 2025-12-29
```

### 观察日志

```
INFO topic_selection.pipeline ============================================================
INFO topic_selection.pipeline 开始自动选题pipeline
INFO topic_selection.pipeline ============================================================
INFO topic_selection.signal_tagging 步骤1: 为items打信号标签 (LLM#0)...
INFO topic_selection.topic_mining 步骤2: 挖掘主题候选...
INFO topic_selection.proxy_signals 步骤3: 计算代理信号...
INFO topic_selection.topic_scoring 步骤4: 主题打分与过滤...
INFO topic_selection.topic_gate 步骤5: LLM决策门...
INFO topic_selection.topic_gate   ✅ 通过: topic:abc123 (优先级=5/5, hook=AI技术突破...)
INFO topic_selection.pipeline 自动选题pipeline完成: 2 个主题通过
```

### 禁用（回滚）

```yaml
auto_topic:
  enabled: false  # 改为false
```

---

## 11. 测试与验证

必须覆盖：

* signals JSON 解析正确
* topic_id 跨天稳定（给定相同 canonical key）
* 结构性淘汰规则生效
* topic_score 计算 + breakdown 正确（0-100范围）
* Gate 失败时能降级
* 被淘汰 topics 不会进入后续"安思派校验/LLM增强"阶段

---

## 12. 已知风险与建议

* **LLM#0 成本与延迟**：必须缓存 + 去重 + 并发上限
* **topic_id 稳定性**：如果实体提取质量差，建议先把 canonical key 简化为 "Top实体 + 领域词 + 动作词（可选）"
* **proxy 信号初期偏弱**：trend/time/persona/history_echo 建议从"轻量启发式"起步，后续再替换为更强的趋势源与 embedding

---

## 13. 关键修复点总结

相比初版文档，本优化版修复了以下致命问题：

1. **✅ 统一分数体系到0-100**：content(0-60) + proxy(0-25) + structure(-10~+15)
2. **✅ 修复阈值**：70必播，55可播（替代混乱的10/15）
3. **✅ topic_id稳定策略**：使用canonical key（实体+动作+领域）替代标题hash
4. **✅ 补齐降级策略**：time_signal=0.5, persona=0.3, history_echo=0.0但不影响整体
5. **✅ 统一优先级定义**：5最高，1最低（全篇一致）
6. **✅ 明确边界**：模块输入/输出契约清晰
7. **✅ 成本控制说明**：缓存、去重、并发策略

---

**更新日期**：2025-12-29  
**版本**：1.0.1（优化版）  
**作者**：Auto-Podcast Team
