import { describe, it, expect, beforeEach, vi } from 'vitest'
import { LRUCache } from '../cache'

describe('LRUCache', () => {
  let cache: LRUCache

  beforeEach(() => {
    cache = new LRUCache(3, 1000)
  })

  it('should store and retrieve values', () => {
    const mockResponse = {
      id: 'test-1',
      object: 'chat.completion',
      created: Date.now(),
      model: 'gpt-4',
      choices: [{ index: 0, message: { role: 'assistant' as const, content: 'Hello' }, finish_reason: 'stop' }],
    }

    cache.set('key1', mockResponse)
    const result = cache.get('key1')

    expect(result).toEqual(mockResponse)
  })

  it('should return null for non-existent keys', () => {
    expect(cache.get('non-existent')).toBeNull()
  })

  it('should evict oldest item when max size exceeded', () => {
    const response1 = { id: '1', object: 'chat.completion', created: Date.now(), model: 'gpt-4', choices: [] }
    const response2 = { id: '2', object: 'chat.completion', created: Date.now(), model: 'gpt-4', choices: [] }
    const response3 = { id: '3', object: 'chat.completion', created: Date.now(), model: 'gpt-4', choices: [] }
    const response4 = { id: '4', object: 'chat.completion', created: Date.now(), model: 'gpt-4', choices: [] }

    cache.set('key1', response1)
    cache.set('key2', response2)
    cache.set('key3', response3)
    cache.set('key4', response4)

    expect(cache.get('key1')).toBeNull()
    expect(cache.get('key2')).toEqual(response2)
    expect(cache.get('key3')).toEqual(response3)
    expect(cache.get('key4')).toEqual(response4)
  })

  it('should move accessed items to front (LRU behavior)', () => {
    const response1 = { id: '1', object: 'chat.completion', created: Date.now(), model: 'gpt-4', choices: [] }
    const response2 = { id: '2', object: 'chat.completion', created: Date.now(), model: 'gpt-4', choices: [] }
    const response3 = { id: '3', object: 'chat.completion', created: Date.now(), model: 'gpt-4', choices: [] }
    const response4 = { id: '4', object: 'chat.completion', created: Date.now(), model: 'gpt-4', choices: [] }

    cache.set('key1', response1)
    cache.set('key2', response2)
    cache.set('key3', response3)

    cache.get('key1')

    cache.set('key4', response4)

    expect(cache.get('key1')).toEqual(response1)
    expect(cache.get('key2')).toBeNull()
  })

  it('should expire items after TTL', async () => {
    vi.useFakeTimers()

    const response = { id: '1', object: 'chat.completion', created: Date.now(), model: 'gpt-4', choices: [] }
    cache.set('key1', response)

    expect(cache.get('key1')).toEqual(response)

    vi.advanceTimersByTime(1001)

    expect(cache.get('key1')).toBeNull()

    vi.useRealTimers()
  })

  it('should clear all entries', () => {
    const response1 = { id: '1', object: 'chat.completion', created: Date.now(), model: 'gpt-4', choices: [] }
    const response2 = { id: '2', object: 'chat.completion', created: Date.now(), model: 'gpt-4', choices: [] }

    cache.set('key1', response1)
    cache.set('key2', response2)

    expect(cache.size()).toBe(2)

    cache.clear()

    expect(cache.size()).toBe(0)
    expect(cache.get('key1')).toBeNull()
    expect(cache.get('key2')).toBeNull()
  })

  it('should update existing entries', () => {
    const response1 = { id: '1', object: 'chat.completion', created: Date.now(), model: 'gpt-4', choices: [] }
    const response2 = { id: '2', object: 'chat.completion', created: Date.now(), model: 'gpt-4', choices: [] }

    cache.set('key1', response1)
    cache.set('key1', response2)

    expect(cache.get('key1')).toEqual(response2)
    expect(cache.size()).toBe(1)
  })

  it('should delete specific entries', () => {
    const response1 = { id: '1', object: 'chat.completion', created: Date.now(), model: 'gpt-4', choices: [] }
    const response2 = { id: '2', object: 'chat.completion', created: Date.now(), model: 'gpt-4', choices: [] }

    cache.set('key1', response1)
    cache.set('key2', response2)

    cache.delete('key1')

    expect(cache.get('key1')).toBeNull()
    expect(cache.get('key2')).toEqual(response2)
    expect(cache.size()).toBe(1)
  })
})
