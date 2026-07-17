import { Hono } from 'hono'
import { loadOnion } from '../bootstrap/loadOnion.ts'
import { createCharterRoutes } from './routes/charter.ts'
import { createOnionRoutes } from './routes/onion.ts'

export function createApp({ workspaceRoot }: { workspaceRoot: string }): Hono {
  loadOnion(workspaceRoot)

  const app = new Hono()
  app.route('/api/onion', createOnionRoutes(workspaceRoot))
  app.route('/api/charter', createCharterRoutes(workspaceRoot))
  return app
}
