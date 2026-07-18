import { describe, expect, test } from 'bun:test'
import { Hono } from 'hono'
import { createAgentOnionRoutes } from '../agent-onion.ts'
import { PendingStore } from '../../../pending/store.ts'

describe('agent onion HTTP', () => {
  test('authorize allow', async () => {
    const pending = new PendingStore({ defaultTimeoutMs: 60_000 })
    const runtime = {
      evaluate: async () =>
        ({ decision: 'allow' as const, auditTrail: [] }),
    }
    const app = new Hono()
    app.route(
      '/api/agent/onion',
      createAgentOnionRoutes({
        workspaceRoot: '/tmp',
        onionRuntime: runtime as any,
        pendingStore: pending,
      }),
    )
    const res = await app.request('/api/agent/onion/authorize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        toolName: 'WebSearch',
        input: { query: 'weather' },
        sessionId: 's1',
      }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.decision).toBe('allow')
  })

  test('authorize forwards onionId to runtime', async () => {
    const pending = new PendingStore({ defaultTimeoutMs: 60_000 })
    let capturedOpts: { onionId?: string } | undefined
    const runtime = {
      evaluate: async (
        _tool: string,
        _input: Record<string, unknown>,
        opts?: { onionId?: string },
      ) => {
        capturedOpts = opts
        return { decision: 'allow' as const, auditTrail: [] }
      },
    }
    const app = new Hono()
    app.route(
      '/api/agent/onion',
      createAgentOnionRoutes({
        workspaceRoot: '/tmp',
        onionRuntime: runtime,
        pendingStore: pending,
      }),
    )
    const res = await app.request('/api/agent/onion/authorize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        toolName: 'Read',
        input: { path: 'x' },
        sessionId: 's1',
        onionId: 'strict',
      }),
    })
    expect(res.status).toBe(200)
    expect(capturedOpts).toEqual({ onionId: 'strict' })
  })
})
