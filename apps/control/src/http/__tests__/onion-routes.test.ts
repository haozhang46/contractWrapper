import { describe, expect, test, beforeAll } from 'bun:test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { OnionLayer, OnionLayerConfig } from '@harness/protocol'
import { createApp } from '../app.ts'
import { initHarnessDir } from '../../bootstrap/init.ts'

describe('GET/PUT /api/onion', () => {
  const root = mkdtempSync(join(tmpdir(), 'harness-'))

  beforeAll(() => {
    initHarnessDir(root)
  })

  test('GET returns layers with kind', async () => {
    const app = createApp({ workspaceRoot: root })
    const res = await app.request('http://localhost/api/onion')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body.layers)).toBe(true)
    expect(body.layers.length).toBeGreaterThan(0)
    expect(body.layers[0]?.kind).toBe('builtin')
  })

  test('PUT updates layers and GET reflects change', async () => {
    const app = createApp({ workspaceRoot: root })
    const original = await app.request('http://localhost/api/onion')
    const originalBody = await original.json()

    const updatedLayers = originalBody.layers.map((layer: OnionLayer) =>
      layer.id === 'default-require-confirm'
        ? { ...layer, name: 'Updated Confirm Layer' }
        : layer,
    )

    const putRes = await app.request('http://localhost/api/onion', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ layers: updatedLayers }),
    })
    expect(putRes.status).toBe(200)

    const getRes = await app.request('http://localhost/api/onion')
    const getBody = await getRes.json()
    const confirmLayer = getBody.layers.find(
      (layer: OnionLayer) => layer.id === 'default-require-confirm',
    )
    expect(confirmLayer?.name).toBe('Updated Confirm Layer')
  })

  test('PUT accepts legacy OnionLayerConfig without kind', async () => {
    const app = createApp({ workspaceRoot: root })
    const legacy: OnionLayerConfig[] = [
      {
        id: 'default-audit',
        type: 'audit',
        name: 'Audit',
        enabled: true,
        priority: 0,
        config: {},
      },
      {
        id: 'default-capability-gate',
        type: 'capability-gate',
        name: 'Capability Gate',
        enabled: true,
        priority: 10,
        config: { level: 'L2' },
      },
    ]

    const putRes = await app.request('http://localhost/api/onion', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ layers: legacy }),
    })
    expect(putRes.status).toBe(200)
    const body = await putRes.json()
    expect(body.layers.every((l: OnionLayer) => l.kind === 'builtin')).toBe(
      true,
    )
  })
})
