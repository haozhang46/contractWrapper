import { describe, expect, test, beforeAll, mock } from 'bun:test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createApp } from '../app.ts'
import { initHarnessDir } from '../../bootstrap/init.ts'
import { writeFileSync } from 'node:fs'

describe('/api/memory', () => {
  const root = mkdtempSync(join(tmpdir(), 'harness-mem-'))

  beforeAll(() => {
    initHarnessDir(root)
  })

  test('GET returns default config', async () => {
    const app = createApp({ workspaceRoot: root })
    const res = await app.request('http://localhost/api/memory')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.config).toMatchObject({
      provider: 'ccb',
      maxEntries: 200,
      autoRecall: true,
    })
  })

  test('PUT persists config; GET entries starts empty', async () => {
    const app = createApp({ workspaceRoot: root })
    const putRes = await app.request('http://localhost/api/memory', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: 'json',
        maxEntries: 50,
        autoRecall: false,
      }),
    })
    expect(putRes.status).toBe(200)

    const getRes = await app.request('http://localhost/api/memory')
    expect((await getRes.json()).config.provider).toBe('json')

    const entriesRes = await app.request('http://localhost/api/memory/entries')
    expect(entriesRes.status).toBe(200)
    expect((await entriesRes.json()).entries).toEqual([])
  })

  test('POST /extract without LLM key returns empty extracted', async () => {
    const app = createApp({ workspaceRoot: root })
    const res = await app.request('http://localhost/api/memory/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'I prefer dark theme' }],
      }),
    })
    expect(res.status).toBe(200)
    expect((await res.json()).extracted).toEqual([])
  })

  test('POST /extract stores LLM facts into memory dir', async () => {
    writeFileSync(
      join(root, '.harness', 'llm.json'),
      JSON.stringify({
        provider: 'openai',
        model: 'test-model',
        baseUrl: 'https://example.test/v1',
        apiKey: 'sk-test',
      }),
    )

    const originalFetch = globalThis.fetch
    globalThis.fetch = mock(async () => {
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content:
                  '[{"type":"preference","content":"User prefers dark theme"}]',
              },
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    }) as typeof fetch

    try {
      const app = createApp({ workspaceRoot: root })
      const res = await app.request('http://localhost/api/memory/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'I prefer dark theme' }],
        }),
      })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.extracted).toHaveLength(1)
      expect(body.extracted[0]).toMatchObject({
        type: 'preference',
        content: 'User prefers dark theme',
      })
      expect(body.extracted[0].id).toBeTruthy()

      const entriesRes = await app.request(
        'http://localhost/api/memory/entries',
      )
      expect((await entriesRes.json()).entries).toHaveLength(1)
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})
