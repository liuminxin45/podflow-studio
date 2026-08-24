import { describe, expect, it } from 'vitest'

import { VITE_SERVER_WATCH_OPTIONS } from '../viteRuntimeConfig'

describe('Vite development watcher', () => {
  it('ignores Electron session profiles stored under the project root', () => {
    expect(VITE_SERVER_WATCH_OPTIONS.ignored).toContain('**/.podflow/**')
  })
})
