import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export type EndpointMode = 'cloud' | 'ollama-local' | 'ollama-remote'

export type LLMSettings = {
  provider: string
  model: string
  baseUrl: string
  apiKey: string
  endpointMode?: EndpointMode
}

export const DEFAULT_LLM: LLMSettings = {
  provider: 'openai',
  model: 'deepseek-chat',
  baseUrl: 'https://api.deepseek.com/v1',
  apiKey: '',
  endpointMode: 'cloud',
}

export const LOCAL_OLLAMA_ORIGIN = 'http://127.0.0.1:11434'
export const LOCAL_OLLAMA_BASE_URL = `${LOCAL_OLLAMA_ORIGIN}/v1`
export const LOCAL_OLLAMA_API_KEY = 'ollama'

function llmPath(workspaceRoot: string): string {
  return join(workspaceRoot, '.harness', 'llm.json')
}

export function loadLLMSettings(workspaceRoot: string): LLMSettings {
  const path = llmPath(workspaceRoot)
  if (!existsSync(path)) return { ...DEFAULT_LLM }
  try {
    const raw = JSON.parse(readFileSync(path, 'utf-8')) as Partial<LLMSettings>
    return {
      provider: typeof raw.provider === 'string' ? raw.provider : DEFAULT_LLM.provider,
      model: typeof raw.model === 'string' ? raw.model : DEFAULT_LLM.model,
      baseUrl: typeof raw.baseUrl === 'string' ? raw.baseUrl : DEFAULT_LLM.baseUrl,
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

export function normalizeOllamaOrigin(input: string): string {
  const trimmed = input.trim()
  if (!trimmed) throw new Error('Ollama URL is required')
  const withScheme = trimmed.includes('://') ? trimmed : `http://${trimmed}`
  let url: URL
  try {
    url = new URL(withScheme)
  } catch {
    throw new Error(`Invalid Ollama URL: ${input}`)
  }
  return url.origin
}

export function toOpenAiCompatibleBaseUrl(originOrUrl: string): string {
  return `${normalizeOllamaOrigin(originOrUrl)}/v1`
}

export async function fetchOllamaModelNames(
  origin: string,
  init?: { fetch?: typeof fetch; apiKey?: string },
): Promise<string[]> {
  const fetchFn = init?.fetch ?? globalThis.fetch
  const originNorm = normalizeOllamaOrigin(origin)
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (init?.apiKey) headers.Authorization = `Bearer ${init.apiKey}`
  let res: Response
  try {
    res = await fetchFn(`${originNorm}/api/tags`, { headers })
  } catch (e) {
    throw new Error(
      `Cannot reach Ollama at ${originNorm}. Is it running? (${e instanceof Error ? e.message : String(e)})`,
    )
  }
  if (!res.ok) {
    throw new Error(`Ollama tags request failed (${res.status})`)
  }
  const data = (await res.json()) as { models?: Array<{ name?: string }> }
  return (data.models ?? [])
    .map(m => m.name)
    .filter((n): n is string => typeof n === 'string' && n.length > 0)
}
