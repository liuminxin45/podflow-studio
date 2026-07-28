const { makeRequest } = require('./httpClient')

const BOCHA_MAX_CONCURRENCY = 2
const BOCHA_MAX_ATTEMPTS = 3

function createRequestLimiter(maxConcurrency) {
  let activeCount = 0
  const queue = []

  const drain = () => {
    while (activeCount < maxConcurrency && queue.length > 0) {
      const entry = queue.shift()
      if (entry.signal?.aborted) {
        entry.reject(new Error('Request canceled'))
        continue
      }
      activeCount += 1
      entry.resolve(() => {
        activeCount -= 1
        drain()
      })
    }
  }

  return signal => new Promise((resolve, reject) => {
    queue.push({ resolve, reject, signal })
    drain()
  })
}

const acquireBochaRequestSlot = createRequestLimiter(BOCHA_MAX_CONCURRENCY)

function isBochaRateLimitError(error) {
  return Number(error?.statusCode || error?.code) === 429
}

function bochaRetryDelay(attempt, random = Math.random) {
  return (750 * (2 ** attempt)) + Math.floor(random() * 251)
}

function waitForRetry(delayMs, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('Request canceled'))
      return
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', handleAbort)
      resolve()
    }, delayMs)
    const handleAbort = () => {
      clearTimeout(timer)
      reject(new Error('Request canceled'))
    }
    signal?.addEventListener('abort', handleAbort, { once: true })
  })
}

function normalizeBaseUrl(value, fallback) {
  return String(value || fallback).replace(/\/+$/, '')
}

function doubaoSearchEndpoint(apiBase) {
  const base = normalizeBaseUrl(apiBase, 'https://open.feedcoopapi.com')
  if (/\/search_api\/global_search$/i.test(base)) return base
  if (/\/search_api$/i.test(base)) return `${base}/global_search`
  return `${base}/search_api/global_search`
}

