export function parseJSONFromLLM(content: string): any {
  if (!content || typeof content !== 'string') {
    throw new Error('Invalid content: empty or not a string')
  }

  let cleaned = content.trim()

  const codeBlockRegex = /^```(?:json)?\s*\n?([\s\S]*?)\n?```$/
  const match = cleaned.match(codeBlockRegex)
  if (match) {
    cleaned = match[1].trim()
  }

  const jsonStart = cleaned.search(/[{\[]/)
  if (jsonStart > 0) {
    cleaned = cleaned.slice(jsonStart)
  }

  const jsonEnd = cleaned.lastIndexOf('}')
  const jsonEndArray = cleaned.lastIndexOf(']')
  const actualEnd = Math.max(jsonEnd, jsonEndArray)
  if (actualEnd > 0 && actualEnd < cleaned.length - 1) {
    cleaned = cleaned.slice(0, actualEnd + 1)
  }

  try {
    return JSON.parse(cleaned)
  } catch (error: any) {
    throw new Error(
      `JSON解析失败: ${error.message}\n` +
      `清理后的内容前100字符: ${cleaned.slice(0, 100)}`
    )
  }
}

export function safeParseJSON<T>(content: string, defaultValue: T): T {
  try {
    return parseJSONFromLLM(content) as T
  } catch (error) {
    console.error('[IdeationUtils] JSON parsing failed:', error)
    return defaultValue
  }
}

export function validateIdeationResult(parsed: any): {
  valid: boolean
  errors: string[]
} {
  const errors: string[] = []

  if (!parsed || typeof parsed !== 'object') {
    errors.push('结果不是有效的对象')
    return { valid: false, errors }
  }

  if (!parsed.topic) {
    errors.push('缺少 topic 字段')
  } else {
    if (!parsed.topic.title) errors.push('topic 缺少 title')
    if (!parsed.topic.description) errors.push('topic 缺少 description')
  }

  if (!Array.isArray(parsed.blocks)) {
    errors.push('blocks 必须是数组')
  } else if (parsed.blocks.length === 0) {
    errors.push('blocks 不能为空')
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

export function cleanLLMText(text: string): string {
  if (!text) return ''

  return text
    .trim()
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
}
