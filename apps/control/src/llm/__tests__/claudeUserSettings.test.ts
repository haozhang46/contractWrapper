import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  applyOpenAiEndpointToClaudeSettings,
  claudeSettingsPath,
  restoreCloudEndpointToClaudeSettings,
} from '../claudeUserSettings.ts'

let tempHome: string
let originalHarnessClaudeHome: string | undefined

beforeEach(() => {
  tempHome = mkdtempSync(join(tmpdir(), 'claude-settings-'))
  originalHarnessClaudeHome = process.env.HARNESS_CLAUDE_HOME
  delete process.env.HARNESS_CLAUDE_HOME
})

afterEach(() => {
  rmSync(tempHome, { recursive: true, force: true })
  if (originalHarnessClaudeHome === undefined) {
    delete process.env.HARNESS_CLAUDE_HOME
  } else {
    process.env.HARNESS_CLAUDE_HOME = originalHarnessClaudeHome
  }
})

function writeSettings(homeDir: string, settings: Record<string, unknown>): void {
  const dir = join(homeDir, '.claude')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'settings.json'), JSON.stringify(settings, null, 2), 'utf-8')
}

function readSettings(homeDir: string): Record<string, unknown> {
  return JSON.parse(readFileSync(claudeSettingsPath(homeDir), 'utf-8'))
}

describe('claudeSettingsPath', () => {
  test('joins homeDir with .claude/settings.json', () => {
    expect(claudeSettingsPath('/tmp/home')).toBe('/tmp/home/.claude/settings.json')
  })

  test('uses HARNESS_CLAUDE_HOME when homeDir omitted', () => {
    process.env.HARNESS_CLAUDE_HOME = '/env/home'
    expect(claudeSettingsPath()).toBe('/env/home/.claude/settings.json')
  })
})

