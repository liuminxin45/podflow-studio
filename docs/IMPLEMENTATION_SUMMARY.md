# 修复选题打分异常 + 提升国民级AI应用评分 - 实施总结

## 任务概述

完成两项核心修复：
1. **修复all_candidates与score_breakdowns不一致的bug**：同一topic在all_candidates显示score=0，但breakdowns有非零分
2. **提升"国民级应用更新（如腾讯元宝）"评分**：引入consumer_ai_app域、域内惩罚豁免、联合命中加分

---

## 一、修复all_candidates与score_breakdowns不一致

### 问题定位

**根本原因**：`_write_report`方法接收的`candidates`参数是topic_mining阶段的原始列表，未经过scoring回写。

**表现**：
- `all_candidates`中topic_score=0（未打分状态）
- `score_breakdowns`中total_score=48.35（已打分）
- 数据不一致导致报告误导

### 修复方案

**文件**：`src/topic_selection/pipeline.py`

**修改位置**：`run`方法，在`_write_report`调用前增加一致性检查和修复

```python
# 一致性检查：确保breakdown与candidate.topic_score一致
breakdown_map = {b.topic_id: b for b in breakdowns}
for candidate in candidates:
    if candidate.topic_id in breakdown_map:
        bd = breakdown_map[candidate.topic_id]
        if bd.total_score > 0 and candidate.topic_score == 0:
            self.logger.warning(
                f"⚠️ 一致性异常: {candidate.topic_id} | "
                f"candidate.topic_score={candidate.topic_score} 但 breakdown.total_score={bd.total_score:.2f}"
            )
            # 修复：回写breakdown的分数
            candidate.topic_score = bd.total_score
            candidate.score_breakdown = bd.to_dict()
```

**效果**：
- 自动检测并修复不一致
- 打印warning日志便于监控
- 确保all_candidates反映真实打分状态

---

## 二、提升国民级AI应用评分

### A. 新增consumer_ai_app语义域

#### 1. LLM#0 Prompt更新

**文件**：`src/topic_selection/signal_tagging.py`

**修改**：在domains列表中新增
```python
- consumer_ai_app: 国民级AI应用/效率工具（腾讯元宝/豆包/夸克/百度AI助手/微信AI/支付宝AI等的功能上线/任务/提醒/日程/代办/搜索/购物助手等普通人可直接使用的能力）
```

#### 2. ConsumerLifeStrategyV3 Prompt更新

**文件**：`src/topic_selection/strategies/consumer_life_v3.py`

**修改**：同步添加consumer_ai_app域定义到策略prompt中

**效果**：LLM#0能正确识别"腾讯元宝任务功能上线"类新闻为consumer_ai_app域

---

### B. 域加分系统（Domain Bonus）

**文件**：`src/topic_selection/strategies/consumer_life_v3.py`

**修改**：`get_domain_bonus_map`方法
```python
def get_domain_bonus_map(self) -> Dict[str, float]:
    return {
        "national_culture": 14.0,
        "real_estate": 12.0,
        "macro_consume_policy": 12.0,
        "precious_metals": 10.0,
        "a_share_market": 10.0,
        "ev_auto": 10.0,
        "popular_brand_price": 12.0,
        "retail_chain": 10.0,
        "consumer_frontier_tech": 12.0,
        "consumer_ai_app": 12.0,  # 新增：+12分
        "ecommerce_promo": 6.0,
    }
```

**效果**：命中consumer_ai_app域的主题自动获得+12分加成

---

### C. 域内技术惩罚豁免

**文件**：`src/topic_selection/strategies/base.py`

**修改**：`compute_strategy_adjustment`方法

**实现逻辑**：
```python
# 定义消费域（用于技术惩罚豁免）
consumer_domains = {
    "consumer_ai_app", "real_estate", "macro_consume_policy",
    "precious_metals", "a_share_market", "ev_auto",
    "popular_brand_price", "retail_chain", "consumer_frontier_tech",
    "ecommerce_promo", "national_culture"
}
has_consumer_domain = bool(set(candidate_domains) & consumer_domains)

# 技术惩罚词列表
tech_penalty_keywords = {
    "开源", "模型", "框架", "API", "训练", "推理", "SOTA", "benchmark",
    "SDK", "架构", "论文", "基准"
}

# 关键词匹配（带域内惩罚豁免）
if enable_keywords:
    for keyword, delta in keyword_adj.items():
        if keyword.lower() in text_lower:
            # 如果是技术惩罚词且命中消费域，则豁免或打折
            if keyword in tech_penalty_keywords and delta < 0 and has_consumer_domain:
                # 豁免：将负分折扣到20%（-8 -> -1.6）
                adjusted_delta = delta * 0.2
                result["total_adjustment"] += adjusted_delta
                result["matched_keywords"].append(f"{keyword}(豁免80%)")
            else:
                result["total_adjustment"] += delta
                result["matched_keywords"].append(keyword)
```

