import http from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'

const { makeRequest, resolveProxyUrl } = require('../httpClient') as {
  makeRequest: (options: Record<string, unknown>) => Promise<{ statusCode: number; body: any }>
  resolveProxyUrl: (url: URL, env: Record<string, string>) => string
}

const servers: http.Server[] = []

afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve()))))
})

describe('httpClient proxy support', () => {
  it('honors HTTP_PROXY for external requests', async () => {
    let requestedUrl = ''
    const proxy = http.createServer((request, response) => {
      requestedUrl = request.url || ''
      response.setHeader('Content-Type', 'application/json')
      response.end(JSON.stringify({ via: 'proxy' }))
    })
    servers.push(proxy)
    await new Promise<void>(resolve => proxy.listen(0, '127.0.0.1', resolve))
    const address = proxy.address()
    if (!address || typeof address === 'string') throw new Error('Proxy did not start')

    const result = await makeRequest({
      url: 'http://example.test/search',
      proxyEnv: { HTTP_PROXY: `http://127.0.0.1:${address.port}`, NO_PROXY: '' },
    })

    expect(result.body).toEqual({ via: 'proxy' })
    expect(requestedUrl).toBe('http://example.test/search')
  })

  it('always bypasses proxies for the local Electron gateway and respects NO_PROXY', () => {
    const env = { HTTPS_PROXY: 'http://proxy.example:8080', HTTP_PROXY: 'http://proxy.example:8080', NO_PROXY: '.internal.test' }
    expect(resolveProxyUrl(new URL('http://127.0.0.1:5100/models'), env)).toBe('')
    expect(resolveProxyUrl(new URL('https://api.internal.test/search'), env)).toBe('')
    expect(resolveProxyUrl(new URL('https://api.tavily.com/search'), env)).toBe('http://proxy.example:8080')
  })
})
