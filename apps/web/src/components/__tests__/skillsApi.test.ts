import { afterEach, describe, expect, mock, test } from 'bun:test'
import { skillsFetch, skillsRunError } from '../skillsApi'

afterEach(() => {
  mock.restore()
})

describe('skillsRunError', () => {
  test('maps Error to message', () => {
    expect(skillsRunError(new Error('network down'))).toEqual({
      message: 'network down',
    })
  })

  test('maps non-Error to string message', () => {
    expect(skillsRunError('bad json')).toEqual({ message: 'bad json' })
  })
})

describe('skillsFetch', () => {
  test('parses ok envelope', async () => {
    globalThis.fetch = mock(async () =>
      new Response(
        JSON.stringify({
          ok: true,
          data: [{ id: 'demo', name: 'demo', enabled: false }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    ) as unknown as typeof fetch

    const r = await skillsFetch<Array<{ id: string }>>('')
    expect(r).toEqual({
      ok: true,
      data: [{ id: 'demo', name: 'demo', enabled: false }],
    })
  })

  test('parses error envelope with status', async () => {
    globalThis.fetch = mock(async () =>
      new Response(
        JSON.stringify({
          ok: false,
          error: { code: 'CONFLICT', message: 'already enabled' },
        }),
        { status: 409, headers: { 'Content-Type': 'application/json' } },
      ),
    ) as unknown as typeof fetch

    const r = await skillsFetch('/x/enable', {
      method: 'POST',
      body: JSON.stringify({ source: 'runtime' }),
    })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.status).toBe(409)
      expect(r.error.code).toBe('CONFLICT')
    }
  })

  test('rejects when fetch fails', async () => {
    globalThis.fetch = mock(async () => {
      throw new Error('Failed to fetch')
    }) as unknown as typeof fetch
    await expect(skillsFetch('')).rejects.toThrow('Failed to fetch')
  })
})
