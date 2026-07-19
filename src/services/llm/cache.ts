import type { LLMResponse } from '../../types/llm'

interface CacheEntry {
  response: LLMResponse
  timestamp: number
  accessCount: number
}

interface LRUNode {
  key: string
  prev: LRUNode | null
  next: LRUNode | null
}

export class LRUCache {
  private cache = new Map<string, CacheEntry>()
  private head: LRUNode | null = null
  private tail: LRUNode | null = null
  private nodeMap = new Map<string, LRUNode>()

  constructor(
    private readonly maxSize: number,
    private readonly ttl: number
  ) {}

  get(key: string): LLMResponse | null {
    const entry = this.cache.get(key)
    if (!entry) return null

    if (Date.now() - entry.timestamp > this.ttl) {
      this.delete(key)
      return null
    }

    entry.accessCount++
    this.moveToFront(key)
    return entry.response
  }

  set(key: string, response: LLMResponse): void {
    if (this.cache.has(key)) {
      const entry = this.cache.get(key)!
      entry.response = response
      entry.timestamp = Date.now()
      this.moveToFront(key)
      return
    }

    if (this.cache.size >= this.maxSize) {
      this.evictLRU()
    }

    this.cache.set(key, {
      response,
      timestamp: Date.now(),
      accessCount: 1,
    })
    this.addToFront(key)
  }

  delete(key: string): void {
    this.cache.delete(key)
    this.removeNode(key)
  }

  clear(): void {
    this.cache.clear()
    this.head = null
    this.tail = null
    this.nodeMap.clear()
  }

  size(): number {
    return this.cache.size
  }

  private moveToFront(key: string): void {
    const node = this.nodeMap.get(key)
    if (!node || node === this.head) return

    this.removeNode(key)
    this.addToFront(key)
  }

  private addToFront(key: string): void {
    const node: LRUNode = { key, prev: null, next: this.head }
    this.nodeMap.set(key, node)

    if (this.head) {
      this.head.prev = node
    }
    this.head = node

    if (!this.tail) {
      this.tail = node
    }
  }

  private removeNode(key: string): void {
    const node = this.nodeMap.get(key)
    if (!node) return

    if (node.prev) {
      node.prev.next = node.next
    } else {
      this.head = node.next
    }

    if (node.next) {
      node.next.prev = node.prev
    } else {
      this.tail = node.prev
    }

    this.nodeMap.delete(key)
  }

  private evictLRU(): void {
    if (!this.tail) return
    const key = this.tail.key
    this.delete(key)
  }
}