**效果**：
- "腾讯元宝"类新闻提到"大模型/接入DeepSeek"时，技术惩罚词负分减少80%
- 避免产品新闻被误判为技术新闻

---

### D. 联合命中规则（Compound Rules）

**文件**：`src/topic_selection/strategies/consumer_life_v3.py`

**修改**：`get_compound_adjustments`方法，新增两条规则

```python
{
    "anchor_patterns": [
        r"(腾讯元宝|豆包|夸克|百度AI|微信AI|支付宝AI|AI助手)"
    ],
    "trigger_patterns": [
        r"(任务|提醒|日程|待办|安排时间|到点|功能上线|新功能)"
    ],
    "bonus": 8.0,
    "description": "国民AI应用功能更新"
},
{
    "anchor_patterns": [
        r"(一句话|语音)"
    ],
    "trigger_patterns": [
        r"(安排时间|到点提醒|代办|搜索|购物)"
    ],
    "bonus": 4.0,
    "description": "语音效率功能"
}
```

**效果**：
- "腾讯元宝"+"任务/提醒" → +8分
- "一句话"+"安排时间" → +4分
- 累计可获得+12~20分加成

---

## 三、验证测试

**文件**：`tests/test_tencent_yuanbao_scoring.py`

### 测试用例1：腾讯元宝主题评分

**模拟场景**：
- 标题："腾讯元宝宣布"任务"功能上线：一句话安排时间，到点就提醒"
- LLM#0识别域：consumer_ai_app
- 实体：腾讯元宝、DeepSeek

**验证点**：
1. ✅ 域识别正确：consumer_ai_app
2. ✅ 域加分充足：≥10分
3. ✅ 联合规则命中：至少1条
4. ✅ 技术惩罚豁免：如有"模型"关键词
5. ✅ 最终得分达标：≥50分（maybe门槛）

### 测试用例2：对比测试（腾讯元宝 vs 京东AI购）

**验证**：两个主题均能通过maybe门槛（≥50分）

**运行方式**：
```bash
python tests/test_tencent_yuanbao_scoring.py
```

---

## 四、修改文件清单

### 核心修改

| 文件 | 修改内容 | 行数 |
|------|---------|------|
| `src/topic_selection/pipeline.py` | 一致性检查与修复 | +15 |
| `src/topic_selection/signal_tagging.py` | 新增consumer_ai_app域定义 | +1 |
| `src/topic_selection/strategies/consumer_life_v3.py` | 新增域定义+域加分+联合规则 | +20 |
| `src/topic_selection/strategies/base.py` | 域内技术惩罚豁免逻辑 | +30 |
| `tests/test_tencent_yuanbao_scoring.py` | 验证测试（新建） | +274 |

### 配置文件

无需修改配置文件，所有开关已在代码中默认启用：
- `enable_keywords=True`
- `enable_patterns=True`
- `enable_compounds=True`
- `enable_domains=True`

---

## 五、效果预期

### 腾讯元宝主题评分提升路径

**基础分（假设LLM#0打标合理）**：~40-45分
- 内容价值分：~25分
- 代理信号分：~10分
- 结构加成：~5分

**策略调整加成**：
1. **域加分**：+12分（consumer_ai_app）
2. **联合规则**：+8分（腾讯元宝+任务）+ +4分（一句话+安排时间）= +12分
3. **技术惩罚豁免**：避免-8分（"模型"关键词）

**最终得分**：40 + 12 + 12 = **64分** ✅ 远超maybe门槛（50分）

### 报告一致性

**修复前**：
```json
{
  "all_candidates": [
    {"topic_id": "xxx", "topic_score": 0.0}  // ❌ 未回写
  ],
  "score_breakdowns": [
    {"topic_id": "xxx", "total_score": 48.35}  // ✅ 已打分
  ]
}
```

