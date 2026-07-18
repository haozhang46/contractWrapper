import { describe, expect, test } from 'bun:test'
import { normalizeOpenAiBaseUrl } from '../normalizeOpenAiBaseUrl.ts'

describe('normalizeOpenAiBaseUrl', () => {
  test('strips /chat/completions suffix', () => {
    expect(
      normalizeOpenAiBaseUrl('http://192.168.1.7:8080/v1/chat/completions'),
    ).toBe('http://192.168.1.7:8080/v1')
  })

  test('leaves existing /v1 base URL unchanged', () => {
    expect(normalizeOpenAiBaseUrl('http://192.168.1.7:8080/v1')).toBe(
      'http://192.168.1.7:8080/v1',
    )
  })

  test('appends /v1 to origin-only URL', () => {
    expect(normalizeOpenAiBaseUrl('http://192.168.1.7:8080')).toBe(
      'http://192.168.1.7:8080/v1',
    )
  })

  test('prepends http and appends /v1 when scheme is missing', () => {
    expect(normalizeOpenAiBaseUrl('192.168.1.7:8080')).toBe(
      'http://192.168.1.7:8080/v1',
    )
  })

  test('throws for unparseable input', () => {
    expect(() => normalizeOpenAiBaseUrl('not a url!!!')).toThrow(
      /^Invalid OpenAI base URL/,
    )
  })
})
