import { describe, it, expect } from 'vitest'
import {
  detectCategory,
  computeRelevance,
  getQualitySignals,
} from '../contentAnalysis'
import type { ContentItem } from '../../types/workflow'

describe('contentAnalysis', () => {
  describe('detectCategory', () => {
    it('应该根据关键词识别类别', () => {
      const item: ContentItem = {
        title: 'AI 突破性进展',
        content: '人工智能技术取得重大突破',
        source: 'Test',
      }

      const category = detectCategory(item)
      expect(category).toBeDefined()
      expect(category?.id).toBeDefined()
    })

    it('无法识别时应该返回 null', () => {
      const item: ContentItem = {
        title: 'Random Title',
        content: 'Random content without keywords',
        source: 'Test',
      }

      const category = detectCategory(item)
      expect(category).toBeNull()
    })
  })

  describe('computeRelevance', () => {
    it('应该计算内容与主题的相关度', () => {
      const item: ContentItem = {
        title: 'OpenAI 发布 GPT-5',
        content: 'AI 模型技术突破',
        source: 'Test',
      }

      const highRelevance = computeRelevance(item, 'OpenAI GPT AI')
      const lowRelevance = computeRelevance(item, '区块链 加密货币')

      expect(highRelevance).toBe('high')
      expect(lowRelevance).toBe('low')
    })

    it('没有主题时应该返回 medium', () => {
      const item: ContentItem = { title: 'Test', content: 'Test', source: 'Test' }
      expect(computeRelevance(item, '')).toBe('medium')
    })
  })

  describe('getQualitySignals', () => {
    it('不再生成低价值的多来源确认信号', () => {
      const items: ContentItem[] = [
        { title: 'OpenAI 发布 GPT-5', content: 'Content 1', source: 'A' },
        { title: 'OpenAI 发布 GPT-5 模型', content: 'Content 2', source: 'B' },
      ]

      const signals = getQualitySignals(items[0])
      expect(signals.some(s => s.text.includes('多来源'))).toBe(false)
    })

    it('应该识别可靠来源信号', () => {
      const item: ContentItem = {
        title: 'Breaking News',
        content: 'Important update',
        source: 'Reuters',
      }

      const signals = getQualitySignals(item)
      expect(signals.some(s => s.text.includes('可靠来源'))).toBe(true)
    })

    it('应该识别主题相关信号', () => {
      const item: ContentItem = {
        title: 'AI 技术进展',
        content: '人工智能领域的最新发展',
        source: 'Tech Blog',
      }

      const signals = getQualitySignals(item, 'AI 人工智能')
      expect(signals.some(s => s.text.includes('关注'))).toBe(true)
    })

    it('应该限制返回最多 2 个信号', () => {
      const item: ContentItem = {
        title: 'OpenAI AI 突破',
        content: '重大技术突破',
        source: 'Reuters',
      }

      const signals = getQualitySignals(item, 'OpenAI AI')
      expect(signals.length).toBeLessThanOrEqual(2)
    })
  })
})
