# 频道配置指南 - 统一入口设计

## 概述

从v3.2版本开始，Auto-Podcast支持**频道级统一配置**，只需在`config/settings.yaml`顶部修改`channel.id`，即可自动切换：
- 自动选题策略（consumer_life_v3 / tech_innovation / balanced）
- 播客风格（tone、audience、length）
- 频道名称和定位

**核心理念**：一处切换，全局响应

---

## 快速开始

### 1. 切换频道

编辑`config/settings.yaml`，只需修改第10行：

```yaml
channel:
  id: life-consumer  # ← 修改这里即可
```

**可选值**：
- `life-consumer` - 生活消费频道（默认）
- `tech-innovation` - 技术创新频道
- `balanced-mix` - 综合平衡频道

### 2. 运行Pipeline

```bash
python run.py --step all
```

系统会自动：
1. 从`channel_presets`读取频道配置
2. 自动选择对应的`auto_topic_strategy`
3. 应用频道风格（tone、audience、length）

---

## 频道预设详解

### life-consumer（生活消费频道）

**定位**：面向普通消费者，关注民生、钱袋子、生活便利

**自动配置**：
```yaml
channel_presets:
  life-consumer:
    name: "生活与消费资讯"
    style:
      tone: "口语化、生动、像朋友聊天"
      audience: "普通消费者"
      length_minutes: 6
    auto_topic_strategy: "consumer_life_v3"  # 自动选题策略
```

**选题策略特点**：
- 优先黄金/白银/A股/房地产/电车等民生话题
- 强化"钱袋子"相关关键词加分
- 技术惩罚词在消费域内豁免（避免误伤产品新闻）
- 支持语义域加分（consumer_ai_app、real_estate等）

**适用场景**：
- 家庭理财播客
- 生活消费指南
- 民生政策解读

---

### tech-innovation（技术创新频道）

**定位**：面向开发者/技术决策者，关注技术突破、开源项目

**自动配置**：
```yaml
channel_presets:
  tech-innovation:
    name: "技术创新资讯"
    style:
      tone: "专业、精准、有深度"
      audience: "开发者、技术决策者"
      length_minutes: 8
    auto_topic_strategy: "tech_innovation"
```

**选题策略特点**：
- 优先开源项目、技术突破、架构创新
- 强化技术关键词加分（开源/模型/框架/API）
- 降低民生话题权重
- 适合技术深度解读

**适用场景**：
- 技术周报播客
- 开源项目推荐
- 技术趋势分析

---

### balanced-mix（综合平衡频道）

**定位**：兼顾技术创新和民生价值，广泛受众

**自动配置**：
```yaml
channel_presets:
  balanced-mix:
    name: "综合资讯"
    style:
      tone: "专业且易懂、平衡"
      audience: "广泛受众"
      length_minutes: 7
    auto_topic_strategy: "balanced"
```

**选题策略特点**：
- 技术与民生话题均衡
- 适度的关键词调整
- 适合多元化内容

**适用场景**：
- 综合新闻播客
- 跨领域资讯
- 通用型播客

---

## 配置优先级

系统支持三级配置覆盖：

### 1. 自动推导（默认）

```yaml
channel:
  id: life-consumer  # 自动推导 -> consumer_life_v3

auto_topic:
  # strategy字段留空或注释掉
```

**日志输出**：
```
根据频道 'life-consumer' 自动选择策略: consumer_life_v3
加载策略成功: consumer_life_v3 - 面向普通消费者...
```

### 2. 手动覆盖

```yaml
channel:
  id: life-consumer

auto_topic:
  strategy: "tech_innovation"  # 手动覆盖，不使用频道默认策略
```

**日志输出**：
```
使用配置文件指定的策略: tech_innovation
加载策略成功: tech_innovation - 面向开发者...
```

### 3. 降级兜底

如果策略加载失败，自动降级到`balanced`策略：

```
策略加载失败: Strategy 'xxx' not found，回退到 balanced 策略
```

---

## 自定义频道

### 添加新频道

编辑`config/settings.yaml`，在`channel_presets`下新增：

```yaml
channel_presets:
  my-custom-channel:
    name: "我的自定义频道"
    style:
      tone: "轻松幽默"
      audience: "年轻人"
      length_minutes: 5
    auto_topic_strategy: "consumer_life_v3"  # 选择已有策略
```

