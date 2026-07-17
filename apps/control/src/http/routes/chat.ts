import { Hono } from 'hono'
import type { AgentSlot } from '@harness/slot'
import { getDefaultSlot } from '../../slot/factory.ts'

export function createChatRoutes(
  workspaceRoot: string,
  slot?: AgentSlot,
): Hono {
  const chatApi = new Hono()
  const resolved = slot ?? getDefaultSlot(workspaceRoot)

  chatApi.post('/', async c => {
    const body = await c.req.json<{
      messages?: Array<{ role: string; content: string }>
    }>()
    const messages = body?.messages ?? []
    if (messages.length === 0) {
      return c.json({ error: 'messages are required' }, 400)
    }

    const encoder = new TextEncoder()
    // Scope disconnect to this request's signal. Unscoped slot.abort() would
    // kill the in-flight turn when a *queued* client drops under serial turnChain.
    const signal = c.req.raw.signal

    const onAbort = () => {
      resolved.abort(signal)
    }
    signal.addEventListener('abort', onAbort)

    const stream = new ReadableStream({
      async start(controller) {
        // Keep the SSE connection alive while tools run / wait for Allow
        // (otherwise proxies or servers may drop a silent stream).
        const keepalive = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(': keepalive\n\n'))
          } catch {
            // stream already closed
          }
        }, 5_000)
        try {
          await resolved.sendMessageWithHistory(
            messages,
            event => {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
              )
            },
            signal,
          )
        } catch (err) {
          if (!(err instanceof Error && err.name === 'AbortError')) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: 'error',
                  message: err instanceof Error ? err.message : String(err),
                })}\n\n`,
              ),
            )
          }
        } finally {
          clearInterval(keepalive)
          signal.removeEventListener('abort', onAbort)
          try {
            controller.enqueue(encoder.encode('data: [DONE]\n\n'))
            controller.close()
          } catch {
            // already cancelled
          }
        }
      },
      cancel() {
        resolved.abort(signal)
        signal.removeEventListener('abort', onAbort)
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

  return chatApi
}
