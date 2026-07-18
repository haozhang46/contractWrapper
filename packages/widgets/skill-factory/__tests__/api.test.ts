import { describe, expect, test, afterEach, mock } from 'bun:test'
import { sfFetch, sfRunError } from '../api.ts'

afterEach(() => {
  mock.restore()
})

describe('sfRunError', () => {
  test('maps Error to message', () => {
    expect(sfRunError(new Error('network down'))).toEqual({
      message: 'network down',
    })
  })

  test('maps non-Error to string message', () => {
    expect(sfRunError('bad json')).toEqual({ message: 'bad json' })
  })
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

  test('rejects when fetch fails', async () => {
    globalThis.fetch = mock(async () => {
      throw new Error('Failed to fetch')
    }) as unknown as typeof fetch
    await expect(sfFetch('/skills')).rejects.toThrow('Failed to fetch')
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