### 使用自定义频道

```yaml
channel:
  id: my-custom-channel  # 切换到自定义频道
```

---

## 配置文件结构

### 完整示例

```yaml
# ============================================================
# 频道配置（全局入口）
# 切换频道后，自动选题策略、风格、受众定位等配置会自动响应
# ============================================================
channel:
  id: life-consumer  # ← 唯一需要修改的地方
  
  # 以下字段由channel.id自动决定，无需手动修改
  name: "生活与消费资讯"
  language: "zh-CN"
  style:
    tone: "口语化、生动、像朋友聊天"
    audience: "普通消费者"
    length_minutes: 6

# 频道预设（内部映射表，由代码自动读取）
channel_presets:
  life-consumer:
    name: "生活与消费资讯"
    style:
      tone: "口语化、生动、像朋友聊天"
      audience: "普通消费者"
      length_minutes: 6
    auto_topic_strategy: "consumer_life_v3"
  
  tech-innovation:
    name: "技术创新资讯"
    style:
      tone: "专业、精准、有深度"
      audience: "开发者、技术决策者"
      length_minutes: 8
    auto_topic_strategy: "tech_innovation"
  
  balanced-mix:
    name: "综合资讯"
    style:
      tone: "专业且易懂、平衡"
      audience: "广泛受众"
      length_minutes: 7
    auto_topic_strategy: "balanced"

# ============================================================
# 自动选题配置
# 注意：策略由 channel.id 自动决定，无需手动配置
# ============================================================
auto_topic:
  enabled: true
  time_window_days: 7
  
  # 策略由 channel.id 自动决定：
  # - life-consumer -> consumer_life_v3
  # - tech-innovation -> tech_innovation
  # - balanced-mix -> balanced
  # 如需手动覆盖，可取消注释下面一行：
  # strategy: "consumer_life_v3"
  
  enable_keywords: true
  enable_patterns: true
  enable_compounds: true
  enable_domains: true
```

---

## 实现原理

### 代码逻辑

**文件**：`src/app/pipelines/steps/selection_step.py`

```python
def _run_auto_topic(self, ctx: EpisodeContext, auto_topic_cfg: dict) -> dict:
    # 1. 优先使用配置文件的strategy
    strategy_name = auto_topic_cfg.get("strategy")
    
    if not strategy_name:
        # 2. 从 channel_presets 自动推导策略
        channel_id = ctx.config.get("channel", {}).get("id", "life-consumer")
        channel_presets = ctx.config.get("channel_presets", {})
        
        if channel_id in channel_presets:
            strategy_name = channel_presets[channel_id].get("auto_topic_strategy", "balanced")
            self.logger.info(f"根据频道 '{channel_id}' 自动选择策略: {strategy_name}")
        else:
            strategy_name = "balanced"
            self.logger.warning(f"频道 '{channel_id}' 未配置预设，使用默认策略: balanced")
    else:
        self.logger.info(f"使用配置文件指定的策略: {strategy_name}")
    
    # 3. 加载策略
    try:
        strategy = get_strategy(strategy_name)
        self.logger.info(f"加载策略成功: {strategy.name} - {strategy.description}")
    except ValueError as e:
        self.logger.warning(f"策略加载失败: {e}，回退到 balanced 策略")
        strategy = get_strategy("balanced")
```

### 配置读取流程

```
1. 读取 channel.id
   ↓
2. 查找 channel_presets[channel.id]
   ↓
3. 提取 auto_topic_strategy
   ↓
4. 加载对应策略实例
   ↓
5. 应用策略的 scorer_config、prompt、adjustment rules
```

---

## 常见问题

### Q1: 修改channel.id后需要重启吗？

**A**: 不需要。每次运行`python run.py`都会重新读取配置文件。

### Q2: 如何验证频道切换成功？

**A**: 查看日志输出：

```bash
python run.py --step all 2>&1 | grep "频道\|策略"
```

应该看到：
```
根据频道 'life-consumer' 自动选择策略: consumer_life_v3
加载策略成功: consumer_life_v3 - 面向普通消费者...
```

### Q3: 可以同时运行多个频道吗？

**A**: 可以。通过不同的配置文件：

```bash
# 生活消费频道
python run.py --config config/settings_life.yaml

# 技术创新频道
python run.py --config config/settings_tech.yaml
```

