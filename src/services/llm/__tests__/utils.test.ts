import { describe, it, expect } from 'vitest'
import {
  normalizeUrl,
  validateCredentials,
  buildHeaders,
  extractModelIds,
  normalizeError,
  getCacheKey,
  delay,
} from '../utils'
import { LLMError } from '../../../types/llm'

describe('LLM Utils', () => {
  describe('normalizeUrl', () => {
    it('should remove trailing slash', () => {
      expect(normalizeUrl('https://api.openai.com/v1/')).toBe('https://api.openai.com/v1')
    })

    it('should trim whitespace', () => {
      expect(normalizeUrl('  https://api.openai.com/v1  ')).toBe('https://api.openai.com/v1')
    })

    it('should handle url without trailing slash', () => {
      expect(normalizeUrl('https://api.openai.com/v1')).toBe('https://api.openai.com/v1')
    })
  })

  describe('validateCredentials', () => {
    it('should not throw for valid credentials', () => {
      expect(() => validateCredentials('https://api.openai.com/v1', 'sk-test')).not.toThrow()
    })

    it('should throw for missing apiBase', () => {
      expect(() => validateCredentials('', 'sk-test')).toThrow(LLMError)
      expect(() => validateCredentials('', 'sk-test')).toThrow('Missing API credentials')
    })

    it('should throw for missing apiKey', () => {
      expect(() => validateCredentials('https://api.openai.com/v1', '')).toThrow(LLMError)
    })

    it('should throw for both missing', () => {
      expect(() => validateCredentials('', '')).toThrow(LLMError)
    })
  })

  describe('buildHeaders', () => {
    it('should use Authorization header for OpenAI', () => {
      const headers = buildHeaders('https://api.openai.com/v1', 'sk-test')

      expect(headers['Content-Type']).toBe('application/json')
      expect(headers['Authorization']).toBe('Bearer sk-test')
      expect(headers['api-key']).toBeUndefined()
    })

    it('should use api-key header for Azure OpenAI', () => {
      const headers = buildHeaders('https://test.openai.azure.com/v1', 'azure-key')

      expect(headers['Content-Type']).toBe('application/json')
      expect(headers['api-key']).toBe('azure-key')
      expect(headers['Authorization']).toBeUndefined()
    })
  })

  describe('extractModelIds', () => {
    it('should extract and sort model IDs', () => {
      const data = {
        object: 'list',
        data: [
          { id: 'gpt-4', object: 'model' },
          { id: 'gpt-3.5-turbo', object: 'model' },
          { id: 'gpt-4-turbo', object: 'model' },
        ],
      }

      const ids = extractModelIds(data)

      expect(ids).toEqual(['gpt-3.5-turbo', 'gpt-4', 'gpt-4-turbo'])
    })

    it('should filter out empty IDs', () => {
      const data = {
        object: 'list',
        data: [
          { id: 'gpt-4', object: 'model' },
          { id: '', object: 'model' },
          { id: '  ', object: 'model' },
        ],
      }

      const ids = extractModelIds(data)

      expect(ids).toEqual(['gpt-4'])
    })

    it('should throw for invalid response', () => {
      const data = { invalid: 'response' } as any

      expect(() => extractModelIds(data)).toThrow(LLMError)
      expect(() => extractModelIds(data)).toThrow('Invalid models response')
    })

    it('should throw for non-array data', () => {
      const data = { object: 'list', data: 'not-an-array' } as any

      expect(() => extractModelIds(data)).toThrow(LLMError)
    })
  })

  describe('normalizeError', () => {
    it('should return LLMError as-is', () => {
      const error = new LLMError('Test error', 'AUTH')
      const normalized = normalizeError(error)

      expect(normalized).toBe(error)
    })

    it('should convert AbortError to TIMEOUT', () => {
      const error = new DOMException('Aborted', 'AbortError')
      const normalized = normalizeError(error)

      expect(normalized).toBeInstanceOf(LLMError)
      expect(normalized.code).toBe('TIMEOUT')
      expect(normalized.message).toBe('Request timeout')
    })

    it('should convert fetch errors to NETWORK', () => {
      const error = new Error('fetch failed')
      const normalized = normalizeError(error)

      expect(normalized).toBeInstanceOf(LLMError)
      expect(normalized.code).toBe('NETWORK')
      expect(normalized.message).toBe('Network error')
    })

    it('should convert unknown errors to UNKNOWN', () => {
      const error = new Error('Unknown problem')
      const normalized = normalizeError(error)

      expect(normalized).toBeInstanceOf(LLMError)
      expect(normalized.code).toBe('UNKNOWN')
      expect(normalized.message).toBe('Unknown problem')
    })
  })

  describe('getCacheKey', () => {
    it('should generate consistent keys for same options', () => {
      const options = {
        apiBase: 'https://api.openai.com/v1',
        apiKey: 'sk-test',
        model: 'gpt-4',
        messages: [{ role: 'user' as const, content: 'Hello' }],
        temperature: 0.7,
      }

      const key1 = getCacheKey(options)
      const key2 = getCacheKey(options)

      expect(key1).toBe(key2)
    })

    it('should generate different keys for different options', () => {
      const options1 = {
        apiBase: 'https://api.openai.com/v1',
        apiKey: 'sk-test',
        model: 'gpt-4',
        messages: [{ role: 'user' as const, content: 'Hello' }],
        temperature: 0.7,
      }

      const options2 = {
        ...options1,
        temperature: 0.8,
      }

      const key1 = getCacheKey(options1)
      const key2 = getCacheKey(options2)

      expect(key1).not.toBe(key2)
    })

    it('should include all relevant parameters in key', () => {
      const options = {
        apiBase: 'https://api.openai.com/v1',
        apiKey: 'sk-test',
        model: 'gpt-4',
        messages: [{ role: 'user' as const, content: 'Test' }],
        temperature: 0.5,
      }

      const key = getCacheKey(options)

      expect(key).toContain('https://api.openai.com/v1')
      expect(key).toContain('gpt-4')
      expect(key).toContain('0.5')
      expect(key).toContain('Test')
    })
  })

  describe('delay', () => {
    it('should resolve after specified time', async () => {
      const start = Date.now()
      await delay(100)
      const duration = Date.now() - start

      expect(duration).toBeGreaterThanOrEqual(95)
      expect(duration).toBeLessThan(150)
    })
  })
})
