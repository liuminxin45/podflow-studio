# LLM Service 完整指南

## 概览

LLM Service 是一个统一的 LLM API 抽象层，提供以下核心功能：
- ✅ 统一的 API 调用接口
- ✅ 自动请求缓存（5分钟 TTL）
- ✅ 速率限制（10 请求/秒）
- ✅ 性能监控（响应时间、成功率）
- ✅ Streaming API 支持
- ✅ 完整的单元测试覆盖

## 快速开始

### 基础调用

```typescript
import { llmService } from '@/services/llmService'

const response = await llmService.call({
  apiBase: 'https://api.openai.com/v1',
  apiKey: 'your-api-key',
  model: 'gpt-4',
  messages: [{ role: 'user', content: 'Hello!' }],
  temperature: 0.7,
})

console.log(response.choices[0].message.content)
```

### Streaming API

```typescript
import { llmService } from '@/services/llmService'

await llmService.callStreaming(
  {
    apiBase: 'https://api.openai.com/v1',
    apiKey: 'your-api-key',
    model: 'gpt-4',
    messages: [{ role: 'user', content: 'Write a long story...' }],
  },
  (chunk) => {
    console.log('Received:', chunk)
  }
)
```

### 批量处理

```typescript
import { llmService } from '@/services/llmService'

const items = [/* your items */]
const batchFn = async (batch) => {
  // Process batch with LLM
  return processedBatch
}

const results = await llmService.batchAnalyze(
  items,
  batchFn,
  (progress) => console.log(`Progress: ${progress * 100}%`)
)
```

## 核心特性

### 1. 自动缓存

LLM Service 自动缓存相同请求的响应，减少 API 调用成本：

- **缓存键**: 基于 `apiBase + model + messages + temperature`
- **TTL**: 5 分钟（可在 `llmService.ts` 中调整）
- **容量**: 最多 100 个缓存条目（LRU 策略）

**手动清空缓存**:
```typescript
llmService.clearCache()
```

### 2. 速率限制

采用令牌桶算法（Token Bucket）防止 API 速率超限：

- **容量**: 100 tokens
- **补充速率**: 10 tokens/秒
- **自动等待**: 达到限制时自动等待

**配置参数** (在 `llmService.ts` 中):
```typescript
private readonly RATE_LIMIT_MAX_TOKENS = 100
private readonly RATE_LIMIT_REFILL_RATE = 10
private readonly RATE_LIMIT_REFILL_INTERVAL = 1000
```

### 3. 性能监控

实时跟踪 LLM API 调用的性能指标：

```typescript
const metrics = llmService.getMetrics()
console.log({
  totalCalls: metrics.totalCalls,
  successfulCalls: metrics.successfulCalls,
  failedCalls: metrics.failedCalls,
  averageResponseTime: metrics.averageResponseTime,
  failureRate: metrics.failureRate,
})
```

**UI 组件**: 使用 `LLMMetricsPanel` 组件可视化监控数据

### 4. 错误处理

统一的错误分类系统：

```typescript
import { LLMError } from '@/types/llm'

try {
  await llmService.call(options)
} catch (error) {
  if (error instanceof LLMError) {
    switch (error.code) {
      case 'AUTH': // 认证错误
      case 'NETWORK': // 网络错误
      case 'TIMEOUT': // 超时
      case 'PARSE': // 响应解析失败
      case 'UNKNOWN': // 未知错误
    }
  }
}
```

## 测试

### 运行测试

```bash
# 运行所有测试
npm test

# 带 UI 界面
npm run test:ui

# 生成覆盖率报告
npm run test:coverage
```

### 测试覆盖率目标

- **Lines**: 80%+
- **Functions**: 80%+
- **Branches**: 80%+
- **Statements**: 80%+

### 单元测试示例

```typescript
import { describe, it, expect, vi } from 'vitest'
import { llmService } from '../llmService'

describe('LLMService', () => {
  it('should cache responses', async () => {
    const options = { /* ... */ }
    
    const response1 = await llmService.call(options)
    const response2 = await llmService.call(options)
    
    // Second call should use cache
    expect(response1).toBe(response2)
  })
})
```

