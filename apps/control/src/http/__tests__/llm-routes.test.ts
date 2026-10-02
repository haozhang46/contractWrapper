import { describe, expect, test, beforeEach } from 'bun:test'
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createApp } from '../app.ts'
import { initHarnessDir } from '../../bootstrap/init.ts'

describe('/api/llm', () => {
  const root = mkdtempSync(join(tmpdir(), 'harness-llm-'))

  beforeEach(() => {
    initHarnessDir(root)
  })

  test('GET returns defaults when file missing', async () => {
    const app = createApp({ workspaceRoot: root })
    const res = await app.request('http://localhost/api/llm')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.provider).toBe('openai')
    expect(body.model).toBe('deepseek-chat')
    expect(body.baseUrl).toBe('https://api.deepseek.com/v1')
    expect(body.apiKey).toBe('')
  })

  test('PUT writes llm.json and GET returns saved values', async () => {
    const app = createApp({ workspaceRoot: root })
    const res = await app.request('http://localhost/api/llm', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: 'anthropic',
        model: 'qwen3.8-max-preview',
        baseUrl: 'https://example.com/apps/anthropic',
        apiKey: 'sk-test',
      }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.provider).toBe('anthropic')
    expect(body.model).toBe('qwen3.8-max-preview')
    expect(body.baseUrl).toBe('https://example.com/apps/anthropic')
    expect(body.apiKey).toBe('sk-test')

    const path = join(root, '.harness', 'llm.json')
    expect(existsSync(path)).toBe(true)
    const disk = JSON.parse(readFileSync(path, 'utf-8'))
    expect(disk.model).toBe('qwen3.8-max-preview')

    const getRes = await app.request('http://localhost/api/llm')
    expect(getRes.status).toBe(200)
    const got = await getRes.json()
    expect(got.apiKey).toBe('sk-test')
  })
})
