import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import { mkdtempSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createApp } from '../app.ts'
import { initHarnessDir } from '../../bootstrap/init.ts'
import {
  bounceDefaultSlot,
  getDefaultSlot,
  setDefaultSlotForTests,
} from '../../slot/factory.ts'
import { CcbSlot } from '../../slot/ccb-slot.ts'
import {
  LOCAL_OLLAMA_BASE_URL,
  normalizeOllamaOrigin,
  toOpenAiCompatibleBaseUrl,
} from '../../llm/settings.ts'

describe('llm settings helpers', () => {
  test('normalizeOllamaOrigin prepends http and strips path', () => {
    expect(normalizeOllamaOrigin('192.168.1.10:11434')).toBe(
      'http://192.168.1.10:11434',
    )
    expect(normalizeOllamaOrigin('http://host:11434/v1')).toBe(
      'http://host:11434',
    )
  })

  test('toOpenAiCompatibleBaseUrl appends /v1 once', () => {
    expect(toOpenAiCompatibleBaseUrl('http://127.0.0.1:11434')).toBe(
      'http://127.0.0.1:11434/v1',
    )
    expect(toOpenAiCompatibleBaseUrl('http://127.0.0.1:11434/v1')).toBe(
      'http://127.0.0.1:11434/v1',
    )
  })
})

describe('/api/llm', () => {
  const root = mkdtempSync(join(tmpdir(), 'harness-llm-'))

  beforeEach(() => {
    initHarnessDir(root)
    setDefaultSlotForTests(null)
  })

  afterEach(() => {
    setDefaultSlotForTests(null)
  })

  test('GET returns defaults when file missing', async () => {
    const app = createApp({ workspaceRoot: root })
    const res = await app.request('http://localhost/api/llm')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.provider).toBe('openai')
    expect(body.model).toBe('deepseek-chat')
    expect(body.endpointMode).toBe('cloud')
  })

  test('PUT writes llm.json and bounces slot', async () => {
    const slot = getDefaultSlot(root) as CcbSlot
    const disposeCalls: number[] = []
    const orig = slot.dispose.bind(slot)
    slot.dispose = () => {
      disposeCalls.push(1)
      orig()
    }

    const app = createApp({ workspaceRoot: root })
    // Re-bind singleton already created — bounceDefaultSlot uses cached
    bounceDefaultSlot()

    const res = await app.request('http://localhost/api/llm', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: 'openai',
        model: 'qwen2.5:7b',
        baseUrl: LOCAL_OLLAMA_BASE_URL,
        apiKey: 'ollama',
        endpointMode: 'ollama-local',
      }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.model).toBe('qwen2.5:7b')
    expect(body.endpointMode).toBe('ollama-local')

    const path = join(root, '.harness', 'llm.json')
    expect(existsSync(path)).toBe(true)
    const disk = JSON.parse(readFileSync(path, 'utf-8'))
    expect(disk.baseUrl).toBe(LOCAL_OLLAMA_BASE_URL)
    expect(disposeCalls.length).toBeGreaterThanOrEqual(1)
  })

  test('GET /ollama/tags proxies models', async () => {
    const app = createApp({ workspaceRoot: root })
    const prev = globalThis.fetch
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({ models: [{ name: 'qwen2.5:7b' }] }),
        { status: 200 },
      )) as typeof fetch
    try {
      const res = await app.request(
        'http://localhost/api/llm/ollama/tags?origin=127.0.0.1:11434',
      )
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.models).toEqual(['qwen2.5:7b'])
    } finally {
      globalThis.fetch = prev
    }
  })
})
