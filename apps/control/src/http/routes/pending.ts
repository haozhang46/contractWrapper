import { Hono } from 'hono'
import type { PendingStore } from '../../pending/store.ts'

export function createPendingRoutes(pending: PendingStore): Hono {
  const pendingApi = new Hono()

  pendingApi.get('/', c => {
    return c.json({ pending: pending.list() })
  })

  pendingApi.get('/stream', c => {
    const encoder = new TextEncoder()
    let unsubscribe: (() => void) | undefined
    let keepalive: ReturnType<typeof setInterval> | undefined

    const stream = new ReadableStream({
      start(controller) {
        const send = (list: ReturnType<PendingStore['list']>) => {
          try {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ pending: list })}\n\n`,
              ),
            )
          } catch {
            // closed
          }
        }

        send(pending.list())
        unsubscribe = pending.subscribe(send)
        keepalive = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(': keepalive\n\n'))
          } catch {
            // closed
          }
        }, 5_000)
      },
      cancel() {
        unsubscribe?.()
        if (keepalive) clearInterval(keepalive)
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    })
  })

  return pendingApi
}
