import { Hono } from 'hono'
import type { NamedOnion, OnionLayer } from '@harness/protocol'
import { isDefaultOnionId } from '@harness/protocol'
import { onionRegistry } from '../../onionSingleton.ts'

const VALID_ID = /^[a-zA-Z0-9_-]+$/

function isValidOnionId(id: unknown): id is string {
  return typeof id === 'string' && id.length > 0 && VALID_ID.test(id)
}

function deepCopyLayers(layers: OnionLayer[]): OnionLayer[] {
  return JSON.parse(JSON.stringify(layers)) as OnionLayer[]
}

export function createOnionsRoutes(): Hono {
  const api = new Hono()

  api.get('/', c => {
    return c.json({ onions: onionRegistry.list() })
  })

  api.post('/', async c => {
    const body = await c.req.json<{ id?: unknown; name?: unknown }>()
    if (!isValidOnionId(body.id)) {
      return c.json({ error: 'Invalid onion id' }, 400)
    }
    if (onionRegistry.get(body.id)) {
      return c.json({ error: 'Onion already exists' }, 409)
    }
    const def = onionRegistry.get('default')
    if (!def) {
      return c.json({ error: 'Default onion missing' }, 500)
    }
    const name =
      typeof body.name === 'string' && body.name.trim()
        ? body.name.trim()
        : body.id
    const onion: NamedOnion = {
      version: 1,
      id: body.id,
      name,
      layers: deepCopyLayers(def.layers),
    }
    try {
      onionRegistry.save(onion)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return c.json({ error: message }, 400)
    }
    return c.json(onion, 200)
  })

  api.get('/:id', c => {
    const onion = onionRegistry.get(c.req.param('id'))
    if (!onion) {
      return c.json({ error: 'Onion not found' }, 404)
    }
    return c.json(onion)
  })

  api.put('/:id', async c => {
    const paramId = c.req.param('id')
    const body = await c.req.json<Partial<NamedOnion>>()
    if (body.id !== undefined && body.id !== paramId) {
      return c.json({ error: 'Body id must match URL id' }, 400)
    }
    const existing = onionRegistry.get(paramId)
    if (!existing) {
      return c.json({ error: 'Onion not found' }, 404)
    }
    if (!Array.isArray(body.layers)) {
      return c.json({ error: 'Invalid payload: layers must be an array' }, 400)
    }
    const onion: NamedOnion = {
      version: 1,
      id: paramId,
      name:
        typeof body.name === 'string' && body.name.trim()
          ? body.name.trim()
          : existing.name,
      layers: body.layers,
    }
    try {
      onionRegistry.save(onion)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return c.json({ error: message }, 400)
    }
    return c.json(onionRegistry.get(paramId))
  })

  api.delete('/:id', c => {
    const id = c.req.param('id')
    if (isDefaultOnionId(id)) {
      return c.json({ error: 'Cannot delete the default onion' }, 403)
    }
    if (!onionRegistry.get(id)) {
      return c.json({ error: 'Onion not found' }, 404)
    }
    onionRegistry.delete(id)
    return c.body(null, 204)
  })

  return api
}
