import { describe, expect, test } from 'bun:test'
import { checkControlHealth } from '../controlHealth.ts'

describe('checkControlHealth', () => {
  test('returns false when control is unreachable', async () => {
    const result = await checkControlHealth('http://127.0.0.1:1')
    expect(result.ok).toBe(false)
    expect(result.error).toBeTruthy()
  })

  test('returns ok when /api/health responds', async () => {
    const server = Bun.serve({
      port: 0,
      fetch() {
        return Response.json({ ok: true })
      },
    })
    try {
      const result = await checkControlHealth(`http://127.0.0.1:${server.port}`)
      expect(result).toEqual({ ok: true })
    } finally {
      server.stop(true)
    }
  })
})
