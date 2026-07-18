import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  existsSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { claudeSettingsPath } from '../../llm/claudeUserSettings.ts'
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

  describe('PUT Claude settings sync', () => {
    let claudeHome: string
    let originalHarnessClaudeHome: string | undefined

    beforeEach(() => {
      claudeHome = mkdtempSync(join(tmpdir(), 'harness-claude-home-'))
      originalHarnessClaudeHome = process.env.HARNESS_CLAUDE_HOME
      process.env.HARNESS_CLAUDE_HOME = claudeHome
    })

    afterEach(() => {
      rmSync(claudeHome, { recursive: true, force: true })
      if (originalHarnessClaudeHome === undefined) {
        delete process.env.HARNESS_CLAUDE_HOME
      } else {
        process.env.HARNESS_CLAUDE_HOME = originalHarnessClaudeHome
      }
    })

    test('normalizes baseUrl and dual-writes Claude settings for ollama-remote', async () => {
      const app = createApp({ workspaceRoot: root })
      const res = await app.request('http://localhost/api/llm', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'openai',
          model: 'qwen2.5',
          baseUrl: 'http://192.168.1.7:8080/v1/chat/completions',
          apiKey: 'ollama',
          endpointMode: 'ollama-remote',
        }),
      })

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.baseUrl).toBe('http://192.168.1.7:8080/v1')
      expect(body.warning).toBeUndefined()

      const llmPath = join(root, '.harness', 'llm.json')
      const disk = JSON.parse(readFileSync(llmPath, 'utf-8'))
      expect(disk.baseUrl).toBe('http://192.168.1.7:8080/v1')

      const claude = JSON.parse(
        readFileSync(claudeSettingsPath(claudeHome), 'utf-8'),
      )
      expect(claude.modelType).toBe('openai')
      expect(claude.endpointMode).toBe('ollama-remote')
      expect(claude.env.OPENAI_BASE_URL).toBe('http://192.168.1.7:8080/v1')
      expect(claude.env.OPENAI_MODEL).toBe('qwen2.5')
    })

    test('returns 400 for invalid baseUrl without writing llm.json', async () => {
      const isolatedRoot = mkdtempSync(join(tmpdir(), 'harness-llm-invalid-'))
      initHarnessDir(isolatedRoot)
      const app = createApp({ workspaceRoot: isolatedRoot })
      const res = await app.request('http://localhost/api/llm', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'openai',
          model: 'qwen2.5',
          baseUrl: 'not a valid url!!!',
          apiKey: 'ollama',
          endpointMode: 'ollama-remote',
        }),
      })

      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error).toMatch(/Invalid OpenAI base URL/)
      expect(existsSync(join(isolatedRoot, '.harness', 'llm.json'))).toBe(false)
      expect(existsSync(claudeSettingsPath(claudeHome))).toBe(false)
      rmSync(isolatedRoot, { recursive: true, force: true })
    })

    test('restores cloud snapshot when switching to cloud', async () => {
      const claudeDir = join(claudeHome, '.claude')
      mkdirSync(claudeDir, { recursive: true })
      writeFileSync(
        join(claudeDir, 'settings.json'),
        JSON.stringify(
          {
            modelType: 'openai',
            endpointMode: 'ollama-remote',
            cloudEndpointSnapshot: {
              modelType: 'anthropic',
              env: { ANTHROPIC_API_KEY: 'sk-test' },
            },
            env: {
              CLAUDE_CODE_USE_OPENAI: '1',
              OPENAI_BASE_URL: 'http://192.168.1.7:8080/v1',
            },
          },
          null,
          2,
        ),
        'utf-8',
      )

      const app = createApp({ workspaceRoot: root })
      const res = await app.request('http://localhost/api/llm', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'openai',
          model: 'deepseek-chat',
          baseUrl: 'https://api.deepseek.com/v1',
          apiKey: 'sk-cloud',
          endpointMode: 'cloud',
        }),
      })

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.endpointMode).toBe('cloud')
      expect(body.warning).toBeUndefined()

      const claude = JSON.parse(
        readFileSync(claudeSettingsPath(claudeHome), 'utf-8'),
      )
      expect(claude.modelType).toBe('anthropic')
      expect(claude.endpointMode).toBe('cloud')
      expect(claude.env).toEqual({ ANTHROPIC_API_KEY: 'sk-test' })
    })

    test('returns warning when Claude settings write fails', async () => {
      writeFileSync(join(claudeHome, '.claude'), 'blocks directory creation', 'utf-8')

      const app = createApp({ workspaceRoot: root })
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
      expect(typeof body.warning).toBe('string')
      expect(body.warning.length).toBeGreaterThan(0)
      expect(existsSync(join(root, '.harness', 'llm.json'))).toBe(true)
    })
  })

  test('POST /ollama/start returns running when already up', async () => {
    const app = createApp({ workspaceRoot: root })
    const prev = globalThis.fetch
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ models: [] }), { status: 200 })) as typeof fetch
    try {
      const res = await app.request('http://localhost/api/llm/ollama/start', {
        method: 'POST',
      })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.status).toBe('running')
    } finally {
      globalThis.fetch = prev
    }
  })
})
