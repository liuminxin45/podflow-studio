# Cache & Idempotency Architecture

## 核心原则

**不烧钱、可复现、可追责**

## 强制规范

所有外部API调用（MetaSo / LLM / TTS）必须遵循以下流程：

```python
# 1. Build payload
payload = {
    "query": query_text,
    "model": model_name,
    "temperature": 0.7,
    # ... other params
}

# 2. Stable serialize
normalized_payload = normalize_payload(payload)
serialized = stable_json_dumps(normalized_payload)

# 3. Hash → cache key
cache_key = create_cache_key("api_name", normalized_payload, version="v1")

# 4. Cache lookup
cached_result = cache_store.get(cache_key)
if cached_result is not None:
    return cached_result, True  # Cache hit

# 5. Miss 才请求
result = call_external_api(payload)
cache_store.set(cache_key, result, metadata={"cost": cost})

return result, False  # Cache miss
```

## 稳定序列化

### 为什么需要稳定序列化？

相同的输入必须产生相同的缓存键，否则缓存失效。

**问题示例**：
```python
# 不稳定 - 字典顺序不确定
json.dumps({"b": 2, "a": 1})  # 可能是 '{"b":2,"a":1}' 或 '{"a":1,"b":2}'

# 不稳定 - 包含时间戳
payload = {"query": "test", "timestamp": time.time()}
```

### 稳定序列化实现

```python
def stable_json_dumps(obj: Any) -> str:
    return json.dumps(
        obj,
        sort_keys=True,        # 键排序
        ensure_ascii=False,    # 保留Unicode
        separators=(',', ':'), # 无空白
    )
```

### 负载规范化

移除不影响结果的字段：

```python
def normalize_payload(payload: Dict[str, Any]) -> Dict[str, Any]:
    # 移除不稳定字段
    exclude_fields = {
        'timestamp',
        'request_id',
        'trace_id',
        'user_id',
        'session_id',
    }
    
    return {
        k: v for k, v in payload.items()
        if k not in exclude_fields
    }
```

## 缓存键设计

### 格式

```
{prefix}:{version}:{payload_hash}
```

**示例**：
```
metaso:v1:a3f5e8c9d2b1...
llm:v1:7b2d4f1a8c3e...
tts:v1:9e1c6a4b7f2d...
```

### 版本控制

当API参数或行为变化时，更新版本号：

```python
# v1: 旧版本
cache_key = create_cache_key("llm", payload, version="v1")

# v2: 新版本（不同的参数结构）
cache_key = create_cache_key("llm", payload, version="v2")
```

这样可以避免新旧版本的缓存冲突。

## 缓存实现

### CacheStore

```python
@dataclass
class CacheStore:
    base_dir: Path = Path(".cache")
    enable_metrics: bool = True
    
    def get(self, key: str) -> Any | None:
        """获取缓存，自动记录指标"""
        path = self._path_for(key)
        if not path.exists():
            metrics.increment("cache.miss")
            return None
        
        entry = load_cache_entry(path)
        entry.hit_count += 1
        entry.accessed_at = time.time()
        save_cache_entry(path, entry)
        
        metrics.increment("cache.hit")
        return entry.value
    
    def set(self, key: str, value: Any, metadata: Dict = None):
        """设置缓存，记录元数据"""
        entry = CacheEntry(
            value=value,
            created_at=time.time(),
            metadata=metadata or {},
        )
        save_cache_entry(self._path_for(key), entry)
        metrics.increment("cache.set")
```

### CacheEntry

```python
@dataclass
class CacheEntry:
    value: Any
    created_at: float
    accessed_at: float = field(default_factory=time.time)
    hit_count: int = 0
    metadata: Dict[str, Any] = field(default_factory=dict)
```

元数据可以包含：
- `cost`: API调用成本
- `duration_ms`: 调用时长
- `model`: 使用的模型
- `tokens`: Token数量

## 幂等性保证

### 什么是幂等性？

**相同的输入 → 相同的输出**

对于相同的 `run_id` 和配置，多次运行应该产生完全相同的结果。

