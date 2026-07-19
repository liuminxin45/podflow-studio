import type { PerformanceMetrics } from '../../types/llm'

export class MetricsCollector {
  private metrics: PerformanceMetrics = {
    totalCalls: 0,
    successfulCalls: 0,
    failedCalls: 0,
    totalDuration: 0,
    averageResponseTime: 0,
    failureRate: 0,
  }

  recordCall(duration: number, success: boolean): void {
    this.metrics.totalCalls++
    this.metrics.totalDuration += duration

    if (success) {
      this.metrics.successfulCalls++
    } else {
      this.metrics.failedCalls++
    }

    this.metrics.averageResponseTime = this.metrics.totalDuration / this.metrics.totalCalls
    this.metrics.failureRate = this.metrics.failedCalls / this.metrics.totalCalls
  }

  getMetrics(): PerformanceMetrics {
    return { ...this.metrics }
  }

  reset(): void {
    this.metrics = {
      totalCalls: 0,
      successfulCalls: 0,
      failedCalls: 0,
      totalDuration: 0,
      averageResponseTime: 0,
      failureRate: 0,
    }
  }
}
