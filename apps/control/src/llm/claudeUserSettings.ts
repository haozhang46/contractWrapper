import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export type ClaudeEndpointApply = {
  endpointMode: 'ollama-local' | 'ollama-remote'
  baseUrl: string
  model: string
  apiKey: string
}

export type CloudEndpointSnapshot = {
  modelType?: string
  env?: Record<string, string>
}

export type ClaudeUserSettings = {
  modelType?: string
  env?: Record<string, string>
  endpointMode?: 'cloud' | 'ollama-local' | 'ollama-remote'
  cloudEndpointSnapshot?: CloudEndpointSnapshot
  [key: string]: unknown
}

type ClaudeSettingsOpts = {
  homeDir?: string
  readFile?: (path: string, encoding: BufferEncoding) => string
  writeFile?: (path: string, data: string, encoding: BufferEncoding) => void
}

const ROUTING_STEAL_KEYS = [
  'ANTHROPIC_BASE_URL',
  'ANTHROPIC_AUTH_TOKEN',
  'ANTHROPIC_API_KEY',
  'CLAUDE_CODE_USE_GEMINI',
  'CLAUDE_CODE_USE_GROK',
] as const

function resolveHomeDir(homeDir?: string): string {
  if (homeDir) return homeDir
  if (process.env.HARNESS_CLAUDE_HOME) return process.env.HARNESS_CLAUDE_HOME
  return homedir()
}

export function claudeSettingsPath(homeDir?: string): string {
  return join(resolveHomeDir(homeDir), '.claude', 'settings.json')
}

function loadClaudeSettings(
  path: string,
  readFile: (path: string, encoding: BufferEncoding) => string,
): ClaudeUserSettings {
  if (!existsSync(path)) return {}
  try {
    return JSON.parse(readFile(path, 'utf-8')) as ClaudeUserSettings
  } catch {
    return {}
  }
}

function hasMeaningfulCloudConfig(settings: ClaudeUserSettings): boolean {
  if (settings.modelType !== undefined && settings.modelType !== '') return true
  return settings.env !== undefined && Object.keys(settings.env).length > 0
}

function shouldSnapshot(settings: ClaudeUserSettings): boolean {
  if (!hasMeaningfulCloudConfig(settings)) return false
  if (!settings.cloudEndpointSnapshot) return true
  const mode = settings.endpointMode
  return mode === undefined || mode === 'cloud'
}

function takeSnapshot(settings: ClaudeUserSettings): CloudEndpointSnapshot {
  const snapshot: CloudEndpointSnapshot = {}
  if (settings.modelType !== undefined) {
    snapshot.modelType = settings.modelType
  }
  if (settings.env && Object.keys(settings.env).length > 0) {
    snapshot.env = { ...settings.env }
  }
  return snapshot
}

function writeClaudeSettings(
  path: string,
  settings: ClaudeUserSettings,
  writeFile: (path: string, data: string, encoding: BufferEncoding) => void,
): void {
  const dir = join(path, '..')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFile(path, `${JSON.stringify(settings, null, 2)}\n`, 'utf-8')
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function applyOpenAiEndpointToClaudeSettings(
  apply: ClaudeEndpointApply,
  opts?: ClaudeSettingsOpts,
): { ok: true } | { ok: false; warning: string } {
  const path = claudeSettingsPath(opts?.homeDir)
  const readFile = opts?.readFile ?? readFileSync
  const writeFile = opts?.writeFile ?? writeFileSync

  try {
    const settings = loadClaudeSettings(path, readFile)

    if (shouldSnapshot(settings)) {
      settings.cloudEndpointSnapshot = takeSnapshot(settings)
    }

    settings.modelType = 'openai'
    settings.endpointMode = apply.endpointMode
    settings.env = settings.env ?? {}

    settings.env.CLAUDE_CODE_USE_OPENAI = '1'
    settings.env.OPENAI_BASE_URL = apply.baseUrl
    settings.env.OPENAI_API_KEY = apply.apiKey
    settings.env.OPENAI_MODEL = apply.model
    settings.env.OPENAI_DEFAULT_HAIKU_MODEL = apply.model
    settings.env.OPENAI_DEFAULT_SONNET_MODEL = apply.model
    settings.env.OPENAI_DEFAULT_OPUS_MODEL = apply.model

    for (const key of ROUTING_STEAL_KEYS) {
      delete settings.env[key]
    }

    writeClaudeSettings(path, settings, writeFile)
    return { ok: true }
  } catch (error) {
    return { ok: false, warning: errorMessage(error) }
  }
}

export function restoreCloudEndpointToClaudeSettings(
  opts?: ClaudeSettingsOpts,
): { ok: true } | { ok: false; warning: string } {
  const path = claudeSettingsPath(opts?.homeDir)
  const readFile = opts?.readFile ?? readFileSync
  const writeFile = opts?.writeFile ?? writeFileSync

  try {
    const settings = loadClaudeSettings(path, readFile)
    const snapshot = settings.cloudEndpointSnapshot

    if (snapshot) {
      if (snapshot.modelType !== undefined) {
        settings.modelType = snapshot.modelType
      }
      settings.env =
        snapshot.env !== undefined ? { ...snapshot.env } : {}
    }

    settings.endpointMode = 'cloud'
    writeClaudeSettings(path, settings, writeFile)
    return { ok: true }
  } catch (error) {
    return { ok: false, warning: errorMessage(error) }
  }
}
