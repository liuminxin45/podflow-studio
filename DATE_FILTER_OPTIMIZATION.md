# 日期过滤优化总结

## 问题描述

**原问题**：Pipeline在digest拆分阶段处理了大量昨天及之前的数据，浪费时间和API调用。

**具体表现**：
- 检测到7个汇总items（2025-12-23 到 2025-12-29）
- 每个汇总需要60-180秒拆分
- 总计需要10-15分钟
- 但实际上只需要今天（2025-12-29）的数据

---

## 解决方案

### ✅ 已实施的优化

**核心改进**：将日期过滤提前到digest检测和拆分**之前**

**Pipeline流程调整**：

```
旧流程：
RSS获取 → 规范化 → 去重 → 合规验证 → Digest检测 → Digest拆分 → 聚类

新流程：
RSS获取 → 规范化 → 去重 → 合规验证 → 日期过滤 ✨ → Digest检测 → Digest拆分 → 聚类
```

### 代码修改位置

**文件**：`run.py`

**修改位置**：第1280-1333行

**关键逻辑**：
```python
# ===== 日期过滤（尽早发生，在digest拆分之前） =====
import datetime as dt
# 从episode_id中提取日期 (格式: "channel:YYYY-MM-DD")
date_str = episode_id.split(":")[-1] if ":" in episode_id else episode_id
target_date = dt.datetime.strptime(date_str, "%Y-%m-%d").date()

log.info("=" * 60)
log.info(f"开始日期过滤：只保留 {target_date} 的数据...")
log.info("=" * 60)

date_filtered_items = []
old_items = []

for item in fetched:
    published_at = item.get("published_at")
    if published_at:
        try:
            # 解析日期
            if isinstance(published_at, str):
                item_date = dt.datetime.fromisoformat(published_at.replace("Z", "+00:00")).date()
            elif isinstance(published_at, dt.datetime):
                item_date = published_at.date()
            else:
                item_date = None
            
            # 只保留目标日期的数据
            if item_date == target_date:
                date_filtered_items.append(item)
            else:
                old_items.append(item)
        except Exception as e:
            log.warning(f"日期解析失败: {item.get('title', 'unknown')[:50]} - {e}")
            # 日期解析失败的保留（避免丢失数据）
            date_filtered_items.append(item)
    else:
        # 没有日期的保留（避免丢失数据）
        date_filtered_items.append(item)

log.info(f"日期过滤完成:")
log.info(f"  - 保留 {target_date} 的数据: {len(date_filtered_items)} 条")
log.info(f"  - 过滤掉旧数据: {len(old_items)} 条")

# 使用日期过滤后的数据
fetched = date_filtered_items
```

---

## 预期效果

### 优化前
```
输入: 8个items (1普通 + 7汇总)
  - 2025-12-29: 1个汇总 ✅ 需要
  - 2025-12-28: 1个汇总 ❌ 不需要
  - 2025-12-27: 1个汇总 ❌ 不需要
  - 2025-12-26: 1个汇总 ❌ 不需要
  - 2025-12-25: 1个汇总 ❌ 不需要
  - 2025-12-24: 1个汇总 ❌ 不需要
  - 2025-12-23: 1个汇总 ❌ 不需要
  - AI工具集: 1个普通 ✅ 需要

Digest拆分: 7个汇总 × 平均100秒 = 约12分钟
API调用: 7次
```

### 优化后
```
日期过滤:
  - 保留 2025-12-29: 2个items (1汇总 + 1普通)
  - 过滤掉旧数据: 6个items

Digest拆分: 1个汇总 × 60秒 = 约1分钟
API调用: 1次

⚡ 时间节省: 11分钟 (91.7%)
⚡ API节省: 6次调用 (85.7%)
```

---

## 验证方法

### 1. 查看日志输出

运行pipeline后，应该看到以下日志：

```bash
python run.py --step fetch --date 2025-12-29
```

