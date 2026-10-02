import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export type LLMSettings = {
  provider: string
  model: string
  baseUrl: string
  apiKey: string
  endpointMode?: 'cloud' | 'ollama-local' | 'ollama-remote'
}

export const DEFAULT_LLM: LLMSettings = {
  provider: 'openai',
  model: 'deepseek-chat',
  baseUrl: 'https://api.deepseek.com/v1',
  apiKey: '',
  endpointMode: 'cloud',
}

function llmPath(workspaceRoot: string): string {
  return join(workspaceRoot, '.harness', 'llm.json')
}

export function loadLLMSettings(workspaceRoot: string): LLMSettings {
  const path = llmPath(workspaceRoot)
  if (!existsSync(path)) return { ...DEFAULT_LLM }
  try {
    const raw = JSON.parse(readFileSync(path, 'utf-8')) as Partial<LLMSettings>
    return {
      provider:
        typeof raw.provider === 'string' ? raw.provider : DEFAULT_LLM.provider,
      model: typeof raw.model === 'string' ? raw.model : DEFAULT_LLM.model,
      baseUrl:
        typeof raw.baseUrl === 'string' ? raw.baseUrl : DEFAULT_LLM.baseUrl,
      apiKey: typeof raw.apiKey === 'string' ? raw.apiKey : DEFAULT_LLM.apiKey,
      endpointMode:
        raw.endpointMode === 'cloud' ||
        raw.endpointMode === 'ollama-local' ||
        raw.endpointMode === 'ollama-remote'
          ? raw.endpointMode
          : 'cloud',
    }
  } catch {
    return { ...DEFAULT_LLM }
  }
}

export function saveLLMSettings(
  workspaceRoot: string,
  settings: LLMSettings,
): LLMSettings {
  const dir = join(workspaceRoot, '.harness')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const next: LLMSettings = {
    provider: String(settings.provider ?? DEFAULT_LLM.provider),
    model: String(settings.model ?? ''),
    baseUrl: String(settings.baseUrl ?? ''),
    apiKey: String(settings.apiKey ?? ''),
    endpointMode: settings.endpointMode ?? 'cloud',
  }
  writeFileSync(llmPath(workspaceRoot), JSON.stringify(next, null, 2), 'utf-8')
  return next
}
