import { Hono } from 'hono'
import type { PendingDecision, PendingStore } from '../../pending/store.ts'

export function createConfirmRoutes(pending: PendingStore): Hono {
  const confirmApi = new Hono()

  confirmApi.post('/', async c => {
    const body = await c.req.json<{
      requestId: string
      decision: PendingDecision
    }>()

    const ok = pending.resolve(body.requestId, body.decision)
    if (!ok) {
      return c.json({ error: 'not found' }, 404)
    }

    return c.json({ ok: true })
  })

  return confirmApi
}