describe('applyOpenAiEndpointToClaudeSettings', () => {
  test('creates settings with openai env when file is missing', () => {
    const result = applyOpenAiEndpointToClaudeSettings(
      {
        endpointMode: 'ollama-remote',
        baseUrl: 'http://192.168.1.7:8080/v1',
        model: 'qwen2.5',
        apiKey: 'ollama',
      },
      { homeDir: tempHome },
    )

    expect(result).toEqual({ ok: true })
    const settings = readSettings(tempHome)
    expect(settings.modelType).toBe('openai')
    expect(settings.endpointMode).toBe('ollama-remote')
    expect(settings.cloudEndpointSnapshot).toBeUndefined()
    expect(settings.env).toEqual({
      CLAUDE_CODE_USE_OPENAI: '1',
      OPENAI_BASE_URL: 'http://192.168.1.7:8080/v1',
      OPENAI_API_KEY: 'ollama',
      OPENAI_MODEL: 'qwen2.5',
      OPENAI_DEFAULT_HAIKU_MODEL: 'qwen2.5',
      OPENAI_DEFAULT_SONNET_MODEL: 'qwen2.5',
      OPENAI_DEFAULT_OPUS_MODEL: 'qwen2.5',
    })
  })

  test('snapshots cloud modelType and env on first apply', () => {
    writeSettings(tempHome, {
      modelType: 'anthropic',
      endpointMode: 'cloud',
      env: {
        ANTHROPIC_API_KEY: 'sk-cloud',
        ANTHROPIC_BASE_URL: 'https://api.anthropic.com',
      },
    })

    const result = applyOpenAiEndpointToClaudeSettings(
      {
        endpointMode: 'ollama-local',
        baseUrl: 'http://127.0.0.1:11434/v1',
        model: 'llama3',
        apiKey: 'ollama',
      },
      { homeDir: tempHome },
    )

    expect(result).toEqual({ ok: true })
    const settings = readSettings(tempHome)
    expect(settings.cloudEndpointSnapshot).toEqual({
      modelType: 'anthropic',
      env: {
        ANTHROPIC_API_KEY: 'sk-cloud',
        ANTHROPIC_BASE_URL: 'https://api.anthropic.com',
      },
    })
  })

  test('does not overwrite snapshot when switching remote to local', () => {
    writeSettings(tempHome, {
      modelType: 'openai',
      endpointMode: 'ollama-remote',
      cloudEndpointSnapshot: {
        modelType: 'anthropic',
        env: { ANTHROPIC_API_KEY: 'sk-saved' },
      },
      env: {
        CLAUDE_CODE_USE_OPENAI: '1',
        OPENAI_BASE_URL: 'http://remote:8080/v1',
        OPENAI_API_KEY: 'ollama',
        OPENAI_MODEL: 'remote-model',
      },
    })

    applyOpenAiEndpointToClaudeSettings(
      {
        endpointMode: 'ollama-local',
        baseUrl: 'http://127.0.0.1:11434/v1',
        model: 'local-model',
        apiKey: 'ollama',
      },
      { homeDir: tempHome },
    )

    const settings = readSettings(tempHome)
    expect(settings.cloudEndpointSnapshot).toEqual({
      modelType: 'anthropic',
      env: { ANTHROPIC_API_KEY: 'sk-saved' },
    })
    expect(settings.endpointMode).toBe('ollama-local')
    expect((settings.env as Record<string, string>).OPENAI_MODEL).toBe('local-model')
  })

  test('clears anthropic and alternate provider routing keys from env', () => {
    writeSettings(tempHome, {
      modelType: 'anthropic',
      endpointMode: 'cloud',
      env: {
        ANTHROPIC_BASE_URL: 'https://api.anthropic.com',
        ANTHROPIC_AUTH_TOKEN: 'token',
        ANTHROPIC_API_KEY: 'sk-test',
        CLAUDE_CODE_USE_GEMINI: '1',
        CLAUDE_CODE_USE_GROK: '1',
        OTHER_KEY: 'keep',
      },
    })

    applyOpenAiEndpointToClaudeSettings(
      {
        endpointMode: 'ollama-remote',
        baseUrl: 'http://192.168.1.7:8080/v1',
        model: 'qwen2.5',
        apiKey: 'secret',
      },
      { homeDir: tempHome },
    )

    const env = readSettings(tempHome).env as Record<string, string>
    expect(env.ANTHROPIC_BASE_URL).toBeUndefined()
    expect(env.ANTHROPIC_AUTH_TOKEN).toBeUndefined()
    expect(env.ANTHROPIC_API_KEY).toBeUndefined()
    expect(env.CLAUDE_CODE_USE_GEMINI).toBeUndefined()
    expect(env.CLAUDE_CODE_USE_GROK).toBeUndefined()
    expect(env.OTHER_KEY).toBe('keep')
    expect(env.CLAUDE_CODE_USE_OPENAI).toBe('1')
    expect(env.OPENAI_API_KEY).toBe('secret')
  })

  test('returns warning when write fails', () => {
    const result = applyOpenAiEndpointToClaudeSettings(
      {
        endpointMode: 'ollama-local',
        baseUrl: 'http://127.0.0.1:11434/v1',
        model: 'llama3',
        apiKey: 'ollama',
      },
      {
        homeDir: tempHome,
        writeFile: () => {
          throw new Error('disk full')
        },
      },
    )

    expect(result).toEqual({ ok: false, warning: 'disk full' })
  })

  test('does not snapshot when prior settings are empty', () => {
    applyOpenAiEndpointToClaudeSettings(
      {
        endpointMode: 'ollama-remote',
        baseUrl: 'http://192.168.1.7:8080/v1',
        model: 'qwen2.5',
        apiKey: 'ollama',
      },
      { homeDir: tempHome },
    )

    const settings = readSettings(tempHome)
    expect(settings.cloudEndpointSnapshot).toBeUndefined()
  })
})

