import { Hono } from 'hono'
import {
  loadLLMSettings,
  saveLLMSettings,
  type LLMSettings,
} from '../../llm/settings.ts'

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
    return c.json(saved)
  })

  return api
}
