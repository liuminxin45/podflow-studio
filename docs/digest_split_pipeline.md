# Digest Split Pipeline - 汇总型RSS拆分流水线

## 一、问题背景

### 原有问题

当前系统假设：**1 条 RSS item ≈ 1 个新闻事件**

但现实中存在"汇总型 RSS 源"，典型如：
- 标题是日期（如"2025-12-29 星期一 / 每天60秒读懂世界"）
- 内容中包含 10–15 条完全不相关的热点
- 实体跨度极大（无人机 / 财政部 / 火灾 / 消费政策 等）

**现状问题**：
1. 聚类阶段把"一条汇总 RSS"当作一个 cluster
2. topic_mining 把该 cluster 转成一个 TopicCandidate
3. 多个不相关实体被当作一个主题统一打分
4. topic_score、proxy_signals、LLM Gate 全部被污染
→ **选题结果严重失真**

**根因**：
- RSS item 粒度不一致
- 缺少"事件拆分（segmentation）"阶段
- 聚类发生得太早

---

## 二、解决方案

### 核心原则

**后续所有"聚类 / 打分 / 选题 / Gate"，都必须基于「单一事件粒度」**

### 新流程

```
RSS items
  ↓
pre_filter (低成本规则)
  ↓
digest_detector (识别"汇总型/多事件"item)
  ├─ 普通 item → normal_items
  └─ 汇总 item → LLM_splitter → split_items (多个独立事件)
  ↓
merge(normal_items + split_items)
  ↓
去重
  ↓
聚类
  ↓
item_signal_tagging
  ↓
topic_candidate_mining
  ↓
topic_scoring / gate
  ↓
后续流程
```

**关键变化**：**"拆分"必须发生在"聚类"之前**

---

## 三、模块说明

### 1. Digest Detector（汇总型RSS检测）

**文件**：`src/fetch/digest_detector.py`

**目标**：
- 低成本判断一个 RSS item 是否包含多个不相关事件
- 只有判定为 digest 的 item，才允许进入 LLM 拆分

**检测特征**：
1. **标题特征**：日期/星期/"今日要闻/盘点/速览/60秒"
2. **内容列表**：包含多条编号/短句列表（≥5条）
3. **实体数量**：明显偏多（≥8个）
4. **列表密度**：内容长度与列表项数量比例

**输出**：
```python
DigestDetectionResult(
    is_digest: bool,
    confidence: float,  # 0.0-1.0
    reasons: list[str],
    metadata: dict
)
```

**使用示例**：
```python
from src.fetch.digest_detector import DigestDetector

detector = DigestDetector()
result = detector.detect(item)

if result.is_digest:
    print(f"检测到汇总型RSS，置信度: {result.confidence:.2f}")
    print(f"原因: {result.reasons}")
```

---

### 2. LLM Splitter（仅用于拆分，不做判断）

**文件**：`src/fetch/digest_splitter.py`

**目标**：
- 将 1 条"汇总型 RSS"拆成 N 条"单一事件 item"
- 不得补充事实，不得脑补
- 输出必须结构化、可追溯

**约束**：
- 只对 `is_digest=true` 的 item 调用
- LLM 输出 JSON array，每个子事件包含：
  - `sub_id`（稳定，可追溯到原 item）
  - `title`
  - `summary`（必须能在原文找到对应句）
  - `entities`
  - `keywords`
  - `evidence_span`（原文片段）
- 如果无法可靠拆分，允许返回空数组

**输出**：
```python
SplitResult(
    success: bool,
    sub_events: list[SubEvent],
    error: Optional[str],
    metadata: dict
)
```

**使用示例**：
```python
from src.fetch.digest_splitter import DigestSplitter

splitter = DigestSplitter()
result = splitter.split(digest_item)

if result.success:
    print(f"拆分成功，生成 {len(result.sub_events)} 个子事件")
    for sub in result.sub_events:
        print(f"  - {sub.title}")
```

---

### 3. 统一 Item 抽象

