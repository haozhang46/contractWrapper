import { Hono } from 'hono'
import { loadCharter, saveCharter } from '../../bootstrap/loadCharter.ts'

export function createCharterRoutes(workspaceRoot: string): Hono {
  const charterApi = new Hono()

  charterApi.get('/', c => {
    return c.json({ content: loadCharter(workspaceRoot) ?? '' })
  })

  charterApi.put('/', async c => {
    const body = await c.req.json<{ content: string }>()
    saveCharter(workspaceRoot, body.content ?? '')
    return c.json({ ok: true })
  })

  return charterApi
}
