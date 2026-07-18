import { describe, expect, test, afterEach, mock } from 'bun:test'
import { sfFetch } from '../api.ts'

afterEach(() => {
  mock.restore()
})

describe('sfFetch', () => {
  test('parses ok envelope', async () => {
    globalThis.fetch = mock(async () =>
      new Response(JSON.stringify({ ok: true, data: { id: 'x' } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    ) as unknown as typeof fetch
    const r = await sfFetch<{ id: string }>('/skills/x')
    expect(r).toEqual({ ok: true, data: { id: 'x' } })
  })

  test('parses error envelope with status', async () => {
    globalThis.fetch = mock(async () =>
      new Response(
        JSON.stringify({
          ok: false,
          error: { code: 'FROZEN_PATH', message: 'FROZEN_PATH: published/x' },
        }),
        { status: 403, headers: { 'Content-Type': 'application/json' } },
      ),
    ) as unknown as typeof fetch
    const r = await sfFetch('/skills/generate', { method: 'POST', body: '{}' })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.status).toBe(403)
      expect(r.error.code).toBe('FROZEN_PATH')
    }
  })
})