拆分后生成的 `sub_item`，必须：
- 与普通 RSS item 使用**同一数据结构**
- 在后续 pipeline 中"不可区分来源"

**标准字段**：
```python
{
    "id": str,           # 唯一ID
    "title": str,
    "summary": str,
    "content": str,
    "url": str,
    "published_at": str,
    "source": str,
    "category": str,
    "_split_from": {     # 元数据：标记这是拆分来的
        "parent_id": str,
        "parent_title": str,
        "evidence_span": str,
        "entities": list[str],
        "keywords": list[str]
    }
}
```

---

## 四、配置说明

### 配置文件

**位置**：`config/digest_split.example.yaml`

```yaml
digest_split:
  # 是否启用汇总型RSS拆分功能
  enabled: true
  
  # LLM缓存配置
  cache_ttl_seconds: 86400  # 24小时
  enable_cache: true
  
  # 黑名单源（直接跳过，不进行拆分）
  blacklist_sources: []
  
  # 检测器配置
  detector:
    title_confidence_threshold: 0.5
    min_list_items: 5
    min_entity_count: 8
  
  # 拆分器配置
  splitter:
    temperature: 0.1
    max_content_length: 3000
    strict_validation: true
```

### 在 channel_config.json 中启用

```json
{
  "digest_split": {
    "enabled": true,
    "cache_ttl_seconds": 86400,
    "enable_cache": true
  }
}
```

---

## 五、Pipeline 集成

### 修改位置

**文件**：`run.py` 的 `step_fetch()` 函数

**插入位置**：在 `dedup_items()` 之后，`cluster_items()` 之前

```python
# 去重
fetched = dedup_items(normalized, max_items=max_items)

# ===== 汇总型RSS拆分（在聚类之前） =====
digest_split_cfg = cfg.get("digest_split") or {}
digest_split_enabled = digest_split_cfg.get("enabled", False)

if digest_split_enabled:
    # 1. 检测汇总型items
    normal_items, digest_items = detect_digest_items(fetched)
    
    # 2. 拆分汇总型items
    if digest_items:
        splitter = DigestSplitter()
        split_items, split_stats = split_digest_items(digest_items, splitter)
        
        # 3. 合并普通items和拆分后的items
        fetched = normal_items + split_items

# 聚类（此时所有items都是单一事件粒度）
cluster_cfg = _build_cluster_config(cfg)
clusters = cluster_items(list(items_by_id.values()), config=cluster_cfg)
```

---

## 六、可观测性

### 日志输出

```
============================================================
开始汇总型RSS检测与拆分...
============================================================
检测完成: 45 普通items, 3 汇总items
拆分完成:
  - 成功拆分: 3/3
  - 失败拆分: 0
  - 生成子事件: 18
  - 平均每个汇总拆出: 6.0 个子事件
合并后总计: 63 items (45 普通 + 18 拆分)
============================================================
```

### Artifacts 输出

**位置**：`out/fetch_archives/artifacts/`

- `digest_items.jsonl`：检测到的汇总型items
- `split_items.jsonl`：拆分后的子事件items
- `normalized_items.jsonl`：所有规范化后的items

---

## 七、测试

### 运行测试

```bash
python tests/test_digest_split.py
```

### 测试覆盖

1. **test_digest_detector_date_title**：纯日期标题检测
2. **test_digest_detector_normal_news**：普通新闻不被误判
3. **test_digest_detector_list_content**：列表内容检测
4. **test_detect_digest_items_batch**：批量检测
5. **test_split_items_to_dict**：拆分结果转换
6. **test_pipeline_integration**：完整pipeline集成

---

## 八、成本控制

### 1. Digest Detector（无LLM成本）

- 纯规则/启发式
- 失败率低
- 可配置阈值

### 2. LLM Splitter（有成本）

**缓存机制**：
- 基于内容 hash 的缓存
- 默认 TTL：24小时
- 避免重复拆分相同内容

