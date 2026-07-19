import { describe, it, expect, beforeEach } from 'vitest'
import { MetricsCollector } from '../metrics'

describe('MetricsCollector', () => {
  let collector: MetricsCollector

  beforeEach(() => {
    collector = new MetricsCollector()
  })

  it('should initialize with zero metrics', () => {
    const metrics = collector.getMetrics()

    expect(metrics.totalCalls).toBe(0)
    expect(metrics.successfulCalls).toBe(0)
    expect(metrics.failedCalls).toBe(0)
    expect(metrics.totalDuration).toBe(0)
    expect(metrics.averageResponseTime).toBe(0)
    expect(metrics.failureRate).toBe(0)
  })

  it('should record successful calls', () => {
    collector.recordCall(100, true)
    collector.recordCall(200, true)

    const metrics = collector.getMetrics()

    expect(metrics.totalCalls).toBe(2)
    expect(metrics.successfulCalls).toBe(2)
    expect(metrics.failedCalls).toBe(0)
    expect(metrics.totalDuration).toBe(300)
    expect(metrics.averageResponseTime).toBe(150)
    expect(metrics.failureRate).toBe(0)
  })

  it('should record failed calls', () => {
    collector.recordCall(100, false)
    collector.recordCall(200, false)

    const metrics = collector.getMetrics()

    expect(metrics.totalCalls).toBe(2)
    expect(metrics.successfulCalls).toBe(0)
    expect(metrics.failedCalls).toBe(2)
    expect(metrics.failureRate).toBe(1)
  })

  it('should calculate correct average response time', () => {
    collector.recordCall(100, true)
    collector.recordCall(200, true)
    collector.recordCall(300, true)

    const metrics = collector.getMetrics()

    expect(metrics.averageResponseTime).toBe(200)
  })

  it('should calculate correct failure rate', () => {
    collector.recordCall(100, true)
    collector.recordCall(200, false)
    collector.recordCall(300, true)
    collector.recordCall(400, false)

    const metrics = collector.getMetrics()

    expect(metrics.failureRate).toBe(0.5)
  })

  it('should reset all metrics', () => {
    collector.recordCall(100, true)
    collector.recordCall(200, false)

    collector.reset()

    const metrics = collector.getMetrics()

    expect(metrics.totalCalls).toBe(0)
    expect(metrics.successfulCalls).toBe(0)
    expect(metrics.failedCalls).toBe(0)
    expect(metrics.totalDuration).toBe(0)
    expect(metrics.averageResponseTime).toBe(0)
    expect(metrics.failureRate).toBe(0)
  })

  it('should return a copy of metrics', () => {
    collector.recordCall(100, true)

    const metrics1 = collector.getMetrics()
    const metrics2 = collector.getMetrics()

    expect(metrics1).toEqual(metrics2)
    expect(metrics1).not.toBe(metrics2)
  })

  it('should handle mixed success and failure calls', () => {
    collector.recordCall(50, true)
    collector.recordCall(100, false)
    collector.recordCall(150, true)
    collector.recordCall(200, true)
    collector.recordCall(250, false)

    const metrics = collector.getMetrics()

    expect(metrics.totalCalls).toBe(5)
    expect(metrics.successfulCalls).toBe(3)
    expect(metrics.failedCalls).toBe(2)
    expect(metrics.totalDuration).toBe(750)
    expect(metrics.averageResponseTime).toBe(150)
    expect(metrics.failureRate).toBe(0.4)
  })
})
