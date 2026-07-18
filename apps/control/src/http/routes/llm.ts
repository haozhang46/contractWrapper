import { Hono } from 'hono'
import {
  applyOpenAiEndpointToClaudeSettings,
  restoreCloudEndpointToClaudeSettings,
} from '../../llm/claudeUserSettings.ts'
import { normalizeOpenAiBaseUrl } from '../../llm/normalizeOpenAiBaseUrl.ts'
import {
  fetchOllamaModelNames,
  loadLLMSettings,
  LOCAL_OLLAMA_ORIGIN,
  saveLLMSettings,
  type EndpointMode,
  type LLMSettings,
} from '../../llm/settings.ts'
import {
  ensureLocalOllamaRunning,
  isOllamaReachable,
} from '../../llm/ollamaRuntime.ts'
import { bounceDefaultSlot } from '../../slot/factory.ts'

function shouldNormalizeBaseUrl(
  baseUrl: string,
  provider: string,
  endpointMode: EndpointMode,
): boolean {
  if (!baseUrl.trim()) return false
  if (endpointMode === 'ollama-local' || endpointMode === 'ollama-remote') {
    return true
  }
  return provider === 'openai'
}

export function createLlmRoutes(workspaceRoot: string): Hono {
  const api = new Hono()

  api.get('/', c => {
    return c.json(loadLLMSettings(workspaceRoot))
  })

  api.put('/', async c => {
    const body = await c.req.json<Partial<LLMSettings>>()
    const provider = body.provider ?? 'openai'
    const endpointMode = body.endpointMode ?? 'cloud'
    const rawBaseUrl = body.baseUrl ?? ''

    let baseUrl = rawBaseUrl
    if (shouldNormalizeBaseUrl(rawBaseUrl, provider, endpointMode)) {
      try {
        baseUrl = normalizeOpenAiBaseUrl(rawBaseUrl)
      } catch (e) {
        return c.json(
          { error: e instanceof Error ? e.message : String(e) },
          400,
        )
      }
    }

    const saved = saveLLMSettings(workspaceRoot, {
      provider,
      model: body.model ?? '',
      baseUrl,
      apiKey: body.apiKey ?? '',
      endpointMode,
    })

    let warning: string | undefined
    if (endpointMode === 'ollama-local' || endpointMode === 'ollama-remote') {
      const result = applyOpenAiEndpointToClaudeSettings({
        endpointMode,
        baseUrl: saved.baseUrl,
        model: saved.model,
        apiKey: saved.apiKey,
      })
      if (!result.ok) warning = result.warning
    } else if (endpointMode === 'cloud') {
      const result = restoreCloudEndpointToClaudeSettings()
      if (!result.ok) warning = result.warning
    }

    bounceDefaultSlot()
    return c.json(warning ? { ...saved, warning } : saved)
  })

  api.get('/ollama/status', async c => {
    const running = await isOllamaReachable(LOCAL_OLLAMA_ORIGIN)
    return c.json({
      status: running ? 'running' : 'stopped',
      origin: LOCAL_OLLAMA_ORIGIN,
    })
  })

  api.post('/ollama/start', async c => {
    const result = await ensureLocalOllamaRunning()
    const status =
      result.status === 'error'
        ? 500
        : result.status === 'starting'
          ? 202
          : 200
    return c.json(result, status)
  })

  api.get('/ollama/tags', async c => {
    const origin = c.req.query('origin')
    if (!origin?.trim()) {
      return c.json({ error: 'origin query param is required' }, 400)
    }
    const apiKey = c.req.query('apiKey') ?? undefined
    try {
      const models = await fetchOllamaModelNames(origin, { apiKey })
      return c.json({ models })
    } catch (e) {
      return c.json(
        { error: e instanceof Error ? e.message : String(e) },
        502,
      )
    }
  })

  return api
}
