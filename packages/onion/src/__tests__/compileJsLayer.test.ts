import { describe, expect, test } from 'bun:test'
import { compileJsLayer } from '../compileJsLayer.ts'

describe('compileJsLayer', () => {
  test('rejects invalid source', () => {
    expect(() => compileJsLayer('not valid js {{{')).toThrow()
  })

  test('compiles async middleware', async () => {
    const mw = compileJsLayer('async (ctx, next) => { ctx.message = "ok"; await next() }')
    const ctx = {
      toolName: 'Read',
      input: {},
      decision: null as 'allow' | 'deny' | 'ask' | null,
      auditTrail: [] as { layerId: string; decision: string; timestamp: number; detail?: string }[],
    }
    await mw(ctx, async () => {
      ctx.decision = 'allow'
    })
    expect(ctx.message).toBe('ok')
    expect(ctx.decision).toBe('allow')
  })
})
