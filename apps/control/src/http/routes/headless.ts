import { Hono } from 'hono'
import {
  loadHeadlessSettings,
  saveHeadlessSettings,
  type HeadlessSettings,
} from '../../bootstrap/loadHeadless.ts'

export function createHeadlessRoutes(workspaceRoot: string): Hono {
  const api = new Hono()

  api.get('/', c => {
    return c.json(loadHeadlessSettings(workspaceRoot))
  })

  api.put('/', async c => {
    const body = await c.req.json<Partial<HeadlessSettings>>()
    const saved = saveHeadlessSettings(workspaceRoot, {
      autoAllow: Boolean(body.autoAllow),
      unsafeMode: Boolean(body.unsafeMode),
    })
    return c.json(saved)
  })

  return api
}
