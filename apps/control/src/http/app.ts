import { Hono } from 'hono'
import { loadOnion } from '../bootstrap/loadOnion.ts'
import { onionRegistry } from '../onionSingleton.ts'
import type { PendingStore } from '../pending/store.ts'
import { pendingStore } from '../pendingSingleton.ts'
import { createAgentOnionRoutes } from './routes/agent-onion.ts'
import { createChatRoutes } from './routes/chat.ts'
import { createChatSessionsRoutes } from './routes/chat-sessions.ts'
import { createCharterRoutes } from './routes/charter.ts'
import { createConfirmRoutes } from './routes/confirm.ts'
import { createHeadlessRoutes } from './routes/headless.ts'
import { createMemoryRoutes } from './routes/memory.ts'
import { createOnionRoutes } from './routes/onion.ts'
import { createOnionsRoutes } from './routes/onions.ts'
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
  app.route('/api/chat', createChatRoutes(workspaceRoot))
  app.route('/api/chat-sessions', createChatSessionsRoutes(workspaceRoot))
  app.route('/api/memory', createMemoryRoutes(workspaceRoot))
  app.route('/api/onion', createOnionRoutes(workspaceRoot))
  app.route('/api/onions', createOnionsRoutes())
  app.route('/api/charter', createCharterRoutes(workspaceRoot))
  app.route('/api/headless', createHeadlessRoutes(workspaceRoot))
  app.route('/api/pending', createPendingRoutes(pending))
  app.route('/api/confirm', createConfirmRoutes(pending))
  app.route(
    '/api/agent/onion',
    createAgentOnionRoutes({
      workspaceRoot,
      onionRuntime: onionRegistry,
      pendingStore: pending,
    }),
  )
  return app
}
