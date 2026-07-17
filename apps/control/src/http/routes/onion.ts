import { Hono } from 'hono'
import type { OnionLayerConfig } from '@harness/protocol'
import { saveOnion } from '../../bootstrap/loadOnion.ts'
import { onionRuntime } from '../../onionSingleton.ts'

export function createOnionRoutes(workspaceRoot: string): Hono {
  const onionApi = new Hono()

  onionApi.get('/', c => {
    return c.json({ layers: onionRuntime.getLayers() })
  })

  onionApi.put('/', async c => {
    const body = await c.req.json<{ layers: OnionLayerConfig[] }>()
    if (!Array.isArray(body.layers)) {
      return c.json({ error: 'Invalid payload: layers must be an array' }, 400)
    }
    saveOnion(workspaceRoot, body.layers)
    return c.json({ layers: onionRuntime.getLayers() })
  })

  return onionApi
}
