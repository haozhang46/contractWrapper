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

    const stream = new ReadableStream({
      start(controller) {
        const send = (list: ReturnType<PendingStore['list']>) => {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(list)}\n\n`),
          )
        }

        send(pending.list())
        unsubscribe = pending.subscribe(send)
      },
      cancel() {
        unsubscribe?.()
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