function normalizeDoubaoSearchResponse(body, query, maxResults = 5) {
  const providerError = body?.ResponseMetadata?.Error
  if (providerError) {
    throw new Error(`豆包搜索失败: ${providerError.Message || providerError.Code || '未知服务错误'}`)
  }
  const documents = Array.isArray(body?.Result?.Documents) ? body.Result.Documents : []
  return {
    provider: 'doubao_search',
    query: String(query || ''),
    results: documents.slice(0, Math.min(20, Math.max(1, Number(maxResults) || 5))).map((item, index) => {
      const snippets = Array.isArray(item.Snippet)
        ? item.Snippet
          .filter(part => part?.Type === 'text' && part.Text)
          .map(part => String(part.Text).trim())
          .filter(Boolean)
        : []
      return {
        id: String(item.Id || item.DocId || `doubao-search-${Date.now()}-${index}`),
        title: String(item.Title || item.Url || '未命名来源'),
        url: String(item.Url || ''),
        excerpt: snippets.join('\n'),
        publishedAt: item.DocumentInfo?.PublishTime
          ? String(item.DocumentInfo.PublishTime)
          : undefined,
      }
    }).filter(item => /^https?:\/\//i.test(item.url) && item.excerpt.trim()),
  }
}

async function searchDoubao({ apiBase, apiKey, query, maxResults = 5, signal }) {
  const key = String(apiKey || '').trim()
  if (!key) throw new Error('豆包搜索 API Key 未配置')
  const count = Math.min(20, Math.max(1, Number(maxResults) || 5))
  const response = await makeRequest({
    url: doubaoSearchEndpoint(apiBase),
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: {
      query: String(query || '').trim(),
      doc_count: count,
      max_snippet_length: 1200,
      max_image_count_per_doc: 0,
    },
    timeout: 45000,
    signal,
  })
  return normalizeDoubaoSearchResponse(response.body || {}, query, count)
}

async function searchTavily({ apiBase, apiKey, query, topic = 'news', timeRange = 'week', maxResults = 5, signal }) {
  const key = String(apiKey || '').trim()
  if (!key) throw new Error('Tavily API Key 未配置')
  const response = await makeRequest({
    url: `${normalizeBaseUrl(apiBase, 'https://api.tavily.com')}/search`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: {
      query: String(query || '').trim(),
      topic,
      search_depth: 'advanced',
      max_results: Math.min(10, Math.max(1, Number(maxResults) || 5)),
      include_answer: false,
      include_raw_content: false,
      ...(timeRange ? { time_range: timeRange } : {}),
    },
    timeout: 45000,
    signal,
  })
  const body = response.body || {}
  return {
    provider: 'tavily',
    query: body.query || query,
    responseTime: body.response_time,
    results: Array.isArray(body.results) ? body.results.map((item, index) => ({
      id: `tavily-${Date.now()}-${index}`,
      title: String(item.title || item.url || '未命名来源'),
      url: String(item.url || ''),
      excerpt: String(item.content || ''),
      publishedAt: item.published_date ? String(item.published_date) : undefined,
      relevance: typeof item.score === 'number' ? item.score : undefined,
    })).filter(item => /^https?:\/\//i.test(item.url)) : [],
  }
}

function bochaEndpoint(apiBase) {
  const base = normalizeBaseUrl(apiBase, 'https://api.bochaai.com')
  if (/\/v1\/web-search$/i.test(base)) return base
  if (/\/v1$/i.test(base)) return `${base}/web-search`
  return `${base}/v1/web-search`
}

function bochaFreshness(timeRange) {
  return ({
    day: 'oneDay',
    week: 'oneWeek',
    month: 'oneMonth',
    year: 'oneYear',
  })[timeRange] || 'noLimit'
}

function normalizeBochaResponse(body, query) {
  if (body?.code && Number(body.code) !== 200) {
    throw new Error(`博查搜索失败: ${body.msg || body.message || `code ${body.code}`}`)
  }
  const payload = body?.data && typeof body.data === 'object' ? body.data : body || {}
  const values = Array.isArray(payload.webPages?.value) ? payload.webPages.value : []
  return {
    provider: 'bocha',
    query: String(payload.queryContext?.originalQuery || query || ''),
    results: values.map((item, index) => ({
      id: String(item.id || `bocha-${Date.now()}-${index}`),
      title: String(item.name || item.title || item.url || '未命名来源'),
      url: String(item.url || ''),
      excerpt: String(item.summary || item.snippet || ''),
      publishedAt: item.datePublished ? String(item.datePublished) : undefined,
    })).filter(item => /^https?:\/\//i.test(item.url) && item.excerpt.trim()),
  }
}

async function searchBocha({ apiBase, apiKey, query, timeRange = 'week', maxResults = 5, signal }) {
  const key = String(apiKey || '').trim()
  if (!key) throw new Error('博查 API Key 未配置')
  for (let attempt = 0; attempt < BOCHA_MAX_ATTEMPTS; attempt += 1) {
    const release = await acquireBochaRequestSlot(signal)
    try {
      const response = await makeRequest({
        url: bochaEndpoint(apiBase),
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
        },
        body: {
          query: String(query || '').trim(),
          freshness: bochaFreshness(timeRange),
          summary: true,
          count: Math.min(10, Math.max(1, Number(maxResults) || 5)),
        },
        timeout: 45000,
        signal,
      })
      return normalizeBochaResponse(response.body, query)
    } catch (error) {
      if (!isBochaRateLimitError(error) || attempt === BOCHA_MAX_ATTEMPTS - 1) throw error
    } finally {
      release()
    }
    await waitForRetry(bochaRetryDelay(attempt), signal)
  }
  throw new Error('博查搜索失败: 已超过重试次数')
}

module.exports = {
  bochaEndpoint,
  bochaFreshness,
  bochaRetryDelay,
  createRequestLimiter,
  doubaoSearchEndpoint,
  isBochaRateLimitError,
  normalizeBochaResponse,
  normalizeDoubaoSearchResponse,
  searchBocha,
  searchDoubao,
  searchTavily,
}
