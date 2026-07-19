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
  const noProxy = envValue(env, 'NO_PROXY', 'no_proxy')
  if (shouldBypassProxy(urlObj, noProxy)) return ''
  if (urlObj.protocol === 'https:') {
    return envValue(env, 'HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy')
  }
  return envValue(env, 'HTTP_PROXY', 'http_proxy')
}

function createProxyAgent(urlObj, env = process.env) {
  const proxyUrl = resolveProxyUrl(urlObj, env)
  if (!proxyUrl) return false
  return urlObj.protocol === 'https:'
    ? new HttpsProxyAgent(proxyUrl)
    : new HttpProxyAgent(proxyUrl)
}

function requestError(prefix, error) {
  const detail = [error?.message, error?.code, error?.syscall].filter(Boolean).join(' · ') || 'unknown network error'
  const wrapped = new Error(`${prefix}: ${detail}`)
  wrapped.code = error?.code
  wrapped.cause = error
  return wrapped
}

function gatewayError(statusCode, data) {
  let parsed = null
  try {
    parsed = JSON.parse(data)
  } catch {
    // Keep raw provider/gateway body when it is not JSON.
  }

  const projectError = parsed?.error
  const code = projectError?.code
  const message = projectError?.message || data.slice(0, 200)
  const error = new Error(code ? `${code}: ${message}` : `HTTP ${statusCode}: ${message}`)
  error.statusCode = statusCode
  error.code = code
  error.body = parsed || data
  return error
}

function makeRequest({ url, method = 'GET', headers = {}, body = null, timeout = 30000, proxyEnv = process.env, signal }) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url)
    const isHttps = urlObj.protocol === 'https:'
    const client = isHttps ? https : http

    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method,
      headers,
      agent: createProxyAgent(urlObj, proxyEnv)
    }

    if (body && method !== 'GET') {
      const bodyStr = typeof body === 'string' ? body : JSON.stringify(body)
      options.headers['Content-Length'] = Buffer.byteLength(bodyStr)
    }

    const cleanup = () => signal?.removeEventListener('abort', handleAbort)
    const handleAbort = () => req.destroy(new Error('Request canceled'))
    const req = client.request(options, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            cleanup()
            resolve({ statusCode: res.statusCode, body: JSON.parse(data), raw: data })
          } catch (e) {
            cleanup()
            resolve({ statusCode: res.statusCode, body: null, raw: data })
          }
        } else {
          cleanup()
          reject(gatewayError(res.statusCode, data))
        }
      })
    })

    req.on('error', (e) => {
      cleanup()
      reject(requestError('Request failed', e))
    })

    req.setTimeout(timeout, () => {
      cleanup()
      req.destroy()
      reject(new Error(`Request timeout (${timeout}ms)`))
    })

    if (signal?.aborted) handleAbort()
    else signal?.addEventListener('abort', handleAbort, { once: true })

    if (body && method !== 'GET') {
      const bodyStr = typeof body === 'string' ? body : JSON.stringify(body)
      req.write(bodyStr)
    }

    req.end()
  })
}

function makeStreamingRequest({ url, method = 'POST', headers = {}, body = null, timeout = 180000, onChunk, onEnd, onError, proxyEnv = process.env, signal }) {
  return new Promise((resolve, reject) => {
    let streamFailed = false
    const urlObj = new URL(url)
    const isHttps = urlObj.protocol === 'https:'
    const client = isHttps ? https : http

    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method,
      headers,
      agent: createProxyAgent(urlObj, proxyEnv)
    }

    if (body) {
      const bodyStr = typeof body === 'string' ? body : JSON.stringify(body)
      options.headers['Content-Length'] = Buffer.byteLength(bodyStr)
    }

    const cleanup = () => signal?.removeEventListener('abort', handleAbort)
    const handleAbort = () => req.destroy(new Error('Request canceled'))
    const req = client.request(options, (res) => {
      let buffer = ''
      let errorBody = ''
      
      res.on('data', chunk => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          errorBody += chunk.toString()
          return
        }

        buffer += chunk.toString()
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed || trimmed === 'data: [DONE]') continue
          if (!trimmed.startsWith('data: ')) continue

          try {
            const json = JSON.parse(trimmed.slice(6))
            if (json.error) {
              streamFailed = true
              cleanup()
              const message = json.error.code ? `${json.error.code}: ${json.error.message}` : json.error.message
              if (onError) onError(message)
              reject(new Error(message))
              req.destroy()
              return
            }
            const content = json.choices?.[0]?.delta?.content
            if (content && onChunk) {
              onChunk(content)
            }
          } catch (e) {
            // Ignore parse errors in streaming
          }
        }
      })

      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          cleanup()
          const error = gatewayError(res.statusCode, errorBody)
          if (onError) onError(error.message)
          reject(error)
          return
        }
        if (streamFailed) return
        if (onEnd) onEnd()
        cleanup()
        resolve({ success: true })
      })

      res.on('error', (err) => {
        if (streamFailed) return
        cleanup()
        if (onError) onError(err.message)
        reject(err)
      })
    })

    req.on('error', (e) => {
      if (streamFailed) return
      cleanup()
      if (onError) onError(e.message)
      reject(requestError('Request failed', e))
    })

    req.setTimeout(timeout, () => {
      cleanup()
      req.destroy()
      const err = new Error(`Request timeout (${timeout}ms)`)
      if (onError) onError(err.message)
      reject(err)
    })

    if (signal?.aborted) handleAbort()
    else signal?.addEventListener('abort', handleAbort, { once: true })

    if (body) {
      const bodyStr = typeof body === 'string' ? body : JSON.stringify(body)
      req.write(bodyStr)
    }

    req.end()
  })
}

module.exports = {
  resolveProxyUrl,
  makeRequest,
  makeStreamingRequest
}
