const https = require('https')
const http = require('http')
const { HttpsProxyAgent } = require('https-proxy-agent')
const { HttpProxyAgent } = require('http-proxy-agent')

function envValue(env, ...names) {
  for (const name of names) {
    const value = String(env?.[name] || '').trim()
    if (value) return value
  }
  return ''
}

function shouldBypassProxy(urlObj, noProxyValue) {
  const hostname = urlObj.hostname.toLowerCase()
  if (hostname === 'localhost' || hostname === '::1' || /^127\./.test(hostname)) return true
  const port = String(urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80))
  return String(noProxyValue || '').split(',').map(item => item.trim().toLowerCase()).filter(Boolean).some(rule => {
    if (rule === '*') return true
    const [ruleHost, rulePort] = rule.split(':')
    if (rulePort && rulePort !== port) return false
    const normalized = ruleHost.replace(/^\*\./, '.').replace(/^\./, '')
    return hostname === normalized || hostname.endsWith(`.${normalized}`)
  })
}

function resolveProxyUrl(urlObj, env = process.env) {
  if (shouldBypassProxy(urlObj, envValue(env, 'NO_PROXY', 'no_proxy'))) return ''
  return urlObj.protocol === 'https:'
    ? envValue(env, 'HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy')
    : envValue(env, 'HTTP_PROXY', 'http_proxy')
}

function createProxyAgent(urlObj, env = process.env) {
  const proxyUrl = resolveProxyUrl(urlObj, env)
  if (!proxyUrl) return false
  return urlObj.protocol === 'https:' ? new HttpsProxyAgent(proxyUrl) : new HttpProxyAgent(proxyUrl)
}

function gatewayError(statusCode, data) {
  let parsed = null
  try { parsed = JSON.parse(data) } catch { /* Preserve non-JSON diagnostics. */ }
  const projectError = parsed?.error
  const message = projectError?.message || data.slice(0, 200)
  const error = new Error(projectError?.code ? `${projectError.code}: ${message}` : `HTTP ${statusCode}: ${message}`)
  error.statusCode = statusCode
  error.code = projectError?.code
  error.body = parsed || data
  return error
}

function makeRequest({ url, method = 'GET', headers = {}, body = null, timeout = 30000, proxyEnv = process.env, signal }) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url)
    const client = urlObj.protocol === 'https:' ? https : http
    const bodyStr = body && method !== 'GET' ? (typeof body === 'string' ? body : JSON.stringify(body)) : ''
    const req = client.request({
      hostname: urlObj.hostname,
      port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method,
      headers: { ...headers, ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {}) },
      agent: createProxyAgent(urlObj, proxyEnv),
    }, res => {
      let data = ''
      res.on('data', chunk => { data += chunk })
      res.on('end', () => {
        cleanup()
        if (res.statusCode < 200 || res.statusCode >= 300) return reject(gatewayError(res.statusCode, data))
        try { resolve({ statusCode: res.statusCode, body: JSON.parse(data), raw: data }) }
        catch { resolve({ statusCode: res.statusCode, body: null, raw: data }) }
      })
    })
    const cleanup = () => signal?.removeEventListener('abort', handleAbort)
    const handleAbort = () => req.destroy(new Error('Request canceled'))
    req.on('error', error => { cleanup(); reject(error) })
    req.setTimeout(timeout, () => req.destroy(new Error(`Request timeout (${timeout}ms)`)))
    if (signal?.aborted) handleAbort()
    else signal?.addEventListener('abort', handleAbort, { once: true })
    if (bodyStr) req.write(bodyStr)
    req.end()
  })
}

module.exports = { resolveProxyUrl, makeRequest }
