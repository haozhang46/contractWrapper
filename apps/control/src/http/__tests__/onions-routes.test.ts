import { describe, expect, test, beforeAll } from 'bun:test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { NamedOnion, OnionLayer } from '@harness/protocol'
import { createApp } from '../app.ts'
import { initHarnessDir } from '../../bootstrap/init.ts'

describe('/api/onions CRUD', () => {
  const root = mkdtempSync(join(tmpdir(), 'harness-onions-'))

  beforeAll(() => {
    initHarnessDir(root)
  })

  test('GET lists default onion', async () => {
    const app = createApp({ workspaceRoot: root })
    const res = await app.request('http://localhost/api/onions')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body.onions)).toBe(true)
    const def = body.onions.find((o: { id: string }) => o.id === 'default')
    expect(def).toBeDefined()
    expect(def.isDefault).toBe(true)
    expect(def.layerCount).toBeGreaterThan(0)
  })

  test('POST creates onion by deep-copying default layers', async () => {
    const app = createApp({ workspaceRoot: root })
    const res = await app.request('http://localhost/api/onions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'strict', name: 'Strict' }),
    })
    expect(res.status).toBe(200)
    const created = (await res.json()) as NamedOnion
    expect(created.id).toBe('strict')
    expect(created.name).toBe('Strict')
    expect(created.layers.length).toBeGreaterThan(0)
    expect(created.layers[0]?.kind).toBeDefined()

    const listRes = await app.request('http://localhost/api/onions')
    const list = await listRes.json()
    expect(list.onions.some((o: { id: string }) => o.id === 'strict')).toBe(
      true,
    )
  })

  test('POST returns 409 when id exists', async () => {
    const app = createApp({ workspaceRoot: root })
    const res = await app.request('http://localhost/api/onions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'default' }),
    })
    expect(res.status).toBe(409)
  })

  test('POST returns 400 for invalid id', async () => {
    const app = createApp({ workspaceRoot: root })
    const res = await app.request('http://localhost/api/onions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: '../evil' }),
    })
    expect(res.status).toBe(400)
  })

  test('GET /:id returns NamedOnion or 404', async () => {
    const app = createApp({ workspaceRoot: root })
    const ok = await app.request('http://localhost/api/onions/default')
    expect(ok.status).toBe(200)
    const onion = (await ok.json()) as NamedOnion
    expect(onion.id).toBe('default')
    expect(Array.isArray(onion.layers)).toBe(true)

    const missing = await app.request('http://localhost/api/onions/missing-id')
    expect(missing.status).toBe(404)
  })

  test('PUT updates onion; compile fail → 400', async () => {
    const app = createApp({ workspaceRoot: root })
    const getRes = await app.request('http://localhost/api/onions/strict')
    const onion = (await getRes.json()) as NamedOnion

    const putOk = await app.request('http://localhost/api/onions/strict', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...onion,
        name: 'Strict Updated',
      }),
    })
    expect(putOk.status).toBe(200)
    const saved = (await putOk.json()) as NamedOnion
    expect(saved.name).toBe('Strict Updated')

    const putBad = await app.request('http://localhost/api/onions/strict', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        version: 1,
        id: 'strict',
        name: 'Broken',
        layers: [
          ...onion.layers,
          {
            id: 'bad-js',
            name: 'Bad JS',
            enabled: true,
            priority: 99,
            kind: 'js',
            source: 'not a function {{{',
          } satisfies OnionLayer,
        ],
      }),
    })
    expect(putBad.status).toBe(400)
  })

  test('DELETE non-default succeeds; DELETE default → 403', async () => {
    const app = createApp({ workspaceRoot: root })

    const delDefault = await app.request(
      'http://localhost/api/onions/default',
      { method: 'DELETE' },
    )
    expect(delDefault.status).toBe(403)

    const delMissing = await app.request(
      'http://localhost/api/onions/no-such',
      { method: 'DELETE' },
    )
    expect(delMissing.status).toBe(404)

    const delOk = await app.request('http://localhost/api/onions/strict', {
      method: 'DELETE',
    })
    expect([200, 204]).toContain(delOk.status)

    const after = await app.request('http://localhost/api/onions/strict')
    expect(after.status).toBe(404)
  })

  test('GET/PUT /api/onion still operate on default', async () => {
    const app = createApp({ workspaceRoot: root })
    const getRes = await app.request('http://localhost/api/onion')
    expect(getRes.status).toBe(200)
    const body = await getRes.json()
    expect(Array.isArray(body.layers)).toBe(true)
    expect(body.layers.length).toBeGreaterThan(0)
    expect(body.layers[0]?.kind).toBeDefined()

    const updatedLayers = body.layers.map((layer: OnionLayer) =>
      layer.id === 'default-require-confirm'
        ? { ...layer, name: 'Proxy Updated Confirm' }
        : layer,
    )

    const putRes = await app.request('http://localhost/api/onion', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ layers: updatedLayers }),
    })
    expect(putRes.status).toBe(200)

    const again = await app.request('http://localhost/api/onion')
    const againBody = await again.json()
    const confirm = againBody.layers.find(
      (l: OnionLayer) => l.id === 'default-require-confirm',
    )
    expect(confirm?.name).toBe('Proxy Updated Confirm')

    const def = await app.request('http://localhost/api/onions/default')
    const defOnion = (await def.json()) as NamedOnion
    const defConfirm = defOnion.layers.find(
      l => l.id === 'default-require-confirm',
    )
    expect(defConfirm?.name).toBe('Proxy Updated Confirm')
  })
})
