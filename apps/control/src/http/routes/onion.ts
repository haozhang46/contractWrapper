import { Hono } from 'hono'
import type { OnionLayer, OnionLayerConfig } from '@harness/protocol'
import { toBuiltinLayer } from '@harness/protocol'
import { saveOnion } from '../../bootstrap/loadOnion.ts'
import { onionRegistry } from '../../onionSingleton.ts'

function normalizeLayers(raw: unknown[]): OnionLayer[] {
  return raw.map(layer => {
    if (layer && typeof layer === 'object' && 'kind' in layer) {
      return layer as OnionLayer
    }
    return toBuiltinLayer(layer as OnionLayerConfig)
  })
}

export function createOnionRoutes(workspaceRoot: string): Hono {
  const onionApi = new Hono()

  onionApi.get('/', c => {
    const def = onionRegistry.get('default')
    const layers = def?.layers ?? []
    return c.json({ layers })
  })

  onionApi.put('/', async c => {
    const body = await c.req.json<{ layers: unknown[] }>()
    if (!Array.isArray(body.layers)) {
      return c.json({ error: 'Invalid payload: layers must be an array' }, 400)
    }
    try {
      saveOnion(workspaceRoot, normalizeLayers(body.layers))
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return c.json({ error: message }, 400)
    }
    const def = onionRegistry.get('default')
    return c.json({ layers: def?.layers ?? [] })
  })

  return onionApi
}
