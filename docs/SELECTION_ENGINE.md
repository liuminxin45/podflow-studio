# Selection Engine Architecture

## 概述

Selection Engine 是 Auto-Podcast vNext 的核心组件，负责从大量内容中选择最有价值的故事。

## 设计目标

1. **质量优先**：选择最有价值、最有影响力的内容
2. **多样性**：避免主题、来源过于集中
3. **可解释**：每个选择/拒绝决策都有明确理由
4. **可控制**：通过配置调整选择策略

## 核心流程

```
原始内容 (N items)
    ↓
URL去重 → 内容去重 → SimHash去重
    ↓
Story Clusters (M clusters, M << N)
    ↓
多维度评分 (freshness, impact, trust, quality)
    ↓
约束过滤 (cooldown, diversity, similarity)
    ↓
Top-K Selection
    ↓
选中的故事 (K items, K << M)
```

## 去重机制

### 1. URL去重

**目的**：过滤完全相同的链接

**策略**：
```python
def normalize_url(url: str) -> str:
    # 1. 统一协议 (http → https)
    # 2. 移除查询参数
    # 3. 移除fragment (#)
    # 4. 统一域名大小写
    # 5. 移除尾部斜杠
    return normalized_url
```

**指纹**：`url_fingerprint = sha256(normalized_url)`

### 2. 内容去重

**目的**：过滤完全相同的内容

**策略**：
```python
def content_fingerprint(item: NewsItem) -> str:
    # 组合标题和正文
    text = f"{item.title}\n{item.content}"
    # 规范化空白
    text = normalize_whitespace(text)
    # SHA256哈希
    return sha256(text)
```

### 3. SimHash近似去重

**目的**：检测近似重复内容

**算法**：
```python
def simhash(text: str) -> int:
    # 1. 分词/分字
    tokens = tokenize(text)
    
    # 2. 计算每个token的哈希
    # 3. 加权累加到64位向量
    # 4. 向量二值化
    
    return 64bit_hash

def is_duplicate(hash1: int, hash2: int, threshold: int = 3) -> bool:
    # 汉明距离
    hamming_distance = popcount(hash1 ^ hash2)
    return hamming_distance <= threshold
```

**阈值选择**：
- `threshold = 3`: 严格（约95%相似）
- `threshold = 5`: 宽松（约90%相似）

## 聚类算法

### Story Clustering

**目的**：将相似新闻聚合为故事

**相似度计算**：
```python
def cluster_similarity(item1: NewsItem, item2: NewsItem) -> float:
    # SimHash相似度
    simhash_sim = 1 - (hamming_distance / 64)
    
    # 标题Jaccard相似度
    title_sim = jaccard_similarity(item1.title, item2.title)
    
    # 组合
    return simhash_sim * 0.7 + title_sim * 0.3
```

**聚类条件**：
```python
if (simhash_distance <= 3 and title_jaccard >= 0.3):
    merge_to_same_cluster()
```

### 聚类代表选择

从每个簇中选择最佳代表：
```python
def select_representative(cluster: List[NewsItem]) -> NewsItem:
    # 优先级：
    # 1. 来源可信度最高
    # 2. 内容质量最好
    # 3. 发布时间最新
    return best_item
```

## 评分系统

### 多维度评分

```python
def score_cluster(cluster: StoryCluster) -> float:
    score = (
        freshness_score(cluster) * freshness_weight +
        impact_score(cluster) * impact_weight +
        source_trust_score(cluster) * trust_weight +
        quality_score(cluster) * quality_weight
    )
    return score
```

### 1. 新鲜度评分 (Freshness)

```python
def freshness_score(cluster: StoryCluster) -> float:
    age_hours = (now - cluster.latest_published_at).hours
    
    # 指数衰减
    if age_hours <= 6:
        return 1.0
    elif age_hours <= 24:
        return 0.8
    elif age_hours <= 48:
        return 0.5
    else:
        return max(0.2, 1.0 / (age_hours / 24))
```

**权重**：
- Realtime模式：0.4（高）
- Research模式：0.1（低）

### 2. 影响力评分 (Impact)

