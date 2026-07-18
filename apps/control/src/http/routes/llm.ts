import { Hono } from 'hono'
import {
  fetchOllamaModelNames,
  loadLLMSettings,
  saveLLMSettings,
  type LLMSettings,
} from '../../llm/settings.ts'
import { bounceDefaultSlot } from '../../slot/factory.ts'

export function createLlmRoutes(workspaceRoot: string): Hono {
  const api = new Hono()

  api.get('/', c => {
    return c.json(loadLLMSettings(workspaceRoot))
  })

  api.put('/', async c => {
    const body = await c.req.json<Partial<LLMSettings>>()
    const saved = saveLLMSettings(workspaceRoot, {
      provider: body.provider ?? 'openai',
      model: body.model ?? '',
      baseUrl: body.baseUrl ?? '',
      apiKey: body.apiKey ?? '',
      endpointMode: body.endpointMode,
    })
    bounceDefaultSlot()
    return c.json(saved)
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
