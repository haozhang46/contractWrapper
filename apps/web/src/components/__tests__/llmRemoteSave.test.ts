import { describe, expect, test } from 'bun:test'
import {
  buildRemoteSavePatch,
  canSaveRemote,
} from '../llmRemoteSave'

describe('buildRemoteSavePatch', () => {
  test('preserves custom path in baseUrl verbatim', () => {
    const patch = buildRemoteSavePatch({
      baseUrl: 'http://192.168.1.7:8080/v1',
      model: 'qwen2.5',
      apiKey: 'secret',
    })

    expect(patch.baseUrl).toBe('http://192.168.1.7:8080/v1')
    expect(patch.endpointMode).toBe('ollama-remote')
    expect(patch.provider).toBe('openai')
    expect(patch.model).toBe('qwen2.5')
    expect(patch.apiKey).toBe('secret')
  })

  test('uses ollama when apiKey is empty', () => {
    const patch = buildRemoteSavePatch({
      baseUrl: 'http://192.168.1.7:8080/v1',
      model: 'qwen2.5',
      apiKey: '',
    })

    expect(patch.apiKey).toBe('ollama')
  })

  test('uses ollama when apiKey is whitespace only', () => {
    const patch = buildRemoteSavePatch({
      baseUrl: 'http://192.168.1.7:8080/v1',
      model: 'qwen2.5',
      apiKey: '   ',
    })

    expect(patch.apiKey).toBe('ollama')
  })
})

describe('canSaveRemote', () => {
  test('returns false when baseUrl is blank', () => {
    expect(
      canSaveRemote({ baseUrl: '', model: 'qwen2.5', apiKey: '' }),
    ).toBe(false)
    expect(
      canSaveRemote({ baseUrl: '   ', model: 'qwen2.5', apiKey: '' }),
    ).toBe(false)
  })

  test('returns false when model is blank', () => {
    expect(
      canSaveRemote({
        baseUrl: 'http://192.168.1.7:8080/v1',
        model: '',
        apiKey: '',
      }),
    ).toBe(false)
    expect(
      canSaveRemote({
        baseUrl: 'http://192.168.1.7:8080/v1',
        model: '   ',
        apiKey: '',
      }),
    ).toBe(false)
  })

  test('returns true when baseUrl and model are non-empty', () => {
    expect(
      canSaveRemote({
        baseUrl: 'http://192.168.1.7:8080/v1',
        model: 'qwen2.5',
        apiKey: '',
      }),
    ).toBe(true)
  })
})
