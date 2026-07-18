import { Hono } from 'hono'
import type { EvaluateResult } from '@harness/onion'
import type { AuthorizeRequest } from '@harness/protocol'
import { handleAuthorize, handleWaitResolve } from '../../mcp/handlers.ts'
import type { PendingStore } from '../../pending/store.ts'

export function createAgentOnionRoutes(deps: {
  workspaceRoot: string
  onionRuntime: {
    evaluate: (
      tool: string,
      input: Record<string, unknown>,
      opts?: { onionId?: string },
    ) => Promise<EvaluateResult>
  }
  pendingStore: PendingStore
}): Hono {
  const api = new Hono()

  api.post('/authorize', async c => {
    const body = await c.req.json<AuthorizeRequest>()
    const result = await handleAuthorize(
      deps.onionRuntime,
      deps.pendingStore,
      body,
      { workspaceRoot: deps.workspaceRoot },
    )
    return c.json(result)
  })

  api.post('/wait_resolve', async c => {
    const { requestId, timeoutMs } = await c.req.json<{
      requestId: string
      timeoutMs?: number
    }>()
    const result = await handleWaitResolve(
      deps.pendingStore,
      requestId,
      timeoutMs,
    )
    return c.json(result)
  })

  return api
}
