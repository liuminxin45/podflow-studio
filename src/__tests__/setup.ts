import { beforeAll, afterEach, afterAll, vi } from 'vitest'
import { cleanup } from '@testing-library/react'

class LocalStorageMock implements Storage {
  private store: Record<string, string> = {}

  get length(): number {
    return Object.keys(this.store).length
  }

  clear(): void {
    this.store = {}
  }

  getItem(key: string): string | null {
    return this.store[key] || null
  }

  setItem(key: string, value: string): void {
    this.store[key] = String(value)
  }

  removeItem(key: string): void {
    delete this.store[key]
  }

  key(index: number): string | null {
    const keys = Object.keys(this.store)
    return keys[index] || null
  }
}

beforeAll(() => {
  global.window = global.window || ({} as any)
  global.localStorage = new LocalStorageMock()
  global.window.localStorage = global.localStorage
  global.window.matchMedia = global.window.matchMedia || vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
  global.ResizeObserver = global.ResizeObserver || class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  const getComputedStyle = global.window.getComputedStyle.bind(global.window)
  global.window.getComputedStyle = ((element: Element) => (
    getComputedStyle(element)
  )) as typeof global.window.getComputedStyle
  global.HTMLElement.prototype.scrollIntoView = global.HTMLElement.prototype.scrollIntoView || vi.fn()
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

afterAll(() => {
  vi.restoreAllMocks()
})