**黑名单机制**：
- 配置 `blacklist_sources`
- 直接跳过不可靠的源

**成本估算**：
- 假设每天 5 个汇总型RSS
- 每个汇总 ~2000 tokens
- 每天成本：5 × 2000 × 2 (input+output) × $0.14/1M ≈ $0.003

---

## 九、验证标准

### 完成标准

当以下情况成立，视为完成：

✅ **"60s-每天60秒读懂世界"这类 RSS**：
  - 不再直接生成 TopicCandidate
  - 要么被过滤
  - 要么被拆成多个独立事件后参与选题

✅ **topic_candidate 中的 entities 数量显著下降**

✅ **topic_score 不再因为"杂糅实体"而虚高**

✅ **LLM Gate 的拒绝率下降、命中率更稳定**

---

## 十、新旧流程对比

### 旧流程

```
RSS items (粒度不一致)
  ↓
去重
  ↓
聚类 ← ❌ 汇总型RSS被当作一个cluster
  ↓
topic_mining ← ❌ 生成污染的TopicCandidate
  ↓
topic_scoring ← ❌ 打分失真
  ↓
LLM Gate ← ❌ 决策不可靠
```

### 新流程

```
RSS items (粒度不一致)
  ↓
digest_detector (识别汇总型)
  ├─ 普通 items
  └─ 汇总 items → LLM_splitter → 拆分为单一事件
  ↓
merge (统一为单一事件粒度) ✅
  ↓
去重
  ↓
聚类 ✅ 所有items都是单一事件
  ↓
topic_mining ✅ 生成准确的TopicCandidate
  ↓
topic_scoring ✅ 打分真实
  ↓
LLM Gate ✅ 决策可信
```

---

## 十一、文件清单

### 新增文件

1. `src/fetch/digest_detector.py` - 汇总检测器
2. `src/fetch/digest_splitter.py` - LLM拆分器
3. `config/digest_split.example.yaml` - 配置示例
4. `tests/test_digest_split.py` - 测试文件
5. `docs/digest_split_pipeline.md` - 本文档

### 修改文件

1. `run.py` - 集成digest split到主流程

### 输出文件（运行时生成）

1. `out/fetch_archives/artifacts/digest_items.jsonl`
2. `out/fetch_archives/artifacts/split_items.jsonl`

---

## 十二、FAQ

### Q1: 为什么不在聚类后拆分？

**A**: 聚类后拆分会导致：
- 汇总型RSS已经形成cluster，无法再拆
- 后续打分、选题都基于错误的cluster
- 无法修正已经污染的数据

### Q2: 检测器会不会误判？

**A**: 检测器使用多个特征综合判断，误判率低：
- 置信度阈值：0.5（可配置）
- 多个特征互相验证
- 即使误判，LLM拆分失败会返回空数组，不影响原item

### Q3: LLM拆分失败怎么办？

**A**: 拆分失败的item会被丢弃（不进入后续流程），因为：
- 无法可靠拆分说明内容质量差
- 保留会污染后续选题
- 可通过日志观察失败率，调整策略

### Q4: 成本会不会太高？

**A**: 成本可控：
- 缓存机制避免重复拆分
- 黑名单机制跳过不可靠源
- 每天预计成本 < $0.01

### Q5: 如何回滚？

**A**: 配置中设置 `enabled: false` 即可关闭，不影响其他功能

---

## 十三、后续优化方向

1. **检测器优化**：
   - 增加更多启发式规则
   - 支持自定义检测模式
   - 学习历史检测结果

2. **拆分器优化**：
   - 支持更多LLM提供商
   - 优化prompt提升准确率
   - 增加拆分质量评估

3. **可观测性增强**：
   - 拆分成功率监控
   - 子事件质量评分
   - A/B测试对比

4. **成本优化**：
   - 智能缓存策略
   - 批量拆分优化
   - 本地模型fallback

---

**版本**: 1.0.0  
**更新时间**: 2025-12-29  
**作者**: Auto-Podcast Team