### 实现策略

#### 1. 确定性哈希

```python
def compute_hash(data: Union[str, bytes, Dict, List]) -> str:
    if isinstance(data, (dict, list)):
        data = stable_json_dumps(data)
    
    if isinstance(data, str):
        data = data.encode('utf-8')
    
    return hashlib.sha256(data).hexdigest()
```

#### 2. 固定随机种子

```python
# 对于需要随机性的操作
random.seed(run_id_hash)
np.random.seed(run_id_hash)
```

#### 3. 时间戳处理

```python
# 不要在缓存键中使用当前时间
# ❌ 错误
cache_key = f"llm:{query}:{time.time()}"

# ✅ 正确
cache_key = f"llm:{hash(query)}:v1"
```

#### 4. 排序保证

```python
# 对列表排序以保证顺序一致
items.sort(key=lambda x: x.id)

# 对字典键排序
sorted_dict = dict(sorted(data.items()))
```

## API包装器

### MetaSo API

```python
def metaso_research_with_cache(
    query: str,
    max_results: int = 10,
    **kwargs
) -> Tuple[Dict, bool]:
    # 1. Build payload
    payload = {
        "query": query,
        "max_results": max_results,
        **kwargs
    }
    
    # 2-3. Create cache key
    cache_key = metaso_cache_key(query, max_results, **kwargs)
    
    # 4-5. Cache lookup and call
    result, is_hit = cached_call(
        cache_key,
        lambda: call_metaso_api(payload),
        metadata={"api": "metaso", "cost": 0.01}
    )
    
    # Record metrics
    if not is_hit:
        metrics.record_cost("metaso", 0.01)
    
    return result, is_hit
```

### LLM API

```python
def llm_generate_with_cache(
    prompt: str,
    model: str,
    temperature: float = 0.7,
    **kwargs
) -> Tuple[str, bool]:
    payload = {
        "prompt": prompt,
        "model": model,
        "temperature": temperature,
        **kwargs
    }
    
    cache_key = llm_cache_key(prompt, model, temperature, **kwargs)
    
    result, is_hit = cached_call(
        cache_key,
        lambda: call_llm_api(payload),
        metadata={"api": "llm", "model": model}
    )
    
    if not is_hit:
        tokens = estimate_tokens(prompt, result)
        cost = calculate_llm_cost(model, tokens)
        metrics.record_cost("llm", cost)
    
    return result, is_hit
```

### TTS API

```python
def tts_synthesize_with_cache(
    text: str,
    voice: str,
    speed: float = 1.0,
    **kwargs
) -> Tuple[bytes, bool]:
    payload = {
        "text": text,
        "voice": voice,
        "speed": speed,
        **kwargs
    }
    
    cache_key = tts_cache_key(text, voice, speed, **kwargs)
    
    result, is_hit = cached_call(
        cache_key,
        lambda: call_tts_api(payload),
        metadata={"api": "tts", "voice": voice}
    )
    
    if not is_hit:
        duration = estimate_audio_duration(text)
        cost = calculate_tts_cost(duration)
        metrics.record_cost("tts", cost)
    
    return result, is_hit
```

## 缓存管理

### 缓存统计

```python
cache_stats = cache_store.get_stats()
# {
#     "total_entries": 1234,
#     "total_size_bytes": 52428800,
#     "total_size_mb": 50.0,
#     "cache_dir": ".cache"
# }
```

### 缓存清理

```python
# 清空所有缓存
cache_store.clear_all()

# 删除特定缓存
cache_store.delete(cache_key)

# 清理过期缓存（可选实现）
cache_store.clear_expired(ttl_hours=168)  # 7天
```

### 缓存预热

```python
# 预先加载常用查询
common_queries = load_common_queries()
for query in common_queries:
    cache_key = metaso_cache_key(query)
    if not cache_store.exists(cache_key):
        result = call_metaso_api(query)
        cache_store.set(cache_key, result)
```

## 成本追踪

### 按API统计

