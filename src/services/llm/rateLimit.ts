import type { RateLimitConfig } from '../../types/llm'

export class TokenBucketRateLimiter {
  private tokens: number
  private lastRefill: number

  constructor(private readonly config: RateLimitConfig) {
    this.tokens = config.maxTokens
    this.lastRefill = Date.now()
  }

  async acquire(): Promise<void> {
    this.refill()

    if (this.tokens >= 1) {
      this.tokens -= 1
      return
    }

    const waitTime = this.config.refillInterval - (Date.now() - this.lastRefill)
    if (waitTime > 0) {
      await this.delay(waitTime)
      return this.acquire()
    }
  }

  private refill(): void {
    const now = Date.now()
    const timeSinceLastRefill = now - this.lastRefill
    const refillIntervals = Math.floor(timeSinceLastRefill / this.config.refillInterval)

    if (refillIntervals > 0) {
      this.tokens = Math.min(
        this.config.maxTokens,
        this.tokens + refillIntervals * this.config.refillRate
      )
      this.lastRefill = now
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  getAvailableTokens(): number {
    this.refill()
    return this.tokens
  }

  reset(): void {
    this.tokens = this.config.maxTokens
    this.lastRefill = Date.now()
  }
}