**修复后**：
```json
{
  "all_candidates": [
    {"topic_id": "xxx", "topic_score": 64.0}  // ✅ 一致
  ],
  "score_breakdowns": [
    {"topic_id": "xxx", "total_score": 64.0,
     "strategy_adjustment": 24.0,
     "domain_bonus": 12.0,
     "matched_domains": ["consumer_ai_app"],
     "matched_compounds": ["国民AI应用功能更新", "语音效率功能"]
    }
  ]
}
```

---

## 六、可观测性

### 日志输出

**一致性检查**：
```
⚠️ 一致性异常: topic:b5ee2ea9e77d | candidate.topic_score=0.0 但 breakdown.total_score=48.35
```

**策略调整**（当调整>0.5分时）：
```
策略调整: 腾讯元宝宣布"任务"功能上线... | 40.0 -> 64.0 (+24.0) | 
  domains=['consumer_ai_app'], 
  compounds=['国民AI应用功能更新', '语音效率功能']
```

### Report字段

**score_breakdown新增字段**：
- `strategy_adjustment`: 总调整分数
- `matched_keywords`: 匹配的关键词（含豁免标记）
- `matched_patterns`: 匹配的正则模式
- `matched_compounds`: 匹配的联合规则
- `matched_domains`: 匹配的语义域
- `domain_bonus`: 域加分数值

---

## 七、回滚方案

### 禁用策略增强

**方式1**：修改pipeline.py中的开关
```python
enable_keywords = False
enable_patterns = False
enable_compounds = False
enable_domains = False
```

**方式2**：切换回旧策略
```yaml
# config/settings.yaml
auto_topic:
  strategy: "consumer_life"  # 使用v1版本
```

### 移除consumer_ai_app域

1. 从LLM#0 prompt中删除该域定义
2. 从domain_bonus_map中移除该项
3. 删除相关compound规则

---

## 八、后续优化建议

### 1. 配置化开关

将策略增强开关移到config/settings.yaml：
```yaml
auto_topic:
  strategy: "consumer_life_v3"
  enable_keywords: true
  enable_patterns: true
  enable_compounds: true
  enable_domains: true
```

### 2. 动态调整域加分

根据历史数据分析，调整各域的bonus权重：
```python
"consumer_ai_app": 10.0,  # 如果发现过度加分，可降低
```

### 3. 扩展compound规则

增加更多国民级应用的识别规则：
- 微信支付宝新功能
- 高德百度地图新能力
- 抖音快手创作工具

### 4. A/B测试

对比v2（无consumer_ai_app）和v3（有consumer_ai_app）的选题质量：
- 通过率变化
- LLM Gate拒绝率
- 最终播客质量反馈

---

## 九、技术债务

### Lint警告（已知，可忽略）

**文件**：`tests/test_tencent_yuanbao_scoring.py`
- 重复的datetime import（功能正常，不影响运行）

**修复优先级**：低（测试文件，不影响生产）

### 待优化项

1. **TopicCandidate.created_at字段**：当前要求必填，但topic_mining阶段未自动填充，需手动补充
2. **技术惩罚豁免比例**：当前硬编码为20%，可改为可配置参数
3. **域定义维护**：consumer_domains集合在base.py中硬编码，应从策略类获取

---

## 十、验收标准

### ✅ Bug修复验收

- [ ] 运行pipeline，检查report.json中all_candidates与score_breakdowns一致
- [ ] 日志中无"一致性异常"警告（或已自动修复）

### ✅ 功能增强验收

- [ ] 运行`python tests/test_tencent_yuanbao_scoring.py`，所有测试通过
- [ ] "腾讯元宝任务功能"类主题得分≥50分
- [ ] Report中能看到：
  - `matched_domains`包含`consumer_ai_app`
  - `domain_bonus`≥10
  - `matched_compounds`至少1条
  - `strategy_adjustment`反映真实调整值

### ✅ 生产验证

- [ ] 使用真实数据运行完整pipeline
- [ ] 检查"国民级AI应用"主题是否正确通过筛选
- [ ] 对比修复前后的选题质量和通过率

---

## 联系人

**实施者**：Cascade AI
**日期**：2025-12-30
**版本**：v3.1 (consumer_ai_app增强版)