**期望的日志输出**：
```
2025-12-29 XX:XX:XX INFO step.fetch ============================================================
2025-12-29 XX:XX:XX INFO step.fetch 开始日期过滤：只保留 2025-12-29 的数据...
2025-12-29 XX:XX:XX INFO step.fetch ============================================================
2025-12-29 XX:XX:XX INFO step.fetch 日期过滤完成:
2025-12-29 XX:XX:XX INFO step.fetch   - 保留 2025-12-29 的数据: 2 条
2025-12-29 XX:XX:XX INFO step.fetch   - 过滤掉旧数据: 6 条
2025-12-29 XX:XX:XX INFO step.fetch 过滤掉的旧数据示例:
2025-12-29 XX:XX:XX INFO step.fetch     - 📅 2025-12-28 星期日 (发布于: 2025-12-28T...)
2025-12-29 XX:XX:XX INFO step.fetch     - 📅 2025-12-27 星期六 (发布于: 2025-12-27T...)
2025-12-29 XX:XX:XX INFO step.fetch     - 📅 2025-12-26 星期五 (发布于: 2025-12-26T...)
2025-12-29 XX:XX:XX INFO step.fetch ============================================================
2025-12-29 XX:XX:XX INFO step.fetch ============================================================
2025-12-29 XX:XX:XX INFO step.fetch 开始汇总型RSS检测与拆分...
2025-12-29 XX:XX:XX INFO step.fetch ============================================================
2025-12-29 XX:XX:XX INFO fetch.digest_detector 开始批量检测 2 个items...
2025-12-29 XX:XX:XX INFO fetch.digest_detector 批量检测完成:
2025-12-29 XX:XX:XX INFO fetch.digest_detector   - 普通items: 1
2025-12-29 XX:XX:XX INFO fetch.digest_detector   - 汇总items: 1
2025-12-29 XX:XX:XX INFO fetch.digest_splitter 开始批量拆分 1 个汇总items...
```

### 2. 检查artifacts文件

```bash
# 查看过滤掉的旧数据
cat out/fetch_archives/life-consumer_2025-12-29/artifacts/date_filtered_old_items.jsonl

# 应该包含6条旧数据（2025-12-23 到 2025-12-28）
```

### 3. 性能对比

**优化前**：
- Digest检测: 8个items
- Digest拆分: 7个汇总
- 总耗时: 约12分钟

**优化后**：
- 日期过滤: 8个 → 2个
- Digest检测: 2个items
- Digest拆分: 1个汇总
- 总耗时: 约1分钟

---

## 注意事项

### 1. 日期解析容错

- 如果日期解析失败，item会被**保留**（避免丢失数据）
- 如果item没有`published_at`字段，会被**保留**

### 2. 日期格式支持

支持以下日期格式：
- ISO 8601: `2025-12-29T10:00:00Z`
- ISO 8601 with timezone: `2025-12-29T10:00:00+08:00`
- datetime对象

### 3. Episode ID格式

从`episode_id`中提取日期，支持格式：
- `channel:YYYY-MM-DD` → 提取 `YYYY-MM-DD`
- `YYYY-MM-DD` → 直接使用

---

## 后续优化建议

### 1. 配置化日期范围

允许用户配置保留多少天的数据：

```yaml
# config/settings.yaml
pipeline:
  date_filter:
    enabled: true
    keep_days: 1  # 只保留今天
    # keep_days: 2  # 保留今天和昨天
```

### 2. RSS源级别的日期过滤

某些RSS源可能需要保留更长时间的数据：

```yaml
sources:
  rss:
    - name: "60s-每天60秒读懂世界"
      url: "https://60s.viki.moe/v2/60s/rss"
      date_filter:
        keep_days: 1  # 只保留今天
    
    - name: "深度分析"
      url: "https://example.com/rss"
      date_filter:
        keep_days: 7  # 保留一周
```

### 3. 并发拆分

如果有多个今天的汇总items，可以并发拆分：

```python
from concurrent.futures import ThreadPoolExecutor

with ThreadPoolExecutor(max_workers=3) as executor:
    futures = [executor.submit(splitter.split, item) for item in digest_items]
    results = [f.result() for f in futures]
```

---

## 总结

✅ **已完成**：
1. 将日期过滤提前到digest检测之前
2. 添加详细的日志输出
3. 保存过滤掉的旧数据到artifacts

⚡ **性能提升**：
- 时间节省: 91.7% (12分钟 → 1分钟)
- API节省: 85.7% (7次 → 1次)

📝 **验证方法**：
- 查看日志中的日期过滤信息
- 检查artifacts中的旧数据文件
- 确认只有今天的数据被拆分

---

**优化完成时间**: 2025-12-29 18:10  
**状态**: ✅ 已实施，待验证
