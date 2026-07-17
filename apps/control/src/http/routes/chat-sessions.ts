import { Hono } from 'hono'
import {
  deleteChatSession,
  getChatSession,
  listChatSessions,
  saveChatSession,
} from '../../chat/store.ts'

export function createChatSessionsRoutes(workspaceRoot: string): Hono {
  const api = new Hono()

  api.get('/', c => {
    return c.json({ sessions: listChatSessions(workspaceRoot) })
  })

  api.put('/', async c => {
    const body = await c.req.json<{
      id?: string
      title?: string
      messages?: Array<{
        role: string
        content: string
        toolCalls?: Array<{
          id: string
          toolName: string
          input: Record<string, unknown>
          output?: string
          status: 'pending' | 'running' | 'complete' | 'error'
        }>
      }>
    }>()
    if (!body.id || typeof body.id !== 'string') {
      return c.json({ error: 'id is required' }, 400)
    }
    if (!Array.isArray(body.messages)) {
      return c.json({ error: 'messages must be an array' }, 400)
    }
    const session = saveChatSession(workspaceRoot, {
      id: body.id,
      title: body.title ?? 'New Chat',
      messages: body.messages,
    })
    return c.json(session)
  })

  api.get('/:id', c => {
    const session = getChatSession(workspaceRoot, c.req.param('id'))
    if (!session) return c.json({ error: 'not found' }, 404)
    return c.json(session)
  })

  api.delete('/:id', c => {
    const ok = deleteChatSession(workspaceRoot, c.req.param('id'))
    if (!ok) return c.json({ error: 'not found' }, 404)
    return c.json({ ok: true })
  })

  return api
}