## 最佳实践

### 1. 使用缓存

对于相同的查询，LLM Service 会自动从缓存返回：

```typescript
// 第一次调用 - API 请求
const result1 = await llmService.call(options)

// 第二次调用 - 从缓存返回（5分钟内）
const result2 = await llmService.call(options)
```

### 2. 监控性能

定期检查性能指标，优化调用策略：

```typescript
setInterval(() => {
  const metrics = llmService.getMetrics()
  if (metrics.failureRate > 0.1) {
    console.warn('Failure rate exceeds 10%!')
  }
}, 60000)
```

### 3. 错误重试

对于临时性错误，实现重试逻辑：

```typescript
async function callWithRetry(options, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await llmService.call(options)
    } catch (error) {
      if (error.code === 'TIMEOUT' && i < maxRetries - 1) {
        await delay(1000 * (i + 1))
        continue
      }
      throw error
    }
  }
}
```

### 4. Streaming 适用场景

使用 Streaming API 的场景：
- ✓ 长文本生成（文章、报告）
- ✓ 实时对话应用
- ✓ 需要立即显示首字的场景
- ✗ 短查询（缓存更高效）

## 架构设计

```
┌─────────────────────────────────────────┐
│           Application Layer              │
│   (Components, Hooks, Business Logic)   │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│          LLM Service Layer               │
│  ┌─────────────────────────────────┐    │
│  │  Cache Layer (5min TTL)         │    │
│  └─────────────────────────────────┘    │
│  ┌─────────────────────────────────┐    │
│  │  Rate Limiter (Token Bucket)    │    │
│  └─────────────────────────────────┘    │
│  ┌─────────────────────────────────┐    │
│  │  Performance Metrics Tracker    │    │
│  └─────────────────────────────────┘    │
└──────────────┬──────────────────────────┘
               │
      ┌────────┴────────┐
      ▼                 ▼
┌──────────┐    ┌──────────────┐
│ Electron │    │  Fetch API   │
│   IPC    │    │  (Fallback)  │
└──────────┘    └──────────────┘
      │                 │
      └────────┬────────┘
               ▼
      ┌─────────────────┐
      │   LLM Provider   │
      │ (OpenAI/Azure)   │
      └─────────────────┘
```

## 性能优化建议

### 1. 提高缓存命中率

- 标准化 prompt 格式
- 使用固定的 temperature 值
- 复用常见查询模式

### 2. 降低延迟

- 使用 Electron IPC（绕过浏览器限制）
- 对于长文本使用 Streaming
- 设置合理的 timeout 值

### 3. 节省成本

- 启用缓存（默认开启）
- 使用批量处理 API
- 选择合适的模型（mini vs full）

## 故障排查

### 问题：速率限制触发过于频繁

**解决方案**:
```typescript
// 调整速率限制参数
private readonly RATE_LIMIT_MAX_TOKENS = 200 // 增加容量
private readonly RATE_LIMIT_REFILL_RATE = 20 // 增加补充速率
```

### 问题：缓存未生效

**检查**:
1. 确认请求参数完全一致
2. 检查缓存是否被清空
3. 确认未超过 TTL（5分钟）

### 问题：Streaming 连接中断

**解决方案**:
```typescript
// 添加重连逻辑
try {
  await llmService.callStreaming(options, onChunk)
} catch (error) {
  // 重试或降级到非 Streaming 模式
  const response = await llmService.call(options)
}
```

## 贡献指南

### 添加新功能

1. 在 `llmService.ts` 中实现功能
2. 在 `__tests__/llmService.test.ts` 中添加测试
3. 确保测试覆盖率 ≥ 80%
4. 更新本文档

### 测试规范

- 所有公共方法必须有单元测试
- 异常路径必须被覆盖
- 使用 `vi.mock()` 模拟外部依赖

## 参考资料

- [OpenAI API 文档](https://platform.openai.com/docs/api-reference)
- [Azure OpenAI 文档](https://learn.microsoft.com/en-us/azure/ai-services/openai/)
- [Vitest 文档](https://vitest.dev/)