describe('restoreCloudEndpointToClaudeSettings', () => {
  test('restores snapshot modelType and env', () => {
    writeSettings(tempHome, {
      modelType: 'openai',
      endpointMode: 'ollama-remote',
      cloudEndpointSnapshot: {
        modelType: 'anthropic',
        env: {
          ANTHROPIC_API_KEY: 'sk-restored',
          ANTHROPIC_BASE_URL: 'https://api.anthropic.com',
        },
      },
      env: {
        CLAUDE_CODE_USE_OPENAI: '1',
        OPENAI_BASE_URL: 'http://192.168.1.7:8080/v1',
        OPENAI_API_KEY: 'ollama',
        OPENAI_MODEL: 'qwen2.5',
      },
    })

    const result = restoreCloudEndpointToClaudeSettings({ homeDir: tempHome })
    expect(result).toEqual({ ok: true })

    const settings = readSettings(tempHome)
    expect(settings.endpointMode).toBe('cloud')
    expect(settings.modelType).toBe('anthropic')
    expect(settings.env).toEqual({
      ANTHROPIC_API_KEY: 'sk-restored',
      ANTHROPIC_BASE_URL: 'https://api.anthropic.com',
    })
  })

  test('sets endpointMode cloud only when snapshot is missing', () => {
    writeSettings(tempHome, {
      modelType: 'openai',
      endpointMode: 'ollama-local',
      env: {
        CLAUDE_CODE_USE_OPENAI: '1',
        OPENAI_BASE_URL: 'http://127.0.0.1:11434/v1',
        OPENAI_MODEL: 'llama3',
      },
    })

    restoreCloudEndpointToClaudeSettings({ homeDir: tempHome })

    const settings = readSettings(tempHome)
    expect(settings.endpointMode).toBe('cloud')
    expect(settings.modelType).toBe('openai')
    expect(settings.env).toEqual({
      CLAUDE_CODE_USE_OPENAI: '1',
      OPENAI_BASE_URL: 'http://127.0.0.1:11434/v1',
      OPENAI_MODEL: 'llama3',
    })
  })

  test('clears OpenAI env when snapshot exists without env key', () => {
    writeSettings(tempHome, {
      modelType: 'openai',
      endpointMode: 'ollama-remote',
      cloudEndpointSnapshot: {
        modelType: 'anthropic',
      },
      env: {
        CLAUDE_CODE_USE_OPENAI: '1',
        OPENAI_BASE_URL: 'http://192.168.1.7:8080/v1',
        OPENAI_API_KEY: 'ollama',
        OPENAI_MODEL: 'qwen2.5',
      },
    })

    restoreCloudEndpointToClaudeSettings({ homeDir: tempHome })

    const settings = readSettings(tempHome)
    expect(settings.endpointMode).toBe('cloud')
    expect(settings.modelType).toBe('anthropic')
    expect(settings.env).toEqual({})
  })

  test('apply from empty settings then restore clears legacy empty snapshot OpenAI leftovers', () => {
    applyOpenAiEndpointToClaudeSettings(
      {
        endpointMode: 'ollama-local',
        baseUrl: 'http://127.0.0.1:11434/v1',
        model: 'llama3',
        apiKey: 'ollama',
      },
      { homeDir: tempHome },
    )

    expect(readSettings(tempHome).cloudEndpointSnapshot).toBeUndefined()

    writeSettings(tempHome, {
      ...readSettings(tempHome),
      cloudEndpointSnapshot: {},
    })

    restoreCloudEndpointToClaudeSettings({ homeDir: tempHome })

    const settings = readSettings(tempHome)
    expect(settings.endpointMode).toBe('cloud')
    expect(settings.env).toEqual({})
    const env = settings.env as Record<string, string>
    expect(env.OPENAI_BASE_URL).toBeUndefined()
    expect(env.CLAUDE_CODE_USE_OPENAI).toBeUndefined()
  })

  test('returns warning when write fails', () => {
    writeSettings(tempHome, { endpointMode: 'ollama-local' })

    const result = restoreCloudEndpointToClaudeSettings({
      homeDir: tempHome,
      writeFile: () => {
        throw new Error('permission denied')
      },
    })

    expect(result).toEqual({ ok: false, warning: 'permission denied' })
  })
})