### Q4: channel.name和style字段需要手动修改吗？

**A**: 不需要。这些字段只是为了可读性保留在配置文件中，实际运行时会被`channel_presets`覆盖（如果代码实现了覆盖逻辑）。当前版本这些字段仅用于文档说明。

### Q5: 如何禁用自动策略推导？

**A**: 在`auto_topic`下显式指定`strategy`：

```yaml
auto_topic:
  strategy: "consumer_life_v3"  # 强制使用指定策略，忽略频道配置
```

---

## 迁移指南

### 从旧配置迁移

**旧配置（v3.1及之前）**：
```yaml
channel:
  id: life-consumer
  name: "生活与消费资讯"
  style:
    tone: "口语化、生动、像朋友聊天"
    audience: "普通消费者"

auto_topic:
  strategy: "consumer_life_v3"  # 需要手动修改
```

**新配置（v3.2+）**：
```yaml
channel:
  id: life-consumer  # 只需修改这里

channel_presets:
  life-consumer:
    auto_topic_strategy: "consumer_life_v3"  # 自动映射

auto_topic:
  # strategy字段留空，自动推导
```

### 迁移步骤

1. 备份原配置文件
2. 添加`channel_presets`配置块
3. 注释掉`auto_topic.strategy`字段
4. 运行测试验证

---

## 最佳实践

### 1. 频道命名规范

- 使用小写字母和连字符：`life-consumer`、`tech-innovation`
- 避免特殊字符和空格
- 保持简短且语义明确

### 2. 策略选择建议

| 内容类型 | 推荐频道 | 策略 |
|---------|---------|------|
| 家庭理财、民生政策 | life-consumer | consumer_life_v3 |
| 开源项目、技术突破 | tech-innovation | tech_innovation |
| 综合新闻、跨领域 | balanced-mix | balanced |
| 产品评测（AI应用） | life-consumer | consumer_life_v3 |
| 技术深度解读 | tech-innovation | tech_innovation |

### 3. 配置管理

- 将`channel_presets`视为"策略注册表"，集中管理
- 频道定义与策略实现解耦，便于扩展
- 使用版本控制跟踪配置变更

### 4. 日志监控

关键日志点：
```
根据频道 'xxx' 自动选择策略: xxx
加载策略成功: xxx - xxx
策略调整: xxx | 40.0 -> 64.0 (+24.0) | domains=['consumer_ai_app']
```

---

## 技术架构

### 配置层级

```
settings.yaml
├── channel (全局入口)
│   └── id: life-consumer
├── channel_presets (映射表)
│   ├── life-consumer
│   │   └── auto_topic_strategy: consumer_life_v3
│   ├── tech-innovation
│   │   └── auto_topic_strategy: tech_innovation
│   └── balanced-mix
│       └── auto_topic_strategy: balanced
└── auto_topic (执行配置)
    └── strategy: (可选覆盖)
```

### 策略加载流程

```
SelectionStep._run_auto_topic()
  ↓
读取 auto_topic.strategy (可选)
  ↓ (如果为空)
读取 channel.id
  ↓
查找 channel_presets[channel.id].auto_topic_strategy
  ↓
get_strategy(strategy_name)
  ↓
加载策略实例 (ConsumerLifeStrategyV3 / TechInnovationStrategy / BalancedStrategy)
  ↓
应用策略配置 (scorer_config, prompt, adjustments)
```

---

## 版本历史

### v3.2 (2025-12-30)
- ✅ 新增频道级统一配置
- ✅ 自动策略推导机制
- ✅ channel_presets映射表
- ✅ 配置优先级系统

### v3.1 (2025-12-29)
- ✅ 新增consumer_ai_app语义域
- ✅ 域内技术惩罚豁免
- ✅ 联合命中规则

### v3.0 (2025-12-28)
- ✅ 策略系统重构
- ✅ 语义域加分机制
- ✅ 可插拔策略架构

---

## 联系与支持

**文档维护**：Cascade AI  
**版本**：v3.2  
**更新日期**：2025-12-30

如有问题或建议，请查看：
- `IMPLEMENTATION_SUMMARY.md` - 实施总结
- `tests/test_strategy_adjustment.py` - 策略测试
- `src/topic_selection/strategies/` - 策略实现