```python
metrics = get_metrics()

# MetaSo成本
metaso_cost = metrics.get_total_cost("api.metaso.cost")

# LLM成本
llm_cost = metrics.get_total_cost("api.llm.cost")

# TTS成本
tts_cost = metrics.get_total_cost("api.tts.cost")

# 总成本
total_cost = metrics.get_total_cost()
```

### 成本预警

```python
def check_cost_limit(max_cost: float = 1.0):
    current_cost = metrics.get_total_cost()
    
    if current_cost >= max_cost:
        raise CostLimitExceeded(
            f"Cost limit exceeded: ${current_cost:.2f} >= ${max_cost:.2f}"
        )
    
    if current_cost >= max_cost * 0.8:
        logger.warning(
            f"Cost approaching limit: ${current_cost:.2f} / ${max_cost:.2f}"
        )
```

## Manifest记录

### 缓存命中率

```python
manifest = PipelineManifest(episode_id=episode_id)

# 自动从metrics提取
cache_hits = metrics.get_counter("cache.hit")
cache_misses = metrics.get_counter("cache.miss")

manifest.cache_stats = {
    "cache_hit": int(cache_hits),
    "cache_miss": int(cache_misses),
}

hit_rate = manifest._calculate_cache_hit_rate()
# 目标: > 60%
```

### 成本记录

```python
manifest.total_cost = metrics.get_total_cost()

# 按API分类
manifest.metadata["cost_breakdown"] = {
    "metaso": metrics.get_total_cost("api.metaso.cost"),
    "llm": metrics.get_total_cost("api.llm.cost"),
    "tts": metrics.get_total_cost("api.tts.cost"),
}
```

## 验证幂等性

### 测试方法

```python
def test_idempotency():
    # 第一次运行
    result1 = run_pipeline(
        run_id="test_123",
        config=config,
        force_refresh=False
    )
    
    # 第二次运行（相同配置）
    result2 = run_pipeline(
        run_id="test_123",
        config=config,
        force_refresh=False
    )
    
    # 验证结果一致
    assert result1.episode_id == result2.episode_id
    assert result1.manifest.total_cost == result2.manifest.total_cost
    assert result1.selected_clusters == result2.selected_clusters
    
    # 验证缓存命中
    assert result2.cache_hit_rate > 0.9  # 第二次运行应该几乎全部命中
```

### 检查点

- [ ] 相同输入产生相同缓存键
- [ ] 缓存命中时不调用外部API
- [ ] 成本记录准确
- [ ] Manifest可复现
- [ ] 时间戳不影响缓存键

## 故障排查

### 缓存未命中

**症状**：缓存命中率很低

**排查**：
1. 检查负载是否包含不稳定字段
2. 检查序列化是否稳定
3. 检查版本号是否正确

### 成本异常

**症状**：成本超出预期

**排查**：
1. 检查缓存是否生效
2. 检查是否有重复调用
3. 检查预算控制是否生效

### 结果不一致

**症状**：相同输入产生不同输出

**排查**：
1. 检查是否使用了随机数
2. 检查是否使用了当前时间
3. 检查排序是否稳定

## 最佳实践

### DO ✅

- 使用稳定序列化
- 规范化负载
- 记录缓存元数据
- 追踪成本
- 版本化缓存键

### DON'T ❌

- 在缓存键中使用时间戳
- 在缓存键中使用随机数
- 跳过缓存直接调用API
- 忽略成本追踪
- 使用不稳定的序列化

## 监控指标

### 缓存效率

- **命中率**: `cache_hit / (cache_hit + cache_miss)`
  - 目标: > 60%
  
- **节省成本**: `saved_cost = miss_count * avg_api_cost`

### 幂等性

- **复跑一致性**: 相同run_id的结果是否一致
  - 目标: 100%

- **缓存稳定性**: 缓存键是否稳定
  - 目标: 无重复键

## 参考

- [PIPELINE.md](./PIPELINE.md): 完整流水线架构
- [src/store/cache.py](../src/store/cache.py): 缓存实现
- [src/utils/serialization.py](../src/utils/serialization.py): 序列化工具