```python
def impact_score(cluster: StoryCluster) -> float:
    # 基于多个因素
    factors = []
    
    # 1. 簇大小（报道数量）
    cluster_size_score = min(1.0, len(cluster.items) / 10)
    factors.append(cluster_size_score * 0.4)
    
    # 2. 来源多样性
    unique_domains = len(set(item.domain for item in cluster.items))
    diversity_score = min(1.0, unique_domains / 5)
    factors.append(diversity_score * 0.3)
    
    # 3. 关键词匹配
    keyword_score = match_important_keywords(cluster)
    factors.append(keyword_score * 0.3)
    
    return sum(factors)
```

### 3. 来源可信度 (Source Trust)

```python
def source_trust_score(cluster: StoryCluster) -> float:
    # 使用代表性条目的来源可信度
    representative = cluster.representative
    
    # 从source_policy.yaml加载
    trust = get_source_trust(representative.domain)
    
    # 0.0 - 1.0
    return trust
```

**可信度分级**：
- 0.9-1.0: 权威新闻机构（Reuters, AP）
- 0.7-0.9: 主流媒体
- 0.5-0.7: 一般来源
- 0.0-0.5: 需谨慎

### 4. 内容质量 (Quality)

```python
def quality_score(cluster: StoryCluster) -> float:
    item = cluster.representative
    
    factors = []
    
    # 1. 内容长度（适中为佳）
    length = len(item.content)
    if 500 <= length <= 3000:
        length_score = 1.0
    elif length < 500:
        length_score = length / 500
    else:
        length_score = max(0.5, 3000 / length)
    factors.append(length_score * 0.4)
    
    # 2. 提取置信度
    extract_conf = item.quality.extract_confidence
    factors.append(extract_conf * 0.3)
    
    # 3. 标题质量
    title_quality = assess_title_quality(item.title)
    factors.append(title_quality * 0.3)
    
    return sum(factors)
```

## 约束系统

### 1. 冷却期约束 (Cooldown)

**目的**：避免短期内重复相似话题

```python
def check_cooldown(cluster: StoryCluster, history: List[Episode]) -> bool:
    cooldown_hours = config.cooldown_hours  # 48小时
    
    for past_episode in history:
        for past_cluster in past_episode.clusters:
            # 检查相似度
            if is_similar(cluster, past_cluster):
                time_diff = now - past_episode.created_at
                if time_diff.hours < cooldown_hours:
                    return False  # 冷却期内，拒绝
    
    return True  # 通过
```

**例外关键词**：
```yaml
exception_keywords:
  - "重大突破"
  - "首次"
  - "历史性"
  - "紧急"
```

如果标题包含例外关键词，可突破冷却期限制。

### 2. 多样性约束 (Diversity)

**目的**：避免主题或来源过于集中

```python
def check_diversity(
    cluster: StoryCluster,
    selected: List[StoryCluster],
    config: DiversityConfig
) -> bool:
    # 1. 主题多样性
    topic_count = count_by_topic(selected, cluster.topic)
    if topic_count >= config.max_per_topic:
        return False
    
    # 2. 域名多样性
    domain_count = count_by_domain(selected, cluster.domain)
    if domain_count >= config.max_per_domain:
        return False
    
    return True
```

**配置示例**：
```yaml
diversity:
  max_per_topic: 4    # 每个主题最多4个
  max_per_domain: 3   # 每个域名最多3个
```

### 3. 标题相似度约束

**目的**：避免标题过于相似

```python
def check_title_similarity(
    cluster: StoryCluster,
    selected: List[StoryCluster],
    threshold: float = 0.7
) -> bool:
    for selected_cluster in selected:
        similarity = jaccard_similarity(
            cluster.title,
            selected_cluster.title
        )
        if similarity >= threshold:
            return False  # 太相似，拒绝
    
    return True
```

## 选择算法

### Greedy Selection with Constraints

