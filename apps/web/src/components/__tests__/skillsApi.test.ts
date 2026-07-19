import { afterEach, describe, expect, mock, test } from 'bun:test'
import { getSkill, skillsFetch, skillsRunError } from '../skillsApi'

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

describe('getSkill', () => {
  test('builds query string for source and zone', async () => {
    const fetchMock = mock(async (input: RequestInfo | URL) => {
      const url = String(input)
      expect(url).toBe('/api/skills/shared?source=factory&zone=published')
      return new Response(
        JSON.stringify({
          ok: true,
          data: {
            id: 'shared',
            name: 'shared',
            source: 'factory',
            zone: 'published',
            skillMd: '# Factory\n',
            enabled: false,
            installed: false,
            description: 'Factory',
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const r = await getSkill('shared', { source: 'factory', zone: 'published' })
    expect(r.ok).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  test('omits query when no source/zone', async () => {
    const fetchMock = mock(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe('/api/skills/demo')
      return new Response(
        JSON.stringify({
          ok: true,
          data: {
            id: 'demo',
            name: 'demo',
            source: 'runtime',
            skillMd: '# Demo\n',
            enabled: false,
            installed: false,
            description: 'Demo',
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    await getSkill('demo')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
