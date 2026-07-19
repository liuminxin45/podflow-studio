import { describe, it, expect, beforeEach, vi } from 'vitest'
import { TokenBucketRateLimiter } from '../rateLimit'

describe('TokenBucketRateLimiter', () => {
  let rateLimiter: TokenBucketRateLimiter

  beforeEach(() => {
    rateLimiter = new TokenBucketRateLimiter({
      maxTokens: 10,
      refillRate: 5,
      refillInterval: 1000,
    })
  })

  it('should allow requests within token limit', async () => {
    await expect(rateLimiter.acquire()).resolves.toBeUndefined()
    await expect(rateLimiter.acquire()).resolves.toBeUndefined()
    await expect(rateLimiter.acquire()).resolves.toBeUndefined()
  })

  it('should block when tokens exhausted', async () => {
    vi.useFakeTimers()

    for (let i = 0; i < 10; i++) {
      await rateLimiter.acquire()
    }

    expect(rateLimiter.getAvailableTokens()).toBe(0)

    const acquirePromise = rateLimiter.acquire()
    vi.advanceTimersByTime(1000)
    await acquirePromise

    expect(rateLimiter.getAvailableTokens()).toBe(4)

    vi.useRealTimers()
  })

  it('should refill tokens over time', async () => {
    vi.useFakeTimers()

    for (let i = 0; i < 10; i++) {
      await rateLimiter.acquire()
    }

    expect(rateLimiter.getAvailableTokens()).toBe(0)

    vi.advanceTimersByTime(2000)

    expect(rateLimiter.getAvailableTokens()).toBe(10)

    vi.useRealTimers()
  })

  it('should not exceed max tokens', async () => {
    vi.useFakeTimers()

    await rateLimiter.acquire()

    vi.advanceTimersByTime(10000)

    expect(rateLimiter.getAvailableTokens()).toBe(10)

    vi.useRealTimers()
  })

  it('should reset to initial state', async () => {
    for (let i = 0; i < 5; i++) {
      await rateLimiter.acquire()
    }

    expect(rateLimiter.getAvailableTokens()).toBe(5)

    rateLimiter.reset()

    expect(rateLimiter.getAvailableTokens()).toBe(10)
  })

  it('should handle multiple refill intervals', async () => {
    vi.useFakeTimers()

    for (let i = 0; i < 10; i++) {
      await rateLimiter.acquire()
    }

    vi.advanceTimersByTime(3000)

    expect(rateLimiter.getAvailableTokens()).toBe(10)

    vi.useRealTimers()
  })
})