```python
def select_clusters(
    clusters: List[StoryCluster],
    max_items: int,
    min_score: float,
    constraints: ConstraintConfig
) -> Tuple[List[StoryCluster], List[RejectionReason]]:
    
    # 1. 过滤低分簇
    candidates = [c for c in clusters if c.score >= min_score]
    
    # 2. 按分数排序
    candidates.sort(key=lambda c: c.score, reverse=True)
    
    selected = []
    rejected = []
    
    # 3. 贪心选择
    for cluster in candidates:
        if len(selected) >= max_items:
            rejected.append((cluster, "quota_exceeded"))
            continue
        
        # 检查约束
        if not check_cooldown(cluster, history):
            rejected.append((cluster, "cooldown_blocked"))
            continue
        
        if not check_diversity(cluster, selected, constraints):
            rejected.append((cluster, "diversity_blocked"))
            continue
        
        if not check_title_similarity(cluster, selected):
            rejected.append((cluster, "title_too_similar"))
            continue
        
        # 通过所有检查，选中
        selected.append(cluster)
    
    return selected, rejected
```

## 拒绝理由

每个被拒绝的簇都有明确的理由：

| 理由代码 | 说明 | 可调整参数 |
|---------|------|-----------|
| `score_too_low` | 分数低于阈值 | `min_score` |
| `quota_exceeded` | 已达到最大数量 | `max_items` |
| `cooldown_blocked` | 冷却期内 | `cooldown_hours` |
| `diversity_blocked` | 违反多样性约束 | `max_per_topic`, `max_per_domain` |
| `title_too_similar` | 标题过于相似 | `title_similarity_threshold` |

## 可解释性

### Selection Decision

每个选中的簇都包含选择理由：

```json
{
  "cluster_id": "cluster_123",
  "score": 0.85,
  "rank": 1,
  "selection_reason": "High impact story with strong source trust",
  "score_breakdown": {
    "freshness": 0.9,
    "impact": 0.85,
    "source_trust": 0.9,
    "quality": 0.75
  },
  "constraints_passed": [
    "cooldown",
    "diversity",
    "title_similarity"
  ]
}
```

### Rejection Reason

每个被拒绝的簇都包含拒绝理由：

```json
{
  "cluster_id": "cluster_456",
  "score": 0.72,
  "rejection_reason": "cooldown_blocked",
  "rejection_details": {
    "similar_to": "episode_20251225_cluster_789",
    "time_since_last": "36 hours",
    "cooldown_required": "48 hours"
  }
}
```

## 配置调优

### 提高内容质量

```yaml
scoring:
  quality_weight: 0.3  # 增加质量权重
  min_score: 0.7       # 提高最低分数
```

### 增加多样性

```yaml
diversity:
  max_per_topic: 3     # 减少每主题数量
  max_per_domain: 2    # 减少每域名数量
```

### 减少重复

```yaml
constraints:
  cooldown_hours: 72   # 延长冷却期
  title_similarity_threshold: 0.6  # 降低相似度阈值
```

## 性能优化

### 1. 批量处理

```python
# 批量计算SimHash
simhashes = batch_compute_simhash(items)

# 批量聚类
clusters = batch_clustering(simhashes)
```

### 2. 缓存历史数据

```python
# 缓存最近N天的选择历史
history_cache = load_recent_history(days=7)
```

### 3. 增量更新

```python
# 只处理新增内容
new_items = fetch_since_last_run()
```

## 监控指标

### 质量指标

- **7天重复率**：`< 5%`
- **平均分数**：`≥ 0.7`
- **选择率**：`selected / candidates`

### 多样性指标

- **主题分布熵**：越高越好
- **来源分布熵**：越高越好
- **标题相似度均值**：`< 0.5`

### 约束效果

- **冷却期拦截率**：被冷却期拒绝的比例
- **多样性拦截率**：被多样性拒绝的比例
- **例外触发率**：例外关键词触发的比例

## 故障排查

### 选中内容过少

1. 检查 `min_score` 是否过高
2. 检查约束是否过严
3. 检查输入内容质量

### 重复内容过多

1. 降低 SimHash 阈值
2. 延长冷却期
3. 降低标题相似度阈值

### 多样性不足

1. 减少 `max_per_topic`
2. 减少 `max_per_domain`
3. 增加候选内容数量

## 参考

- [PIPELINE.md](./PIPELINE.md): 完整流水线架构
- [SOURCE_POLICY.md](./SOURCE_POLICY.md): 源策略配置
