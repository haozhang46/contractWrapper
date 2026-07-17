import { Hono } from 'hono'
import { loadOnion } from '../bootstrap/loadOnion.ts'
import { onionRuntime } from '../onionSingleton.ts'
import type { PendingStore } from '../pending/store.ts'
import { pendingStore } from '../pendingSingleton.ts'
import { createAgentOnionRoutes } from './routes/agent-onion.ts'
import { createCharterRoutes } from './routes/charter.ts'
import { createConfirmRoutes } from './routes/confirm.ts'
import { createOnionRoutes } from './routes/onion.ts'
import { createPendingRoutes } from './routes/pending.ts'

export function createApp({
  workspaceRoot,
  pending = pendingStore,
}: {
  workspaceRoot: string
  pending?: PendingStore
}): Hono {
  loadOnion(workspaceRoot)

  const app = new Hono()
  app.route('/api/onion', createOnionRoutes(workspaceRoot))
  app.route('/api/charter', createCharterRoutes(workspaceRoot))
  app.route('/api/pending', createPendingRoutes(pending))
  app.route('/api/confirm', createConfirmRoutes(pending))
  app.route(
    '/api/agent/onion',
    createAgentOnionRoutes({
      workspaceRoot,
      onionRuntime,
      pendingStore: pending,
    }),
  )
  return app
}
